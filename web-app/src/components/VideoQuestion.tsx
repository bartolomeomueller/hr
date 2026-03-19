import type { QueryKey } from "@tanstack/react-query";
import type z from "zod";
import { VideoQuestionPayloadType } from "@/db/payload-types";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import { addChunkAndTryUpload } from "@/services/UploadService";
import { VideoRecorder } from "./VideoRecorder";

export function VideoQuestion({
  questions,
  interviewUuid,
  queryKeyToInvalidateAnswers,
  answers,
}: {
  questions: Array<z.infer<typeof QuestionSelectSchema>>;
  interviewUuid: string;
  queryKeyToInvalidateAnswers: QueryKey;
  answers: Array<z.infer<typeof AnswerSelectSchema>>;
}) {
  if (questions.length !== 1) {
    throw new Error(
      "Video flow steps should only have one question. This should never happen, please report it.",
    );
  }
  const question = questions[0];
  const questionPayloadResult = VideoQuestionPayloadType.safeParse(
    question.questionPayload,
  );
  if (!questionPayloadResult.success)
    throw new Error(
      `Question payload does not match expected type for single choice question. This should never happen, please report it. ${questionPayloadResult.error.message}`,
    );
  const questionPayload = questionPayloadResult.data;

  return (
    <form>
      <div>{questionPayload.question}</div>
      <VideoRecorder
        maxDurationSec={questionPayload.maxDurationSeconds}
        maxOvertimeSec={questionPayload.maxOvertimeSeconds}
        transferNewChunk={addChunkAndTryUpload}
      />
    </form>
  );
}
