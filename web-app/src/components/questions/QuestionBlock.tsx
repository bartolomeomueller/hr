import type { QueryKey } from "@tanstack/react-query";
import { ClientOnly } from "@tanstack/react-router";
import type z from "zod";
import { QuestionType } from "@/db/payload-types";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import type { InterviewFormType } from "../Interview";
import {
  DocumentQuestion,
  isDocumentQuestionAnswered,
} from "./DocumentQuestion";
import {
  isMultipleChoiceQuestionAnswered,
  MultipleChoiceQuestion,
} from "./MultipleChoiceQuestion";
import {
  isSingleChoiceQuestionAnswered,
  SingleChoiceQuestion,
} from "./SingleChoiceQuestion";
import { isTextQuestionAnswered, TextQuestion } from "./TextQuestion";

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

        switch (question.questionType) {
          case QuestionType.video:
            throw new Error("This is a bug, please report it");
          case QuestionType.text: {
            return (
              <TextQuestion
                key={question.uuid}
                form={form}
                question={question}
                interviewUuid={interviewUuid}
                queryKeyToInvalidateAnswers={queryKeyToInvalidateAnswers}
                answer={answer}
              />
            );
          }
          case QuestionType.single_choice: {
            return (
              <SingleChoiceQuestion
                key={question.uuid}
                form={form}
                question={question}
                interviewUuid={interviewUuid}
                queryKeyToInvalidateAnswers={queryKeyToInvalidateAnswers}
                answer={answer}
              />
            );
          }
          case QuestionType.multiple_choice: {
            return (
              <MultipleChoiceQuestion
                key={question.uuid}
                form={form}
                question={question}
                interviewUuid={interviewUuid}
                queryKeyToInvalidateAnswers={queryKeyToInvalidateAnswers}
                answer={answer}
              />
            );
          }
          case QuestionType.document: {
            return (
              <ClientOnly key={question.uuid}>
                <DocumentQuestion
                  question={question}
                  interviewUuid={interviewUuid}
                  queryKeyToInvalidateAnswers={queryKeyToInvalidateAnswers}
                  answer={answer}
                />
              </ClientOnly>
            );
          }
          default:
            throw new Error(
              `Question type ${question.questionType} is not supported. Please report this bug.`,
            );
        }
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
