import { getLogger } from "@orpc/experimental-pino";
import { and, eq } from "drizzle-orm/sql/expressions/conditions";
import z from "zod";
import { db } from "@/db";
import {
  DocumentAnswerPayloadType,
  QuestionType,
  VideoAnswerPayloadType,
} from "@/db/payload-types";
import { Answer, Question } from "@/db/schema";
import {
  enqueueVideoProcessingJob,
  cancelVideoProcessingJob as tryCancelVideoProcessingJob,
} from "@/lib/bullmq.server";
import {
  deleteObject,
  deleteObjectsForPrefix,
  getObjectKeyForDocumentUuid,
  getObjectKeyForProcessedVideoUuid,
  getObjectKeyForVideoUuid,
} from "@/lib/s3.server";
import { validateAnswerPayloadForQuestionType } from "@/lib/validate-answer-payload";
import { base } from "../base";
import { debugMiddleware } from "../middlewares";
import { AnswerSelectSchema } from "../schema";

export async function saveAnswerAndHandleVideoEffects(input: {
  interviewUuid: string;
  questionUuid: string;
  answerPayload: z.infer<typeof AnswerSelectSchema.shape.answerPayload>;
}) {
  let existingAnswerPayload = null;

  const { savedAnswer, answerPayload, questionType } = await db.transaction(
    async (tx) => {
      const question = await tx.query.Question.findFirst({
        where: eq(Question.uuid, input.questionUuid),
        columns: {
          questionType: true,
        },
      });
      if (!question) {
        throw new Error(`Question ${input.questionUuid} was not found.`);
      }

      const answerPayload = validateAnswerPayloadForQuestionType({
        questionType: question.questionType,
        answerPayload: input.answerPayload,
      });

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

      if (existingAnswer) {
        existingAnswerPayload = existingAnswer.answerPayload;

        const [updatedAnswer] = await tx
          .update(Answer)
          .set({
            answerPayload,
            answeredAt: new Date(),
          })
          .where(eq(Answer.uuid, existingAnswer.uuid))
          .returning();

        return {
          savedAnswer: updatedAnswer,
          answerPayload,
          questionType: question.questionType,
        };
      }

      const [insertedAnswer] = await tx
        .insert(Answer)
        .values({
          interviewUuid: input.interviewUuid,
          questionUuid: input.questionUuid,
          answerPayload,
          answeredAt: new Date(),
        })
        .returning();

      return {
        savedAnswer: insertedAnswer,
        answerPayload,
        questionType: question.questionType,
      };
    },
  );

  // If the answer payload is a video answer, add a processing job to the queue.
  if (questionType === QuestionType.video) {
    const videoAnswerPayload = answerPayload as z.infer<
      typeof VideoAnswerPayloadType
    >;
    await enqueueVideoProcessingJob(videoAnswerPayload.videoUuid);

    // If a previous video answer exists, delete the old video and processed video from object storage.
    if (existingAnswerPayload) {
      const existingVideoAnswerPayload = VideoAnswerPayloadType.parse(
        existingAnswerPayload,
      );

      if (
        existingVideoAnswerPayload.videoUuid !== videoAnswerPayload.videoUuid
      ) {
        await tryCancelVideoProcessingJob(existingVideoAnswerPayload.videoUuid);
      }

      if (existingVideoAnswerPayload.status === "uploaded") {
        void deleteObject(
          getObjectKeyForVideoUuid(existingVideoAnswerPayload.videoUuid),
        );
      }
      if (existingVideoAnswerPayload.status === "processed") {
        void deleteObjectsForPrefix(
          getObjectKeyForProcessedVideoUuid(
            existingVideoAnswerPayload.videoUuid,
          ),
        );
      }
    }
  }

  return savedAnswer;
}

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
  .handler(async ({ input }) => saveAnswerAndHandleVideoEffects(input));

export const deleteAnswer = base
  .use(debugMiddleware)
  .input(
    AnswerSelectSchema.pick({
      interviewUuid: true,
      questionUuid: true,
    }),
  )
  .output(z.null())
  .handler(async ({ input }) => {
    await db
      .delete(Answer)
      .where(
        and(
          eq(Answer.interviewUuid, input.interviewUuid),
          eq(Answer.questionUuid, input.questionUuid),
        ),
      );

    return null;
  });

export const addNewDocumentToAnswer = base
  .use(debugMiddleware)
  .input(
    AnswerSelectSchema.pick({
      interviewUuid: true,
      questionUuid: true,
    }).extend({
      document: DocumentAnswerPayloadType.options[0].shape.documents.element,
      isSingleFileUpload: z.boolean(),
    }),
  )
  .output(AnswerSelectSchema)
  .handler(async ({ input, context }) => {
    // Remember the uuid of the document to delete after the transaction has completed successfully.
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
              kind: "documents",
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

      // If there were previously no documents, just add the new document to the answer.
      if (existingAnswerPayload.kind === "no_documents") {
        const [updatedAnswer] = await tx
          .update(Answer)
          .set({
            answerPayload: {
              kind: "documents",
              documents: [input.document],
            },
            answeredAt: new Date(),
          })
          .where(eq(Answer.uuid, existingAnswer.uuid))
          .returning();

        return updatedAnswer;
      }

      // If there exists a document with the same name, it will be replaced. Otherwise the document will just be added.
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

      // If this is a single file upload, all existing documents will be replaced with the new one.
      if (input.isSingleFileUpload) {
        documentUuidToDelete =
          existingAnswerPayload.documents.at(0)?.documentUuid;
        existingDocumentsWithoutSameNameDocument.length = 0; // Clear the array, so only the new document will be in the answer.
      }

      const [updatedAnswer] = await tx
        .update(Answer)
        .set({
          answerPayload: {
            kind: "documents",
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
        DocumentAnswerPayloadType.options[0].shape.documents.element.shape
          .documentUuid,
    }),
  )
  .output(AnswerSelectSchema.nullable())
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
      if (existingAnswerPayload.kind === "no_documents") {
        throw new Error(
          `If a document should be deleted from an answer, the answer payload must contain uploaded documents.`,
        );
      }

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
            `This means a prior deletion has run for this document. This can happen normally for single file uploads. ` +
            `Document uuid: ${input.documentUuid}, interview uuid: ${input.interviewUuid}, question uuid: ${input.questionUuid}`,
        );
      }

      if (existingDocumentsWithoutSameUuidDocument.length === 0) {
        await tx.delete(Answer).where(eq(Answer.uuid, existingAnswer.uuid));
        return null;
      }

      const [updatedAnswer] = await tx
        .update(Answer)
        .set({
          answerPayload: {
            kind: "documents",
            documents: existingDocumentsWithoutSameUuidDocument,
          },
          answeredAt: new Date(),
        })
        .where(eq(Answer.uuid, existingAnswer.uuid))
        .returning();

      return updatedAnswer;
    });
  });
