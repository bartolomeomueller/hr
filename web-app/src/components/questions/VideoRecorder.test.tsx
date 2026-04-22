// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoRecorder } from "./VideoRecorder";

const enumerateDevicesMock = vi.fn();
const getUserMediaMock = vi.fn();
const mediaDevicesAddEventListenerMock = vi.fn();
const mediaDevicesRemoveEventListenerMock = vi.fn();
const audioContextCreateMediaStreamSourceMock = vi.fn();
let latestMediaRecorder: FakeMediaRecorder | null = null;
let shouldThrowNextCreateMediaStreamSource = false;

class FakeMediaRecorder {
  static isTypeSupported(type: string) {
    return type === "video/webm";
  }

  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  state: "inactive" | "recording" = "inactive";

  constructor(
    _stream: MediaStream,
    options: {
      mimeType: string;
    },
  ) {
    this.mimeType = options.mimeType;
    latestMediaRecorder = this;
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

class FakeAudioContext {
  state: "running" | "suspended" | "closed" = "running";
  destination = {} as AudioDestinationNode;

  createMediaStreamSource(_stream: MediaStream) {
    if (shouldThrowNextCreateMediaStreamSource) {
      shouldThrowNextCreateMediaStreamSource = false;
      throw new Error("Audio monitor source creation failed.");
    }
    audioContextCreateMediaStreamSourceMock();
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as MediaStreamAudioSourceNode;
  }

  createDelay(_maxDelayTime?: number) {
    return {
      delayTime: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as DelayNode;
  }

  createGain() {
    return {
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as GainNode;
  }

  resume = vi.fn(async () => {
    this.state = "running";
  });

  close = vi.fn(async () => {
    this.state = "closed";
  });
}

beforeEach(() => {
  latestMediaRecorder = null;
  shouldThrowNextCreateMediaStreamSource = false;
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("AudioContext", FakeAudioContext);
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      enumerateDevices: enumerateDevicesMock,
      getUserMedia: getUserMediaMock,
      addEventListener: mediaDevicesAddEventListenerMock,
      removeEventListener: mediaDevicesRemoveEventListenerMock,
    },
  });

  enumerateDevicesMock.mockResolvedValue([
    createDevice({
      deviceId: "default",
      groupId: "audio-default",
      kind: "audioinput",
      label: "MacBook Pro Microphone",
    }),
    createDevice({
      deviceId: "audio-built-in",
      groupId: "audio-default",
      kind: "audioinput",
      label: "MacBook Pro Microphone",
    }),
    createDevice({
      deviceId: "audio-external",
      groupId: "audio-external",
      kind: "audioinput",
      label: "DJI Mic Mini",
    }),
    createDevice({
      deviceId: "default",
      groupId: "video-default",
      kind: "videoinput",
      label: "FaceTime HD Camera",
    }),
    createDevice({
      deviceId: "video-built-in",
      groupId: "video-default",
      kind: "videoinput",
      label: "FaceTime HD Camera",
    }),
    createDevice({
      deviceId: "video-external",
      groupId: "video-external",
      kind: "videoinput",
      label: "Logitech Brio",
    }),
  ]);

  getUserMediaMock.mockImplementation(
    async (constraints: MediaStreamConstraints) =>
      createMediaStream(constraints),
  );
});

afterEach(() => {
  cleanup();
  audioContextCreateMediaStreamSourceMock.mockReset();
  enumerateDevicesMock.mockReset();
  getUserMediaMock.mockReset();
  mediaDevicesAddEventListenerMock.mockReset();
  mediaDevicesRemoveEventListenerMock.mockReset();
  vi.unstubAllGlobals();
});

describe("VideoRecorder", () => {
  it("updates the selected default microphone after a devicechange switches the browser default", async () => {
    renderVideoRecorder();

    await screen.findByRole("button", {
      name: /Microphone: MacBook Pro Microphone/i,
    });

    enumerateDevicesMock.mockResolvedValue([
      createDevice({
        deviceId: "default",
        groupId: "audio-new-default",
        kind: "audioinput",
        label: "Shure MV7",
      }),
      createDevice({
        deviceId: "audio-shure",
        groupId: "audio-new-default",
        kind: "audioinput",
        label: "Shure MV7",
      }),
      createDevice({
        deviceId: "audio-external",
        groupId: "audio-external",
        kind: "audioinput",
        label: "DJI Mic Mini",
      }),
      createDevice({
        deviceId: "default",
        groupId: "video-default",
        kind: "videoinput",
        label: "FaceTime HD Camera",
      }),
      createDevice({
        deviceId: "video-built-in",
        groupId: "video-default",
        kind: "videoinput",
        label: "FaceTime HD Camera",
      }),
      createDevice({
        deviceId: "video-external",
        groupId: "video-external",
        kind: "videoinput",
        label: "Logitech Brio",
      }),
    ]);

    const deviceChangeRegistrations =
      mediaDevicesAddEventListenerMock.mock.calls.filter(
        ([eventName]) => eventName === "devicechange",
      );
    const handleDeviceChange = deviceChangeRegistrations.at(-1)?.[1] as
      | (() => void)
      | undefined;

    expect(handleDeviceChange).toBeTruthy();
    handleDeviceChange?.();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Microphone: Shure MV7/i }),
      ).toBeTruthy();
    });
  });

  it("does not reacquire media when devicechange keeps the same default microphone", async () => {
    renderVideoRecorder();

    await screen.findByRole("button", {
      name: /Microphone: MacBook Pro Microphone/i,
    });

    expect(getUserMediaMock).toHaveBeenCalledTimes(1);

    enumerateDevicesMock.mockResolvedValue([
      createDevice({
        deviceId: "default",
        groupId: "audio-default",
        kind: "audioinput",
        label: "MacBook Pro Microphone",
      }),
      createDevice({
        deviceId: "audio-built-in",
        groupId: "audio-default",
        kind: "audioinput",
        label: "MacBook Pro Microphone",
      }),
      createDevice({
        deviceId: "audio-external",
        groupId: "audio-external",
        kind: "audioinput",
        label: "DJI Mic Mini",
      }),
      createDevice({
        deviceId: "default",
        groupId: "video-default",
        kind: "videoinput",
        label: "FaceTime HD Camera",
      }),
      createDevice({
        deviceId: "video-built-in",
        groupId: "video-default",
        kind: "videoinput",
        label: "FaceTime HD Camera",
      }),
      createDevice({
        deviceId: "video-external",
        groupId: "video-external",
        kind: "videoinput",
        label: "Logitech Brio",
      }),
    ]);

    const deviceChangeRegistrations =
      mediaDevicesAddEventListenerMock.mock.calls.filter(
        ([eventName]) => eventName === "devicechange",
      );
    const handleDeviceChange = deviceChangeRegistrations.at(-1)?.[1] as
      | (() => void)
      | undefined;

    expect(handleDeviceChange).toBeTruthy();
    handleDeviceChange?.();

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    });
  });

  it("selects a clicked microphone", async () => {
    renderVideoRecorder();

    await screen.findByRole("button", {
      name: /Microphone: MacBook Pro Microphone/i,
    });

    openDropdown(
      screen.getByRole("button", {
        name: /Microphone: MacBook Pro Microphone/i,
      }),
    );

    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "DJI Mic Mini" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Microphone: DJI Mic Mini/i }),
      ).toBeTruthy();
    });
  });

  it("falls back to the default microphone when the selected microphone disappears", async () => {
    renderVideoRecorder();

    openDropdown(
      await screen.findByRole("button", {
        name: /Microphone: MacBook Pro Microphone/i,
      }),
    );

    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "DJI Mic Mini" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Microphone: DJI Mic Mini/i }),
      ).toBeTruthy();
    });

    enumerateDevicesMock.mockResolvedValue([
      createDevice({
        deviceId: "default",
        groupId: "audio-default",
        kind: "audioinput",
        label: "MacBook Pro Microphone",
      }),
      createDevice({
        deviceId: "audio-built-in",
        groupId: "audio-default",
        kind: "audioinput",
        label: "MacBook Pro Microphone",
      }),
      createDevice({
        deviceId: "default",
        groupId: "video-default",
        kind: "videoinput",
        label: "FaceTime HD Camera",
      }),
      createDevice({
        deviceId: "video-built-in",
        groupId: "video-default",
        kind: "videoinput",
        label: "FaceTime HD Camera",
      }),
      createDevice({
        deviceId: "video-external",
        groupId: "video-external",
        kind: "videoinput",
        label: "Logitech Brio",
      }),
    ]);

    const deviceChangeRegistrations =
      mediaDevicesAddEventListenerMock.mock.calls.filter(
        ([eventName]) => eventName === "devicechange",
      );
    const handleDeviceChange = deviceChangeRegistrations.at(-1)?.[1] as
      | (() => void)
      | undefined;

    expect(handleDeviceChange).toBeTruthy();
    handleDeviceChange?.();

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /Microphone: MacBook Pro Microphone/i,
        }),
      ).toBeTruthy();
    });
  });

  it("falls back to the default camera when the selected camera disappears", async () => {
    renderVideoRecorder();

    openDropdown(
      await screen.findByRole("button", {
        name: /Camera: FaceTime HD Camera/i,
      }),
    );

    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "Logitech Brio" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Camera: Logitech Brio/i }),
      ).toBeTruthy();
    });

    enumerateDevicesMock.mockResolvedValue([
      createDevice({
        deviceId: "default",
        groupId: "audio-default",
        kind: "audioinput",
        label: "MacBook Pro Microphone",
      }),
      createDevice({
        deviceId: "audio-built-in",
        groupId: "audio-default",
        kind: "audioinput",
        label: "MacBook Pro Microphone",
      }),
      createDevice({
        deviceId: "audio-external",
        groupId: "audio-external",
        kind: "audioinput",
        label: "DJI Mic Mini",
      }),
      createDevice({
        deviceId: "default",
        groupId: "video-default",
        kind: "videoinput",
        label: "FaceTime HD Camera",
      }),
      createDevice({
        deviceId: "video-built-in",
        groupId: "video-default",
        kind: "videoinput",
        label: "FaceTime HD Camera",
      }),
    ]);

    const deviceChangeRegistrations =
      mediaDevicesAddEventListenerMock.mock.calls.filter(
        ([eventName]) => eventName === "devicechange",
      );
    const handleDeviceChange = deviceChangeRegistrations.at(-1)?.[1] as
      | (() => void)
      | undefined;

    expect(handleDeviceChange).toBeTruthy();
    handleDeviceChange?.();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Camera: FaceTime HD Camera/i }),
      ).toBeTruthy();
    });
  });

  it("keeps only one device dropdown open when switching from microphone to camera", async () => {
    renderVideoRecorder();

    openDropdown(
      await screen.findByRole("button", {
        name: /Microphone: MacBook Pro Microphone/i,
      }),
    );

    expect(
      await screen.findByRole("menuitemradio", { name: "DJI Mic Mini" }),
    ).toBeTruthy();

    openDropdown(
      screen.getByRole("button", {
        name: /Camera: FaceTime HD Camera/i,
        hidden: true,
      }),
    );

    expect(
      await screen.findByRole("menuitemradio", { name: "Logitech Brio" }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(
        screen.queryByRole("menuitemradio", { name: "DJI Mic Mini" }),
      ).toBeNull();
    });
  });

  it('changes the "Record" button to "Stop" after recording starts', async () => {
    renderVideoRecorder();

    fireEvent.click(await screen.findByRole("button", { name: /Record/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Stop/i })).toBeTruthy();
    });
  });

  it("hides microphone and camera controls while recording", async () => {
    renderVideoRecorder();

    fireEvent.click(await screen.findByRole("button", { name: /Record/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Stop/i })).toBeTruthy();
    });

    expect(
      screen.queryByRole("button", {
        name: /Microphone: MacBook Pro Microphone/i,
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Camera: FaceTime HD Camera/i }),
    ).toBeNull();
  });

  it("turns the mic test back off when recording starts", async () => {
    renderVideoRecorder();

    fireEvent.click(
      await screen.findByRole("button", { name: /Enable audio monitor/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Disable audio monitor/i }),
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Record/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Stop/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Enable audio monitor/i }),
      ).toBeTruthy();
    });
  });

  it("rebuilds the audio monitor only once when the preview stream is fully replaced", async () => {
    renderVideoRecorder();

    fireEvent.click(
      await screen.findByRole("button", { name: /Enable audio monitor/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Disable audio monitor/i }),
      ).toBeTruthy();
    });

    expect(audioContextCreateMediaStreamSourceMock).toHaveBeenCalledTimes(1);

    enumerateDevicesMock.mockResolvedValue([
      createDevice({
        deviceId: "default",
        groupId: "audio-new-default",
        kind: "audioinput",
        label: "Shure MV7",
      }),
      createDevice({
        deviceId: "audio-shure",
        groupId: "audio-new-default",
        kind: "audioinput",
        label: "Shure MV7",
      }),
      createDevice({
        deviceId: "audio-external",
        groupId: "audio-external",
        kind: "audioinput",
        label: "DJI Mic Mini",
      }),
      createDevice({
        deviceId: "default",
        groupId: "video-default",
        kind: "videoinput",
        label: "FaceTime HD Camera",
      }),
      createDevice({
        deviceId: "video-built-in",
        groupId: "video-default",
        kind: "videoinput",
        label: "FaceTime HD Camera",
      }),
      createDevice({
        deviceId: "video-external",
        groupId: "video-external",
        kind: "videoinput",
        label: "Logitech Brio",
      }),
    ]);

    const deviceChangeRegistrations =
      mediaDevicesAddEventListenerMock.mock.calls.filter(
        ([eventName]) => eventName === "devicechange",
      );
    const handleDeviceChange = deviceChangeRegistrations.at(-1)?.[1] as
      | (() => void)
      | undefined;

    expect(handleDeviceChange).toBeTruthy();
    handleDeviceChange?.();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Microphone: Shure MV7/i }),
      ).toBeTruthy();
    });

    expect(audioContextCreateMediaStreamSourceMock).toHaveBeenCalledTimes(2);
  });

  it("shows an audio-monitor-specific error when monitor setup fails during device refresh", async () => {
    renderVideoRecorder();

    fireEvent.click(
      await screen.findByRole("button", { name: /Enable audio monitor/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Disable audio monitor/i }),
      ).toBeTruthy();
    });

    shouldThrowNextCreateMediaStreamSource = true;

    openDropdown(
      screen.getByRole("button", {
        name: /Microphone: MacBook Pro Microphone/i,
      }),
    );

    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "DJI Mic Mini" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Could not start mic test\. You can still record video\./i),
      ).toBeTruthy();
    });

    expect(
      screen.queryByText(/Could not access camera\/microphone\./i),
    ).toBeNull();
  });

  it("automatically stops recording after the maximum duration is reached", async () => {
    renderVideoRecorder({
      maxDurationSec: 1,
      maxOvertimeSec: 0,
    });

    fireEvent.click(await screen.findByRole("button", { name: /Record/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Stop/i })).toBeTruthy();
    });

    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: /Record/i })).toBeTruthy();
      },
      { timeout: 2_000 },
    );
  });

  it("uploads the final buffered chunk when recording stops", async () => {
    const transferNewChunk = vi.fn().mockResolvedValue(undefined);
    renderVideoRecorder({ transferNewChunk });

    fireEvent.click(await screen.findByRole("button", { name: /Record/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Stop/i })).toBeTruthy();
    });

    emitRecorderChunk(new Blob(["final-chunk"], { type: "video/webm" }));
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));

    await waitFor(() => {
      expect(transferNewChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          recordingId: expect.stringMatching(/^optimistic-recording-id-/),
          isLastChunk: true,
          partNumber: 1,
          chunk: expect.any(Blob),
        }),
      );
    });
  });

  it("uploads a non-final chunk when the buffer exceeds 5 MiB", async () => {
    const transferNewChunk = vi.fn().mockResolvedValue(undefined);
    renderVideoRecorder({ transferNewChunk });

    fireEvent.click(await screen.findByRole("button", { name: /Record/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Stop/i })).toBeTruthy();
    });

    emitRecorderChunk(
      new Blob([new Uint8Array(5 * 1024 * 1024)], { type: "video/webm" }),
    );

    await waitFor(() => {
      expect(transferNewChunk).toHaveBeenCalledWith(
        expect.objectContaining({
          recordingId: expect.stringMatching(/^optimistic-recording-id-/),
          isLastChunk: false,
          partNumber: 1,
          chunk: expect.any(Blob),
        }),
      );
    });
  });

  it("increments multipart upload part numbers across chunk flushes and final stop", async () => {
    const transferNewChunk = vi.fn().mockResolvedValue(undefined);
    renderVideoRecorder({ transferNewChunk });

    fireEvent.click(await screen.findByRole("button", { name: /Record/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Stop/i })).toBeTruthy();
    });

    emitRecorderChunk(
      new Blob([new Uint8Array(5 * 1024 * 1024)], { type: "video/webm" }),
    );
    emitRecorderChunk(
      new Blob([new Uint8Array(5 * 1024 * 1024)], { type: "video/webm" }),
    );
    emitRecorderChunk(new Blob(["tail"], { type: "video/webm" }));
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));

    await waitFor(() => {
      expect(transferNewChunk).toHaveBeenCalledTimes(3);
    });

    expect(transferNewChunk.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        isLastChunk: false,
        partNumber: 1,
      }),
    );
    expect(transferNewChunk.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        isLastChunk: false,
        partNumber: 2,
      }),
    );
    expect(transferNewChunk.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({
        isLastChunk: true,
        partNumber: 3,
      }),
    );
  });
});

function renderVideoRecorder({
  maxDurationSec = 120,
  maxOvertimeSec = 30,
  transferNewChunk = vi.fn().mockResolvedValue(undefined),
}: {
  maxDurationSec?: number;
  maxOvertimeSec?: number;
  transferNewChunk?: ReturnType<typeof vi.fn>;
} = {}) {
  return render(
    <VideoRecorder
      maxDurationSec={maxDurationSec}
      maxOvertimeSec={maxOvertimeSec}
      transferNewChunk={transferNewChunk}
    />,
  );
}

function emitRecorderChunk(blob: Blob) {
  if (!latestMediaRecorder?.ondataavailable) {
    throw new Error(
      "This is a bug, please report it. No active media recorder to emit a chunk from.",
    );
  }

  latestMediaRecorder.ondataavailable({ data: blob } as BlobEvent);
}

function openDropdown(button: HTMLElement) {
  fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
}

function createDevice(device: {
  deviceId: string;
  groupId: string;
  kind: MediaDeviceKind;
  label: string;
}) {
  return {
    ...device,
    toJSON: () => device,
  } satisfies MediaDeviceInfo;
}

function createMediaStream(constraints: MediaStreamConstraints) {
  const tracks: MediaStreamTrack[] = [];

  if (constraints.audio) {
    tracks.push(createTrack("audio"));
  }
  if (constraints.video) {
    tracks.push(createTrack("video"));
  }

  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((track) => track.kind === "audio"),
    getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
    addTrack: (track: MediaStreamTrack) => {
      tracks.push(track);
    },
    removeTrack: (track: MediaStreamTrack) => {
      const index = tracks.indexOf(track);
      if (index >= 0) {
        tracks.splice(index, 1);
      }
    },
  } as MediaStream;
}

function createTrack(kind: "audio" | "video") {
  return {
    kind,
    stop: vi.fn(),
  } as MediaStreamTrack;
}
