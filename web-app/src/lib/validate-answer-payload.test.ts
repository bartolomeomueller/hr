import { describe, expect, it } from "vitest";
import { QuestionType } from "@/db/payload-types";
import { validateAnswerPayloadForQuestionType } from "@/lib/validate-answer-payload";

describe("validateAnswerPayloadForQuestionType", () => {
  it("accepts valid text answers", () => {
    expect(
      validateAnswerPayloadForQuestionType({
        questionType: QuestionType.text,
        answerPayload: {
          answer: "valid",
        },
      }),
    ).toEqual({
      answer: "valid",
    });
  });

  it("rejects invalid text answers", () => {
    expect(() =>
      validateAnswerPayloadForQuestionType({
        questionType: QuestionType.text,
        answerPayload: {
          answer: "",
        },
      }),
    ).toThrowError();
  });
});
