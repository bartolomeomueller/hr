import z from "zod";
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
  // .output()
  .handler(async ({ input }) => {
    await completeMultipartUploadForVideo({
      uploadId: input.uploadId,
      videoUuid: input.videoUuid,
      parts: input.parts,
    });
  });

// TODO for download of video use a cookie or something else than presigned urls for download
export const createPresignedS3DocumentDownloadUrlByUuid = base
  .use(debugMiddleware)
  .input(z.object({ documentUuid: z.uuidv7() }))
  .output(z.object({ downloadUrl: z.url() }))
  .handler(async ({ input }) => {
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
