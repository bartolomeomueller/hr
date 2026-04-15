import type { QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import type z from "zod";
import { getQueryClient } from "@/lib/query-client";
import { isPreSignedURLStillValid } from "@/lib/utils";
import { client } from "@/orpc/client";
import type { AnswerSelectSchema } from "@/orpc/schema";
import { useDocumentUploadStore } from "@/stores/documentUploadStore";

const defaultDocumentUploadServiceDependencies = {
  client,
  getQueryClient,
  isPreSignedURLStillValid,
  toast,
  uploadStore: useDocumentUploadStore,
  createXmlHttpRequest: () => new XMLHttpRequest(),
};

export class DocumentUploadService {
  uploadPipeline: Promise<void> = Promise.resolve();

  constructor(
    private readonly dependencies: typeof defaultDocumentUploadServiceDependencies = defaultDocumentUploadServiceDependencies,
  ) {}

  async addToUploadPipeline({
    file,
    interviewUuid,
    questionUuid,
    queryKeyToInvalidateAnswers,
    isSingleFileUpload,
  }: {
    file: File;
    interviewUuid: string;
    questionUuid: string;
    queryKeyToInvalidateAnswers: QueryKey;
    isSingleFileUpload: boolean;
  }) {
    const abortController = new AbortController();

    // Already fetch a pre-signed url, so the upload can start immediately, when the pipeline gets to the upload step.
    const preSignedUrlPromise =
      this.dependencies.client.createPresignedS3DocumentUploadUrl({
        mimeType: file.type,
      });

    const localUuid = this.dependencies.uploadStore
      .getState()
      .addDocumentToUpload({
        questionUuid,
        file,
        abortController,
      });

    this.uploadPipeline = this.uploadPipeline.then(async () => {
      try {
        await this.uploadDocument({
          file,
          localUuid,
          interviewUuid,
          questionUuid,
          queryKeyToInvalidateAnswers,
          signal: abortController.signal,
          preSignedUrlPromise,
          isSingleFileUpload,
        });
      } catch (error) {
        this.dependencies.toast.error(
          "Das Hochladen des Dokuments ist fehlgeschlagen. Bitte versuche es erneut.",
        );
        console.error(error);
        return this.removeUpload({ localUuid });
      }
    });
  }

  // TODO somewhere best ui near check file.size to be under 5GiB

  private async uploadDocument({
    file,
    localUuid,
    interviewUuid,
    questionUuid,
    queryKeyToInvalidateAnswers,
    signal,
    preSignedUrlPromise,
    isSingleFileUpload,
  }: {
    file: File;
    localUuid: string;
    interviewUuid: string;
    questionUuid: string;
    queryKeyToInvalidateAnswers: QueryKey;
    signal: AbortSignal;
    preSignedUrlPromise: Promise<{ uuid: string; uploadUrl: string }>;
    isSingleFileUpload: boolean;
  }) {
    if (signal.aborted) {
      return this.removeUpload({ localUuid });
    }

    // Check if the pre-signed URL is still valid. If not, get a new one.
    // Url contains the information below as search params
    // X-Amz-Date=20260326T193627Z&X-Amz-Expires=300
    let { uploadUrl, uuid } = await preSignedUrlPromise;
    if (signal.aborted) {
      return this.removeUpload({ localUuid });
    }

    if (!isPreSignedURLStillValid(uploadUrl)) {
      // If the current time is past the expiration time minus a buffer (e.g., 1 minute), we consider the URL expired and get a new one.
      ({ uploadUrl, uuid } =
        await this.dependencies.client.createPresignedS3DocumentUploadUrl({
          mimeType: file.type,
        }));
    }

    const uploadWasAborted = await new Promise<boolean>((resolve, reject) => {
      const xhr = this.dependencies.createXmlHttpRequest();
      const abortUpload = () => {
        xhr.abort();
      };

      signal.addEventListener("abort", abortUpload, { once: true });

      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          this.dependencies.uploadStore
            .getState()
            .updateDocumentProgress(localUuid, progress);
          console.log(
            `Upload progress for file index ${localUuid}: ${progress}%`,
          );
        }
      };

      xhr.onload = () => {
        signal.removeEventListener("abort", abortUpload);
        if (xhr.status !== 200) {
          reject(
            new Error(
              `Upload failed for file index ${localUuid} with status ${xhr.status}`,
            ),
          );
          return;
        }
        console.log(`Upload successful for file index ${localUuid}`);
        resolve(false);
      };
      xhr.onerror = () => {
        signal.removeEventListener("abort", abortUpload);
        reject(
          new Error(`Network error during upload of file index ${localUuid}`),
        );
      };
      xhr.onabort = () => {
        signal.removeEventListener("abort", abortUpload);
        resolve(true);
      };

      if (signal.aborted) {
        signal.removeEventListener("abort", abortUpload);
        resolve(true);
        return;
      }

      xhr.send(file);
    });

    if (uploadWasAborted || signal.aborted) {
      return this.removeUpload({ localUuid });
    }

    // Fire and forget the syncing to the ui, so the next upload can begin.
    void (async () => {
      let updatedAnswer: z.infer<typeof AnswerSelectSchema> | null = null;
      try {
        updatedAnswer = await this.dependencies.client.addNewDocumentToAnswer({
          interviewUuid,
          questionUuid,
          document: {
            documentUuid: uuid,
            fileName: file.name,
            mimeType: file.type,
          },
          isSingleFileUpload,
        });
      } catch (error) {
        this.dependencies.toast.error(
          "Das Hochladen des Dokuments ist fehlgeschlagen. Bitte versuche es erneut.",
        );
        console.error("Error adding document to answer:", error);
      }

      this.dependencies.uploadStore
        .getState()
        .removeDocumentFromUpload(localUuid);
      if (updatedAnswer) {
        this.dependencies
          .getQueryClient()
          .setQueryData<
            Awaited<
              ReturnType<
                typeof this.dependencies.client.getInterviewRelatedDataByInterviewUuid
              >
            >
          >(queryKeyToInvalidateAnswers, (old) => {
            if (!old) return old;
            return {
              ...old,
              answers: old.answers.map((answer) =>
                answer.questionUuid === questionUuid ? updatedAnswer : answer,
              ),
            };
          });
      }
      await this.dependencies.getQueryClient().invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      });
    })();
  }

  private removeUpload({ localUuid }: { localUuid: string }) {
    this.dependencies.uploadStore
      .getState()
      .removeDocumentFromUpload(localUuid);
  }
}

export const documentUploadService = new DocumentUploadService();
