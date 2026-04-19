import type z from "zod";
import {
  DocumentAnswerPayloadType,
  MultipleChoiceAnswerPayloadType,
  QuestionType,
  SingleChoiceAnswerPayloadType,
  TextAnswerPayloadType,
  VideoAnswerPayloadType,
} from "@/db/payload-types";
import type { AnswerSelectSchema } from "@/orpc/schema";

const answerPayloadSchemaByQuestionType = {
  [QuestionType.video]: VideoAnswerPayloadType,
  [QuestionType.text]: TextAnswerPayloadType,
  [QuestionType.single_choice]: SingleChoiceAnswerPayloadType,
  [QuestionType.multiple_choice]: MultipleChoiceAnswerPayloadType,
  [QuestionType.document]: DocumentAnswerPayloadType,
} satisfies Record<QuestionType, z.ZodType>;

export function validateAnswerPayloadForQuestionType({
  questionType,
  answerPayload,
}: {
  questionType: string;
  answerPayload: z.infer<typeof AnswerSelectSchema.shape.answerPayload>;
}) {
  const schema =
    answerPayloadSchemaByQuestionType[questionType as QuestionType];
  if (!schema) {
    throw new Error(
      `Unknown question type ${questionType}. This should never happen, please report it.`,
    );
  }

  return validateAnswerPayloadWithSchema({
    questionType,
    answerPayload,
    schema,
  });
}

function validateAnswerPayloadWithSchema({
  questionType,
  answerPayload,
  schema,
}: {
  questionType: string;
  answerPayload: z.infer<typeof AnswerSelectSchema.shape.answerPayload>;
  schema: z.ZodType;
}) {
  const result = schema.safeParse(answerPayload);
  if (!result.success) {
    throw new Error(
      `Answer payload does not match expected type for ${questionType} question. This should never happen.`,
    );
  }

  return result.data;
}
