import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";
import type z from "zod";

vi.mock("@/services/RecordingUploadService.client", () => ({
  recordingUploadService: {
    addToUploadPipeline: vi.fn(),
  },
}));

import { isVideoQuestionAnswered } from "@/components/questions/VideoQuestion";
import { QuestionType } from "@/db/payload-types";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";

function createVideoQuestion(): z.infer<typeof QuestionSelectSchema> {
  return {
    uuid: uuidv7(),
    flowStepUuid: uuidv7(),
    position: 1,
    questionType: QuestionType.video,
    questionPayload: {
      question: "Please record your answer",
      maxDurationSeconds: 60,
      maxOvertimeSeconds: 10,
    },
    isCv: false,
  };
}

describe("isVideoQuestionAnswered", () => {
  it("returns false when no answer exists and no upload is in progress", () => {
    expect(isVideoQuestionAnswered(undefined)).toBe(false);
  });

  it("returns true when an answer exists", () => {
    const question = createVideoQuestion();
    const answer: z.infer<typeof AnswerSelectSchema> = {
      uuid: uuidv7(),
      interviewUuid: uuidv7(),
      questionUuid: question.uuid,
      answerPayload: {
        videoUuid: uuidv7(),
        status: "uploaded",
      },
      answeredAt: new Date(),
    };

    expect(isVideoQuestionAnswered(answer)).toBe(true);
  });

  it("returns false when no final upload is in progress", () => {
    expect(isVideoQuestionAnswered(undefined, false)).toBe(false);
  });

  it("returns true when the final upload is in progress", () => {
    expect(isVideoQuestionAnswered(undefined, true)).toBe(true);
  });
});
