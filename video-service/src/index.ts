import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { mkdir, writeFile, readdir, appendFile } from "node:fs/promises";
import path from "node:path";
import { v7 as uuidv7 } from "uuid";
import { Piscina } from "piscina";

const app = new Hono();
const storageRoot =
  process.env.VIDEO_STORAGE_DIR ?? path.resolve(process.cwd(), "tmp/videos");
const uploadDir = path.join(storageRoot, "uploads");
const processedDir = path.join(storageRoot, "processed");
const backupDir = path.join(storageRoot, "backup");

const pool = new Piscina({
  filename: path.join(__dirname, "worker.ts"),
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

// TODO make the upload streaming

// The upload endpoint gets a blob video file and saves it to the local filesystem under a generated uuidv7 filename.
// It then signals the worker process to process the video file to dash.
// It then returns the uuidv7 to the client.
app.post("/api/v1/upload", async (c) => {
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
      "./failed.log",
      `${uuid} failed because: ${errorMsg}\n`,
    ).catch((err) => {
      console.error("THIS IS REALLY BAD: Failed to write to failed.log:", err);
    });
    console.error(
      `Job permanently failed after ${maxRetries} retries: ${uuid}. Error: ${errorMsg}`,
    );
  }
}
