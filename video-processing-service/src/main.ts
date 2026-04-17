import { mkdir, rm } from "node:fs/promises";
import type { Job } from "bullmq";
import { UnrecoverableError, Worker } from "bullmq";
import z from "zod";
import processVideo from "./processVideo.js";
import {
  moveObjectToBackupPrefix,
  recursiveStreamingUpload,
  streamingDownload,
} from "./s3.js";

const downloadsDir = "tmp/downloads";
const processedDir = "tmp/processed";
const videoProcessingQueueName =
  process.env.VIDEO_PROCESSING_QUEUE_NAME ?? "video-processing";
const redisConnection = {
  host: process.env.REDIS_HOST ?? "redis",
  port: Number(process.env.REDIS_PORT ?? "6379"),
};

const s3UploadsPrefix = "videos/uploads";
const s3UploadsBackupPrefix = "videos/uploads-backup";
const s3ProcessedPrefix = "videos/processed";
const videoProcessingCancellationChannel = `${videoProcessingQueueName}:cancel`;
const videoProcessingCancellationMessageSchema = z.object({
  jobId: z.string(),
  reason: z.string(),
});
const activeVideoProcessingJobs = new Map<string, string>();

// TODO test failures and retries, does not seem to work correctly currently
export const worker = new Worker(
  videoProcessingQueueName,
  async (job, _token, signal) => {
    const jobId = getJobId(job);
    const cancellationSignal = getCancellationSignal(signal);
    activeVideoProcessingJobs.set(jobId, job.data.uuid);

    try {
      await executeProcessingJob(job, cancellationSignal);
    } catch (error) {
      if (
        cancellationSignal.aborted ||
        isVideoProcessingCancellationError(error)
      ) {
        throw new UnrecoverableError(
          getVideoProcessingCancellationReason(
            cancellationSignal,
            job.data.uuid,
          ),
        );
      }

      throw error;
    } finally {
      activeVideoProcessingJobs.delete(jobId);
    }
  },
  { connection: redisConnection },
);

const cancellationSubscriberPromise = setupCancellationSubscriber();

async function executeProcessingJob(
  job: Job<{ uuid: string }>,
  signal: AbortSignal,
): Promise<void> {
  const { uuid } = job.data;

  try {
    throwIfCancellationRequested(signal, uuid);
    await cleanupAndSetup(); // Clean up if something failed previously
    throwIfCancellationRequested(signal, uuid);

    const fileToProcess = await streamingDownload({
      uuid,
      downloadPrefix: s3UploadsPrefix,
      downloadsDir,
    });
    throwIfCancellationRequested(signal, uuid);

    const processedVideoDir = await processVideo({
      fileToProcess,
      processedDir,
      signal,
    });
    throwIfCancellationRequested(signal, uuid);

    await recursiveStreamingUpload({
      uuid,
      localDirectory: processedVideoDir,
      uploadPrefix: s3ProcessedPrefix,
    });

    await moveObjectToBackupPrefix({
      uuid,
      sourcePrefix: s3UploadsPrefix,
      backupPrefix: s3UploadsBackupPrefix,
    });

    console.log(`Successfully processed and uploaded video ${uuid}`);
  } catch (error) {
    if (isExpectedCancellation(signal, error, uuid)) {
      console.log(`Cancelled processing video ${uuid}`);
      throw error;
    }

    console.error(`Error processing video ${uuid}:`, error);
    throw error; // Let BullMQ handle retries
  }
}

// This makes it non concurrentable FIXME
async function cleanupAndSetup() {
  await rm(downloadsDir, { recursive: true, force: true });
  await rm(processedDir, { recursive: true, force: true });

  await mkdir(downloadsDir, { recursive: true });
  await mkdir(processedDir, { recursive: true });
}

function throwIfCancellationRequested(signal: AbortSignal, uuid: string) {
  if (signal.aborted) {
    throw new Error(getVideoProcessingCancellationReason(signal, uuid));
  }
}

function getVideoProcessingCancellationReason(
  signal: AbortSignal | undefined,
  uuid: string,
) {
  if (typeof signal?.reason === "string" && signal.reason.length > 0) {
    return signal.reason;
  }

  return `Video processing cancelled for ${uuid}`;
}

function isVideoProcessingCancellationError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.startsWith("Video processing cancelled for ")
  );
}

function isExpectedCancellation(
  signal: AbortSignal,
  error: unknown,
  uuid: string,
) {
  if (signal.aborted) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const expectedReason = getVideoProcessingCancellationReason(signal, uuid);
  return (
    error.message === expectedReason ||
    error.message === signal.reason ||
    isVideoProcessingCancellationError(error)
  );
}

function getJobId(job: Job<{ uuid: string }>) {
  if (!job.id) {
    throw new Error(`Expected job id for video ${job.data.uuid}`);
  }

  return String(job.id);
}

function getCancellationSignal(signal: AbortSignal | undefined) {
  return signal ?? new AbortController().signal;
}

async function setupCancellationSubscriber() {
  const client = await worker.client;
  const subscriber = client.duplicate();

  subscriber.on("error", (error) => {
    console.error("Video processing cancellation subscriber error:", error);
  });
  subscriber.on("message", (_channel, message) => {
    void handleCancellationMessage(message);
  });

  await subscriber.subscribe(videoProcessingCancellationChannel);

  return subscriber;
}

async function handleCancellationMessage(message: string) {
  const payload = parseCancellationMessage(message);

  if (!payload) {
    return;
  }

  if (!activeVideoProcessingJobs.has(payload.jobId)) {
    return;
  }

  worker.cancelJob(payload.jobId, payload.reason);
}

function parseCancellationMessage(message: string) {
  try {
    return videoProcessingCancellationMessageSchema.parse(JSON.parse(message));
  } catch {
    return null;
  }
}

export async function closeVideoProcessingCancellationSubscriber() {
  const subscriber = await cancellationSubscriberPromise;
  await subscriber.unsubscribe(videoProcessingCancellationChannel);
  subscriber.disconnect();
}
