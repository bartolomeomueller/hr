import { type QueryKey, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type z from "zod";
import {
  VideoAnswerPayloadType,
  VideoQuestionPayloadType,
} from "@/db/payload-types";
import { orpc } from "@/orpc/client";
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

  const answer = answers.find((a) => a.questionUuid === question.uuid); // undefined if no answer was given yet
  const answerPayloadParseResult = VideoAnswerPayloadType.safeParse(
    answer?.answerPayload,
  );
  const [selectedOption, setSelectedOption] = useState(
    answerPayloadParseResult.success
      ? answerPayloadParseResult.data.videoUuid
      : "",
  );
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { mutate } = useMutation({
    ...orpc.saveAnswer.mutationOptions(),
    // isPending is false as soon as the new (previously invalidated) query data arrives, since we are returning the promise
    onSettled: (_data, _error, _variables, _onMutateResult, context) =>
      context.client.invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      }),
    retry: 1,
  });

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
