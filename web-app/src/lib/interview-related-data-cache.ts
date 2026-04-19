import type z from "zod";
import type { client } from "@/orpc/client";
import type { AnswerSelectSchema } from "@/orpc/schema";

export type InterviewRelatedDataQueryData = Awaited<
  ReturnType<typeof client.getInterviewRelatedDataByInterviewUuid>
>;

export function createOptimisticAnswer({
  interviewUuid,
  questionUuid,
  answerPayload,
  previousAnswer,
}: {
  interviewUuid: string;
  questionUuid: string;
  answerPayload: z.infer<typeof AnswerSelectSchema.shape.answerPayload>;
  previousAnswer?: z.infer<typeof AnswerSelectSchema>;
}): z.infer<typeof AnswerSelectSchema> {
  return {
    uuid:
      previousAnswer?.uuid ??
      globalThis.crypto?.randomUUID?.() ??
      `optimistic-answer-${questionUuid}`,
    interviewUuid,
    questionUuid,
    answerPayload,
    answeredAt: previousAnswer?.answeredAt ?? new Date(),
  };
}

export function findAnswerInInterviewRelatedDataCache<
  T extends
    | {
        answers: Array<z.infer<typeof AnswerSelectSchema>>;
      }
    | null
    | undefined,
>(
  oldData: T,
  questionUuid: string,
): z.infer<typeof AnswerSelectSchema> | undefined {
  if (!oldData) {
    return undefined;
  }

  return oldData.answers.find((answer) => answer.questionUuid === questionUuid);
}

export function upsertAnswerInInterviewRelatedDataCache<
  T extends
    | {
        answers: Array<z.infer<typeof AnswerSelectSchema>>;
      }
    | null
    | undefined,
>(oldData: T, updatedAnswer: z.infer<typeof AnswerSelectSchema>): T {
  if (!oldData) {
    return oldData;
  }

  const existingAnswerIndex = oldData.answers.findIndex(
    (answer) => answer.questionUuid === updatedAnswer.questionUuid,
  );
  const answers =
    existingAnswerIndex === -1
      ? [...oldData.answers, updatedAnswer]
      : oldData.answers.map((answer) =>
          answer.questionUuid === updatedAnswer.questionUuid
            ? updatedAnswer
            : answer,
        );

  return {
    ...oldData,
    answers,
  } as T;
}

export function removeAnswerFromInterviewRelatedDataCache<
  T extends
    | {
        answers: Array<z.infer<typeof AnswerSelectSchema>>;
      }
    | null
    | undefined,
>(oldData: T, questionUuid: string): T {
  if (!oldData) {
    return oldData;
  }

  return {
    ...oldData,
    answers: oldData.answers.filter(
      (answer) => answer.questionUuid !== questionUuid,
    ),
  } as T;
}
