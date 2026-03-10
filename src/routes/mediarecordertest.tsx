import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/mediarecordertest")({
  component: RouteComponent,
});

const MAX_DURATION_MS = 3 * 60 * 1000; // 3 minutes

function RouteComponent() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(MAX_DURATION_MS / 1000);
  const [error, setError] = useState<string | null>(null);

  // Revoke the object URL when it changes or on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    const mediaRecorder = mediaRecorderRef.current;
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    setIsRecording(false);
  }, []);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  const startRecording = useCallback(async () => {
    setError(null);
    setRecordedUrl(null);
    setTimeLeft(MAX_DURATION_MS / 1000);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
    } catch {
      setError(
        "Could not access camera/microphone. Please allow permissions and try again.",
      );
      return;
    }

    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {
        // Autoplay blocked by browser; preview will appear once user interacts
      });
    }

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "";

    const mediaRecorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mimeType || "video/webm",
      });
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);

      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.muted = false;
      }
    };

    mediaRecorder.start(250); // collect data every 250 ms
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);

    timerRef.current = setTimeout(() => {
      stopRecording();
    }, MAX_DURATION_MS);

    countdownRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopRecording]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-900 p-8">
      <h1 className="text-3xl font-bold text-white">
        Video Recorder{" "}
        <span className="text-base font-normal text-slate-400">
          (native MediaRecorder)
        </span>
      </h1>

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
          src={!isRecording && recordedUrl ? recordedUrl : undefined}
          controls={!isRecording && !!recordedUrl}
          autoPlay={!isRecording && !!recordedUrl}
        >
          <track kind="captions" />
        </video>
      </div>

      {isRecording && (
        <div className="flex items-center gap-3">
          <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-red-500" />
          <span className="font-mono text-lg text-white">
            Recording — {formattedTime} remaining
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
            {recordedUrl ? "Record Again" : "Start Recording"}
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

        {recordedUrl && !isRecording && (
          <a
            href={recordedUrl}
            download="recording.webm"
            className="rounded-lg border border-slate-600 px-6 py-3 font-semibold text-slate-300 transition-colors hover:border-slate-400 hover:text-white"
          >
            Download
          </a>
        )}
      </div>
    </div>
  );
}
