import type { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import { createPresignedUploadUrlForDocument } from "@/lib/s3.server";

describe("createPresignedUploadUrlForDocument", () => {
  it("rejects non-pdf mime types", async () => {
    await expect(
      createPresignedUploadUrlForDocument(
        {
          mimeType: "text/plain",
        },
        {
          config: {
            credentials: {
              accessKeyId: "test-access-key",
              secretAccessKey: "test-secret-key",
            },
            bucketName: "test-bucket",
            endpoint: "http://127.0.0.1:8333",
            region: "us-east-1",
          },
          client: {
            send: vi.fn(),
          } as unknown as S3Client,
          getSignedUrl: vi.fn(),
          paginateListObjectsV2: vi.fn(),
        },
      ),
    ).rejects.toThrow();
  });
});
