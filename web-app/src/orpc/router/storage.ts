import { os } from "@orpc/server";
import z from "zod";
import {
  createPresignedStreamDownloadUrl,
  createPresignedUploadUrl,
} from "@/lib/s3";
import {
  CreatePresignedS3TestDownloadUrlInputSchema,
  PresignedS3TestDownloadSchema,
} from "@/orpc/schema";
import { debugMiddleware } from "../debug-middleware";

export const createPresignedS3WebmUploadUrl = os
  .use(debugMiddleware)
  .input(z.void())
  .output(
    z.object({
      uuid: z.uuidv7(),
      uploadUrl: z.url(),
    }),
  )
  .handler(async () => {
    try {
      return await createPresignedUploadUrl({
        prefix: `videos/uploads`,
        fileExtension: ".webm",
        mimeType: "video/webm",
      });
    } catch (error) {
      throw new Error(
        `Failed to generate presigned S3 upload URL: ${String(error)}`,
      );
    }
  });

// TODO for download of video use a cookie or something else than presigned urls for download
// TODO remove
export const createPresignedS3TestDownloadUrl = os
  .use(debugMiddleware)
  .input(CreatePresignedS3TestDownloadUrlInputSchema)
  .output(PresignedS3TestDownloadSchema)
  .handler(async ({ input }) => {
    try {
      return await createPresignedStreamDownloadUrl(input.objectKey);
    } catch (error) {
      throw new Error(
        `Failed to generate presigned S3 download URL for ${input.objectKey}: ${String(error)}`,
      );
    }
  });

export const createPresignedS3DocumentUploadUrl = os
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
    try {
      return await createPresignedUploadUrl({
        prefix: `documents/uploads`,
        fileExtension: "",
        mimeType: input.mimeType,
      });
    } catch (error) {
      throw new Error(
        `Failed to generate presigned S3 upload URL: ${String(error)}`,
      );
    }
  });
