import z from "zod";

export const VideoQuestionPayloadType = z.object({
  question: z.string(),
});
export const TextQuestionPayloadType = z.object({
  question: z.string(),
});
export const SingleChoiceQuestionPayloadType = z.object({
  question: z.string(),
  options: z.array(z.string()),
});
export const MultipleChoiceQuestionPayloadType = z.object({
  question: z.string(),
  options: z.array(z.string()),
  minSelections: z.number().optional(),
  maxSelections: z.number().optional(),
});

export const QuestionPayloadType = z.xor([
  VideoQuestionPayloadType,
  TextQuestionPayloadType,
  SingleChoiceQuestionPayloadType,
  MultipleChoiceQuestionPayloadType,
]);

export const VideoAnswerPayloadType = z.object({
  videoUuid: z.string(),
});
export const TextAnswerPayloadType = z.object({
  answer: z.string(),
});
export const SingleChoiceAnswerPayloadType = z.object({
  selectedOption: z.string(),
});
export const MultipleChoiceAnswerPayloadType = z.object({
  selectedOptions: z.array(z.string()),
});

export const AnswerPayloadType = z.xor([
  VideoAnswerPayloadType,
  TextAnswerPayloadType,
  SingleChoiceAnswerPayloadType,
  MultipleChoiceAnswerPayloadType,
]);
