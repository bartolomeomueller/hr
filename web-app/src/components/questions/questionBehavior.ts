import type { QueryKey } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type z from "zod";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import type { InterviewFormType } from "../Interview";

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
