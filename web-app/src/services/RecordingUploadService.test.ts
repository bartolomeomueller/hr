import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordingUploadService } from "@/services/RecordingUploadService";
import {
  useRecordingUploadStore,
  useUploadedRecordingPartsStore,
} from "@/stores/recordingUploadStore";

function createDeferredPromise<T>() {
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise,
  };
}

function createIndexedDbDouble() {
  let nextId = 1;
  const files = new Map<number, File>();

  return {
    open: vi.fn(() => {
      const store = {
        add: vi.fn(({ file }: { file: File }) => {
          const id = nextId++;
          const request = {
            result: id,
            onsuccess: undefined as (() => void) | undefined,
          };

          queueMicrotask(() => {
            files.set(id, file);
            request.onsuccess?.();
            queueMicrotask(() => {
              transaction.oncomplete?.();
            });
          });

          return request;
        }),
        get: vi.fn((id: number) => {
          const request = {
            result: undefined as { file: File } | undefined,
            onsuccess: undefined as (() => void) | undefined,
            onerror: undefined as (() => void) | undefined,
          };

          queueMicrotask(() => {
            const file = files.get(id);
            request.result = file ? { file } : undefined;
            request.onsuccess?.();
          });

          return request;
        }),
        delete: vi.fn((id: number) => {
          files.delete(id);
          queueMicrotask(() => {
            transaction.oncomplete?.();
          });
        }),
      };

      const transaction = {
        objectStore: vi.fn(() => store),
        oncomplete: undefined as (() => void) | undefined,
        onerror: undefined as
          | ((event: Event & { target: IDBTransaction }) => void)
          | undefined,
      };

      const db = {
        objectStoreNames: {
          contains: vi.fn(() => false),
        },
        createObjectStore: vi.fn(),
        transaction: vi.fn(() => transaction),
      };

      const request = {
        result: db,
        onupgradeneeded: undefined as
          | ((event: Event & { target: IDBOpenDBRequest }) => void)
          | undefined,
        onsuccess: undefined as
          | ((event: Event & { target: IDBOpenDBRequest }) => void)
          | undefined,
        onerror: undefined as
          | ((event: Event & { target: IDBOpenDBRequest }) => void)
          | undefined,
      };

      queueMicrotask(() => {
        request.onupgradeneeded?.({ target: request } as unknown as Event & {
          target: IDBOpenDBRequest;
        });
        request.onsuccess?.({ target: request } as unknown as Event & {
          target: IDBOpenDBRequest;
        });
      });

      return request;
    }),
    deleteDatabase: vi.fn(),
  } as unknown as IDBFactory;
}

function createXhrDouble() {
  const xhr = {
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(),
    getResponseHeader: vi.fn(() => '"etag-1"'),
    upload: {},
    status: 200,
    onload: undefined,
    onerror: undefined,
    onabort: undefined,
  } as unknown as XMLHttpRequest & {
    upload: {
      onprogress?: (event: ProgressEvent<XMLHttpRequestEventTarget>) => void;
    };
    onload?: () => void;
    onerror?: () => void;
    onabort?: () => void;
  };

  xhr.abort = vi.fn(() => {
    xhr.onabort?.();
  });

  return xhr;
}

function createQueryClientDouble() {
  return {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  };
}

function createService({
  createPresignedS3RecordingMultipartUploadUrl,
  createXmlHttpRequest = () => new XMLHttpRequest(),
  finishMultipartUploadForRecording = vi.fn(),
  saveAnswer = vi.fn(),
  queryClient = createQueryClientDouble(),
  isPreSignedUrlStillValid = vi.fn(() => true),
}: {
  createPresignedS3RecordingMultipartUploadUrl: ReturnType<typeof vi.fn>;
  createXmlHttpRequest?: () => XMLHttpRequest;
  finishMultipartUploadForRecording?: ReturnType<typeof vi.fn>;
  saveAnswer?: ReturnType<typeof vi.fn>;
  queryClient?: ReturnType<typeof createQueryClientDouble>;
  isPreSignedUrlStillValid?: ReturnType<typeof vi.fn>;
}) {
  return new RecordingUploadService({
    client: {
      createPresignedS3RecordingMultipartUploadUrl,
      finishMultipartUploadForRecording,
      saveAnswer,
      getInterviewRelatedDataByInterviewUuid: vi.fn(),
    },
    getQueryClient: () => queryClient as never,
    isPreSignedURLStillValid: isPreSignedUrlStillValid,
    toast: {
      error: vi.fn(),
    },
    recordingUploadStore: useRecordingUploadStore,
    uploadedRecordingPartsStore: useUploadedRecordingPartsStore,
    createXmlHttpRequest,
    indexedDb: createIndexedDbDouble(),
  });
}

describe("RecordingUploadService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRecordingUploadStore.setState({ recordings: [] });
    useUploadedRecordingPartsStore.setState({ uploadedParts: {} });
  });

  afterEach(() => {
    useRecordingUploadStore.setState({ recordings: [] });
    useUploadedRecordingPartsStore.setState({ uploadedParts: {} });
  });

  it("adds a pending recording to the upload store as soon as an upload is queued", async () => {
    const presignedUrl = createDeferredPromise<{
      videoUuid: string;
      uploadId: string;
      uploadUrl: string;
    }>();
    const createPresignedS3RecordingMultipartUploadUrl = vi
      .fn()
      .mockReturnValueOnce(presignedUrl.promise);
    const service = createService({
      createPresignedS3RecordingMultipartUploadUrl,
    });

    await service.addToUploadPipeline({
      file: new File(["video"], "answer.webm", {
        type: "video/webm",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      partNumber: 1,
      isLastPart: false,
    });

    const recordings = useRecordingUploadStore.getState().recordings;

    expect(createPresignedS3RecordingMultipartUploadUrl).toHaveBeenCalledWith({
      mimeType: "video/webm",
      partNumber: 1,
      uploadId: undefined,
      videoUuid: undefined,
    });
    expect(recordings).toHaveLength(1);
    expect(recordings[0]).toMatchObject({
      questionUuid: "question-1",
      indexedDBId: expect.any(Number),
      progress: 0,
      partNumber: 1,
      isLastPart: false,
    });
    expect(recordings[0]?.abortController).toBeInstanceOf(AbortController);

    service.uploadPipeline = Promise.resolve();
  });

  it("updates the upload progress in the store when the xhr reports progress", async () => {
    const presignedUrl = createDeferredPromise<{
      videoUuid: string;
      uploadId: string;
      uploadUrl: string;
    }>();
    const createPresignedS3RecordingMultipartUploadUrl = vi
      .fn()
      .mockReturnValueOnce(presignedUrl.promise);
    const xhr = createXhrDouble();
    const service = createService({
      createPresignedS3RecordingMultipartUploadUrl,
      createXmlHttpRequest: () => xhr,
    });

    await service.addToUploadPipeline({
      file: new File(["video"], "answer.webm", {
        type: "video/webm",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      partNumber: 1,
      isLastPart: false,
    });

    presignedUrl.resolve({
      videoUuid: "video-1",
      uploadId: "upload-1",
      uploadUrl: "https://example.com/upload",
    });

    await vi.waitFor(() => {
      expect(xhr.send).toHaveBeenCalledTimes(1);
    });

    const indexedDbId =
      useRecordingUploadStore.getState().recordings[0]?.indexedDBId;
    expect(indexedDbId).toBeDefined();

    xhr.upload.onprogress?.({
      lengthComputable: true,
      loaded: 25,
      total: 100,
    } as ProgressEvent<XMLHttpRequestEventTarget>);

    expect(useRecordingUploadStore.getState().recordings[0]).toMatchObject({
      indexedDBId: indexedDbId,
      progress: 25,
    });

    useRecordingUploadStore.getState().recordings[0]?.abortController.abort();
    await service.uploadPipeline;
  });

  it("removes an upload from the store when it is aborted", async () => {
    const presignedUrl = createDeferredPromise<{
      videoUuid: string;
      uploadId: string;
      uploadUrl: string;
    }>();
    const createPresignedS3RecordingMultipartUploadUrl = vi
      .fn()
      .mockReturnValueOnce(presignedUrl.promise);
    const xhr = createXhrDouble();
    const service = createService({
      createPresignedS3RecordingMultipartUploadUrl,
      createXmlHttpRequest: () => xhr,
    });

    await service.addToUploadPipeline({
      file: new File(["video"], "answer.webm", {
        type: "video/webm",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      partNumber: 1,
      isLastPart: false,
    });

    presignedUrl.resolve({
      videoUuid: "video-1",
      uploadId: "upload-1",
      uploadUrl: "https://example.com/upload",
    });

    await vi.waitFor(() => {
      expect(xhr.send).toHaveBeenCalledTimes(1);
    });

    expect(useRecordingUploadStore.getState().recordings).toHaveLength(1);

    useRecordingUploadStore.getState().recordings[0]?.abortController.abort();

    await service.uploadPipeline;

    expect(useRecordingUploadStore.getState().recordings).toHaveLength(0);
    expect(xhr.abort).toHaveBeenCalledTimes(1);
  });

  it("stores multipart state for the first uploaded part after a successful upload", async () => {
    const presignedUrl = createDeferredPromise<{
      videoUuid: string;
      uploadId: string;
      uploadUrl: string;
    }>();
    const createPresignedS3RecordingMultipartUploadUrl = vi
      .fn()
      .mockReturnValueOnce(presignedUrl.promise);
    const xhr = createXhrDouble();
    const service = createService({
      createPresignedS3RecordingMultipartUploadUrl,
      createXmlHttpRequest: () => xhr,
    });

    await service.addToUploadPipeline({
      file: new File(["video"], "answer.webm", {
        type: "video/webm",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      partNumber: 1,
      isLastPart: false,
    });

    presignedUrl.resolve({
      videoUuid: "video-1",
      uploadId: "upload-1",
      uploadUrl: "https://example.com/upload",
    });

    await vi.waitFor(() => {
      expect(xhr.send).toHaveBeenCalledTimes(1);
    });

    xhr.onload?.();

    await vi.waitFor(() => {
      expect(
        useUploadedRecordingPartsStore.getState().uploadedParts["question-1"],
      ).toEqual({
        videoUuid: "video-1",
        uploadId: "upload-1",
        status: "uploading",
        parts: [
          {
            PartNumber: 1,
            ETag: '"etag-1"',
          },
        ],
      });
    });

    await service.uploadPipeline;
  });

  it("finalizes the last uploaded part, saves the answer, and clears multipart state", async () => {
    const presignedUrl = createDeferredPromise<{
      videoUuid: string;
      uploadId: string;
      uploadUrl: string;
    }>();
    const finishMultipartUpload = createDeferredPromise<void>();
    const createPresignedS3RecordingMultipartUploadUrl = vi
      .fn()
      .mockReturnValueOnce(presignedUrl.promise);
    const finishMultipartUploadForRecording = vi
      .fn()
      .mockReturnValueOnce(finishMultipartUpload.promise);
    const saveAnswer = vi.fn().mockResolvedValue({
      questionUuid: "question-1",
      answerPayload: {
        videoUuid: "video-1",
        status: "uploaded",
      },
    });
    const queryClient = createQueryClientDouble();
    const xhr = createXhrDouble();
    const service = createService({
      createPresignedS3RecordingMultipartUploadUrl,
      createXmlHttpRequest: () => xhr,
      finishMultipartUploadForRecording,
      saveAnswer,
      queryClient,
    });

    await service.addToUploadPipeline({
      file: new File(["video"], "answer.webm", {
        type: "video/webm",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      partNumber: 1,
      isLastPart: true,
    });

    presignedUrl.resolve({
      videoUuid: "video-1",
      uploadId: "upload-1",
      uploadUrl: "https://example.com/upload",
    });

    await vi.waitFor(() => {
      expect(xhr.send).toHaveBeenCalledTimes(1);
    });

    xhr.onload?.();

    await vi.waitFor(() => {
      expect(finishMultipartUploadForRecording).toHaveBeenCalledWith({
        videoUuid: "video-1",
        uploadId: "upload-1",
        parts: [
          {
            PartNumber: 1,
            ETag: '"etag-1"',
          },
        ],
      });
    });

    expect(
      useUploadedRecordingPartsStore.getState().uploadedParts["question-1"],
    ).toEqual({
      videoUuid: "video-1",
      uploadId: "upload-1",
      status: "finalizing",
      parts: [
        {
          PartNumber: 1,
          ETag: '"etag-1"',
        },
      ],
    });

    finishMultipartUpload.resolve();

    await vi.waitFor(() => {
      expect(saveAnswer).toHaveBeenCalledWith({
        interviewUuid: "interview-1",
        questionUuid: "question-1",
        answerPayload: {
          videoUuid: "video-1",
          status: "uploaded",
        },
      });
    });

    await vi.waitFor(() => {
      expect(
        useUploadedRecordingPartsStore.getState().uploadedParts["question-1"],
      ).toBeUndefined();
    });

    expect(queryClient.setQueryData).toHaveBeenCalledTimes(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["answers", "interview-1"],
    });

    await service.uploadPipeline;
  });

  it("refreshes an expired presigned url before uploading", async () => {
    const firstPresignedUrl = createDeferredPromise<{
      videoUuid: string;
      uploadId: string;
      uploadUrl: string;
    }>();
    const createPresignedS3RecordingMultipartUploadUrl = vi
      .fn()
      .mockReturnValueOnce(firstPresignedUrl.promise)
      .mockResolvedValueOnce({
        videoUuid: "video-1-refreshed",
        uploadId: "upload-1-refreshed",
        uploadUrl: "https://example.com/upload-refreshed",
      });
    const isPreSignedUrlStillValid = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const xhr = createXhrDouble();
    const service = createService({
      createPresignedS3RecordingMultipartUploadUrl,
      createXmlHttpRequest: () => xhr,
      isPreSignedUrlStillValid,
    });

    await service.addToUploadPipeline({
      file: new File(["video"], "answer.webm", {
        type: "video/webm",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      partNumber: 1,
      isLastPart: false,
    });

    firstPresignedUrl.resolve({
      videoUuid: "video-1",
      uploadId: "upload-1",
      uploadUrl: "https://example.com/upload-initial",
    });

    await vi.waitFor(() => {
      expect(
        createPresignedS3RecordingMultipartUploadUrl,
      ).toHaveBeenNthCalledWith(2, {
        mimeType: "video/webm",
        partNumber: 1,
      });
    });

    await vi.waitFor(() => {
      expect(xhr.open).toHaveBeenCalledWith(
        "PUT",
        "https://example.com/upload-refreshed",
      );
    });

    useRecordingUploadStore.getState().recordings[0]?.abortController.abort();
    await service.uploadPipeline;
  });
});
