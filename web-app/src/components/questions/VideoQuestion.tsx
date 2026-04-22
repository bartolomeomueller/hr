import { type QueryKey, useMutation } from "@tanstack/react-query";
import { ClientOnly } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import type z from "zod";
import {
  VideoAnswerPayloadType,
  VideoQuestionPayloadType,
} from "@/db/payload-types";
import {
  type InterviewRelatedDataQueryData,
  removeAnswerFromInterviewRelatedDataCache,
} from "@/lib/interview-related-data-cache";
import { orpc } from "@/orpc/client";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import { recordingUploadService } from "@/services/RecordingUploadService.client";
import { useRecordingUploadStore } from "@/stores/recordingUploadStore";
import { Button } from "../ui/button";
import { Large } from "../ui/typography";
import type { QuestionBehavior } from "./questionBehavior";
import { VideoRecorder } from "./VideoRecorder";

export const videoQuestionBehavior: QuestionBehavior = {
  getFormDefaultValue: getVideoQuestionFormDefaultValue,
  isAnswered: ({ question, answer, questionUuidsWithUploadingRecordings }) =>
    isVideoQuestionAnswered(
      answer,
      questionUuidsWithUploadingRecordings.has(question.uuid),
    ),
  renderQuestionBlockQuestion: () => {
    throw new Error("Video questions are not supported in question blocks.");
  },
};

function isVideoQuestionAnswered(
  answer: z.infer<typeof AnswerSelectSchema> | undefined,
  hasUploadingRecordingForQuestion = false,
) {
  if (answer) {
    return true;
  }

  return hasUploadingRecordingForQuestion;
}

// Tanstack Form is not used for this component.
function getVideoQuestionFormDefaultValue() {
  return undefined;
}

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
  const hasUploadingRecordingWithLastPart = useRecordingUploadStore((state) =>
    state.recordings.some(
      (recording) =>
        recording.questionUuid === question.uuid && recording.isLastPart,
    ),
  );
  const hasAnswerOrUploadingRecordingWithLastPart =
    !!answer || hasUploadingRecordingWithLastPart;

  const { mutate: deleteRecording, isPending: isDeletingRecording } =
    useMutation({
      ...orpc.deleteAnswer.mutationOptions(),
      onMutate: async (variables, context) => {
        await context.client.cancelQueries({
          queryKey: queryKeyToInvalidateAnswers,
        });

        const previousData =
          context.client.getQueryData<InterviewRelatedDataQueryData>(
            queryKeyToInvalidateAnswers,
          );

        context.client.setQueryData<InterviewRelatedDataQueryData>(
          queryKeyToInvalidateAnswers,
          (oldData) =>
            removeAnswerFromInterviewRelatedDataCache(
              oldData,
              variables.questionUuid,
            ),
        );

        return {
          previousData,
        };
      },
      onError: (_error, _variables, onMutateResult, context) => {
        context.client.setQueryData(
          queryKeyToInvalidateAnswers,
          onMutateResult?.previousData,
        );
        toast.error(
          "Löschen der vorherigen Aufnahme fehlgeschlagen. Bitte versuche es erneut.",
        );
      },
      onSettled: (_data, _error, _variables, _onMutateResult, context) =>
        context.client.invalidateQueries({
          queryKey: queryKeyToInvalidateAnswers,
        }),
      retry: 1,
    });

  return (
    <div className="flex flex-col gap-4">
      <Large>{questionPayload.question}</Large>
      {!hasAnswerOrUploadingRecordingWithLastPart && (
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
      )}
      {hasAnswerOrUploadingRecordingWithLastPart && (
        <Button
          disabled={isDeletingRecording}
          variant="destructive"
          onClick={() => {
            deleteRecording({ interviewUuid, questionUuid: question.uuid });
          }}
        >
          Du hast bereits eine Anwort aufgenommen. Wenn du diese ersetzen
          willst, dann drücke hier.
        </Button>
      )}
    </div>
  );
}
