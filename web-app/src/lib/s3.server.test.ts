import { describe, expect, it } from "vitest";
import { createPresignedUploadUrlForDocument } from "@/lib/s3.server";

describe("createPresignedUploadUrlForDocument", () => {
  it("rejects non-pdf mime types", async () => {
    await expect(
      createPresignedUploadUrlForDocument({
        mimeType: "text/plain",
      }),
    ).rejects.toThrow();
  });
});
