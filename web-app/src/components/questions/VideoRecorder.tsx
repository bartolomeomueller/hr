import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

export function VideoRecorder({
  maxDurationSec,
  maxOvertimeSec,
  transferNewChunk,
}: {
  maxDurationSec: number;
  maxOvertimeSec: number;
  transferNewChunk: ({
    recordingId,
    chunk,
    isLastChunk,
    partNumber,
  }: {
    recordingId: string;
    chunk: Blob;
    isLastChunk: boolean;
    partNumber: number;
  }) => Promise<void>;
}) {
  const maxRecordingSec = maxDurationSec + maxOvertimeSec;

  const streamRef = useRef<MediaStream | null>(null); // Asking a user to allow camera/microphone access will result in this stream.
  const videoRef = useRef<HTMLVideoElement>(null); // The <video> element where the stream will be shown before and while recording.
  const mediaRecorderRef = useRef<MediaRecorder | null>(null); // The MediaStream will be fed into the MediaRecorder.
  const startTimeRef = useRef<number | null>(null); // The timestamp when the recording was started.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null); // The setInterval function (running repeatedly) to update the text indicating remaining time.
  const currentRecordingIdRef = useRef<string | null>(null); // The recordingId that should be used for the current recording, so that all chunks get the same id.
  const recordingBufferRef = useRef<Blob[]>([]); // Buffer to hold the recorded chunks before they are transferred.
  const currentPartNumberRef = useRef<number>(1); // The current part number for multipart upload, starting at 1.

  const [isRecording, setIsRecording] = useState(false);
  const [timeFromLimitSec, setTimeFromLimitSec] = useState(maxDurationSec);
  const [error, setError] = useState<string | null>(null);

  const ensurePreviewStream = useCallback(async () => {
    if (streamRef.current) {
      return streamRef.current;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { height: { ideal: 1080 } },
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

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    startTimeRef.current = null;
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
    setTimeFromLimitSec(maxDurationSec);
    currentRecordingIdRef.current = `optimistic-recording-id-${Date.now()}`;
    currentPartNumberRef.current = 1;

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
      if (!currentRecordingIdRef.current) {
        throw new Error(
          "This is a bug, please report it. No recording ID found for new chunk.",
        );
      }

      if (event.data.size > 0) {
        recordingBufferRef.current.push(event.data);

        const aggregatedSize = recordingBufferRef.current.reduce(
          (total, blob) => total + blob.size,
          0,
        );
        // If the size of the buffered chunks exceeds 5 MiB, transfer them and clear the buffer.
        if (aggregatedSize >= 5 * 1024 * 1024) {
          void transferNewChunk({
            recordingId: currentRecordingIdRef.current,
            chunk: new Blob(recordingBufferRef.current, { type: mimeType }),
            isLastChunk: false,
            partNumber: currentPartNumberRef.current,
          });
          recordingBufferRef.current = [];
          currentPartNumberRef.current += 1;
        }
      }
    };

    mediaRecorder.onstop = () => {
      if (!currentRecordingIdRef.current) {
        throw new Error(
          "This is a bug, please report it. No recording ID found for last chunk.",
        );
      }

      void transferNewChunk({
        recordingId: currentRecordingIdRef.current,
        chunk: new Blob(recordingBufferRef.current, { type: mimeType }),
        isLastChunk: true,
        partNumber: currentPartNumberRef.current,
      });
      recordingBufferRef.current = [];
      currentRecordingIdRef.current = null;
      currentPartNumberRef.current = 1;
    };

    mediaRecorder.start(250); // collect data every 250 ms
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);

    startTimeRef.current = performance.now();

    const syncTimeLeftFromStart = () => {
      const startTime = startTimeRef.current;
      if (startTime == null) return;

      const elapsedSec = (performance.now() - startTime) / 1000;
      const clampedElapsedSec = Math.min(elapsedSec, maxRecordingSec);
      setTimeFromLimitSec(maxDurationSec - clampedElapsedSec);

      if (elapsedSec >= maxRecordingSec) {
        stopRecording();
      }
    };

    syncTimeLeftFromStart();
    tickRef.current = setInterval(syncTimeLeftFromStart, 250);
  }, [
    ensurePreviewStream,
    stopRecording,
    maxDurationSec,
    maxRecordingSec,
    transferNewChunk,
  ]);

  const isOvertime = timeFromLimitSec < 0;
  const absTimeSec = Math.abs(timeFromLimitSec);
  const totalSeconds = isOvertime
    ? Math.floor(absTimeSec)
    : Math.ceil(absTimeSec);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <div className="flex w-full flex-col items-center justify-center gap-4">
      {error && (
        <p className="rounded-lg border border-red-500 bg-red-500/10 px-4 py-3 text-red-400">
          {error}
        </p>
      )}

      <div className="w-full overflow-hidden rounded-xl shadow-lg">
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
          <span
            className={cn(
              "font-mono",
              isOvertime ? "animate-pulse text-destructive" : "text-lg",
            )}
          >
            {isOvertime
              ? `Recording — +${formattedTime} overtime`
              : `Recording — ${formattedTime} remaining`}
          </span>
        </div>
      )}

      {!isRecording ? (
        <Button type="button" onClick={startRecording}>
          Start Recording
        </Button>
      ) : (
        <Button type="button" onClick={stopRecording} variant="destructive">
          Stop Recording
        </Button>
      )}
    </div>
  );
}
