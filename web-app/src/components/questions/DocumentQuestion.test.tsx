// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { v7 as uuidv7 } from "uuid";
import { afterEach, describe, expect, it, vi } from "vitest";
import type z from "zod";
import { DocumentQuestion } from "@/components/questions/DocumentQuestion";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import { useDocumentUploadStore } from "@/stores/documentUploadStore";

const {
  saveAnswerMutationFnMock,
  deleteAnswerMutationFnMock,
  deleteDocumentMutationFnMock,
  createDocumentDownloadUrlMutationFnMock,
  addToUploadPipelineMock,
  cancelUploadMock,
  toastErrorMock,
  toastInfoMock,
} = vi.hoisted(() => ({
  saveAnswerMutationFnMock: vi.fn().mockResolvedValue(null),
  deleteAnswerMutationFnMock: vi.fn().mockResolvedValue(null),
  deleteDocumentMutationFnMock: vi.fn().mockResolvedValue(null),
  createDocumentDownloadUrlMutationFnMock: vi.fn().mockResolvedValue(null),
  addToUploadPipelineMock: vi.fn(),
  cancelUploadMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
}));

vi.mock("@/orpc/client", () => ({
  client: {
    deleteDocumentFromObjectStorageAndFromAnswer: vi.fn(),
    getInterviewRelatedDataByInterviewUuid: vi.fn(),
  },
  orpc: {
    saveAnswer: {
      mutationOptions: vi.fn(() => ({
        mutationFn: saveAnswerMutationFnMock,
      })),
    },
    deleteAnswer: {
      mutationOptions: vi.fn(() => ({
        mutationFn: deleteAnswerMutationFnMock,
      })),
    },
    deleteDocumentFromObjectStorageAndFromAnswer: {
      mutationOptions: vi.fn(() => ({
        mutationFn: deleteDocumentMutationFnMock,
      })),
    },
    createPresignedS3DocumentDownloadUrlByUuid: {
      mutationOptions: vi.fn(() => ({
        mutationFn: createDocumentDownloadUrlMutationFnMock,
      })),
    },
  },
}));

vi.mock("@/lib/query-client", () => ({
  getQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock("@/services/DocumentUploadService", () => ({
  documentUploadService: {
    addToUploadPipeline: addToUploadPipelineMock,
    cancelUpload: cancelUploadMock,
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    info: toastInfoMock,
  },
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

function createUploadedDocument(fileName = "resume.pdf") {
  return {
    documentUuid: uuidv7(),
    fileName,
    mimeType: "application/pdf",
  };
}

function renderDocumentQuestion({
  questionPayload,
  answer,
}: {
  questionPayload: { prompt: string; minUploads: number; maxUploads: number };
  answer?: z.infer<typeof AnswerSelectSchema>;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const question: z.infer<typeof QuestionSelectSchema> = {
    uuid: "question-1",
    flowStepUuid: "flow-step-1",
    position: 1,
    questionType: "document",
    questionPayload,
    isCv: false,
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentQuestion
        question={question}
        interviewUuid="interview-1"
        queryKeyToInvalidateAnswers={["answers", "interview-1"]}
        answer={answer}
      />
    </QueryClientProvider>,
  );
}

describe("DocumentQuestion", () => {
  afterEach(() => {
    cleanup();
    saveAnswerMutationFnMock.mockClear();
    deleteAnswerMutationFnMock.mockClear();
    deleteDocumentMutationFnMock.mockClear();
    createDocumentDownloadUrlMutationFnMock.mockClear();
    addToUploadPipelineMock.mockClear();
    cancelUploadMock.mockClear();
    toastErrorMock.mockClear();
    toastInfoMock.mockClear();
    useDocumentUploadStore.setState({ documentsToUpload: [] });
  });

  it("shows the 'no documents' checkbox when zero uploads are allowed", () => {
    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
    });

    expect(screen.getByText("Upload your supporting documents")).toBeTruthy();
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeTruthy();
    expect(checkbox.getAttribute("data-state")).toBe("unchecked");
  });

  it("shows an info toast and does not queue an upload for non-pdf files", async () => {
    const { container } = renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
    });

    const fileInput = container.querySelector('input[type="file"]');
    if (!fileInput) {
      throw new Error("Expected document question to render a file input.");
    }

    fireEvent.change(fileInput, {
      target: {
        files: [
          new File(["plain text"], "notes.txt", {
            type: "text/plain",
          }),
        ],
      },
    });

    expect(toastInfoMock).toHaveBeenCalledTimes(1);
    expect(addToUploadPipelineMock).not.toHaveBeenCalled();
  });

  it("reflects an existing 'no_documents' answer as checked", () => {
    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
      answer: {
        uuid: "answer-1",
        interviewUuid: "interview-1",
        questionUuid: "question-1",
        answerPayload: {
          kind: "no_documents",
        },
        answeredAt: new Date(),
      },
    });

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.getAttribute("data-state")).toBe("checked");
  });

  it("shows an error and falls back to the empty optional state for an invalid answer payload", async () => {
    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
      answer: {
        uuid: "answer-1",
        interviewUuid: "interview-1",
        questionUuid: "question-1",
        answerPayload: {
          kind: "documents",
          documents: [],
        },
        answeredAt: new Date(),
      },
    });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledTimes(1);
    });

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.getAttribute("data-state")).toBe("unchecked");
  });

  it("renders uploaded documents from the existing answer and hides the checkbox", () => {
    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
      answer: {
        uuid: "answer-1",
        interviewUuid: "interview-1",
        questionUuid: "question-1",
        answerPayload: {
          kind: "documents",
          documents: [createUploadedDocument()],
        },
        answeredAt: new Date(),
      },
    });

    expect(screen.getByText("resume.pdf")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("renders multiple uploaded documents from the existing answer", () => {
    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
      answer: {
        uuid: "answer-1",
        interviewUuid: "interview-1",
        questionUuid: "question-1",
        answerPayload: {
          kind: "documents",
          documents: [
            createUploadedDocument("resume.pdf"),
            createUploadedDocument("cover-letter.pdf"),
          ],
        },
        answeredAt: new Date(),
      },
    });

    expect(screen.getByText("resume.pdf")).toBeTruthy();
    expect(screen.getByText("cover-letter.pdf")).toBeTruthy();
  });

  it("keeps the checkbox hidden when uploaded documents already exist", () => {
    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
      answer: {
        uuid: "answer-1",
        interviewUuid: "interview-1",
        questionUuid: "question-1",
        answerPayload: {
          kind: "documents",
          documents: [createUploadedDocument()],
        },
        answeredAt: new Date(),
      },
    });

    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("does not show the checkbox when at least one upload is required", () => {
    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 1,
        maxUploads: 3,
      },
    });

    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("renders uploading documents from the upload store and hides the checkbox", () => {
    useDocumentUploadStore.setState({
      documentsToUpload: [
        {
          localUuid: "local-1",
          questionUuid: "question-1",
          file: new File(["resume"], "resume.pdf", {
            type: "application/pdf",
          }),
          progress: 25,
          abortController: new AbortController(),
        },
      ],
    });

    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
    });

    expect(screen.getByText("resume.pdf")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("renders only uploading documents for the current question", () => {
    useDocumentUploadStore.setState({
      documentsToUpload: [
        {
          localUuid: "local-1",
          questionUuid: "question-1",
          file: new File(["resume"], "resume.pdf", {
            type: "application/pdf",
          }),
          progress: 25,
          abortController: new AbortController(),
        },
        {
          localUuid: "local-2",
          questionUuid: "question-2",
          file: new File(["cover-letter"], "cover-letter.pdf", {
            type: "application/pdf",
          }),
          progress: 50,
          abortController: new AbortController(),
        },
      ],
    });

    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
    });

    expect(screen.getByText("resume.pdf")).toBeTruthy();
    expect(screen.queryByText("cover-letter.pdf")).toBeNull();
  });

  it("shows the checkbox in the empty optional state", () => {
    useDocumentUploadStore.setState({
      documentsToUpload: [],
    });

    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
      answer: undefined,
    });

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeTruthy();
    expect(checkbox.getAttribute("data-state")).toBe("unchecked");
  });

  it("saves a no_documents answer when the checkbox is checked", async () => {
    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
    });

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(saveAnswerMutationFnMock).toHaveBeenCalledTimes(1);
    });

    expect(saveAnswerMutationFnMock.mock.calls[0]?.[0]).toEqual({
      interviewUuid: "interview-1",
      questionUuid: "question-1",
      answerPayload: {
        kind: "no_documents",
      },
    });
  });

  it("disables the checkbox while saving a no_documents answer", async () => {
    const deferredSaveAnswer = createDeferredPromise<null>();
    saveAnswerMutationFnMock.mockReturnValueOnce(deferredSaveAnswer.promise);

    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
    });

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(checkbox.hasAttribute("disabled")).toBe(true);
    });

    deferredSaveAnswer.resolve(null);

    await waitFor(() => {
      expect(checkbox.hasAttribute("disabled")).toBe(false);
    });
  });

  it("disables the checkbox while deleting an existing no_documents answer", async () => {
    const deferredDeleteAnswer = createDeferredPromise<null>();
    deleteAnswerMutationFnMock.mockReturnValueOnce(
      deferredDeleteAnswer.promise,
    );

    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
      answer: {
        uuid: "answer-1",
        interviewUuid: "interview-1",
        questionUuid: "question-1",
        answerPayload: {
          kind: "no_documents",
        },
        answeredAt: new Date(),
      },
    });

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(checkbox.hasAttribute("disabled")).toBe(true);
    });

    deferredDeleteAnswer.resolve(null);

    await waitFor(() => {
      expect(checkbox.hasAttribute("disabled")).toBe(false);
    });
  });

  it("deletes the answer when an existing no_documents answer is unchecked", async () => {
    renderDocumentQuestion({
      questionPayload: {
        prompt: "Upload your supporting documents",
        minUploads: 0,
        maxUploads: 3,
      },
      answer: {
        uuid: "answer-1",
        interviewUuid: "interview-1",
        questionUuid: "question-1",
        answerPayload: {
          kind: "no_documents",
        },
        answeredAt: new Date(),
      },
    });

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(deleteAnswerMutationFnMock).toHaveBeenCalledTimes(1);
    });

    expect(deleteAnswerMutationFnMock.mock.calls[0]?.[0]).toEqual({
      interviewUuid: "interview-1",
      questionUuid: "question-1",
    });
  });
});
