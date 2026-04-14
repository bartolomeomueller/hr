import type { QueryKey } from "@tanstack/react-query";
import { ClientOnly } from "@tanstack/react-router";
import { useState } from "react";
import type z from "zod";
import {
  VideoAnswerPayloadType,
  VideoQuestionPayloadType,
} from "@/db/payload-types";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import { recordingUploadService } from "@/services/RecordingUploadService.client";
import { Large } from "../ui/typography";
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
  const [previousRecordingUuid, setPreviousRecordingUuid] = useState(
    answerPayloadParseResult.success
      ? answerPayloadParseResult.data.videoUuid
      : "",
  );

  // TODO implement recording of new video with warning, that the old recording will be deleted

  return (
    <div className="flex flex-col gap-4">
      <Large>{questionPayload.question}</Large>
      <ClientOnly>
        <VideoRecorder
          maxDurationSec={questionPayload.maxDurationSeconds}
          maxOvertimeSec={questionPayload.maxOvertimeSeconds}
          transferNewChunk={async (chunk) => {
            const file = new File([chunk.chunk], "namedoesnotmatter", {
              type: chunk.chunk.type,
            });
            void recordingUploadService.addToUploadPipeline({
              file,
              interviewUuid,
              questionUuid: question.uuid,
              queryKeyToInvalidateAnswers,
              partNumber: chunk.partNumber,
              isLastPart: chunk.isLastChunk,
            });
          }}
        />
      </ClientOnly>
    </div>
  );
}
