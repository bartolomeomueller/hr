import type { QueryKey } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type z from "zod";
import type { InterviewFormType } from "@/components/interview/Interview";
import { documentQuestionBehavior } from "@/components/interview/questions/DocumentQuestion";
import { multipleChoiceQuestionBehavior } from "@/components/interview/questions/MultipleChoiceQuestion";
import { singleChoiceQuestionBehavior } from "@/components/interview/questions/SingleChoiceQuestion";
import { textQuestionBehavior } from "@/components/interview/questions/TextQuestion";
import { videoQuestionBehavior } from "@/components/interview/questions/VideoQuestion";
import { QuestionType } from "@/db/payload-types";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";

export interface QuestionBehavior {
  getFormDefaultValue: (
    answer: z.infer<typeof AnswerSelectSchema> | undefined,
  ) => string | string[] | undefined;
  isAnswered: (args: {
    question: z.infer<typeof QuestionSelectSchema>;
    answer: z.infer<typeof AnswerSelectSchema> | undefined;
    questionUuidsWithUploadingDocuments: Set<string>;
    questionUuidsWithUploadingRecordings: Set<string>;
  }) => boolean;
  renderQuestionBlockQuestion: (args: {
    form: InterviewFormType;
    question: z.infer<typeof QuestionSelectSchema>;
    interviewUuid: string;
    queryKeyToInvalidateAnswers: QueryKey;
    answer: z.infer<typeof AnswerSelectSchema> | undefined;
  }) => ReactNode;
}

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

export function getCurrentFlowStepFormDefaultValues({
  questions,
  answers,
  currentFlowStepUuid,
}: {
  questions: Array<z.infer<typeof QuestionSelectSchema>>;
  answers: Array<z.infer<typeof AnswerSelectSchema>>;
  currentFlowStepUuid: string;
}) {
  return questions
    .filter((question) => question.flowStepUuid === currentFlowStepUuid)
    .reduce<Record<string, string | string[]>>((defaultValues, question) => {
      const answer = answers.find(
        (currentAnswer) => currentAnswer.questionUuid === question.uuid,
      );
      const defaultValue = getQuestionTypeHelper(
        question.questionType,
      ).getFormDefaultValue(answer);

      if (defaultValue === undefined) {
        return defaultValues;
      }

      defaultValues[question.uuid] = defaultValue;
      return defaultValues;
    }, {});
}

export function renderQuestionBlockQuestion({
  form,
  question,
  interviewUuid,
  queryKeyToInvalidateAnswers,
  answer,
}: {
  form: InterviewFormType;
  question: z.infer<typeof QuestionSelectSchema>;
  interviewUuid: string;
  queryKeyToInvalidateAnswers: QueryKey;
  answer: z.infer<typeof AnswerSelectSchema> | undefined;
}) {
  return getQuestionTypeHelper(
    question.questionType,
  ).renderQuestionBlockQuestion({
    form,
    question,
    interviewUuid,
    queryKeyToInvalidateAnswers,
    answer,
  });
}

export function isInterviewQuestionAnswered({
  question,
  answer,
  questionUuidsWithUploadingDocuments,
  questionUuidsWithUploadingRecordings,
}: {
  question: z.infer<typeof QuestionSelectSchema>;
  answer: z.infer<typeof AnswerSelectSchema> | undefined;
  questionUuidsWithUploadingDocuments: Set<string>;
  questionUuidsWithUploadingRecordings: Set<string>;
}) {
  return getQuestionTypeHelper(question.questionType).isAnswered({
    question,
    answer,
    questionUuidsWithUploadingDocuments,
    questionUuidsWithUploadingRecordings,
  });
}

export function getQuestionTypeHelper(questionType: string): QuestionBehavior {
  const helper = questionTypeHelpers[questionType as QuestionType];
  if (helper) {
    return helper;
  }

  throw new Error(
    `Question type ${questionType} is not supported. Please report this bug.`,
  );
}

const questionTypeHelpers: Record<QuestionType, QuestionBehavior> = {
  [QuestionType.text]: textQuestionBehavior,
  [QuestionType.single_choice]: singleChoiceQuestionBehavior,
  [QuestionType.multiple_choice]: multipleChoiceQuestionBehavior,
  [QuestionType.document]: documentQuestionBehavior,
  [QuestionType.video]: videoQuestionBehavior,
};
