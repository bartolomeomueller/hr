import z from "zod";

export const TextPayloadType = z.object({
  text: z.string(),
});
export const VideoPayloadType = z.object({
  videoUrl: z.string(),
});
export const SingleChoicePayloadType = z.object({
  options: z.array(z.string()),
});
export const MultipleChoiceQuestionPayloadType = z.object({
  text: z.string(),
  options: z.array(z.string()),
  minSelections: z.number().optional(),
  maxSelections: z.number().optional(),
});

export const QuestionPayloadType = z.xor([TextPayloadType, VideoPayloadType]);
export const AnswerPayloadType = z.xor([
  TextPayloadType,
  VideoPayloadType,
  SingleChoicePayloadType,
]);
