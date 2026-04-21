import { Camera, ChevronDown, Mic, Square, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

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
  // List of all available audio and video input devices.
  const [devices, setDevices] = useState<{
    audioinput: MediaDeviceInfo[];
    videoinput: MediaDeviceInfo[];
  }>({
    audioinput: [],
    videoinput: [],
  });
  // Currently selected audio and video deviceIds.
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState("");
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState("");

  const syncDevices = useCallback(
    async ({
      preferredAudioDeviceId,
      preferredVideoDeviceId,
    }: {
      preferredAudioDeviceId: string;
      preferredVideoDeviceId: string;
    }) => {
      const availableDevices = await readInputDevices();

      const nextAudioDeviceId = getPreferredDeviceId(
        availableDevices.audioinput,
        preferredAudioDeviceId,
      );
      const nextVideoDeviceId = getPreferredDeviceId(
        availableDevices.videoinput,
        preferredVideoDeviceId,
      );
      const nextResolvedAudioDeviceKey = getResolvedDeviceKey(
        availableDevices.audioinput,
        nextAudioDeviceId,
      );
      const nextResolvedVideoDeviceKey = getResolvedDeviceKey(
        availableDevices.videoinput,
        nextVideoDeviceId,
      );

      setDevices(availableDevices);
      setSelectedAudioDeviceId(nextAudioDeviceId);
      setSelectedVideoDeviceId(nextVideoDeviceId);

      return {
        nextAudioDeviceId,
        nextVideoDeviceId,
        nextResolvedAudioDeviceKey,
        nextResolvedVideoDeviceKey,
      };
    },
    [],
  );

  const refreshPreviewStream = useCallback(
    async ({
      audioDeviceId,
      videoDeviceId,
      replaceAudio,
      replaceVideo,
    }: {
      audioDeviceId: string;
      videoDeviceId: string;
      replaceAudio: boolean;
      replaceVideo: boolean;
    }) => {
      try {
        if (!streamRef.current || (replaceAudio && replaceVideo)) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: getDeviceConstraint(videoDeviceId, {
              height: { ideal: 1080 },
            }),
            audio: getDeviceConstraint(audioDeviceId, true),
          });

          if (streamRef.current) {
            stopMediaStream(streamRef.current);
          }
          streamRef.current = stream;
          setVideoElementStream(videoRef.current, stream);
        } else {
          if (replaceAudio) {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              audio: getDeviceConstraint(audioDeviceId, true),
              video: false,
            });
            replaceTrack(
              streamRef.current,
              audioStream.getAudioTracks()[0] ?? null,
              "audio",
            );
          }

          if (replaceVideo) {
            const videoStream = await navigator.mediaDevices.getUserMedia({
              video: getDeviceConstraint(videoDeviceId, {
                height: { ideal: 1080 },
              }),
              audio: false,
            });
            replaceTrack(
              streamRef.current,
              videoStream.getVideoTracks()[0] ?? null,
              "video",
            );
          }
        }

        setSelectedAudioDeviceId(audioDeviceId);
        setSelectedVideoDeviceId(videoDeviceId);
        setError(null);

        await syncDevices({
          preferredAudioDeviceId: audioDeviceId,
          preferredVideoDeviceId: videoDeviceId,
        });
        return streamRef.current;
      } catch (error) {
        setError(
          "Could not access camera/microphone. Please allow permissions and try again. If you do not find the permissions settings, just reload and you will be asked again.",
        );
        console.log("Error accessing media devices:", error);
        return null;
      }
    },
    [syncDevices],
  );

  const ensurePreviewStream = useCallback(async () => {
    if (streamRef.current) {
      return streamRef.current;
    }

    return refreshPreviewStream({
      audioDeviceId: selectedAudioDeviceId,
      videoDeviceId: selectedVideoDeviceId,
      replaceAudio: true,
      replaceVideo: true,
    });
  }, [refreshPreviewStream, selectedAudioDeviceId, selectedVideoDeviceId]);

  useEffect(() => {
    void (async () => {
      await ensurePreviewStream();
    })();
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

  // Audio and video hardware can change while this page is open, so resync the
  // selected devices and preview stream whenever the browser reports a device change.
  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) {
      return;
    }

    const handleDeviceChange = () => {
      void (async () => {
        if (
          devices.audioinput.length === 0 ||
          devices.videoinput.length === 0 ||
          !selectedAudioDeviceId ||
          !selectedVideoDeviceId
        ) {
          return;
        }

        const currentResolvedAudioDeviceKey = getResolvedDeviceKey(
          devices.audioinput,
          selectedAudioDeviceId,
        );
        const currentResolvedVideoDeviceKey = getResolvedDeviceKey(
          devices.videoinput,
          selectedVideoDeviceId,
        );
        const {
          nextAudioDeviceId,
          nextVideoDeviceId,
          nextResolvedAudioDeviceKey,
          nextResolvedVideoDeviceKey,
        } = await syncDevices({
          preferredAudioDeviceId: selectedAudioDeviceId,
          preferredVideoDeviceId: selectedVideoDeviceId,
        });
        if (
          isRecording ||
          (currentResolvedAudioDeviceKey === nextResolvedAudioDeviceKey &&
            currentResolvedVideoDeviceKey === nextResolvedVideoDeviceKey)
        ) {
          return;
        }

        await refreshPreviewStream({
          audioDeviceId: nextAudioDeviceId,
          videoDeviceId: nextVideoDeviceId,
          replaceAudio: true,
          replaceVideo: true,
        });
      })();
    };

    mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [
    devices.audioinput,
    devices.videoinput,
    isRecording,
    refreshPreviewStream,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    syncDevices,
  ]);

  // Stop recording and release camera/mic tracks on unmount.
  // Lower cleanup functions will run before upper ones.
  useEffect(() => {
    return () => {
      stopRecording();
      if (streamRef.current) {
        stopMediaStream(streamRef.current);
        streamRef.current = null;
      }
    };
  }, [stopRecording]);

  const selectAudioDevice = useCallback(
    async (deviceId: string) => {
      await refreshPreviewStream({
        audioDeviceId: deviceId,
        videoDeviceId: selectedVideoDeviceId,
        replaceAudio: true,
        replaceVideo: false,
      });
    },
    [refreshPreviewStream, selectedVideoDeviceId],
  );

  const selectVideoDevice = useCallback(
    async (deviceId: string) => {
      await refreshPreviewStream({
        audioDeviceId: selectedAudioDeviceId,
        videoDeviceId: deviceId,
        replaceAudio: false,
        replaceVideo: true,
      });
    },
    [refreshPreviewStream, selectedAudioDeviceId],
  );

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

      <div className="relative w-full overflow-hidden rounded-xl bg-muted shadow-lg">
        <video
          ref={videoRef}
          className="aspect-video w-full object-cover"
          playsInline
          autoPlay
          muted
        >
          <track kind="captions" />
        </video>

        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-full bg-background/20 px-3 py-2 shadow-lg backdrop-blur-sm">
            <DeviceSelectorButton
              icon={Mic}
              label="Microphone"
              disabled={isRecording || devices.audioinput.length === 0}
              value={selectedAudioDeviceId}
              devices={devices.audioinput}
              onValueChange={selectAudioDevice}
            />

            <DeviceSelectorButton
              icon={Camera}
              label="Camera"
              disabled={isRecording || devices.videoinput.length === 0}
              value={selectedVideoDeviceId}
              devices={devices.videoinput}
              onValueChange={selectVideoDevice}
            />

            <div className="h-8 w-px bg-border" />

            {!isRecording ? (
              <Button
                type="button"
                onClick={startRecording}
                variant="default"
                className="rounded-full px-4"
                size="lg"
              >
                <Video className="size-6 fill-current" />
                Record
              </Button>
            ) : (
              <Button
                type="button"
                onClick={stopRecording}
                variant="destructive"
                className="rounded-full px-4"
                size="lg"
              >
                <Square className="size-6 fill-current" />
                Stop
              </Button>
            )}
          </div>
        </div>
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
    </div>
  );
}

function DeviceSelectorButton({
  icon: Icon,
  label,
  disabled,
  value,
  devices,
  onValueChange,
}: {
  icon: typeof Mic;
  label: string;
  disabled: boolean;
  value: string;
  devices: MediaDeviceInfo[];
  onValueChange: (value: string) => void | Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="rounded-full"
          aria-label={
            devices.length === 0
              ? label
              : `${label}: ${getSelectedDeviceLabel(devices, value)}`
          }
        >
          <span className="relative">
            <Icon className="size-5" />
            <ChevronDown className="absolute -right-3 -bottom-1 size-3 rounded-full bg-background text-muted-foreground" />
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-max max-w-[calc(100vw-2rem)] min-w-60"
        align="center"
      >
        {devices.length > 0 ? (
          <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
            {devices.map((device) => (
              <DropdownMenuRadioItem
                key={device.deviceId}
                value={device.deviceId}
                className="items-start"
              >
                <span className="truncate">{getDeviceLabel(device)}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        ) : (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            No entry found
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Releases all resources (camera/mic) used by the given stream by stopping all its tracks.
function stopMediaStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function setVideoElementStream(
  videoElement: HTMLVideoElement | null,
  stream: MediaStream,
) {
  if (!videoElement) {
    throw new Error(
      "This is a bug, please report it. Missing video element for preview stream.",
    );
  }

  videoElement.srcObject = stream;
  videoElement.muted = true;
  videoElement.play().catch(() => {
    // Autoplay blocked by browser; preview will appear once user interacts
  });
}

function replaceTrack(
  stream: MediaStream,
  nextTrack: MediaStreamTrack | null,
  kind: "audio" | "video",
) {
  const currentTrack = stream.getTracks().find((track) => track.kind === kind);
  if (currentTrack) {
    stream.removeTrack(currentTrack);
    currentTrack.stop();
  }
  if (nextTrack) {
    stream.addTrack(nextTrack);
  }
}

// Reads the available media input devices, deduplicates them and returns them grouped by kind.
async function readInputDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    throw new Error(
      "This browser does not support enumerating media devices for the recorder.",
    );
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    audioinput: dedupeDevices(
      devices.filter((device) => device.kind === "audioinput"),
    ),
    videoinput: dedupeDevices(
      devices.filter((device) => device.kind === "videoinput"),
    ),
  };
}

// Deduplicates devices that represent the same physical device.
// If a default device is available, it is kept as the first entry.
function dedupeDevices(devices: MediaDeviceInfo[]) {
  const defaultDevice = devices.find((device) => device.deviceId === "default");
  const dedupedDevices = new Map<string, MediaDeviceInfo>();

  for (const device of devices) {
    if (device.deviceId === "default") {
      continue;
    }

    const dedupeKey = getCanonicalDeviceKey(device);
    if (!dedupedDevices.has(dedupeKey)) {
      dedupedDevices.set(dedupeKey, device);
    }
  }

  return defaultDevice
    ? [defaultDevice, ...dedupedDevices.values()]
    : [...dedupedDevices.values()];
}

// Returns the previous selected deviceId if it is still available.
// Otherwise falls back to the "default" device if available, or the first available device, or an empty string if no devices are available.
function getPreferredDeviceId(
  devices: MediaDeviceInfo[],
  selectedDeviceId: string,
) {
  // This can be untrue if the previous selected device gets disconnected.
  if (devices.some((device) => device.deviceId === selectedDeviceId)) {
    return selectedDeviceId;
  }

  return (
    devices.find((device) => device.deviceId === "default")?.deviceId ??
    devices[0]?.deviceId ??
    ""
  );
}

function getDeviceConstraint(
  deviceId: string,
  fallbackValue: boolean | MediaTrackConstraints,
) {
  if (!deviceId || deviceId === "default") {
    return fallbackValue;
  }

  if (typeof fallbackValue === "boolean") {
    return { deviceId: { exact: deviceId } };
  }

  return {
    ...fallbackValue,
    deviceId: { exact: deviceId },
  };
}

// The device label can contain a technical suffix, which is removed by this function.
function getDeviceLabel(device: MediaDeviceInfo) {
  // Suffix can be something like " (2ca3:4011)"
  const removeSuffixRegex = /\s*\([0-9a-f]+:[0-9a-f]+\)$/i;
  return device.label.replace(removeSuffixRegex, "");
}

// Returns the label of the currently selected device, or "Unknown device" if it cannot be found (e.g. because it got unplugged).
function getSelectedDeviceLabel(
  devices: MediaDeviceInfo[],
  selectedDeviceId: string,
) {
  const selectedDevice = devices.find(
    (device) => device.deviceId === selectedDeviceId,
  );
  if (!selectedDevice) {
    throw new Error(
      "This is a bug, please report it. Selected device is missing from the current device list.",
    );
  }

  return getDeviceLabel(selectedDevice);
}

// Resolve the currently selected device to the concrete underlying device key.
// When "default" is selected, this returns the representative real device behind it.
function getResolvedDeviceKey(
  devices: MediaDeviceInfo[],
  selectedDeviceId: string,
) {
  const selectedDevice = devices.find(
    (device) => device.deviceId === selectedDeviceId,
  );
  if (!selectedDevice) {
    throw new Error(
      "This is a bug, please report it. Selected device is missing from the current device list.",
    );
  }

  if (selectedDevice.deviceId === "default") {
    const representativeDevice = getDefaultRepresentativeDevice(devices);
    return representativeDevice
      ? getCanonicalDeviceKey(representativeDevice)
      : selectedDevice.deviceId;
  }

  return getCanonicalDeviceKey(selectedDevice);
}

function getDefaultRepresentativeDevice(devices: MediaDeviceInfo[]) {
  const defaultDevice = devices.find((device) => device.deviceId === "default");
  if (!defaultDevice) {
    throw new Error(
      "This is a bug, please report it. A browser default device needs a default entry to represent it.",
    );
  }

  return devices.find(
    (device) =>
      device.deviceId !== "default" &&
      defaultDevice.groupId &&
      device.groupId === defaultDevice.groupId,
  );
}

// The groupId is the same for devices that are part of the same physical device.
// That should be set (maybe safari might cause issues), if not fall back to the deviceId.
function getCanonicalDeviceKey(device: MediaDeviceInfo) {
  return device.groupId || device.deviceId;
}
