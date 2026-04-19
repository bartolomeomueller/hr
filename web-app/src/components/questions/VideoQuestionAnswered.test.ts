import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type z from "zod";

const { recordingsMock } = vi.hoisted(() => ({
  recordingsMock: [] as Array<{
    questionUuid: string;
    interviewUuid: string;
    queryKeyToInvalidateAnswers: string[];
    indexedDBId: number;
    progress: number;
    partNumber: number;
    isLastPart: boolean;
  }>,
}));

vi.mock("@/services/RecordingUploadService.client", () => ({
  recordingUploadService: {
    addToUploadPipeline: vi.fn(),
  },
}));

vi.mock("@/stores/recordingUploadStore", () => ({
  useRecordingUploadStore: {
    getState: () => ({
      recordings: recordingsMock,
    }),
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
  beforeEach(() => {
    recordingsMock.length = 0;
  });

  it("returns false when no answer exists and no upload is in progress", () => {
    const question = createVideoQuestion();

    expect(isVideoQuestionAnswered(question, undefined)).toBe(false);
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

    expect(isVideoQuestionAnswered(question, answer)).toBe(true);
  });

  it("returns false when only non-final parts are queued for the question", () => {
    const question = createVideoQuestion();
    recordingsMock.push({
      questionUuid: question.uuid,
      interviewUuid: uuidv7(),
      queryKeyToInvalidateAnswers: ["answers", uuidv7()],
      indexedDBId: 1,
      progress: 50,
      partNumber: 1,
      isLastPart: false,
    });

    expect(isVideoQuestionAnswered(question, undefined)).toBe(false);
  });

  it("returns true when the final part is queued for the question", () => {
    const question = createVideoQuestion();
    recordingsMock.push({
      questionUuid: question.uuid,
      interviewUuid: uuidv7(),
      queryKeyToInvalidateAnswers: ["answers", uuidv7()],
      indexedDBId: 1,
      progress: 50,
      partNumber: 1,
      isLastPart: false,
    });
    recordingsMock.push({
      questionUuid: question.uuid,
      interviewUuid: uuidv7(),
      queryKeyToInvalidateAnswers: ["answers", uuidv7()],
      indexedDBId: 2,
      progress: 10,
      partNumber: 2,
      isLastPart: true,
    });

    expect(isVideoQuestionAnswered(question, undefined)).toBe(true);
  });
});
