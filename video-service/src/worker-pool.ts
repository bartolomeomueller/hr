import { Worker } from "node:worker_threads";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface JobRequest {
  type: "request-job";
  workerId: number;
}

interface JobResult {
  type: "job-complete" | "job-failed";
  uuid: string;
  workerId: number;
  error?: string;
}

type WorkerMessage = JobRequest | JobResult;

export class WorkerPool {
  private pendingQueue: Map<string, { retryCount: number }> = new Map();
  private inFlightJobs: Map<string, { workerId?: number; retryCount: number }> =
    new Map();
  private failedJobs: Set<string> = new Set();
  private idleWorkers: Set<number> = new Set();
  private workers: Worker[] = [];
  private workerCount: number;
  private maxRetries: number = 3;
  private storageRoot: string;

  constructor(workerCount: number, storageRoot: string) {
    this.workerCount = workerCount;
    this.storageRoot = storageRoot;
  }

  /**
   * Start N worker threads. All queue coordination happens on the main thread.
   */
  async startWorkers(): Promise<void> {
    console.log(`Starting ${this.workerCount} worker threads...`);

    for (let i = 0; i < this.workerCount; i++) {
      const worker = new Worker(path.join(__dirname, "worker.ts"), {
        env: {
          ...process.env,
          WORKER_ID: String(i),
          VIDEO_STORAGE_DIR: this.storageRoot,
        },
      });

      worker.on("message", (msg: WorkerMessage) => {
        this.handleWorkerMessage(msg);
      });

      worker.on("error", (err) => {
        console.error(`Worker ${i} error:`, err);
        // Mark any in-flight job from this worker as failed for retry
        for (const [uuid, job] of this.inFlightJobs.entries()) {
          if (job.workerId === i) {
            this.failJob(uuid);
          }
        }
      });

      worker.on("exit", (code) => {
        if (code !== 0) {
          console.error(
            `Worker ${i} exited with code ${code}, treating in-flight jobs as failed`,
          );
          // Mark any in-flight job from this worker as failed for retry
          for (const [uuid, job] of this.inFlightJobs.entries()) {
            if (job.workerId === i) {
              this.failJob(uuid);
            }
          }
        }
      });

      this.workers.push(worker);
    }
  }

  /**
   * Add a job to the pending queue. Called from the upload endpoint.
   * Atomically updates the queue and wakes up an idle worker.
   */
  enqueueJob(uuid: string): void {
    // Only add if not already in any queue
    if (
      !this.pendingQueue.has(uuid) &&
      !this.inFlightJobs.has(uuid) &&
      !this.failedJobs.has(uuid)
    ) {
      this.pendingQueue.set(uuid, { retryCount: 0 });
      this.dispatchToIdleWorkers();
    }
  }

  /**
   * Main thread handles all worker messages. This is the single point of queue mutation.
   * All concurrency happens here, serialized by the event loop.
   */
  private handleWorkerMessage(msg: WorkerMessage): void {
    if (msg.type === "request-job") {
      this.idleWorkers.delete(msg.workerId);
      if (!this.assignNextJob(msg.workerId)) {
        this.idleWorkers.add(msg.workerId);
      }
    } else if (msg.type === "job-complete") {
      const uuid = msg.uuid;
      this.inFlightJobs.delete(uuid);
      console.log(`Job completed: ${uuid}`);
    } else if (msg.type === "job-failed") {
      const uuid = msg.uuid;
      const job = this.inFlightJobs.get(uuid);

      if (job) {
        const nextAttempt = job.retryCount + 1;

        if (nextAttempt <= this.maxRetries) {
          this.inFlightJobs.delete(uuid);
          this.pendingQueue.set(uuid, { retryCount: nextAttempt });
          console.warn(
            `Job failed: ${uuid}, retrying (attempt ${nextAttempt}/${this.maxRetries}). Error: ${msg.error}`,
          );
          this.dispatchToIdleWorkers();
        } else {
          this.inFlightJobs.delete(uuid);
          this.failedJobs.add(uuid);
          console.error(
            `Job permanently failed after ${this.maxRetries} retries: ${uuid}. Error: ${msg.error}`,
          );
        }
      }
    }
  }

  /**
   * Atomically assign the next job from the pending queue to a worker.
   * This ensures only one worker gets each job.
   */
  private assignNextJob(workerId: number): boolean {
    if (this.pendingQueue.size === 0) {
      return false;
    }

    const next = this.pendingQueue.entries().next().value;
    const uuid = next?.[0] as string | undefined;
    const retryCount =
      (next?.[1] as { retryCount: number } | undefined)?.retryCount ?? 0;
    if (!uuid) {
      return false;
    }

    this.pendingQueue.delete(uuid);
    this.inFlightJobs.set(uuid, { workerId, retryCount });

    const worker = this.workers[workerId];
    if (worker) {
      worker.postMessage({ type: "assign-job", uuid });
      return true;
    }

    this.inFlightJobs.delete(uuid);
    this.pendingQueue.set(uuid, { retryCount });
    return false;
  }

  private dispatchToIdleWorkers(): void {
    if (this.pendingQueue.size === 0 || this.idleWorkers.size === 0) {
      return;
    }

    for (const workerId of [...this.idleWorkers]) {
      if (this.pendingQueue.size === 0) {
        break;
      }

      this.idleWorkers.delete(workerId);
      if (!this.assignNextJob(workerId)) {
        this.idleWorkers.add(workerId);
      }
    }
  }

  /**
   * Mark a job as failed and potentially re-queue it.
   * Called when a worker crashes or times out.
   */
  private failJob(uuid: string): void {
    const job = this.inFlightJobs.get(uuid);
    if (job) {
      const nextAttempt = job.retryCount + 1;

      if (nextAttempt <= this.maxRetries) {
        this.inFlightJobs.delete(uuid);
        this.pendingQueue.set(uuid, { retryCount: nextAttempt });
        console.warn(
          `Job recovered and re-queued: ${uuid} (attempt ${nextAttempt}/${this.maxRetries})`,
        );
        this.dispatchToIdleWorkers();
      } else {
        this.inFlightJobs.delete(uuid);
        this.failedJobs.add(uuid);
        console.error(
          `Job permanently failed after recovery attempts: ${uuid}`,
        );
      }
    }
  }

  /**
   * Get queue status for debugging.
   */
  getStatus() {
    return {
      pending: this.pendingQueue.size,
      inFlight: this.inFlightJobs.size,
      failed: this.failedJobs.size,
      workers: this.workers.length,
    };
  }

  /**
   * Gracefully shutdown the pool.
   */
  async shutdown(): Promise<void> {
    console.log("Shutting down worker pool...");
    await Promise.all(this.workers.map((w) => w.terminate()));
    console.log("Worker pool shutdown complete");
  }
}
