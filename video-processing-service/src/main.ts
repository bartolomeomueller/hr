import { mkdir, rm } from "node:fs/promises";
import { Worker } from "bullmq";
import processVideo from "./processVideo.js";
import { recursiveStreamingUpload, streamingDownload } from "./s3.js";

const downloadsDir = "tmp/downloads";
const processedDir = "tmp/processed";

const s3UploadsPrefix = "videos/uploads";
const s3ProcessedPrefix = "videos/processed";
const s3BackupPrefix = "videos/backups";

// TODO test failures and retries, does not seem to work correctly currently
const worker = new Worker(
  "video-processing",
  async (job) => {
    const { uuid } = job.data;
    await executeProcessingJob(uuid);
  },
  // TODO use env vars
  { connection: { host: "redis", port: 6379 } },
);

async function executeProcessingJob(uuid: string): Promise<void> {
  try {
    await cleanupAndSetup(); // Clean up if something failed previously
    const fileToProcess = await streamingDownload({
      uuid,
      downloadPrefix: s3UploadsPrefix,
      downloadsDir,
    });
    const processedVideoDir = await processVideo({
      fileToProcess,
      processedDir,
    });
    await recursiveStreamingUpload({
      uuid,
      localDirectory: processedVideoDir,
      uploadPrefix: s3ProcessedPrefix,
    });
    console.log(`Successfully processed and uploaded video ${uuid}`);
    // await backupInBucket(fileToProcess, processedVideoDir);
    // TODO update state in database somehow
  } catch (error) {
    console.error(`Error processing video ${uuid}:`, error);
    throw error; // Let BullMQ handle retries
  }
}

async function cleanupAndSetup() {
  await rm(downloadsDir, { recursive: true, force: true });
  await rm(processedDir, { recursive: true, force: true });

  await mkdir(downloadsDir, { recursive: true });
  await mkdir(processedDir, { recursive: true });
}
