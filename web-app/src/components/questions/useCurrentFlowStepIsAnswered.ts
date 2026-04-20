import type z from "zod";
import { useShallow } from "zustand/shallow";
import { QuestionType } from "@/db/payload-types";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import { useDocumentUploadStore } from "@/stores/documentUploadStore";
import { useRecordingUploadStore } from "@/stores/recordingUploadStore";
import { isDocumentQuestionAnswered } from "./DocumentQuestion";
import { isMultipleChoiceQuestionAnswered } from "./MultipleChoiceQuestion";
import { isSingleChoiceQuestionAnswered } from "./SingleChoiceQuestion";
import { isTextQuestionAnswered } from "./TextQuestion";
import { isVideoQuestionAnswered } from "./VideoQuestion";

export function useCurrentFlowStepIsAnswered({
  currentFlowStepKind,
  currentFlowStepQuestions,
  answers,
}: {
  currentFlowStepKind: string;
  currentFlowStepQuestions: Array<z.infer<typeof QuestionSelectSchema>>;
  answers: Array<z.infer<typeof AnswerSelectSchema>>;
}) {
  // Persisted answers alone are not enough for the next-button state. We also
  // want in-flight document/video uploads to count as answered immediately, so
  // this hook subscribes to the transient upload stores and derives one
  // reactive answered-state value for the current flow step.
  const questionUuidsWithUploadingDocuments = new Set(
    useDocumentUploadStore(
      useShallow((state) =>
        state.documentsToUpload.map((document) => document.questionUuid),
      ),
    ),
  );
  const questionUuidsWithUploadingRecordings = new Set(
    useRecordingUploadStore(
      useShallow((state) =>
        state.recordings
          .filter((recording) => recording.isLastPart)
          .map((recording) => recording.questionUuid),
      ),
    ),
  );

  if (currentFlowStepKind === "question_block") {
    return currentFlowStepQuestions.every((question) => {
      const answer = answers.find(
        (currentAnswer) => currentAnswer.questionUuid === question.uuid,
      );

      switch (question.questionType) {
        case QuestionType.video:
          throw new Error("This is a bug, please report it");
        case QuestionType.text:
          return isTextQuestionAnswered(answer);
        case QuestionType.single_choice:
          return isSingleChoiceQuestionAnswered(answer);
        case QuestionType.multiple_choice:
          return isMultipleChoiceQuestionAnswered(answer);
        case QuestionType.document:
          return isDocumentQuestionAnswered(
            answer,
            questionUuidsWithUploadingDocuments.has(question.uuid),
          );
        default:
          throw new Error(
            `Question type ${question.questionType} is not supported. Please report this bug.`,
          );
      }
    });
  }

  const currentVideoQuestion = currentFlowStepQuestions[0];
  if (!currentVideoQuestion) {
    throw new Error(
      "Video flow steps should always have exactly one question. This should never happen, please report it.",
    );
  }

  return isVideoQuestionAnswered(
    answers.find((answer) => answer.questionUuid === currentVideoQuestion.uuid),
    questionUuidsWithUploadingRecordings.has(currentVideoQuestion.uuid),
  );
}
