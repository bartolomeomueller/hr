import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/videotest")({
  component: RouteComponent,
});

function RouteComponent() {
  const [recordingData, setRecordingData] = useState<{
    blob: Blob;
    mimeType: string;
  } | null>(null);
  const [recordingObjectUrl, setRecordingObjectUrl] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!recordingData) {
      setRecordingObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(recordingData.blob);
    setRecordingObjectUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [recordingData]);

  return (
    <div className="flex min-h-screen flex-col items-center gap-8 bg-slate-900 p-8">
      <VideoRecorder
        maxDurationMs={3 * 60 * 1000}
        maxOvertimeMs={60 * 1000}
        hasRecording={!!recordingData}
        onRecordingChange={setRecordingData}
      />

      {recordingData && recordingObjectUrl && (
        <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p className="mb-3 text-sm font-medium text-slate-300">
            Recorded Preview (parent-owned data)
          </p>
          <video
            className="aspect-video w-full rounded-lg object-cover"
            src={recordingObjectUrl}
            controls
          >
            <track kind="captions" />
          </video>

          <div className="mt-4 flex flex-wrap gap-4">
            <a
              href={recordingObjectUrl}
              download="recording.webm"
              className="rounded-lg border border-slate-600 px-6 py-3 font-semibold text-slate-300 transition-colors hover:border-slate-400 hover:text-white"
            >
              Download
            </a>

            <button
              type="button"
              onClick={() => {
                // Parent now has the Blob and can upload it wherever needed.
                console.log(
                  "Upload this blob from parent:",
                  recordingData.blob,
                );
              }}
              className="rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-500/30 transition-colors hover:bg-emerald-600"
            >
              Upload Placeholder
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            {recordingData.mimeType} •{" "}
            {Math.round(recordingData.blob.size / 1024)} KB
          </p>
        </div>
      )}
    </div>
  );
}

function VideoRecorder({
  maxDurationMs,
  maxOvertimeMs,
  hasRecording,
  onRecordingChange,
}: {
  maxDurationMs: number;
  maxOvertimeMs: number;
  hasRecording: boolean;
  onRecordingChange: (data: { blob: Blob; mimeType: string } | null) => void;
}) {
  const maxRecordingMs = maxDurationMs + maxOvertimeMs;

  const streamRef = useRef<MediaStream | null>(null); // Asking a user to allow camera/microphone access will result in this stream.
  const videoRef = useRef<HTMLVideoElement>(null); // The <video> element where the stream will be shown before and while recording.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null); // The MediaStream will be fed into the MediaRecorder.
  const chunksRef = useRef<Blob[]>([]); // The blob where the recorded video data will be stored, written in chunks.
  const startTimeRef = useRef<number | null>(null); // The timestamp when the recording was started.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null); // The setInterval function (running repeatedly) to update the text indicating remaining time.

  const [isRecording, setIsRecording] = useState(false);
  const [timeFromLimitMs, setTimeFromLimitMs] = useState(maxDurationMs);
  const [error, setError] = useState<string | null>(null);

  const ensurePreviewStream = useCallback(async () => {
    if (streamRef.current) {
      return streamRef.current;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {
          // Autoplay blocked by browser; preview will appear once user interacts
        });
      }

      return stream;
    } catch (error) {
      setError(
        "Could not access camera/microphone. Please allow permissions and try again. If you do not find the permissions settings, just reload and you will be asked again.",
      );
      console.log("Error accessing media devices:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    void ensurePreviewStream();
  }, [ensurePreviewStream]);

  const stopRecording = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    startTimeRef.current = null;

    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }

    setIsRecording(false);
  }, []);

  // Stop recording and release camera/mic tracks on unmount.
  // Lower cleanup functions will run before upper ones.
  useEffect(() => {
    return () => {
      stopRecording();

      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
    };
  }, [stopRecording]);

  const startRecording = useCallback(async () => {
    setError(null);
    onRecordingChange(null);
    setTimeFromLimitMs(maxDurationMs);
    chunksRef.current = [];

    const stream = await ensurePreviewStream();
    if (!stream) {
      return;
    }

    const av1 = "video/webm;codecs=av1,opus";
    const vp9 = "video/webm;codecs=vp9,opus";
    const vp8 = "video/webm;codecs=vp8,opus";
    const webm = "video/webm";
    let mimeType = "";
    for (const type of [av1, vp9, vp8, webm]) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        break;
      }
    }
    if (!mimeType) {
      setError(
        "No supported MIME type found for recording. Please choose another browser or another device.",
      );
      return;
    }

    const mediaRecorder = new MediaRecorder(stream, { mimeType });
    console.log("MediaRecorder created with mimeType:", mediaRecorder.mimeType);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mimeType,
      });
      onRecordingChange({
        blob,
        mimeType,
      });
    };

    mediaRecorder.start(250); // collect data every 250 ms
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);

    startTimeRef.current = performance.now();

    const syncTimeLeftFromStart = () => {
      const startTime = startTimeRef.current;
      if (startTime == null) return;

      const elapsedMs = performance.now() - startTime;
      const clampedElapsedMs = Math.min(elapsedMs, maxRecordingMs);
      setTimeFromLimitMs(maxDurationMs - clampedElapsedMs);

      if (elapsedMs >= maxRecordingMs) {
        stopRecording();
      }
    };

    syncTimeLeftFromStart();
    tickRef.current = setInterval(syncTimeLeftFromStart, 250);
  }, [
    ensurePreviewStream,
    stopRecording,
    maxDurationMs,
    maxRecordingMs,
    onRecordingChange,
  ]);

  const isOvertime = timeFromLimitMs < 0;
  const absTimeMs = Math.abs(timeFromLimitMs);
  const totalSeconds = isOvertime
    ? Math.floor(absTimeMs / 1000)
    : Math.ceil(absTimeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="flex w-full max-w-2xl flex-col items-center justify-center gap-8">
      {error && (
        <p className="rounded-lg border border-red-500 bg-red-500/10 px-4 py-3 text-red-400">
          {error}
        </p>
      )}

      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
        <video
          ref={videoRef}
          className="aspect-video w-full object-cover"
          playsInline
          autoPlay
          muted
        >
          <track kind="captions" />
        </video>
      </div>

      {isRecording && (
        <div className="flex items-center gap-3">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-red-500" />
          <span
            className={
              isOvertime
                ? "animate-pulse font-mono text-lg text-red-400"
                : "font-mono text-lg text-white"
            }
          >
            {isOvertime
              ? `Recording — +${formattedTime} overtime`
              : `Recording — ${formattedTime} remaining`}
          </span>
        </div>
      )}

      <div className="flex gap-4">
        {!isRecording ? (
          <button
            type="button"
            onClick={startRecording}
            className="rounded-lg bg-cyan-500 px-6 py-3 font-semibold text-white shadow-lg shadow-cyan-500/30 transition-colors hover:bg-cyan-600"
          >
            {hasRecording ? "Record Again" : "Start Recording"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="rounded-lg bg-red-500 px-6 py-3 font-semibold text-white shadow-lg shadow-red-500/30 transition-colors hover:bg-red-600"
          >
            Stop Recording
          </button>
        )}
      </div>
    </div>
  );
}
