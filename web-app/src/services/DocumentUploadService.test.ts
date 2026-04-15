import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getQueryClient } from "@/lib/query-client";
import { isPreSignedURLStillValid } from "@/lib/utils";
import { DocumentUploadService } from "@/services/DocumentUploadService";
import { useDocumentUploadStore } from "@/stores/documentUploadStore";

vi.mock("@/orpc/client", () => ({
  client: {
    createPresignedS3DocumentUploadUrl: vi.fn(),
    addNewDocumentToAnswer: vi.fn(),
    getInterviewRelatedDataByInterviewUuid: vi.fn(),
  },
}));

vi.mock("@/lib/query-client", () => ({
  getQueryClient: vi.fn(() => ({
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock("@/lib/utils", () => ({
  isPreSignedURLStillValid: vi.fn(() => true),
}));

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

function createService({
  createPresignedS3DocumentUploadUrl,
  createXmlHttpRequest = () => new XMLHttpRequest(),
  addNewDocumentToAnswer = vi.fn(),
  isPreSignedUrlStillValid = isPreSignedURLStillValid,
}: {
  createPresignedS3DocumentUploadUrl: ReturnType<typeof vi.fn>;
  createXmlHttpRequest?: () => XMLHttpRequest;
  addNewDocumentToAnswer?: ReturnType<typeof vi.fn>;
  isPreSignedUrlStillValid?: typeof isPreSignedURLStillValid;
}) {
  const serviceDependencies = {
    client: {
      createPresignedS3DocumentUploadUrl,
      addNewDocumentToAnswer,
      getInterviewRelatedDataByInterviewUuid: vi.fn(),
    },
    getQueryClient,
    isPreSignedURLStillValid: isPreSignedUrlStillValid,
    toast: {
      error: vi.fn(),
    },
    uploadStore: useDocumentUploadStore,
    createXmlHttpRequest,
  } as unknown as ConstructorParameters<typeof DocumentUploadService>[0];

  return new DocumentUploadService(serviceDependencies);
}

function createQueryClientDouble() {
  return {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  };
}

function createXhrDouble() {
  const xhr = {
    open: vi.fn(),
    setRequestHeader: vi.fn(),
    send: vi.fn(),
    abort: vi.fn(),
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

describe("DocumentUploadService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocumentUploadStore.setState({
      documentsToUpload: [],
    });
  });

  afterEach(() => {
    useDocumentUploadStore.setState({
      documentsToUpload: [],
    });
  });

  it("adds a pending document to the upload store as soon as an upload is queued", async () => {
    const presignedUrl = createDeferredPromise<{
      uuid: string;
      uploadUrl: string;
    }>();
    const createPresignedS3DocumentUploadUrl = vi
      .fn()
      .mockReturnValueOnce(presignedUrl.promise);

    const service = createService({ createPresignedS3DocumentUploadUrl });

    await service.addToUploadPipeline({
      file: new File(["resume"], "resume.pdf", {
        type: "application/pdf",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      isSingleFileUpload: true,
    });

    const documentsToUpload =
      useDocumentUploadStore.getState().documentsToUpload;

    expect(createPresignedS3DocumentUploadUrl).toHaveBeenCalledWith({
      mimeType: "application/pdf",
    });
    expect(documentsToUpload).toHaveLength(1);
    expect(documentsToUpload[0]).toMatchObject({
      questionUuid: "question-1",
      file: expect.objectContaining({
        name: "resume.pdf",
        type: "application/pdf",
      }),
      progress: 0,
    });
    expect(documentsToUpload[0].abortController).toBeInstanceOf(
      AbortController,
    );

    service.uploadPipeline = Promise.resolve();
  });

  it("updates the upload progress in the store when the xhr reports progress", async () => {
    const presignedUrl = createDeferredPromise<{
      uuid: string;
      uploadUrl: string;
    }>();
    const createPresignedS3DocumentUploadUrl = vi
      .fn()
      .mockReturnValueOnce(presignedUrl.promise);
    const xhr = createXhrDouble();

    const service = createService({
      createPresignedS3DocumentUploadUrl,
      createXmlHttpRequest: () => xhr,
    });

    await service.addToUploadPipeline({
      file: new File(["resume"], "resume.pdf", {
        type: "application/pdf",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      isSingleFileUpload: true,
    });

    presignedUrl.resolve({
      uuid: "document-1",
      uploadUrl: "https://example.com/upload",
    });

    await vi.waitFor(() => {
      expect(xhr.send).toHaveBeenCalledTimes(1);
    });

    const localUuid =
      useDocumentUploadStore.getState().documentsToUpload[0]?.localUuid;
    expect(localUuid).toBeDefined();

    xhr.upload.onprogress?.({
      lengthComputable: true,
      loaded: 25,
      total: 100,
    } as ProgressEvent<XMLHttpRequestEventTarget>);

    expect(
      useDocumentUploadStore.getState().documentsToUpload[0],
    ).toMatchObject({
      localUuid,
      progress: 25,
    });

    useDocumentUploadStore
      .getState()
      .documentsToUpload[0]?.abortController.abort();
    await service.uploadPipeline;
  });

  it("removes an upload from the store when it is aborted", async () => {
    const presignedUrl = createDeferredPromise<{
      uuid: string;
      uploadUrl: string;
    }>();
    const createPresignedS3DocumentUploadUrl = vi
      .fn()
      .mockReturnValueOnce(presignedUrl.promise);
    const xhr = createXhrDouble();

    const service = createService({
      createPresignedS3DocumentUploadUrl,
      createXmlHttpRequest: () => xhr,
    });

    await service.addToUploadPipeline({
      file: new File(["resume"], "resume.pdf", {
        type: "application/pdf",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      isSingleFileUpload: true,
    });

    presignedUrl.resolve({
      uuid: "document-1",
      uploadUrl: "https://example.com/upload",
    });

    await vi.waitFor(() => {
      expect(xhr.send).toHaveBeenCalledTimes(1);
    });

    expect(useDocumentUploadStore.getState().documentsToUpload).toHaveLength(1);

    useDocumentUploadStore
      .getState()
      .documentsToUpload[0]?.abortController.abort();

    await service.uploadPipeline;

    expect(useDocumentUploadStore.getState().documentsToUpload).toHaveLength(0);
    expect(xhr.abort).toHaveBeenCalledTimes(1);
  });

  it("removes the pending upload and updates the query cache after a successful upload", async () => {
    const presignedUrl = createDeferredPromise<{
      uuid: string;
      uploadUrl: string;
    }>();
    const createPresignedS3DocumentUploadUrl = vi
      .fn()
      .mockReturnValueOnce(presignedUrl.promise);
    const addNewDocumentToAnswer = vi.fn().mockResolvedValue({
      questionUuid: "question-1",
      answerPayload: {
        documents: [
          {
            documentUuid: "document-1",
            fileName: "resume.pdf",
            mimeType: "application/pdf",
          },
        ],
      },
    });
    const xhr = createXhrDouble();
    const queryClient = createQueryClientDouble();
    vi.mocked(getQueryClient).mockReturnValue(
      queryClient as unknown as ReturnType<typeof getQueryClient>,
    );

    const service = createService({
      createPresignedS3DocumentUploadUrl,
      createXmlHttpRequest: () => xhr,
      addNewDocumentToAnswer,
    });

    await service.addToUploadPipeline({
      file: new File(["resume"], "resume.pdf", {
        type: "application/pdf",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      isSingleFileUpload: true,
    });

    presignedUrl.resolve({
      uuid: "document-1",
      uploadUrl: "https://example.com/upload",
    });

    await vi.waitFor(() => {
      expect(xhr.send).toHaveBeenCalledTimes(1);
    });

    expect(useDocumentUploadStore.getState().documentsToUpload).toHaveLength(1);

    xhr.onload?.();

    await vi.waitFor(() => {
      expect(addNewDocumentToAnswer).toHaveBeenCalledWith({
        interviewUuid: "interview-1",
        questionUuid: "question-1",
        document: {
          documentUuid: "document-1",
          fileName: "resume.pdf",
          mimeType: "application/pdf",
        },
        isSingleFileUpload: true,
      });
    });

    expect(useDocumentUploadStore.getState().documentsToUpload).toHaveLength(0);
    expect(queryClient.setQueryData).toHaveBeenCalledTimes(1);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["answers", "interview-1"],
    });
  });

  it("requests a fresh presigned url when the first one is already expired", async () => {
    const createPresignedS3DocumentUploadUrl = vi
      .fn()
      .mockResolvedValueOnce({
        uuid: "expired-document",
        uploadUrl: "https://example.com/expired-upload",
      })
      .mockResolvedValueOnce({
        uuid: "fresh-document",
        uploadUrl: "https://example.com/fresh-upload",
      });
    const isPreSignedUrlStillValid = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const xhr = createXhrDouble();

    const service = createService({
      createPresignedS3DocumentUploadUrl,
      createXmlHttpRequest: () => xhr,
      isPreSignedUrlStillValid,
    });

    await service.addToUploadPipeline({
      file: new File(["resume"], "resume.pdf", {
        type: "application/pdf",
      }),
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      isSingleFileUpload: true,
    });

    await vi.waitFor(() => {
      expect(xhr.open).toHaveBeenCalledWith(
        "PUT",
        "https://example.com/fresh-upload",
      );
    });

    expect(createPresignedS3DocumentUploadUrl).toHaveBeenCalledTimes(2);
    expect(createPresignedS3DocumentUploadUrl).toHaveBeenNthCalledWith(1, {
      mimeType: "application/pdf",
    });
    expect(createPresignedS3DocumentUploadUrl).toHaveBeenNthCalledWith(2, {
      mimeType: "application/pdf",
    });
    expect(isPreSignedUrlStillValid).toHaveBeenCalledWith(
      "https://example.com/expired-upload",
    );

    useDocumentUploadStore
      .getState()
      .documentsToUpload[0]?.abortController.abort();
    await service.uploadPipeline;
  });
});
