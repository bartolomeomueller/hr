import type { QueryKey } from "@tanstack/react-query";
import type z from "zod";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import type { InterviewFormType } from "../Interview";
import {
  isInterviewQuestionAnswered,
  renderQuestionBlockQuestion,
} from "./questionTypeHelpers";

export function QuestionBlock({
  form,
  questions,
  interviewUuid,
  queryKeyToInvalidateAnswers,
  answers,
}: {
  form: InterviewFormType;
  questions: Array<z.infer<typeof QuestionSelectSchema>>;
  interviewUuid: string;
  queryKeyToInvalidateAnswers: QueryKey;
  answers: Array<z.infer<typeof AnswerSelectSchema>>;
}) {
  return (
    <form className="flex flex-col gap-4">
      {questions.map((question) => {
        const answer = answers.find((a) => a.questionUuid === question.uuid); // undefined if no answer was given yet

        return renderQuestionBlockQuestion({
          form,
          question,
          interviewUuid,
          queryKeyToInvalidateAnswers,
          answer,
        });
      })}
    </form>
  );
}

export function areQuestionBlockQuestionsAnswered({
  questions,
  answers,
  questionUuidsWithUploadingDocuments,
}: {
  questions: Array<z.infer<typeof QuestionSelectSchema>>;
  answers: Array<z.infer<typeof AnswerSelectSchema>>;
  questionUuidsWithUploadingDocuments: Set<string>;
}) {
  return questions.every((question) => {
    const answer = answers.find(
      (currentAnswer) => currentAnswer.questionUuid === question.uuid,
    );

    return isInterviewQuestionAnswered({
      question,
      answer,
      questionUuidsWithUploadingDocuments,
      questionUuidsWithUploadingRecordings: new Set(),
    });
  });
}
