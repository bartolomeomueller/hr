import { execFileSync as execFile, spawn } from "node:child_process";
import { access, mkdir, rename, unlink } from "node:fs/promises";
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
}: {
  fileToProcess: string;
  processedDir: string;
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
  try {
    ffprobeStdout = await new Promise<string>((resolve, reject) => {
      const proc = spawn("ffprobe", probeArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let out = "";
      let err = "";

      proc.stdout.on("data", (chunk: Buffer) => {
        out += chunk.toString();
      });

      proc.stderr.on("data", (chunk: Buffer) => {
        err += chunk.toString();
      });

      proc.on("error", (spawnErr) => {
        reject(new Error("Failed to spawn ffprobe: " + spawnErr.message));
      });

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(out);
          return;
        }

        const tail = err.trim().slice(-500);
        reject(
          new Error(
            "ffprobe exited with code " +
              code +
              (tail.length > 0 ? ": " + tail : ""),
          ),
        );
      });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(message);
  }

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
    .flatMap((t) => ["-map", "0:v:0"])
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

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", ffmpegArgs, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderrBuf = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `FFmpeg exited with code ${code}: ${stderrBuf.slice(-500)}`,
          ),
        );
    });
    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });

  console.log(`[Worker ${threadId}] Processed: ${uuid}`);

  return path.join(processedDir, uuid);
}
