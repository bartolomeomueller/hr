import z from "zod";
import {
  createPresignedDownloadUrl,
  createPresignedUploadUrlForDocument,
  createPresignedUploadUrlForVideo,
  getObjectKeyForDocumentUuid,
} from "@/lib/s3";
import { base } from "../base";
import { debugMiddleware } from "../middlewares";

export const createPresignedS3WebmUploadUrl = base
  .use(debugMiddleware)
  .input(z.void())
  .output(
    z.object({
      uuid: z.uuidv7(),
      uploadUrl: z.url(),
    }),
  )
  .handler(async () => {
    return await createPresignedUploadUrlForVideo({
      mimeType: "video/webm",
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
