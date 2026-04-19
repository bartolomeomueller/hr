import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";
import type z from "zod";

vi.mock("@/orpc/client", () => ({
  orpc: {
    saveAnswer: {
      mutationOptions: vi.fn(() => ({})),
    },
  },
}));

import { isSingleChoiceQuestionAnswered } from "@/components/questions/SingleChoiceQuestion";
import type { AnswerSelectSchema } from "@/orpc/schema";

describe("isSingleChoiceQuestionAnswered", () => {
  it("returns false when no answer exists", () => {
    expect(isSingleChoiceQuestionAnswered(undefined)).toBe(false);
  });

  it("returns true when an answer exists", () => {
    const answer: z.infer<typeof AnswerSelectSchema> = {
      uuid: uuidv7(),
      interviewUuid: uuidv7(),
      questionUuid: uuidv7(),
      answerPayload: {
        selectedOption: "Option A",
      },
      answeredAt: new Date(),
    };

    expect(isSingleChoiceQuestionAnswered(answer)).toBe(true);
  });
});
