import z from "zod";

export const VideoQuestionPayloadType = z.object({
  question: z.string(),
  maxDurationSeconds: z.number(),
  maxOvertimeSeconds: z.number(), // This should never be 0, at least 10 seconds
});
// TODO make switch long text or short text question
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
export const DocumentQuestionPayloadType = z.object({
  prompt: z.string(),
  minUploads: z.number().min(0).max(1),
  maxUploads: z.number().min(1).max(20),
});

export const QuestionPayloadType = z.xor([
  VideoQuestionPayloadType,
  TextQuestionPayloadType,
  SingleChoiceQuestionPayloadType,
  MultipleChoiceQuestionPayloadType,
  DocumentQuestionPayloadType,
]);
export enum QuestionType {
  video = "video",
  text = "text",
  single_choice = "single_choice",
  multiple_choice = "multiple_choice",
  document = "document",
}

export const VideoAnswerPayloadType = z.object({
  videoUuid: z.uuidv7(),
  status: z.enum(["uploaded", "processed"]),
});
export const TextAnswerPayloadType = z.object({
  answer: z
    .string()
    .min(1, "Bitte gib eine Antwort an.")
    .max(5_000_000, "Die Antwort ist zu lang."),
});
export const SingleChoiceAnswerPayloadType = z.object({
  selectedOption: z.string(),
});
export const MultipleChoiceAnswerPayloadType = z.object({
  selectedOptions: z.array(z.string()),
});
export const DocumentAnswerPayloadType = z.discriminatedUnion("kind", [
  z.object({
    // user uploaded documents
    kind: z.literal("documents"),
    documents: z
      .array(
        z.object({
          documentUuid: z.uuidv7(),
          fileName: z.string(),
          mimeType: z.string(),
        }),
      )
      .min(1),
  }),
  z.object({
    // user chose to provide no documents
    kind: z.literal("no_documents"),
  }),
]);

export const AnswerPayloadType = z.xor([
  VideoAnswerPayloadType,
  TextAnswerPayloadType,
  SingleChoiceAnswerPayloadType,
  MultipleChoiceAnswerPayloadType,
  DocumentAnswerPayloadType,
]);
export enum AnswerType {
  video = "video",
  text = "text",
  single_choice = "single_choice",
  multiple_choice = "multiple_choice",
  document = "document",
}
