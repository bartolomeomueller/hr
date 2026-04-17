import { spawn } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { threadId } from "node:worker_threads";

// Entrypoint for Piscina worker threads.
/**
 * Process a video file using ffmpeg.
 * Transcodes WebM to DASH (MPD + webm segments).
 * On success, deletes the source file.
 * On failure, leaves the source file for retry.
 */
export default async function processVideo({
  fileToProcess,
  processedDir,
  signal,
}: {
  fileToProcess: string;
  processedDir: string;
  signal: AbortSignal;
}): Promise<string> {
  // The file path is set by the main thread, so it never throws.
  const uuid = path.basename(fileToProcess, ".webm");
  await mkdir(path.join(processedDir, uuid), { recursive: true });
  console.log(`[Worker ${threadId}] Starting for ${uuid}`);

  try {
    await access(fileToProcess);
  } catch {
    throw new Error(`Input file not found or not accessible: ${fileToProcess}`);
  }

  // ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 <file>
  const probeArgs = [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    fileToProcess,
  ];

  let ffprobeStdout: string;

  if (signal.aborted) {
    throw signal.reason ?? createCancellationError(uuid);
  }

  ffprobeStdout = await runCommand({
    args: probeArgs,
    command: "ffprobe",
    signal,
    timeoutMs: getCommandTimeoutMs("FFPROBE_TIMEOUT_MS", 30_000),
    uuid,
  });

  if (!ffprobeStdout) {
    throw new Error("ffprobe did not return any output");
  }
  const [width, height] = ffprobeStdout.trim().split(",").map(Number);
  console.log(
    `[Worker ${threadId}] ${uuid} - Input resolution: ${width}x${height}`,
  );
  if (!height || !width) {
    throw new Error(
      `ffprobe output is missing width or height: ${ffprobeStdout}`,
    );
  }
  if (Number.isNaN(width) || Number.isNaN(height)) {
    throw new Error(`ffprobe output is not valid: ${ffprobeStdout}`);
  }

  const targets = [];
  if (height >= 1080) targets.push(1080);
  if (height >= 720) targets.push(720);
  targets.push(480);

  // ffmpeg -i recording.webm \
  // -map 0:v:0 -map 0:v:0 -map 0:v:0 -map 0:a:0 \
  // -c:v libaom-av1 -crf 22 -b:v 0 -cpu-used 6 \
  // -filter:v:0 "fps=24,scale=-2:'min(1080,ih)'" -force_key_frames:v:0 "expr:gte(t,n_forced*4)" \
  // -filter:v:1 "fps=24,scale=-2:'min(720,ih)'"  -force_key_frames:v:1 "expr:gte(t,n_forced*4)" \
  // -filter:v:2 "fps=24,scale=-2:'min(480,ih)'"  -force_key_frames:v:2 "expr:gte(t,n_forced*4)" \
  // -c:a libopus -b:a 96k \
  // -f dash \
  // -seg_duration 4 \
  // -use_template 1 \
  // -use_timeline 1 \
  // -init_seg_name 'init-stream$RepresentationID$.webm' \
  // -media_seg_name 'chunk-stream$RepresentationID$-$Number%05d$.webm' \
  // -adaptation_sets "id=0,streams=v id=1,streams=a" \
  // <uuid>/manifest.mpd
  const mapArgs = targets
    .flatMap(() => ["-map", "0:v:0"])
    .concat(["-map", "0:a:0"]);
  const filterArgs = targets.flatMap((t, i) => [
    `-filter:v:${i}`,
    `fps=24,scale=-2:'min(${t},ih)'`,
    `-force_key_frames:v:${i}`,
    "expr:gte(t,n_forced*4)",
  ]);

  const outputPath = path.join(processedDir, uuid, "manifest.mpd");
  const ffmpegArgs = [
    "-i",
    fileToProcess,
    ...mapArgs,
    "-c:v",
    "libaom-av1",
    "-crf",
    "22",
    "-b:v",
    "0",
    "-cpu-used",
    "6",
    ...filterArgs,
    "-c:a",
    "libopus",
    "-b:a",
    "96k",
    "-f",
    "dash",
    "-seg_duration",
    "4",
    "-use_template",
    "1",
    "-use_timeline",
    "1",
    "-init_seg_name",
    "init-stream$RepresentationID$.webm",
    "-media_seg_name",
    "chunk-stream$RepresentationID$-$Number%05d$.webm",
    "-adaptation_sets",
    "id=0,streams=v id=1,streams=a",
    outputPath,
  ];

  if (signal.aborted) {
    throw signal.reason ?? createCancellationError(uuid);
  }

  await runCommand({
    args: ffmpegArgs,
    command: "ffmpeg",
    signal,
    timeoutMs: getCommandTimeoutMs("FFMPEG_TIMEOUT_MS", 15 * 60_000),
    uuid,
  });

  console.log(`[Worker ${threadId}] Processed: ${uuid}`);

  return path.join(processedDir, uuid);
}

function getCommandTimeoutMs(name: string, fallbackMs: number) {
  const value = process.env[name];

  if (!value) {
    return fallbackMs;
  }

  const timeoutMs = Number(value);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`Expected ${name} to be a positive number`);
  }

  return timeoutMs;
}

function runCommand({
  command,
  args,
  signal,
  timeoutMs,
  uuid,
}: {
  command: string;
  args: string[];
  signal: AbortSignal;
  timeoutMs: number;
  uuid: string;
}) {
  const commandController = new AbortController();
  const timeoutError = new Error(`${command} timed out after ${timeoutMs}ms`);
  const onAbort = () => {
    commandController.abort(signal.reason ?? createCancellationError(uuid));
  };
  const timeoutId = setTimeout(() => {
    commandController.abort(timeoutError);
  }, timeoutMs);

  if (signal.aborted) {
    onAbort();
  } else {
    signal.addEventListener("abort", onAbort, { once: true });
  }

  return new Promise<string>((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      signal: commandController.signal,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (error) => {
      reject(
        getCommandError({
          command,
          commandSignal: commandController.signal,
          error,
          stderr,
          uuid,
        }),
      );
    });

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);

      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(
        getCommandError({
          command,
          commandSignal: commandController.signal,
          code,
          stderr,
          uuid,
        }),
      );
    });
  });
}

function getCommandError({
  command,
  commandSignal,
  error,
  code,
  stderr,
  uuid,
}: {
  command: string;
  commandSignal: AbortSignal;
  error?: Error;
  code?: number | null;
  stderr: string;
  uuid: string;
}) {
  if (commandSignal.aborted) {
    if (commandSignal.reason instanceof Error) {
      return commandSignal.reason;
    }

    return commandSignal.reason ?? createCancellationError(uuid);
  }

  if (error) {
    return new Error(`Failed to spawn ${command}: ${error.message}`);
  }

  const tail = stderr.trim().slice(-500);
  return new Error(
    `${command} exited with code ${code}${tail.length > 0 ? `: ${tail}` : ""}`,
  );
}

function createCancellationError(uuid: string) {
  return new Error(`Video processing cancelled for ${uuid}`);
}
