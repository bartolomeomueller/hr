import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { Queue, QueueEvents } from "bullmq";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? "6379"),
  connectTimeout: 1000,
} as const;

const streamingDownloadMock = vi.fn();
const recursiveStreamingUploadMock = vi.fn();
const moveObjectToBackupPrefixMock = vi.fn();
const uploadedArtifactsByVideoUuid = new Map<string, Map<string, Buffer>>();

vi.mock("./s3.js", () => ({
  moveObjectToBackupPrefix: moveObjectToBackupPrefixMock,
  streamingDownload: streamingDownloadMock,
  recursiveStreamingUpload: recursiveStreamingUploadMock,
}));

describe("video-processing worker", () => {
  let queue: Queue<{ uuid: string }> | undefined;
  let queueEvents: QueueEvents | undefined;
  let importedWorker: typeof import("./main.js").worker | undefined;
  let closeCancellationSubscriber:
    | typeof import("./main.js").closeVideoProcessingCancellationSubscriber
    | undefined;
  const testQueueName = `video-processing-test-${randomUUID()}`;

  beforeAll(async () => {
    process.env.REDIS_HOST = redisConnection.host;
    process.env.REDIS_PORT = String(redisConnection.port);
    process.env.VIDEO_PROCESSING_QUEUE_NAME = testQueueName;

    await assertRedisHostIsReachable();
    assertMediaToolsAreAvailable();

    queue = new Queue(testQueueName, { connection: redisConnection });
    queueEvents = new QueueEvents(testQueueName, {
      connection: redisConnection,
    });

    await assertRedisIsAvailable(queue);
    await queue.waitUntilReady();
    await queueEvents.waitUntilReady();

    ({
      worker: importedWorker,
      closeVideoProcessingCancellationSubscriber: closeCancellationSubscriber,
    } = await import("./main.js"));
    await importedWorker.waitUntilReady();
  }, 5000);

  beforeEach(async () => {
    vi.clearAllMocks();
    uploadedArtifactsByVideoUuid.clear();
    await rm(path.join(process.cwd(), "tmp"), { recursive: true, force: true });
    if (queue) {
      await removeExistingJobs(queue);
    }
  });

  afterAll(async () => {
    await rm(path.join(process.cwd(), "tmp"), { recursive: true, force: true });

    if (queue) {
      await removeExistingJobs(queue);
      await queue.close();
    }

    if (queueEvents) {
      await queueEvents.close();
    }

    if (importedWorker) {
      await importedWorker.close();
    }

    if (closeCancellationSubscriber) {
      await closeCancellationSubscriber();
    }
  }, 5000);

  it("downloads, processes, and uploads a queued video", async () => {
    if (!queue || !queueEvents) {
      throw new Error("Queue test setup did not complete");
    }

    const uuid = randomUUID();

    streamingDownloadMock.mockImplementation(async ({ uuid, downloadsDir }) => {
      const outputPath = path.join(downloadsDir, `${uuid}.webm`);
      createSampleVideo(outputPath);
      return outputPath;
    });
    recursiveStreamingUploadMock.mockImplementation(
      async ({ uuid, localDirectory }) => {
        uploadedArtifactsByVideoUuid.set(
          uuid,
          await readDirectoryContents(localDirectory),
        );
      },
    );

    const job = await queue.add(testQueueName, { uuid }, { jobId: uuid });

    try {
      await job.waitUntilFinished(queueEvents, 5000);
    } catch {
      const reloadedJob = await queue.getJob(uuid);
      throw new Error(
        [
          `Worker job did not complete successfully for ${uuid}`,
          `state: ${await reloadedJob?.getState()}`,
          `failedReason: ${reloadedJob?.failedReason ?? "<missing>"}`,
          `stacktrace: ${JSON.stringify(reloadedJob?.stacktrace ?? [])}`,
        ].join("\n"),
      );
    }

    const uploadedArtifacts = uploadedArtifactsByVideoUuid.get(uuid);
    const uploadedArtifactNames = Array.from(
      uploadedArtifacts?.keys() ?? [],
    ).sort();
    const manifest = uploadedArtifacts?.get("manifest.mpd")?.toString("utf8");

    expect(streamingDownloadMock).toHaveBeenCalledWith({
      uuid,
      downloadPrefix: "videos/uploads",
      downloadsDir: "tmp/downloads",
    });
    expect(uploadedArtifacts).toBeDefined();
    expect(uploadedArtifactNames).toContain("manifest.mpd");
    expect(
      uploadedArtifactNames.some((file) => file.startsWith("init-stream")),
    ).toBe(true);
    expect(
      uploadedArtifactNames.some((file) => file.startsWith("chunk-stream")),
    ).toBe(true);
    expect(manifest).toContain("<MPD");
    expect(manifest).toContain("Representation");
    expect(recursiveStreamingUploadMock).toHaveBeenCalledWith({
      uuid,
      localDirectory: `tmp/processed/${uuid}`,
      uploadPrefix: "videos/processed",
    });
    expect(moveObjectToBackupPrefixMock).toHaveBeenCalledWith({
      uuid,
      sourcePrefix: "videos/uploads",
      backupPrefix: "videos/uploads-backup",
    });
  });

  it("does not upload artifacts when an active job is cancelled", async () => {
    if (!queue || !queueEvents || !importedWorker) {
      throw new Error("Queue test setup did not complete");
    }

    const uuid = randomUUID();
    const cancellationReason = `cancelled-by-test-${uuid}`;

    streamingDownloadMock.mockImplementation(async ({ uuid, downloadsDir }) => {
      const outputPath = path.join(downloadsDir, `${uuid}.webm`);
      createSampleVideo(outputPath);
      await wait(100);
      return outputPath;
    });
    recursiveStreamingUploadMock.mockImplementation(
      async ({ uuid, localDirectory }) => {
        uploadedArtifactsByVideoUuid.set(
          uuid,
          await readDirectoryContents(localDirectory),
        );
      },
    );

    const activeEvent = waitForJobEvent(queueEvents, "active", uuid);
    const job = await queue.add(testQueueName, { uuid }, { jobId: uuid });

    await activeEvent;
    expect(importedWorker.cancelJob(uuid, cancellationReason)).toBe(true);

    await expect(job.waitUntilFinished(queueEvents, 5000)).rejects.toThrow(
      cancellationReason,
    );

    const reloadedJob = await queue.getJob(uuid);

    expect(await reloadedJob?.getState()).toBe("failed");
    expect(reloadedJob?.failedReason).toBe(cancellationReason);
    expect(uploadedArtifactsByVideoUuid.has(uuid)).toBe(false);
    expect(recursiveStreamingUploadMock).not.toHaveBeenCalled();
    expect(moveObjectToBackupPrefixMock).not.toHaveBeenCalled();
  });

  it("does not upload artifacts when an external cancellation request is published", async () => {
    if (!queue || !queueEvents) {
      throw new Error("Queue test setup did not complete");
    }

    const uuid = randomUUID();
    const cancellationReason = `cancelled-by-pubsub-${uuid}`;

    streamingDownloadMock.mockImplementation(async ({ uuid, downloadsDir }) => {
      const outputPath = path.join(downloadsDir, `${uuid}.webm`);
      createSampleVideo(outputPath);
      return outputPath;
    });
    recursiveStreamingUploadMock.mockImplementation(
      async ({ uuid, localDirectory }) => {
        uploadedArtifactsByVideoUuid.set(
          uuid,
          await readDirectoryContents(localDirectory),
        );
      },
    );

    const activeEvent = waitForJobEvent(queueEvents, "active", uuid);
    const job = await queue.add(testQueueName, { uuid }, { jobId: uuid });

    await activeEvent;
    const client = await queue.client;
    await client.publish(
      `${testQueueName}:cancel`,
      JSON.stringify({ jobId: uuid, reason: cancellationReason }),
    );

    await expect(job.waitUntilFinished(queueEvents, 5000)).rejects.toThrow(
      cancellationReason,
    );

    const reloadedJob = await queue.getJob(uuid);

    expect(await reloadedJob?.getState()).toBe("failed");
    expect(reloadedJob?.failedReason).toBe(cancellationReason);
    expect(uploadedArtifactsByVideoUuid.has(uuid)).toBe(false);
    expect(recursiveStreamingUploadMock).not.toHaveBeenCalled();
    expect(moveObjectToBackupPrefixMock).not.toHaveBeenCalled();
  });

  it("ignores malformed external cancellation messages", async () => {
    if (!queue || !queueEvents) {
      throw new Error("Queue test setup did not complete");
    }

    const uuid = randomUUID();

    streamingDownloadMock.mockImplementation(async ({ uuid, downloadsDir }) => {
      const outputPath = path.join(downloadsDir, `${uuid}.webm`);
      createSampleVideo(outputPath);
      return outputPath;
    });
    recursiveStreamingUploadMock.mockImplementation(
      async ({ uuid, localDirectory }) => {
        uploadedArtifactsByVideoUuid.set(
          uuid,
          await readDirectoryContents(localDirectory),
        );
      },
    );

    const activeEvent = waitForJobEvent(queueEvents, "active", uuid);
    const job = await queue.add(testQueueName, { uuid }, { jobId: uuid });

    await activeEvent;
    const client = await queue.client;
    await client.publish(
      `${testQueueName}:cancel`,
      JSON.stringify({ jobId: uuid, reason: 123 }),
    );

    try {
      await job.waitUntilFinished(queueEvents, 5000);
    } catch {
      const reloadedJob = await queue.getJob(uuid);
      throw new Error(
        [
          `Worker job did not complete successfully for ${uuid}`,
          `state: ${await reloadedJob?.getState()}`,
          `failedReason: ${reloadedJob?.failedReason ?? "<missing>"}`,
          `stacktrace: ${JSON.stringify(reloadedJob?.stacktrace ?? [])}`,
        ].join("\n"),
      );
    }

    const reloadedJob = await queue.getJob(uuid);
    const uploadedArtifacts = uploadedArtifactsByVideoUuid.get(uuid);

    expect(await reloadedJob?.getState()).toBe("completed");
    expect(uploadedArtifacts).toBeDefined();
    expect(uploadedArtifacts?.has("manifest.mpd")).toBe(true);
    expect(recursiveStreamingUploadMock).toHaveBeenCalledTimes(1);
    expect(moveObjectToBackupPrefixMock).toHaveBeenCalledTimes(1);
  });

  it("does not upload artifacts when the input video is invalid", async () => {
    if (!queue || !queueEvents) {
      throw new Error("Queue test setup did not complete");
    }

    const uuid = randomUUID();

    streamingDownloadMock.mockImplementation(async ({ uuid, downloadsDir }) => {
      const outputPath = path.join(downloadsDir, `${uuid}.webm`);
      await writeFile(outputPath, "not-a-real-video");
      return outputPath;
    });
    recursiveStreamingUploadMock.mockImplementation(
      async ({ uuid, localDirectory }) => {
        uploadedArtifactsByVideoUuid.set(
          uuid,
          await readDirectoryContents(localDirectory),
        );
      },
    );

    const job = await queue.add(testQueueName, { uuid }, { jobId: uuid });

    await expect(job.waitUntilFinished(queueEvents, 5000)).rejects.toThrow(
      "ffprobe exited with code",
    );

    const reloadedJob = await queue.getJob(uuid);

    expect(await reloadedJob?.getState()).toBe("failed");
    expect(reloadedJob?.failedReason).toContain("ffprobe exited with code");
    expect(uploadedArtifactsByVideoUuid.has(uuid)).toBe(false);
    expect(recursiveStreamingUploadMock).not.toHaveBeenCalled();
    expect(moveObjectToBackupPrefixMock).not.toHaveBeenCalled();
  });
});

function assertMediaToolsAreAvailable() {
  const ffmpegResult = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  const ffprobeResult = spawnSync("ffprobe", ["-version"], {
    stdio: "ignore",
  });

  if (ffmpegResult.status !== 0 || ffprobeResult.status !== 0) {
    throw new Error(
      "ffmpeg and ffprobe must be installed for video-processing-service integration tests.",
    );
  }
}

function createSampleVideo(outputPath: string) {
  // This command creates a 1-second black video with silent audio, encoded in VP9 and Opus in a WebM container.
  const result = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=640x360:d=1:r=24",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=stereo",
      "-shortest",
      "-c:v",
      "libvpx-vp9",
      "-c:a",
      "libopus",
      outputPath,
    ],
    { encoding: "utf8" },
  );

  if (result.status === 0) {
    return;
  }

  throw new Error(
    `Failed to create test video fixture: ${result.stderr || result.stdout}`,
  );
}

async function readDirectoryContents(directoryPath: string) {
  const { readdir } = await import("node:fs/promises");

  const fileNames = await readdir(directoryPath);
  const files = await Promise.all(
    fileNames.map(
      async (fileName) =>
        [fileName, await readFile(path.join(directoryPath, fileName))] as const,
    ),
  );

  return new Map(files);
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function waitForJobEvent(
  queueEvents: QueueEvents,
  eventName: "active",
  jobId: string,
) {
  return new Promise<void>((resolve) => {
    const handleEvent = (event: { jobId: string }) => {
      if (event.jobId !== jobId) {
        return;
      }

      queueEvents.off(eventName, handleEvent);
      resolve();
    };

    queueEvents.on(eventName, handleEvent);
  });
}

async function assertRedisIsAvailable(queue: Queue) {
  try {
    const client = await queue.client;
    await client.ping();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Redis must be running for video-processing-service tests: ${message}`,
    );
  }
}

async function assertRedisHostIsReachable() {
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect({
      host: redisConnection.host,
      port: redisConnection.port,
      timeout: redisConnection.connectTimeout,
    });

    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });

    socket.once("timeout", () => {
      socket.destroy();
      reject(
        new Error(
          `Redis must be running for video-processing-service tests: timed out connecting to ${redisConnection.host}:${redisConnection.port}`,
        ),
      );
    });

    socket.once("error", (error) => {
      socket.destroy();
      const message = error instanceof Error ? error.message : String(error);
      reject(
        new Error(
          `Redis must be running for video-processing-service tests: ${message}`,
        ),
      );
    });
  });
}

async function removeExistingJobs(queue: Queue<{ uuid: string }>) {
  const jobs = await queue.getJobs([
    "active",
    "waiting",
    "delayed",
    "completed",
    "failed",
    "prioritized",
    "waiting-children",
  ]);

  await Promise.all(
    jobs.map(async (job) => {
      try {
        await job.remove();
      } catch {
        // Ignore jobs that are already gone.
      }
    }),
  );
}
