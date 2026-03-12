import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { mkdir, writeFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { v7 as uuidv7 } from "uuid";
import os from "node:os";
import { WorkerPool } from "./worker-pool.js";

const app = new Hono();
const storageRoot =
  process.env.VIDEO_STORAGE_DIR ?? path.resolve(process.cwd(), "tmp/videos");
const uploadDir = path.join(storageRoot, "uploads");
const processedDir = path.join(storageRoot, "processed");

let workerPool: WorkerPool;

const ensureDirs = async () => {
  await mkdir(uploadDir, { recursive: true });
  await mkdir(processedDir, { recursive: true });
};

/**
 * Recovery scan: detects and enqueues any files that should be processed.
 * This handles:
 * - Server crashes (files left in uploads)
 * - Worker Thread crashes (same, since we only delete after success)
 */
const performRecoveryScan = async (): Promise<string[]> => {
  try {
    const files = await readdir(uploadDir);
    const webmFiles = files.filter((f) => f.endsWith(".webm"));

    console.log(`Recovery scan: found ${webmFiles.length} orphaned videos`);

    return webmFiles.map((f) => f.replace(".webm", ""));
  } catch (err) {
    console.error("Recovery scan error:", err);
    return [];
  }
};

/**
 * Initialize the worker pool and start processing.
 */
const initializeWorkerPool = async (): Promise<void> => {
  await ensureDirs();

  const workerCount =
    parseInt(process.env.WORKER_COUNT || "0") || os.cpus().length;
  console.log(`Initializing worker pool with ${workerCount} threads`);

  workerPool = new WorkerPool(workerCount, storageRoot);

  // Perform recovery scan and enqueue any orphaned files
  const orphanedUuids = await performRecoveryScan();
  for (const uuid of orphanedUuids) {
    workerPool.enqueueJob(uuid);
  }

  // Start the worker threads
  await workerPool.startWorkers();
};

serve(
  {
    fetch: app.fetch,
    port: 3001,
  },
  async (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
    await initializeWorkerPool();
  },
);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  if (workerPool) {
    await workerPool.shutdown();
  }
  process.exit(0);
});

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

// The upload endpoint gets a blob video file and saves it to the local filesystem under a generated uuidv7 filename.
// It then signals the worker process to process the video file to dash.
// It then returns the uuidv7 to the client.
app.post("/upload", async (c) => {
  const file = await c.req.blob();

  if (file.size === 0) {
    return c.json({ error: "Request body must contain a video blob." }, 400);
  }

  const id = uuidv7();
  const filename = `${id}.webm`;

  await ensureDirs();

  const uploadPath = path.join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(uploadPath, buffer);

  // Enqueue the job for processing (non-blocking, fires and forgets)
  if (workerPool) {
    workerPool.enqueueJob(id);
  }

  return c.json({ uuid: id }, 201);
});
