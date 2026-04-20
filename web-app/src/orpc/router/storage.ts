import { eq } from "drizzle-orm";
import z from "zod";
import { db } from "@/db";
import { DocumentAnswerPayloadType } from "@/db/payload-types";
import { Answer } from "@/db/schema";
import {
  completeMultipartUploadForVideo,
  createPresignedDownloadUrl,
  createPresignedUploadUrlForDocument,
  createPresignedUploadUrlForVideoPart,
  getObjectKeyForDocumentUuid,
  initiateMultipartUploadForVideo,
} from "@/lib/s3.server";
import { base } from "../base";
import { debugMiddleware } from "../middlewares";
import { AnswerSelectSchema } from "../schema";
import { saveAnswerAndHandleVideoEffects } from "./answer";

// Uploading endpoints are not further protected, as they have to stay public anyway.
// Adding protection would just create noise and for no real security benefit.

export const createPresignedS3RecordingMultipartUploadUrl = base
  .use(debugMiddleware)
  .input(
    z.discriminatedUnion("multipartUploadMode", [
      z.object({
        multipartUploadMode: z.literal("new"),
        mimeType: z.string(),
        partNumber: z.literal(1),
      }),
      z.object({
        multipartUploadMode: z.literal("existing"),
        mimeType: z.string(),
        partNumber: z.number().min(1),
        uploadId: z.string(),
        videoUuid: z.uuidv7(),
      }),
    ]),
  )
  .output(
    z.object({
      videoUuid: z.uuidv7(),
      uploadId: z.string(),
      uploadUrl: z.url(),
    }),
  )
  .handler(async ({ input }) => {
    let uploadId: string;
    let videoUuid: string;

    if (input.multipartUploadMode === "new") {
      const result = await initiateMultipartUploadForVideo({
        mimeType: input.mimeType,
      });
      uploadId = result.uploadId;
      videoUuid = result.uuid;
    } else {
      uploadId = input.uploadId;
      videoUuid = input.videoUuid;
    }

    const uploadUrl = await createPresignedUploadUrlForVideoPart({
      partNumber: input.partNumber,
      uploadId,
      videoUuid,
    });

    return {
      videoUuid,
      uploadId,
      uploadUrl,
    };
  });

export const finishMultipartUploadForRecording = base
  .use(debugMiddleware)
  .input(
    z.object({
      interviewUuid: z.uuidv7(),
      questionUuid: z.uuidv7(),
      videoUuid: z.uuidv7(),
      uploadId: z.string(),
      parts: z.array(
        z.object({
          ETag: z.string(),
          PartNumber: z.number().min(1),
        }),
      ),
    }),
  )
  .output(AnswerSelectSchema)
  .handler(async ({ input }) => {
    await completeMultipartUploadForVideo({
      uploadId: input.uploadId,
      videoUuid: input.videoUuid,
      parts: input.parts,
    });

    // This promise will be awaited by orpc
    return saveAnswerAndHandleVideoEffects({
      interviewUuid: input.interviewUuid,
      questionUuid: input.questionUuid,
      answerPayload: {
        videoUuid: input.videoUuid,
        status: "uploaded",
      },
    });
  });

// TODO for download of video use a cookie or something else than presigned urls for download

export const createPresignedS3DocumentDownloadUrlByUuid = base
  .use(debugMiddleware)
  .input(
    z.object({
      interviewUuid: z.uuidv7(),
      documentUuid: z.uuidv7(),
    }),
  )
  .output(z.object({ downloadUrl: z.url() }))
  .handler(async ({ input }) => {
    await assertDocumentBelongsToInterview({
      interviewUuid: input.interviewUuid,
      documentUuid: input.documentUuid,
    });

    return await createPresignedDownloadUrl(
      getObjectKeyForDocumentUuid(input.documentUuid),
    );
  });

export const createPresignedS3DocumentUploadUrl = base
  .use(debugMiddleware)
  .input(
    z.object({
      mimeType: z.string(),
    }),
  )
  .output(
    z.object({
      uuid: z.uuidv7(),
      uploadUrl: z.url(),
    }),
  )
  .handler(async ({ input }) => {
    return await createPresignedUploadUrlForDocument({
      mimeType: input.mimeType,
    });
  });

async function assertDocumentBelongsToInterview({
  interviewUuid,
  documentUuid,
}: {
  interviewUuid: string;
  documentUuid: string;
}) {
  const answerCandidates = await db
    .select({
      answerPayload: Answer.answerPayload,
    })
    .from(Answer)
    .where(eq(Answer.interviewUuid, interviewUuid));

  for (const answerCandidate of answerCandidates) {
    const parseResult = DocumentAnswerPayloadType.safeParse(
      answerCandidate.answerPayload,
    );
    if (!parseResult.success || parseResult.data.kind !== "documents") {
      continue;
    }

    const matchingDocument = parseResult.data.documents.find(
      (document) => document.documentUuid === documentUuid,
    );
    if (matchingDocument) {
      return;
    }
  }

  throw new Error(
    `Document ${documentUuid} does not belong to interview ${interviewUuid}.`,
  );
}
