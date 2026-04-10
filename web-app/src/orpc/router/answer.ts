import { os } from "@orpc/server";
import { and, eq } from "drizzle-orm/sql/expressions/conditions";
import { db } from "@/db";
import {
  DocumentAnswerPayloadType,
  VideoAnswerPayloadType,
} from "@/db/payload-types";
import { Answer } from "@/db/schema";
import { videoProcessingQueue } from "@/lib/bullmq";
import { deleteObject, getObjectKeyForDocumentUuid } from "@/lib/s3";
import { debugMiddleware } from "../middlewares";
import { AnswerSelectSchema } from "../schema";

// NOTE maybe move to an upsert
// FIXME use transaction
export const saveAnswer = os
  .use(debugMiddleware)
  .input(
    AnswerSelectSchema.pick({
      interviewUuid: true,
      questionUuid: true,
      answerPayload: true,
    }),
  )
  .output(AnswerSelectSchema)
  .handler(async ({ input }) => {
    try {
      const [existingAnswer] = await db
        .select({
          uuid: Answer.uuid,
        })
        .from(Answer)
        .where(
          and(
            eq(Answer.interviewUuid, input.interviewUuid),
            eq(Answer.questionUuid, input.questionUuid),
          ),
        )
        .limit(1);

      // TODO move this to a correct place
      const videoAnswerPayloadResult = VideoAnswerPayloadType.safeParse(
        input.answerPayload,
      );
      if (videoAnswerPayloadResult.success) {
        await videoProcessingQueue.add("video-processing", {
          uuid: videoAnswerPayloadResult.data.videoUuid,
        });
      }

      if (existingAnswer) {
        const [updatedAnswer] = await db
          .update(Answer)
          .set({
            answerPayload: input.answerPayload,
            answeredAt: new Date(),
          })
          .where(eq(Answer.uuid, existingAnswer.uuid))
          .returning();

        return updatedAnswer;
      }

      const [insertedAnswer] = await db
        .insert(Answer)
        .values({
          interviewUuid: input.interviewUuid,
          questionUuid: input.questionUuid,
          answerPayload: input.answerPayload,
          answeredAt: new Date(),
        })
        .returning();

      return insertedAnswer;
    } catch (error) {
      throw new Error(
        `Failed to save interview step for interview ${input.interviewUuid}}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  });

export const addNewDocumentToAnswer = os
  .use(debugMiddleware)
  .input(
    AnswerSelectSchema.pick({
      interviewUuid: true,
      questionUuid: true,
    }).extend({
      document: DocumentAnswerPayloadType.shape.documents.element,
    }),
  )
  .output(AnswerSelectSchema)
  .handler(async ({ input }) => {
    // FIXME in all transactions tx has to be used
    return db.transaction(async (tx) => {
      const [existingAnswer] = await tx
        .select()
        .from(Answer)
        .where(
          and(
            eq(Answer.interviewUuid, input.interviewUuid),
            eq(Answer.questionUuid, input.questionUuid),
          ),
        )
        .limit(1);

      if (!existingAnswer) {
        const [insertedAnswer] = await tx
          .insert(Answer)
          .values({
            interviewUuid: input.interviewUuid,
            questionUuid: input.questionUuid,
            answerPayload: {
              documents: [input.document],
            },
            answeredAt: new Date(),
          })
          .returning();

        return insertedAnswer;
      }

      const existingAnswerPayloadResult = DocumentAnswerPayloadType.safeParse(
        existingAnswer.answerPayload,
      );
      if (!existingAnswerPayloadResult.success) {
        throw new Error(
          `Existing answer payload is not of type DocumentAnswerPayloadType for interview ${input.interviewUuid} and question ${input.questionUuid}`,
        );
      }

      const [existingDocumentWithSameName] =
        existingAnswerPayloadResult.data.documents.filter(
          (document) => document.fileName === input.document.fileName,
        );
      const existingDocumentsWithoutSameNameDocument =
        existingAnswerPayloadResult.data.documents.filter(
          (document) =>
            document.documentUuid !==
            existingDocumentWithSameName?.documentUuid,
        );
      if (existingDocumentWithSameName) {
        await deleteObject(
          getObjectKeyForDocumentUuid(
            existingDocumentWithSameName.documentUuid,
          ),
        );
      }

      const [updatedAnswer] = await tx
        .update(Answer)
        .set({
          answerPayload: {
            documents: [
              ...existingDocumentsWithoutSameNameDocument,
              input.document,
            ],
          },
          answeredAt: new Date(),
        })
        .where(eq(Answer.uuid, existingAnswer.uuid))
        .returning();

      return updatedAnswer;
    });
  });

export const deleteDocumentFromObjectStorageAndFromAnswer = os
  .use(debugMiddleware)
  .input(
    AnswerSelectSchema.pick({
      interviewUuid: true,
      questionUuid: true,
    }).extend({
      documentUuid:
        DocumentAnswerPayloadType.shape.documents.element.shape.documentUuid,
    }),
  )
  .output(AnswerSelectSchema)
  .handler(async ({ input }) => {
    await deleteObject(getObjectKeyForDocumentUuid(input.documentUuid));
    return db.transaction(async (tx) => {
      const [existingAnswer] = await tx
        .select()
        .from(Answer)
        .where(
          and(
            eq(Answer.interviewUuid, input.interviewUuid),
            eq(Answer.questionUuid, input.questionUuid),
          ),
        )
        .limit(1);

      if (!existingAnswer) {
        throw new Error(
          `If a document should be deleted, an answer owning it must exist already.`,
        );
      }
      const existingAnswerPayloadResult = DocumentAnswerPayloadType.safeParse(
        existingAnswer.answerPayload,
      );
      if (!existingAnswerPayloadResult.success) {
        throw new Error(
          `Existing answer payload is not of type DocumentAnswerPayloadType for interview ${input.interviewUuid} and question ${input.questionUuid}`,
        );
      }

      const [existingDocumentWithSameUuid] =
        existingAnswerPayloadResult.data.documents.filter(
          (document) => document.documentUuid === input.documentUuid,
        );
      const existingDocumentsWithoutSameUuidDocument =
        existingAnswerPayloadResult.data.documents.filter(
          (document) => document.documentUuid !== input.documentUuid,
        );
      if (!existingDocumentWithSameUuid) {
        console.trace(
          `If a document should be deleted from an answer, it should exist in the answer payload. ` +
            `This means a prior deletion has run for this document. Fix this. ` +
            `Document uuid: ${input.documentUuid}, interview uuid: ${input.interviewUuid}, question uuid: ${input.questionUuid}`,
        );
      }

      const [updatedAnswer] = await tx
        .update(Answer)
        .set({
          answerPayload: {
            documents: existingDocumentsWithoutSameUuidDocument,
          },
          answeredAt: new Date(),
        })
        .where(eq(Answer.uuid, existingAnswer.uuid))
        .returning();

      return updatedAnswer;
    });
  });
