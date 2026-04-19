import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";
import type z from "zod";

vi.mock("@/orpc/client", () => ({
  client: {},
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

import { isDocumentQuestionAnswered } from "@/components/questions/DocumentQuestion";
import type { AnswerSelectSchema } from "@/orpc/schema";

describe("isDocumentQuestionAnswered", () => {
  it("returns false when no answer exists", () => {
    expect(isDocumentQuestionAnswered(undefined)).toBe(false);
  });

  it("returns true when an answer exists", () => {
    const answer: z.infer<typeof AnswerSelectSchema> = {
      uuid: uuidv7(),
      interviewUuid: uuidv7(),
      questionUuid: uuidv7(),
      answerPayload: {
        kind: "no_documents",
      },
      answeredAt: new Date(),
    };

    expect(isDocumentQuestionAnswered(answer)).toBe(true);
  });
});
