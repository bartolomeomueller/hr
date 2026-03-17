import {
  type Recording,
  type RecordingChunk,
  useUploadStore,
} from "@/stores/uploadStore";

// FIXME write tests for this service, it is too complicated

// TODO: Remove the blob-upload fallback once fetch upload streaming support is
// available across browsers: https://wpt.fyi/interop-2026?feature=interop-2026-fetch&stable
// This function was tested on Chrome and Firefox on 16.03.2026 and was working.
// https://developer.chrome.com/docs/capabilities/web-apis/fetch-streaming-requests#feature_detection
const supportsRequestStreams = (() => {
  if (typeof ReadableStream === "undefined") {
    return false;
  }
  try {
    let duplexAccessed = false;
    const request = new Request("", {
      method: "POST",
      body: new ReadableStream(),
      get duplex() {
        duplexAccessed = true;
        return "half";
      },
    } as RequestInit & { duplex: "half" });

    return duplexAccessed && !request.headers.has("content-type");
  } catch {
    return false;
  }
})();
// const supportsRequestStreams = false; // For testing

// TODO maybe implement if available then: tracking upload progress for fetch https://jakearchibald.com/2025/fetch-streams-not-for-progress/ -> otherwise have to use XMLHttpRequest

let wakeUpStream: (() => void) | null = null;

// TODO think about wrapping this in a lock
export async function addChunkAndTryUpload(chunk: RecordingChunk | null) {
  if (chunk) {
    useUploadStore.getState().addChunk(chunk); // recordings[0] now defined
  }
  if (useUploadStore.getState().recordings.length === 0) {
    return;
  }

  if (wakeUpStream) {
    wakeUpStream();
    wakeUpStream = null;
  }

  if (!supportsRequestStreams) {
    const firstRecording = useUploadStore.getState().recordings.at(0);
    if (!firstRecording?.isComplete) {
      return;
    }
    if (firstRecording.isUploading) {
      return;
    }
    // Does not support streaming uploads and is complete and not yet uploading.
    useUploadStore.getState().setFirstRecordingAsUploading();
    await uploadBlob(firstRecording);
    useUploadStore.getState().removeFirstRecordingInQueue();
    void addChunkAndTryUpload(null); // Start the next upload if there is one

    return;
  }
  if (!useUploadStore.getState().recordings.at(0)?.isUploading) {
    // Streaming upload is supported and the first recording in the queue is not yet uploading
    useUploadStore.getState().setFirstRecordingAsUploading();
    await uploadStream();
    // Since the uploadStream function is event based later, removeFirstRecordingInQueue() will be called if the response of the streaming fetch is ok.
  }
}

async function uploadBlob(recording: Recording, retryCount = 0) {
  try {
    const blob = new Blob(
      recording.chunks.map((c) => c.chunk),
      { type: recording.mimeType },
    ); // The duplication is ok for memory usage
    const response = await fetch(
      "https://localhost:3001/api/v1/upload/upload-blob",
      {
        method: "POST",
        headers: {
          "Content-Type": recording.mimeType,
        },
        body: blob,
      },
    );
    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

    const result = await response.json();
    console.log("Upload successful, server response:", result);

    // TODO call some callback function to get the id to the db somehow, or have the video service communicate with the web-app somehow
  } catch (error) {
    console.error("Blob upload failed:", error);
    if (retryCount < 3) {
      console.log(
        `Retrying blob upload (attempt ${retryCount + 1}) in one second...`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await uploadBlob(recording, retryCount + 1);
    } else {
      console.error("Max retries reached for blob upload.");
      throw new Error("Failed to upload blob after multiple attempts.");
    }
  }
}

async function uploadStream(retryCount = 0) {
  if (retryCount >= 3) {
    console.error("Max retries reached for stream upload.");
    throw new Error("Failed to upload stream after multiple attempts.");
  }

  const stream = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        await pullCallbackForStreamUpload(controller);
      },
    },
    new ByteLengthQueuingStrategy({ highWaterMark: 1024 * 1024 }),
  );
  void initiateUploadStream(
    stream,
    useUploadStore.getState().recordings.at(0)!.mimeType,
    retryCount + 1,
  ); // Start the upload but don't await it, since it is a stream.
}

async function pullCallbackForStreamUpload(
  controller: ReadableStreamDefaultController<Uint8Array>,
  shouldWaitForStateChange = true,
) {
  const recording = useUploadStore.getState().recordings.at(0);
  if (!recording) {
    throw new Error("No recording found to upload. This should not happen.");
  }

  const chunkIndex = recording.chunks.findIndex(
    (chunkWithState) => !chunkWithState.gotEnqueuedToUploadStream,
  );
  if (chunkIndex === -1) {
    if (recording.isComplete) {
      controller.close();
      return;
    }
    if (!shouldWaitForStateChange) {
      return;
    }
    // The recording is still in progress, the uploading is not complete, but there is not a new chunk to enqueue.
    // This resolve will be triggered when addChunkAndTryUpload changes the recording state, or when the timeout elapses.
    await new Promise<void>((resolve) => {
      wakeUpStream = resolve;
      setTimeout(() => {
        // Every resolve is unique, so the timer does not need to be cleared.
        if (wakeUpStream === resolve) {
          wakeUpStream = null;
          resolve();
        }
      }, 1000);
    });
    return pullCallbackForStreamUpload(controller, false);
  }

  const chunkBytes = new Uint8Array(
    await recording.chunks[chunkIndex].chunk.arrayBuffer(),
  );
  useUploadStore
    .getState()
    .setChunkAsEnqueuedToUploadStreamForFirstRecording(chunkIndex);

  controller.enqueue(chunkBytes);

  const updatedRecording = useUploadStore.getState().recordings.at(0);
  if (
    updatedRecording?.isComplete &&
    updatedRecording.chunks.every(
      (chunkWithState) => chunkWithState.gotEnqueuedToUploadStream,
    )
  ) {
    controller.close();
  }
}

async function initiateUploadStream(
  stream: ReadableStream<Uint8Array>,
  mimeType: string,
  retryCount: number,
) {
  try {
    console.log("Starting stream upload with MIME type:", mimeType);
    const response = await fetch(
      "https://localhost:3001/api/v1/upload/upload-stream",
      {
        method: "POST",
        headers: {
          "Content-Type": mimeType,
        },
        body: stream,
        // @ts-expect-error - duplex is required in Chrome for streaming bodies
        duplex: "half",
      },
    );
    if (!response.ok) {
      throw new Error(`Stream upload failed with status ${response.status}`);
    }
    const result = await response.json();
    console.log("Stream upload successful, server response:", result);
    useUploadStore.getState().removeFirstRecordingInQueue();

    // TODO call some callback function to get the id to the db somehow, or have the video service communicate with the web-app somehow

    addChunkAndTryUpload(null); // Start the next upload if there is one
  } catch (error) {
    console.error("Stream upload failed:", error);
    useUploadStore.getState().resetChunksStreamingStateForFirstRecording();
    if (retryCount >= 3) {
      console.error("Max retries reached for stream upload.");
      throw new Error("Failed to upload stream after multiple attempts.");
    }
    console.log(
      `Retrying stream upload (attempt ${retryCount + 1}) in one second...`,
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await uploadStream(retryCount + 1);
  }
}
