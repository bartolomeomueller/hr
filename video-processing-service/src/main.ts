import { mkdir, rmdir } from "node:fs/promises";
import { Worker } from "bullmq";
import processVideo from "./processVideo.js";
import { recursiveStreamingUpload, streamingDownload } from "./s3.js";

const downloadsDir = "tmp/downloads";
const processedDir = "tmp/processed";

const s3UploadsPrefix = "videos/uploads";
const s3ProcessedPrefix = "videos/processed";
const s3BackupPrefix = "videos/backups";

const worker = new Worker("video-processing", async (job) => {
  const { uuid } = job.data;
  await executeProcessingJob(uuid);
});

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
    // await backupInBucket(fileToProcess, processedVideoDir);
  } catch (error) {
    console.error(`Error processing video ${uuid}:`, error);
    throw error; // Let BullMQ handle retries
  }
}

async function cleanupAndSetup() {
  await rmdir(downloadsDir);
  await rmdir(processedDir);

  await mkdir(downloadsDir, { recursive: true });
  await mkdir(processedDir, { recursive: true });
}
