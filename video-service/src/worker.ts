import { mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { parentPort } from "node:worker_threads";
import ffmpeg from "fluent-ffmpeg";

const workerId = parseInt(process.env.WORKER_ID || "0");
const storageRoot =
  process.env.VIDEO_STORAGE_DIR || path.resolve(process.cwd(), "tmp/videos");
const uploadDir = path.join(storageRoot, "uploads");
const processedDir = path.join(storageRoot, "processed");

interface AssignJobMessage {
  type: "assign-job";
  uuid: string;
}

if (!parentPort) {
  throw new Error("Worker must be spawned from parent thread");
}

/**
 * Request the next job from the main thread.
 */
function requestJob(): void {
  parentPort!.postMessage({ type: "request-job", workerId });
}

/**
 * Process a video file using ffmpeg.
 * Transcodes WebM to DASH (MPD + m4s segments).
 * On success, deletes the source file.
 * On failure, leaves the source file for retry.
 */
async function processVideo(uuid: string): Promise<void> {
  const inputPath = path.join(uploadDir, `${uuid}.webm`);
  const outputDir = path.join(processedDir, uuid);
  const outputPath = path.join(outputDir, "manifest.mpd");

  try {
    // Create output directory
    await mkdir(outputDir, { recursive: true });

    // Check if input file exists
    try {
      await readdir(path.dirname(inputPath));
    } catch {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Get resolution
    // ffprobe
    // -v error # verbosity set to error only
    // -select_streams v:0 # select first video stream
    // -show_entries stream=width,height # show width and height
    // -of csv=p=0 # output as csv with no header
    // recording.webm # file name
    const resolution = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        ffmpeg(inputPath).ffprobe((err, data) => {
          if (err) {
            reject(new Error(`ffprobe error: ${err.message}`));
          } else {
            const stream = data.streams.find((s) => s.codec_type === "video");
            if (stream && stream.width && stream.height) {
              resolve({ width: stream.width, height: stream.height });
            } else {
              reject(new Error("No video stream found in input file"));
            }
          }
        });
      },
    );
    console.log(
      `[Worker ${workerId}] Input resolution: ${resolution.width}x${resolution.height}`,
    );

    let mapPartString = "";
    let filterPartString = "";
    if (resolution.height >= 1080) {
      mapPartString = "-map 0:v:0 -map 0:v:0 -map 0:v:0 -map 0:a:0";
      filterPartString =
        '-filter:v:0 "fps=24,scale=-2:\'min(1080,ih)\'" -force_key_frames:v:0 "expr:gte(t,n_forced*4)" ' +
        '-filter:v:1 "fps=24,scale=-2:\'min(720,ih)\'"  -force_key_frames:v:1 "expr:gte(t,n_forced*4)" ' +
        '-filter:v:2 "fps=24,scale=-2:\'min(480,ih)\'"  -force_key_frames:v:2 "expr:gte(t,n_forced*4)"';
    } else if (resolution.height >= 720) {
      mapPartString = "-map 0:v:0 -map 0:v:0 -map 0:a:0";
      filterPartString =
        '-filter:v:0 "fps=24,scale=-2:\'min(720,ih)\'"  -force_key_frames:v:0 "expr:gte(t,n_forced*4)" ' +
        '-filter:v:1 "fps=24,scale=-2:\'min(480,ih)\'"  -force_key_frames:v:1 "expr:gte(t,n_forced*4)"';
    } else {
      mapPartString = "-map 0:v:0 -map 0:a:0";
      filterPartString =
        '-filter:v:0 "fps=24,scale=-2:\'min(480,ih)\'"  -force_key_frames:v:0 "expr:gte(t,n_forced*4)"';
    }

    // Transcode to DASH format
    // ffmpeg -i recording.webm \
    // -map 0:v:0 -map 0:a:0 -map 0:v:0 -map 0:a:0 -map 0:v:0 -map 0:a:0 \
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
    // -adaptation_sets 'id=0,streams=v id=1,streams=a' \
    // dash-output/manifest.mpd
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .outputOptions([
          mapPartString,
          "-c:v libaom-av1 -crf 22 -b:v 0 -cpu-used 6",
          filterPartString,
          "-c:a libopus -b:a 96k",
          "-f dash",
          "-seg_duration 4",
          "-use_template 1",
          "-use_timeline 1",
          "-init_seg_name 'init-stream$RepresentationID$.webm'",
          "-media_seg_name 'chunk-stream$RepresentationID$-$Number%05d$.webm'",
          "-adaptation_sets 'id=0,streams=v id=1,streams=a'",
          "manifest.mpd",
        ])
        .on("error", (err: Error) => {
          reject(new Error(`FFmpeg error: ${err.message}`));
        })
        .on("end", () => {
          resolve();
        })
        .run();
    });

    // Delete the original WebM file on success
    await unlink(inputPath);

    console.log(`[Worker ${workerId}] Processed: ${uuid}`);
    parentPort!.postMessage({ type: "job-complete", uuid, workerId });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(
      `[Worker ${workerId}] Failed to process ${uuid}: ${errorMsg}`,
    );
    parentPort!.postMessage({
      type: "job-failed",
      uuid,
      workerId,
      error: errorMsg,
    });
  }
}

/**
 * Main worker loop: request job, process it, repeat.
 */
async function main(): Promise<void> {
  console.log(`[Worker ${workerId}] Started`);

  parentPort!.on("message", async (msg: AssignJobMessage) => {
    if (msg.type === "assign-job") {
      const uuid = msg.uuid;
      await processVideo(uuid);
      // Request the next job
      requestJob();
    }
  });

  // Initial request to get rolling
  requestJob();
}

main().catch((err) => {
  console.error(`[Worker ${workerId}] Fatal error:`, err);
  process.exit(1);
});
