import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { createWriteStream } from "node:fs";
import {
  access,
  mkdir,
  readdir,
  appendFile,
  unlink,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { v7 as uuidv7 } from "uuid";
import { Piscina } from "piscina";

const app = new Hono();
const storageRoot =
  process.env.VIDEO_STORAGE_DIR ?? path.resolve(process.cwd(), "data/videos");
const uploadDir = path.join(storageRoot, "uploads");
const processedDir = path.join(storageRoot, "processed");
const backupDir = path.join(storageRoot, "backup");
const __dirname = path.dirname(new URL(import.meta.url).pathname);

let workerFilePath = path.join(__dirname, "worker.js");
try {
  await access(workerFilePath);
} catch {
  workerFilePath = path.join(__dirname, "worker.ts");
}

const pool = new Piscina({
  filename: workerFilePath,
  minThreads: 1,
  // maxThreads is automatically set, scaling is automatic
});

const initializeWorkForPool = async (): Promise<void> => {
  await ensureDirs();

  const orphanedUuids = await performRecoveryScan();
  for (const uuid of orphanedUuids) {
    runJobWithRetry(uuid, processedDir, 0, 1);
  }
};

const ensureDirs = async () => {
  await mkdir(uploadDir, { recursive: true });
  await mkdir(processedDir, { recursive: true });
  await mkdir(backupDir, { recursive: true });
};

const setUploadCorsHeaders = (c: Context) => {
  c.header("Access-Control-Allow-Origin", "http://localhost:3000");
  c.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "content-type");
};

const handleUploadCors = async (c: Context, next: () => Promise<void>) => {
  setUploadCorsHeaders(c);

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  await next();
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

serve(
  {
    fetch: app.fetch,
    port: 3001,
  },
  async (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
    await initializeWorkForPool();
  },
);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await pool.destroy();
  process.exit(0);
});

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.use("/api/v1/upload/upload-stream", handleUploadCors);
app.use("/api/v1/upload/upload-blob", handleUploadCors);

// The upload endpoint streams a video file to the local filesystem under a
// generated uuidv7 filename, then signals the worker process to process it.
app.post("/api/v1/upload/upload-stream", async (c) => {
  const requestBody = c.req.raw.body;
  if (!requestBody) {
    return c.json({ error: "Request body must contain a video stream." }, 400);
  }

  const id = uuidv7();
  const filename = `${id}.webm.uploading`;

  await ensureDirs();

  const uploadPath = path.join(uploadDir, filename);
  const uploadStream = createWriteStream(uploadPath);

  try {
    await pipeline(
      Readable.fromWeb(requestBody as unknown as NodeReadableStream),
      uploadStream,
    );
  } catch (error) {
    console.error(`Streaming upload failed for ${id}:`, error);
    await unlink(uploadPath).catch((unlinkError) => {
      console.warn(
        `Failed to remove partial upload ${uploadPath}:`,
        unlinkError,
      );
    });
    return c.json({ error: "Failed to store the streamed upload." }, 500);
  }

  if (uploadStream.bytesWritten === 0) {
    await unlink(uploadPath).catch((unlinkError) => {
      console.warn(`Failed to remove empty upload ${uploadPath}:`, unlinkError);
    });
    return c.json({ error: "Request body must contain a video stream." }, 400);
  }

  await rename(uploadPath, uploadPath.replace(".uploading", ""));

  runJobWithRetry(id, processedDir);

  return c.json({ uuid: id }, 201);
});

// The blob-upload endpoint keeps a non-streaming fallback for browsers that do
// not support fetch request-body streaming yet.
app.post("/api/v1/upload/upload-blob", async (c) => {
  const file = await c.req.blob();

  if (file.size === 0) {
    return c.json({ error: "Request body must contain a video blob." }, 400);
  }

  const id = uuidv7();
  const filename = `${id}.webm.uploading`;

  await ensureDirs();

  const uploadPath = path.join(uploadDir, filename);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(uploadPath, buffer);
  } catch (error) {
    console.error(`Blob upload failed for ${id}:`, error);
    await unlink(uploadPath).catch((unlinkError) => {
      console.warn(
        `Failed to remove partial blob upload ${uploadPath}:`,
        unlinkError,
      );
    });
    return c.json({ error: "Failed to store the blob upload." }, 500);
  }

  await rename(uploadPath, uploadPath.replace(".uploading", ""));

  runJobWithRetry(id, processedDir);

  return c.json({ uuid: id }, 201);
});

async function runJobWithRetry(
  uuid: string,
  processedDir: string,
  retryCount: number = 0,
  maxRetries: number = 3,
): Promise<void> {
  try {
    await pool.run({
      fileToProcess: path.join(uploadDir, `${uuid}.webm`),
      processedDir,
      backupPath: path.join(backupDir, `${uuid}.webm`),
    });
    console.log(`Job completed: ${uuid}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const nextAttempt = retryCount + 1;

    if (nextAttempt <= maxRetries) {
      console.warn(
        `Job failed: ${uuid}, retrying (attempt ${nextAttempt}/${maxRetries}). Error: ${errorMsg}`,
      );
      return runJobWithRetry(uuid, processedDir, nextAttempt, maxRetries);
    }

    await appendFile(
      "./data/failed.log",
      `${uuid} failed because: ${errorMsg}\n`,
    ).catch((err) => {
      console.error("THIS IS REALLY BAD: Failed to write to failed.log:", err);
    });
    console.error(
      `Job permanently failed after ${maxRetries} retries: ${uuid}. Error: ${errorMsg}`,
    );
  }
}
