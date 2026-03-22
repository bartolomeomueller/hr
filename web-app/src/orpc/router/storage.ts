import { os } from "@orpc/server";
import { v7 as uuidv7 } from "uuid";
import {
  createPresignedStreamDownloadUrl,
  createPresignedStreamUploadUrl,
} from "@/lib/s3";
import {
  CreatePresignedS3TestDownloadUrlInputSchema,
  CreatePresignedS3TestUploadUrlInputSchema,
  PresignedS3TestDownloadSchema,
  PresignedS3TestUploadSchema,
} from "@/orpc/schema";
import { debugMiddleware } from "../debug-middleware";

export const createPresignedS3TestUploadUrl = os
  .use(debugMiddleware)
  .input(CreatePresignedS3TestUploadUrlInputSchema)
  .output(PresignedS3TestUploadSchema)
  .handler(async () => {
    try {
      return await createPresignedStreamUploadUrl(
        `videos/uploads/${uuidv7()}.svg`,
        "image/svg+xml",
      );
    } catch (error) {
      throw new Error(
        `Failed to generate presigned S3 upload URL: ${String(error)}`,
      );
    }
  });

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
