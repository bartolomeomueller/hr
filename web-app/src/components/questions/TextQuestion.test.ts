import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";
import type z from "zod";

vi.mock("@/orpc/client", () => ({
  orpc: {
    deleteAnswer: {
      mutationOptions: vi.fn(() => ({})),
    },
    saveAnswer: {
      mutationOptions: vi.fn(() => ({})),
    },
  },
}));

import { isTextQuestionAnswered } from "@/components/questions/TextQuestion";
import type { AnswerSelectSchema } from "@/orpc/schema";

describe("isTextQuestionAnswered", () => {
  it("returns false when no answer exists", () => {
    expect(isTextQuestionAnswered(undefined)).toBe(false);
  });

  it("returns true when an answer exists", () => {
    const answer: z.infer<typeof AnswerSelectSchema> = {
      uuid: uuidv7(),
      interviewUuid: uuidv7(),
      questionUuid: uuidv7(),
      answerPayload: {
        answer: "My answer",
      },
      answeredAt: new Date(),
    };

    expect(isTextQuestionAnswered(answer)).toBe(true);
  });
});
