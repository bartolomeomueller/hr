import { getLogger } from "@orpc/experimental-pino";
import { and, eq } from "drizzle-orm/sql/expressions/conditions";
import { db } from "@/db";
import {
  DocumentAnswerPayloadType,
  VideoAnswerPayloadType,
} from "@/db/payload-types";
import { Answer } from "@/db/schema";
import { videoProcessingQueue } from "@/lib/bullmq";
import { deleteObject, getObjectKeyForDocumentUuid } from "@/lib/s3";
import { base } from "../base";
import { debugMiddleware } from "../middlewares";
import { AnswerSelectSchema } from "../schema";

// NOTE maybe move to an upsert
export const saveAnswer = base
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
    const videoAnswerPayloadResult = VideoAnswerPayloadType.safeParse(
      input.answerPayload,
    );

    const savedAnswer = await db.transaction(async (tx) => {
      const [existingAnswer] = await tx
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

      if (existingAnswer) {
        const [updatedAnswer] = await tx
          .update(Answer)
          .set({
            answerPayload: input.answerPayload,
            answeredAt: new Date(),
          })
          .where(eq(Answer.uuid, existingAnswer.uuid))
          .returning();

        return updatedAnswer;
      }

      const [insertedAnswer] = await tx
        .insert(Answer)
        .values({
          interviewUuid: input.interviewUuid,
          questionUuid: input.questionUuid,
          answerPayload: input.answerPayload,
          answeredAt: new Date(),
        })
        .returning();

      return insertedAnswer;
    });

    // TODO move this to a correct place and handle deleting old video -> maybe dedicated handler for video
    if (videoAnswerPayloadResult.success) {
      await videoProcessingQueue.add("video-processing", {
        uuid: videoAnswerPayloadResult.data.videoUuid,
      });
    }

    return savedAnswer;
  });

export const addNewDocumentToAnswer = base
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
  .handler(async ({ input, context }) => {
    let documentUuidToDelete = null;

    const answer = await db.transaction(async (tx) => {
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

      const existingAnswerPayload = DocumentAnswerPayloadType.parse(
        existingAnswer.answerPayload,
      );

      const existingDocumentWithSameName = existingAnswerPayload.documents.find(
        (document) => document.fileName === input.document.fileName,
      );
      const existingDocumentsWithoutSameNameDocument =
        existingAnswerPayload.documents.filter(
          (document) =>
            document.documentUuid !==
            existingDocumentWithSameName?.documentUuid,
        );

      if (existingDocumentWithSameName) {
        documentUuidToDelete = existingDocumentWithSameName.documentUuid;
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

    // If the document deletion fails, it should not block the answer update.
    if (documentUuidToDelete) {
      const logger = getLogger(context);
      await deleteObject(
        getObjectKeyForDocumentUuid(documentUuidToDelete),
      ).catch((error: unknown) => {
        logger?.error(
          error,
          "Failed to delete replaced document from object storage",
        );
      });
    }

    return answer;
  });

export const deleteDocumentFromObjectStorageAndFromAnswer = base
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
  .handler(async ({ input, context }) => {
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
      const existingAnswerPayload = DocumentAnswerPayloadType.parse(
        existingAnswer.answerPayload,
      );

      const existingDocumentWithSameUuid = existingAnswerPayload.documents.find(
        (document) => document.documentUuid === input.documentUuid,
      );
      const existingDocumentsWithoutSameUuidDocument =
        existingAnswerPayload.documents.filter(
          (document) => document.documentUuid !== input.documentUuid,
        );
      if (!existingDocumentWithSameUuid) {
        const logger = getLogger(context);
        logger?.warn(
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
