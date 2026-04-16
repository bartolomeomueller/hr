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

function createIndexedDbDouble({
  seededFiles,
}: {
  seededFiles?: Record<number, File>;
} = {}) {
  const files = new Map<number, File>(
    Object.entries(seededFiles ?? {}).map(([id, file]) => [Number(id), file]),
  );
  let nextId = Math.max(0, ...Array.from(files.keys())) + 1;

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

function createFailingXhrFactory() {
  const xhrs: Array<ReturnType<typeof createXhrDouble>> = [];

  return {
    xhrs,
    createXmlHttpRequest: () => {
      const xhr = createXhrDouble();
      xhr.send = vi.fn(() => {
        queueMicrotask(() => {
          xhr.onerror?.();
        });
      });
      xhrs.push(xhr);
      return xhr;
    },
  };
}

function createStatusFailingXhrFactory(status: number) {
  const xhrs: Array<ReturnType<typeof createXhrDouble>> = [];

  return {
    xhrs,
    createXmlHttpRequest: () => {
      const xhr = createXhrDouble();
      const mutableXhr = xhr as typeof xhr & { status: number };
      xhr.send = vi.fn(() => {
        queueMicrotask(() => {
          mutableXhr.status = status;
          xhr.onload?.();
        });
      });
      xhrs.push(xhr);
      return xhr;
    },
  };
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
  queryClient = createQueryClientDouble(),
  isPreSignedUrlStillValid = vi.fn(() => true),
  indexedDb = createIndexedDbDouble(),
}: {
  createPresignedS3RecordingMultipartUploadUrl: ReturnType<typeof vi.fn>;
  createXmlHttpRequest?: () => XMLHttpRequest;
  finishMultipartUploadForRecording?: ReturnType<typeof vi.fn>;
  queryClient?: ReturnType<typeof createQueryClientDouble>;
  isPreSignedUrlStillValid?: ReturnType<typeof vi.fn>;
  indexedDb?: IDBFactory;
}) {
  return new RecordingUploadService({
    client: {
      createPresignedS3RecordingMultipartUploadUrl,
      finishMultipartUploadForRecording,
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
    indexedDb,
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
      multipartUploadMode: "new",
      mimeType: "video/webm",
      partNumber: 1,
    });
    expect(recordings).toHaveLength(1);
    expect(recordings[0]).toMatchObject({
      questionUuid: "question-1",
      indexedDBId: expect.any(Number),
      progress: 0,
      partNumber: 1,
      isLastPart: false,
    });
    expect(recordings[0]).not.toHaveProperty("abortController");

    service.uploadPipeline = Promise.resolve();
  });

  it("resumes a persisted queued upload on bootstrap", async () => {
    const createPresignedS3RecordingMultipartUploadUrl = vi
      .fn()
      .mockResolvedValue({
        videoUuid: "video-1",
        uploadId: "upload-1",
        uploadUrl: "https://example.com/upload",
      });
    const xhr = createXhrDouble();

    useRecordingUploadStore.setState({
      recordings: [
        {
          questionUuid: "question-1",
          interviewUuid: "interview-1",
          queryKeyToInvalidateAnswers: ["answers", "interview-1"],
          indexedDBId: 1,
          progress: 0,
          partNumber: 1,
          isLastPart: false,
        },
      ],
    } as never);

    const service = createService({
      createPresignedS3RecordingMultipartUploadUrl,
      createXmlHttpRequest: () => xhr,
      indexedDb: createIndexedDbDouble({
        seededFiles: {
          1: new File(["video"], "answer.webm", {
            type: "video/webm",
          }),
        },
      }),
    });

    void service.resumePersistedUploads();

    await vi.waitFor(() => {
      expect(createPresignedS3RecordingMultipartUploadUrl).toHaveBeenCalledWith(
        {
          multipartUploadMode: "new",
          mimeType: "video/webm",
          partNumber: 1,
        },
      );
    });

    await vi.waitFor(() => {
      expect(xhr.send).toHaveBeenCalledTimes(1);
    });

    service.abortUpload(1);
    await service.uploadPipeline;
  });

  it("retries multipart finalization on bootstrap when a question is persisted as finalizing", async () => {
    const createPresignedS3RecordingMultipartUploadUrl = vi.fn();
    const finishMultipartUploadForRecording = vi.fn().mockResolvedValue({
      questionUuid: "question-1",
      answerPayload: {
        videoUuid: "video-1",
        status: "uploaded",
      },
    });
    const queryClient = createQueryClientDouble();
    const createXmlHttpRequest = vi.fn(() => createXhrDouble());

    useRecordingUploadStore.setState({
      recordings: [
        {
          questionUuid: "question-1",
          interviewUuid: "interview-1",
          queryKeyToInvalidateAnswers: ["answers", "interview-1"],
          indexedDBId: 1,
          progress: 100,
          partNumber: 1,
          isLastPart: true,
        },
      ],
    } as never);
    useUploadedRecordingPartsStore.setState({
      uploadedParts: {
        "question-1": {
          videoUuid: "video-1",
          uploadId: "upload-1",
          status: "finalizing",
          parts: [
            {
              PartNumber: 1,
              ETag: '"etag-1"',
            },
          ],
        },
      },
    });

    const service = createService({
      createPresignedS3RecordingMultipartUploadUrl,
      createXmlHttpRequest,
      finishMultipartUploadForRecording,
      queryClient,
      indexedDb: createIndexedDbDouble(),
    });

    void service.resumePersistedUploads();

    await vi.waitFor(() => {
      expect(finishMultipartUploadForRecording).toHaveBeenCalledWith(
        {
          interviewUuid: "interview-1",
          questionUuid: "question-1",
          videoUuid: "video-1",
          uploadId: "upload-1",
          parts: [
            {
              PartNumber: 1,
              ETag: '"etag-1"',
            },
          ],
        },
        {
          context: {
            retry: 2,
          },
        },
      );
    });

    expect(createPresignedS3RecordingMultipartUploadUrl).not.toHaveBeenCalled();
    expect(createXmlHttpRequest).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(useRecordingUploadStore.getState().recordings).toHaveLength(0);
      expect(
        useUploadedRecordingPartsStore.getState().uploadedParts["question-1"],
      ).toBeUndefined();
    });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["answers", "interview-1"],
    });

    await service.uploadPipeline;
  });

  it("starts later-part presign requests as soon as first-part multipart ids are known", async () => {
    const firstPresignedUrl = createDeferredPromise<{
      videoUuid: string;
      uploadId: string;
      uploadUrl: string;
    }>();
    const createPresignedS3RecordingMultipartUploadUrl = vi
      .fn()
      .mockReturnValueOnce(firstPresignedUrl.promise)
      .mockResolvedValueOnce({
        videoUuid: "video-1",
        uploadId: "upload-1",
        uploadUrl: "https://example.com/upload-part-2",
      });
    const xhr = createXhrDouble();
    const service = createService({
      createPresignedS3RecordingMultipartUploadUrl,
      createXmlHttpRequest: () => xhr,
    });

    await service.addToUploadPipeline({
      file: new File(["video-1"], "answer-1.webm", {
        type: "video/webm",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      partNumber: 1,
      isLastPart: false,
    });

    await service.addToUploadPipeline({
      file: new File(["video-2"], "answer-2.webm", {
        type: "video/webm",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      partNumber: 2,
      isLastPart: false,
    });

    firstPresignedUrl.resolve({
      videoUuid: "video-1",
      uploadId: "upload-1",
      uploadUrl: "https://example.com/upload-part-1",
    });

    await vi.waitFor(() => {
      expect(
        createPresignedS3RecordingMultipartUploadUrl,
      ).toHaveBeenNthCalledWith(2, {
        multipartUploadMode: "existing",
        mimeType: "video/webm",
        partNumber: 2,
        uploadId: "upload-1",
        videoUuid: "video-1",
      });
    });

    const queuedRecordings = useRecordingUploadStore.getState().recordings;
    for (const recording of queuedRecordings) {
      service.abortUpload(recording.indexedDBId);
    }

    await service.uploadPipeline;
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

    service.abortUpload(indexedDbId as number);
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

    service.abortUpload(
      useRecordingUploadStore.getState().recordings[0]?.indexedDBId as number,
    );

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
    const finishMultipartUploadForRecording = vi.fn().mockReturnValueOnce(
      finishMultipartUpload.promise.then(() => ({
        questionUuid: "question-1",
        answerPayload: {
          videoUuid: "video-1",
          status: "uploaded",
        },
      })),
    );
    const queryClient = createQueryClientDouble();
    const xhr = createXhrDouble();
    const service = createService({
      createPresignedS3RecordingMultipartUploadUrl,
      createXmlHttpRequest: () => xhr,
      finishMultipartUploadForRecording,
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
      expect(finishMultipartUploadForRecording).toHaveBeenCalledWith(
        {
          interviewUuid: "interview-1",
          questionUuid: "question-1",
          videoUuid: "video-1",
          uploadId: "upload-1",
          parts: [
            {
              PartNumber: 1,
              ETag: '"etag-1"',
            },
          ],
        },
        {
          context: {
            retry: 2,
          },
        },
      );
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

  it("passes two finalization retries to orpc before saving the answer", async () => {
    const presignedUrl = createDeferredPromise<{
      videoUuid: string;
      uploadId: string;
      uploadUrl: string;
    }>();
    const createPresignedS3RecordingMultipartUploadUrl = vi
      .fn()
      .mockReturnValueOnce(presignedUrl.promise);
    const finishMultipartUploadForRecording = vi.fn().mockResolvedValueOnce({
      questionUuid: "question-1",
      answerPayload: {
        videoUuid: "video-1",
        status: "uploaded",
      },
    });
    const toastError = vi.fn();
    const queryClient = createQueryClientDouble();
    const xhr = createXhrDouble();
    const service = new RecordingUploadService({
      client: {
        createPresignedS3RecordingMultipartUploadUrl,
        finishMultipartUploadForRecording,
        getInterviewRelatedDataByInterviewUuid: vi.fn(),
      },
      getQueryClient: () => queryClient as never,
      isPreSignedURLStillValid: vi.fn(() => true),
      toast: {
        error: toastError,
      },
      recordingUploadStore: useRecordingUploadStore,
      uploadedRecordingPartsStore: useUploadedRecordingPartsStore,
      createXmlHttpRequest: () => xhr,
      indexedDb: createIndexedDbDouble(),
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
      expect(finishMultipartUploadForRecording).toHaveBeenCalledWith(
        {
          interviewUuid: "interview-1",
          questionUuid: "question-1",
          videoUuid: "video-1",
          uploadId: "upload-1",
          parts: [
            {
              PartNumber: 1,
              ETag: '"etag-1"',
            },
          ],
        },
        {
          context: {
            retry: 2,
          },
        },
      );
    });

    expect(toastError).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(
        useUploadedRecordingPartsStore.getState().uploadedParts["question-1"],
      ).toBeUndefined();
    });

    await service.uploadPipeline;
  });

  it("does not save the answer when multipart finalization fails", async () => {
    const presignedUrl = createDeferredPromise<{
      videoUuid: string;
      uploadId: string;
      uploadUrl: string;
    }>();
    const createPresignedS3RecordingMultipartUploadUrl = vi
      .fn()
      .mockReturnValueOnce(presignedUrl.promise);
    const finishMultipartUploadForRecording = vi
      .fn()
      .mockRejectedValue(new Error("finalization failed"));
    const toastError = vi.fn();
    const queryClient = createQueryClientDouble();
    const xhr = createXhrDouble();
    const service = new RecordingUploadService({
      client: {
        createPresignedS3RecordingMultipartUploadUrl,
        finishMultipartUploadForRecording,
        getInterviewRelatedDataByInterviewUuid: vi.fn(),
      },
      getQueryClient: () => queryClient as never,
      isPreSignedURLStillValid: vi.fn(() => true),
      toast: {
        error: toastError,
      },
      recordingUploadStore: useRecordingUploadStore,
      uploadedRecordingPartsStore: useUploadedRecordingPartsStore,
      createXmlHttpRequest: () => xhr,
      indexedDb: createIndexedDbDouble(),
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
      expect(finishMultipartUploadForRecording).toHaveBeenCalledWith(
        {
          interviewUuid: "interview-1",
          questionUuid: "question-1",
          videoUuid: "video-1",
          uploadId: "upload-1",
          parts: [
            {
              PartNumber: 1,
              ETag: '"etag-1"',
            },
          ],
        },
        {
          context: {
            retry: 2,
          },
        },
      );
    });

    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "Das Abschließen des Video-Uploads ist fehlgeschlagen. Bitte lade die Seite erneut, um es erneut zu versuchen.",
      );
    });

    expect(queryClient.setQueryData).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
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
        multipartUploadMode: "existing",
        mimeType: "video/webm",
        partNumber: 1,
        uploadId: "upload-1",
        videoUuid: "video-1",
      });
    });

    await vi.waitFor(() => {
      expect(xhr.open).toHaveBeenCalledWith(
        "PUT",
        "https://example.com/upload-refreshed",
      );
    });

    service.abortUpload(
      useRecordingUploadStore.getState().recordings[0]?.indexedDBId as number,
    );
    await service.uploadPipeline;
  });

  it("preserves resumable upload state after repeated network failures", async () => {
    vi.useFakeTimers();

    const presignedUrl = createDeferredPromise<{
      videoUuid: string;
      uploadId: string;
      uploadUrl: string;
    }>();
    const createPresignedS3RecordingMultipartUploadUrl = vi
      .fn()
      .mockReturnValueOnce(presignedUrl.promise);
    const { xhrs, createXmlHttpRequest } = createFailingXhrFactory();
    const toastError = vi.fn();
    const service = new RecordingUploadService({
      client: {
        createPresignedS3RecordingMultipartUploadUrl,
        finishMultipartUploadForRecording: vi.fn(),
        getInterviewRelatedDataByInterviewUuid: vi.fn(),
      },
      getQueryClient: () => createQueryClientDouble() as never,
      isPreSignedURLStillValid: vi.fn(() => true),
      toast: {
        error: toastError,
      },
      recordingUploadStore: useRecordingUploadStore,
      uploadedRecordingPartsStore: useUploadedRecordingPartsStore,
      createXmlHttpRequest,
      indexedDb: createIndexedDbDouble(),
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

    await vi.runAllTimersAsync();
    await service.uploadPipeline;

    expect(xhrs).toHaveLength(3);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(useRecordingUploadStore.getState().recordings).toHaveLength(1);
    expect(
      useUploadedRecordingPartsStore.getState().uploadedParts["question-1"],
    ).toEqual({
      videoUuid: "video-1",
      uploadId: "upload-1",
      status: "uploading",
      parts: [],
    });

    vi.useRealTimers();
  });

  it("clears multipart state after repeated fatal upload failures", async () => {
    vi.useFakeTimers();

    useUploadedRecordingPartsStore.setState({
      uploadedParts: {
        "question-1": {
          videoUuid: "video-1",
          uploadId: "upload-1",
          status: "uploading",
          parts: [
            {
              PartNumber: 1,
              ETag: '"etag-1"',
            },
          ],
        },
      },
    });

    const createPresignedS3RecordingMultipartUploadUrl = vi
      .fn()
      .mockResolvedValue({
        videoUuid: "video-1",
        uploadId: "upload-1",
        uploadUrl: "https://example.com/upload",
      });
    const { xhrs, createXmlHttpRequest } = createStatusFailingXhrFactory(500);
    const toastError = vi.fn();
    const service = new RecordingUploadService({
      client: {
        createPresignedS3RecordingMultipartUploadUrl,
        finishMultipartUploadForRecording: vi.fn(),
        getInterviewRelatedDataByInterviewUuid: vi.fn(),
      },
      getQueryClient: () => createQueryClientDouble() as never,
      isPreSignedURLStillValid: vi.fn(() => true),
      toast: {
        error: toastError,
      },
      recordingUploadStore: useRecordingUploadStore,
      uploadedRecordingPartsStore: useUploadedRecordingPartsStore,
      createXmlHttpRequest,
      indexedDb: createIndexedDbDouble(),
    });

    await service.addToUploadPipeline({
      file: new File(["video"], "answer.webm", {
        type: "video/webm",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      partNumber: 2,
      isLastPart: false,
    });

    await vi.runAllTimersAsync();
    await service.uploadPipeline;

    expect(xhrs).toHaveLength(3);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(useRecordingUploadStore.getState().recordings).toHaveLength(0);
    expect(
      useUploadedRecordingPartsStore.getState().uploadedParts["question-1"],
    ).toBeUndefined();

    vi.useRealTimers();
  });
});
