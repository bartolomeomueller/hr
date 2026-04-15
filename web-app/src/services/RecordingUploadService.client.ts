import type { QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import type z from "zod";
import { getQueryClient } from "@/lib/query-client";
import { isPreSignedURLStillValid } from "@/lib/utils";
import { client } from "@/orpc/client";
import type { AnswerSelectSchema } from "@/orpc/schema";
import {
  useRecordingUploadStore,
  useUploadedRecordingPartsStore,
} from "@/stores/recordingUploadStore";

const defaultRecordingUploadServiceDependencies = {
  client,
  getQueryClient,
  isPreSignedURLStillValid,
  toast,
  recordingUploadStore: useRecordingUploadStore,
  uploadedRecordingPartsStore: useUploadedRecordingPartsStore,
  createXmlHttpRequest: () => new XMLHttpRequest(),
  indexedDb: indexedDB,
};

// So the options are:
// 1) Streaming upload with fetch:
//   - No firefox support till end of year.
//   - Needs own service in between, as s3 does not support streaming upload.
//   - No progress tracking with fetch, until in a few years.
// 2) Streaming upload with TUS:
//   - Needs own service in between, as s3 does not support streaming upload.
//   - Extra dependency and complexity.
// 3) Multipart upload:
//   - 5MiB parts minimum: 5MiB parts would take 5000/(50/8)=0.8 seconds to upload on a 50Mbps upload connection.

// TODO maybe implement if available then: tracking upload progress for fetch https://jakearchibald.com/2025/fetch-streams-not-for-progress/ -> otherwise have to use XMLHttpRequest

// FIXME write tests for this service, it is too complicated

// This service is the only part allowed to write to the recording upload store, otherwise it would be too hard to manage the state.
// This service needs the state to live outside of its own instance, so that the ui may access and react to it.
// This service should be a singleton and only one upload at a time should be running to maximize throughput.
// This service should be resilient to page reloads, so the upload can continue even if the user accidentally reloads the page in the middle of an upload.

// This service combines data sources for its working. It uses indexedDB to store the recordings parts,
// and uses a two persisted zustand stores to manage the state of the uploads and keep track of upload data, like the uploaded parts and uploadId.

export class RecordingUploadService {
  dbPromise: Promise<IDBDatabase> | null = null;
  uploadPipeline: Promise<void> = Promise.resolve();

  static readonly DB_NAME = "UploadDatabase";
  static readonly STORE_NAME = "recordings";

  constructor(
    private readonly dependencies: typeof defaultRecordingUploadServiceDependencies = defaultRecordingUploadServiceDependencies,
  ) {
    this.dbPromise = this.getDB();
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = this.dependencies.indexedDb.open(
        RecordingUploadService.DB_NAME,
        1,
      );
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(RecordingUploadService.STORE_NAME)) {
          db.createObjectStore(RecordingUploadService.STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
      };
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        resolve(db);
      };
      request.onerror = (event) => {
        this.dbPromise = null; // reset the promise so we can try again in the next call
        this.dependencies.indexedDb.deleteDatabase(
          RecordingUploadService.DB_NAME,
        ); // clean up any potentially corrupted database
        // const dbs = await indexedDB.databases(); // Get all databases for this domain
        reject(
          new Error(
            `IndexedDB error: ${(event.target as IDBOpenDBRequest).error}`,
          ),
        );
      };
    });
    return this.dbPromise;
  }

  private async storeFileInIndexedDB({
    file,
  }: {
    file: File;
  }): Promise<number> {
    const db = await this.getDB();
    return new Promise<number>((resolve, reject) => {
      const transaction = db.transaction(
        RecordingUploadService.STORE_NAME,
        "readwrite",
      );
      const store = transaction.objectStore(RecordingUploadService.STORE_NAME);
      const request = store.add({ file });

      let id = -1;
      request.onsuccess = () => {
        id = request.result as number;
      };

      transaction.oncomplete = () => resolve(id);
      transaction.onerror = (event) =>
        reject(
          new Error(
            `Failed to store file: ${(event.target as IDBTransaction).error}`,
          ),
        );
    });
  }

  private async getFileFromIndexedDB(fileIndex: number): Promise<File> {
    const db = await this.getDB();
    return new Promise<File>((resolve, reject) => {
      const transaction = db.transaction(
        RecordingUploadService.STORE_NAME,
        "readonly",
      );
      const store = transaction.objectStore(RecordingUploadService.STORE_NAME);
      const request = store.get(fileIndex);

      // Only request matters, as we only need the file
      request.onsuccess = () => {
        const result = request.result;
        if (result?.file) {
          resolve(result.file as File);
        } else {
          reject(new Error(`No file found with index ${fileIndex}`));
        }
      };
      request.onerror = (event) =>
        reject(
          new Error(
            `Failed to retrieve file: ${(event.target as IDBRequest).error}`,
          ),
        );
    });
  }

  private async deleteFileFromIndexedDB(fileIndex: number): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(
        RecordingUploadService.STORE_NAME,
        "readwrite",
      );
      const store = transaction.objectStore(RecordingUploadService.STORE_NAME);
      store.delete(fileIndex);

      transaction.oncomplete = () => resolve();
      transaction.onerror = (event) =>
        reject(
          new Error(
            `Failed to delete file: ${(event.target as IDBTransaction).error}`,
          ),
        );
    });
  }

  // Do not await this function, as it may busy wait.
  async addToUploadPipeline({
    file,
    interviewUuid,
    questionUuid,
    queryKeyToInvalidateAnswers,
    partNumber,
    isLastPart,
  }: {
    file: File;
    interviewUuid: string;
    questionUuid: string;
    queryKeyToInvalidateAnswers: QueryKey;
    partNumber: number;
    isLastPart: boolean;
  }) {
    const abortController = new AbortController();

    const fileIndex = await this.storeFileInIndexedDB({ file });

    // This busy waits for the uploadId and videoUuid to be available in the store, which are set after getting the first pre-signed url for a video.
    // Ideally this busy waiting never happens, but it can happen if the server is slow and the recording
    let uploadId: string | undefined;
    let videoUuid: string | undefined;
    if (partNumber !== 1) {
      let counter = 0;
      while (!uploadId || !videoUuid) {
        const multipartIds =
          this.dependencies.uploadedRecordingPartsStore.getState()
            .uploadedParts[questionUuid];
        if (multipartIds) {
          uploadId = multipartIds.uploadId;
          videoUuid = multipartIds.videoUuid;
        } else {
          // Wait for 1 second before checking again, to see if the first part has been uploaded and the uploadId and videoUuid are available.
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        counter++;
        if (counter > 10) {
          this.dependencies.toast.error(
            "Das Hochladen des Videos ist nicht möglich. Bitte lade die Seite neu und versuche es erneut.",
          );
        }
      }
    }

    // Already fetch a pre-signed url, so the upload can start immediately, when the pipeline gets to the upload step.
    const preSignedUrlPromise =
      this.dependencies.client.createPresignedS3RecordingMultipartUploadUrl({
        mimeType: file.type,
        partNumber,
        uploadId,
        videoUuid,
      });

    this.dependencies.recordingUploadStore.getState().addRecordingToUpload({
      questionUuid,
      indexedDBId: fileIndex,
      abortController,
      partNumber,
      isLastPart,
    });

    this.uploadPipeline = this.uploadPipeline.then(async () => {
      // Retry the upload up to 3 times
      for (let i = 1; i <= 3; ++i) {
        try {
          await this.uploadRecording({
            fileIndex,
            interviewUuid,
            questionUuid,
            queryKeyToInvalidateAnswers,
            signal: abortController.signal,
            preSignedUrlPromise,
            partNumber,
            isLastPart,
          });
          break; // if upload succeeds, break out of the retry loop
        } catch (error) {
          if (i === 3) {
            this.dependencies.toast.error(
              "Das Hochladen des Dokuments ist fehlgeschlagen. Bitte versuche es erneut.",
            );
            console.error(error);
            return this.removeUpload({ fileIndex });
          }
          await new Promise((resolve) => setTimeout(resolve, i * 1000));
        }
      }
    });
  }

  private async uploadRecording({
    fileIndex,
    interviewUuid,
    questionUuid,
    queryKeyToInvalidateAnswers,
    signal,
    preSignedUrlPromise,
    partNumber,
    isLastPart,
  }: {
    fileIndex: number;
    interviewUuid: string;
    questionUuid: string;
    queryKeyToInvalidateAnswers: QueryKey;
    signal: AbortSignal;
    preSignedUrlPromise: Promise<{
      videoUuid: string;
      uploadId: string;
      uploadUrl: string;
    }>;
    partNumber: number;
    isLastPart: boolean;
  }) {
    if (signal.aborted) {
      return this.removeUpload({ fileIndex });
    }

    const file = await this.getFileFromIndexedDB(fileIndex);

    if (signal.aborted) {
      return this.removeUpload({ fileIndex });
    }

    // Check if the pre-signed URL is still valid. If not, get a new one.
    // Url contains the information below as search params
    // X-Amz-Date=20260326T193627Z&X-Amz-Expires=300
    let { uploadUrl, videoUuid, uploadId } = await preSignedUrlPromise;
    if (partNumber === 1) {
      this.dependencies.uploadedRecordingPartsStore.getState().setMultipartIds({
        questionUuid,
        videoUuid,
        uploadId,
      });
    }
    if (signal.aborted) {
      return this.removeUpload({ fileIndex });
    }
    if (!this.dependencies.isPreSignedURLStillValid(uploadUrl)) {
      // If the current time is past the expiration time minus a buffer (e.g., 1 minute), we consider the URL expired and get a new one.
      ({ uploadUrl, videoUuid, uploadId } =
        await this.dependencies.client.createPresignedS3RecordingMultipartUploadUrl(
          {
            mimeType: file.type,
            partNumber,
          },
        ));
    }

    const uploadWasAborted = await this.uploadFileToPresignedUrl({
      file,
      fileIndex,
      questionUuid,
      partNumber,
      uploadUrl,
      signal,
    });

    if (uploadWasAborted || signal.aborted) {
      return this.removeUpload({ fileIndex });
    }

    // Fire and forget the syncing to the ui, so the next upload can begin.
    void this.syncUploadedRecordingToAnswer({
      fileIndex,
      interviewUuid,
      questionUuid,
      queryKeyToInvalidateAnswers,
      isLastPart,
      videoUuid,
      uploadId,
    });
  }

  private uploadFileToPresignedUrl({
    file,
    fileIndex,
    questionUuid,
    partNumber,
    uploadUrl,
    signal,
  }: {
    file: File;
    fileIndex: number;
    questionUuid: string;
    partNumber: number;
    uploadUrl: string;
    signal: AbortSignal;
  }) {
    return new Promise<boolean>((resolve, reject) => {
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
          this.dependencies.recordingUploadStore
            .getState()
            .updateRecordingProgress(fileIndex, progress);
          console.log(
            `Upload progress for file index ${fileIndex}: ${progress}%`,
          );
        }
      };

      xhr.onload = () => {
        signal.removeEventListener("abort", abortUpload);
        if (xhr.status !== 200) {
          reject(
            new Error(
              `Upload failed for file index ${fileIndex} with status ${xhr.status}`,
            ),
          );
          return;
        }
        const ETag = xhr.getResponseHeader("ETag");
        if (!ETag) {
          reject(
            new Error(
              `Upload failed for file index ${fileIndex}: missing ETag`,
            ),
          );
          return;
        }
        this.dependencies.uploadedRecordingPartsStore
          .getState()
          .addUploadedPart({
            questionUuid,
            PartNumber: partNumber,
            ETag,
          });
        console.log(`Upload successful for file index ${fileIndex}`);
        resolve(false);
      };
      xhr.onerror = () => {
        signal.removeEventListener("abort", abortUpload);
        reject(
          new Error(`Network error during upload of file index ${fileIndex}`),
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
  }

  private async syncUploadedRecordingToAnswer({
    fileIndex,
    interviewUuid,
    questionUuid,
    queryKeyToInvalidateAnswers,
    isLastPart,
    videoUuid,
    uploadId,
  }: {
    fileIndex: number;
    interviewUuid: string;
    questionUuid: string;
    queryKeyToInvalidateAnswers: QueryKey;
    isLastPart: boolean;
    videoUuid: string;
    uploadId: string;
  }) {
    try {
      await this.deleteFileFromIndexedDB(fileIndex);
    } catch (error) {
      console.error(`Failed to delete file with index ${fileIndex}:`, error);
    }
    this.dependencies.recordingUploadStore
      .getState()
      .removeRecordingFromUpload(fileIndex);

    if (!isLastPart) return;

    this.dependencies.uploadedRecordingPartsStore
      .getState()
      .setUploadLifecycleStatus({
        questionUuid,
        status: "finalizing",
      });

    try {
      await this.dependencies.client.finishMultipartUploadForRecording({
        videoUuid,
        uploadId,
        parts:
          this.dependencies.uploadedRecordingPartsStore.getState()
            .uploadedParts[questionUuid].parts,
      });
    } catch (error) {
      this.dependencies.toast.error(
        "Das Abschließen des Video-Uploads ist fehlgeschlagen. Bitte versuche es erneut.",
      );
      console.error("Error finishing multipart upload:", error);
    }

    let updatedAnswer: z.infer<typeof AnswerSelectSchema> | null = null;
    try {
      updatedAnswer = await this.dependencies.client.saveAnswer({
        interviewUuid,
        questionUuid,
        answerPayload: {
          videoUuid,
          status: "uploaded",
        },
      });
    } catch (error) {
      this.dependencies.toast.error(
        "Das Hochladen des Videos ist fehlgeschlagen. Bitte versuche es erneut.",
      );
      console.error("Error adding recording to answer:", error);
    }

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

    this.dependencies.uploadedRecordingPartsStore
      .getState()
      .removeUploadedPartsForQuestion(questionUuid);
  }

  private async removeUpload({ fileIndex }: { fileIndex: number }) {
    try {
      await this.deleteFileFromIndexedDB(fileIndex);
    } catch (error) {
      console.error(`Failed to delete file with index ${fileIndex}:`, error);
    }
    this.dependencies.recordingUploadStore
      .getState()
      .removeRecordingFromUpload(fileIndex);
  }
}

export const recordingUploadService = new RecordingUploadService();

// TODO think about how to start the upload pipeline on page reload

// TODO think about aborting, and how it works now
