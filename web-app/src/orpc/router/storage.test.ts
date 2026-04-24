import { createRouterClient } from "@orpc/server";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import router from "@/orpc/router";

const { selectMock, createPresignedDownloadUrlMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  createPresignedDownloadUrlMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock("@/lib/s3.server", () => ({
  completeMultipartUploadForVideo: vi.fn(),
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
  createPresignedUploadUrlForDocument: vi.fn(),
  createPresignedUploadUrlForVideoPart: vi.fn(),
  getObjectKeyForDocumentUuid: vi.fn((documentUuid: string) => documentUuid),
  initiateMultipartUploadForVideo: vi.fn(),
}));

vi.mock("@/lib/bullmq.server", () => ({
  enqueueVideoProcessingJob: vi.fn(),
  cancelVideoProcessingJob: vi.fn(),
}));

vi.mock("@/lib/auth.server", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

const client = createRouterClient(router, {
  context: () => ({
    headers: new Headers(),
  }),
});

describe("createPresignedS3DocumentDownloadUrlByUuid", () => {
  beforeEach(() => {
    selectMock.mockReset();
    createPresignedDownloadUrlMock.mockReset();
  });

  it("returns a download url when the document belongs to the interview", async () => {
    const interviewUuid = uuidv7();
    const documentUuid = uuidv7();

    mockDocumentAnswerCandidates([
      {
        answerPayload: {
          kind: "documents",
          documents: [
            {
              documentUuid,
              fileName: "resume.pdf",
              mimeType: "application/pdf",
            },
          ],
        },
        interviewIsFinished: false,
      },
    ]);
    createPresignedDownloadUrlMock.mockResolvedValueOnce({
      downloadUrl: "https://example.com/resume.pdf",
    });

    await expect(
      client.createPresignedS3DocumentDownloadUrlByUuid({
        interviewUuid,
        documentUuid,
      }),
    ).resolves.toEqual({
      downloadUrl: "https://example.com/resume.pdf",
    });
    expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith(documentUuid);
  });

  it("rejects when the document does not belong to the interview", async () => {
    const interviewUuid = uuidv7();
    const documentUuid = uuidv7();

    mockDocumentAnswerCandidates([
      {
        answerPayload: {
          kind: "documents",
          documents: [
            {
              documentUuid: uuidv7(),
              fileName: "resume.pdf",
              mimeType: "application/pdf",
            },
          ],
        },
        interviewIsFinished: false,
      },
    ]);

    await expect(
      client.createPresignedS3DocumentDownloadUrlByUuid({
        interviewUuid,
        documentUuid,
      }),
    ).rejects.toThrow("Forbidden");
    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it("rejects when the document belongs to a finished interview", async () => {
    const interviewUuid = uuidv7();
    const documentUuid = uuidv7();

    mockDocumentAnswerCandidates([
      {
        answerPayload: {
          kind: "documents",
          documents: [
            {
              documentUuid,
              fileName: "resume.pdf",
              mimeType: "application/pdf",
            },
          ],
        },
        interviewIsFinished: true,
      },
    ]);
    createPresignedDownloadUrlMock.mockResolvedValueOnce({
      downloadUrl: "https://example.com/resume.pdf",
    });

    await expect(
      client.createPresignedS3DocumentDownloadUrlByUuid({
        interviewUuid,
        documentUuid,
      }),
    ).rejects.toThrow("Forbidden");
    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });
});

function mockDocumentAnswerCandidates(
  answerCandidates: Array<{
    answerPayload: unknown;
    interviewIsFinished: boolean;
  }>,
) {
  selectMock.mockReturnValueOnce({
    from: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(answerCandidates),
      }),
    }),
  });
}
