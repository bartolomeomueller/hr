// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type z from "zod";
import { DocumentQuestion } from "@/components/questions/DocumentQuestion";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import { useDocumentUploadStore } from "@/stores/documentUploadStore";

vi.mock("@/orpc/client", () => ({
  client: {
    deleteDocumentFromObjectStorageAndFromAnswer: vi.fn(),
    getInterviewRelatedDataByInterviewUuid: vi.fn(),
  },
  orpc: {
    saveAnswer: {
      mutationOptions: vi.fn(() => ({})),
    },
    deleteAnswer: {
      mutationOptions: vi.fn(() => ({})),
    },
    deleteDocumentFromObjectStorageAndFromAnswer: {
      mutationOptions: vi.fn(() => ({})),
    },
    createPresignedS3DocumentDownloadUrlByUuid: {
      mutationOptions: vi.fn(() => ({})),
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
    addToUploadPipeline: vi.fn(),
    cancelUpload: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

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
});
