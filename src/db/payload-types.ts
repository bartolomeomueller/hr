import z from "zod";

export const TextPayloadType = z.object({
  text: z.string(),
});
export const VideoPayloadType = z.object({
  videoUrl: z.string(),
});
export const ScalePayloadType = z.object({
  min: z.number(),
  max: z.number(),
  step: z.number().optional(),
});
export const SingleChoicePayloadType = z.object({
  options: z.array(z.string()),
});
export const MultipleChoicePayloadType = z.object({
  options: z.array(z.string()),
  minSelections: z.number().optional(),
  maxSelections: z.number().optional(),
});

export const QuestionPayloadType = z.xor([TextPayloadType, VideoPayloadType]);
export const AnswerPayloadType = z.xor([
  TextPayloadType,
  VideoPayloadType,
  ScalePayloadType,
  SingleChoicePayloadType,
  MultipleChoicePayloadType,
]);
