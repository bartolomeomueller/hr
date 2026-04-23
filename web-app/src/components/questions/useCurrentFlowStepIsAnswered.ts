import type z from "zod";
import { useShallow } from "zustand/shallow";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import { useDocumentUploadStore } from "@/stores/documentUploadStore";
import { useRecordingUploadStore } from "@/stores/recordingUploadStore";
import { isInterviewQuestionAnswered } from "./QuestionBlock";

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

      return isInterviewQuestionAnswered({
        question,
        answer,
        questionUuidsWithUploadingDocuments,
        questionUuidsWithUploadingRecordings,
      });
    });
  }

  const currentVideoQuestion = currentFlowStepQuestions[0];
  if (!currentVideoQuestion) {
    throw new Error(
      "Video flow steps should always have exactly one question. This should never happen, please report it.",
    );
  }

  return isInterviewQuestionAnswered({
    question: currentVideoQuestion,
    answer: answers.find(
      (answer) => answer.questionUuid === currentVideoQuestion.uuid,
    ),
    questionUuidsWithUploadingDocuments,
    questionUuidsWithUploadingRecordings,
  });
}
