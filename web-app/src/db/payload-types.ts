import z from "zod";

export const VideoQuestionPayloadType = z.object({
  question: z.string(),
  maxDurationSeconds: z.number(),
  maxOvertimeSeconds: z.number(), // This should never be 0, at least 10 seconds
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
  minSelections: z.number().optional(), // TODO think about whether to make them required
  maxSelections: z.number().optional(),
});

export const QuestionPayloadType = z.xor([
  VideoQuestionPayloadType,
  TextQuestionPayloadType,
  SingleChoiceQuestionPayloadType,
  MultipleChoiceQuestionPayloadType,
]);
export enum QuestionType {
  video = "video",
  text = "text",
  single_choice = "single_choice",
  multiple_choice = "multiple_choice",
}

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
export enum AnswerType {
  video = "video",
  text = "text",
  single_choice = "single_choice",
  multiple_choice = "multiple_choice",
}
