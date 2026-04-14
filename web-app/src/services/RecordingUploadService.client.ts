import type { QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import type z from "zod";
import { getQueryClient } from "@/lib/query-client";
import { client } from "@/orpc/client";
import type { AnswerSelectSchema } from "@/orpc/schema";
import {
  useRecordingUploadStore,
  useUploadedRecordingPartsStore,
} from "@/stores/recordingUploadStore";

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

class RecordingUploadService {
  dbPromise: Promise<IDBDatabase> | null = null;
  uploadPipeline: Promise<void> = Promise.resolve();

  static readonly DB_NAME = "UploadDatabase";
  static readonly STORE_NAME = "recordings";
  static readonly OTHER_STORE_NAME = "documents";

  constructor() {
    this.dbPromise = this.getDB();
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(RecordingUploadService.DB_NAME, 1); // version 1 of the database
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(RecordingUploadService.STORE_NAME)) {
          db.createObjectStore(RecordingUploadService.STORE_NAME, {
            keyPath: "id",
            autoIncrement: true,
          });
        }
        if (
          !db.objectStoreNames.contains(RecordingUploadService.OTHER_STORE_NAME)
        ) {
          db.createObjectStore(RecordingUploadService.OTHER_STORE_NAME, {
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
        indexedDB.deleteDatabase(RecordingUploadService.DB_NAME); // clean up any potentially corrupted database
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
          useUploadedRecordingPartsStore.getState().uploadedParts[questionUuid];
        if (multipartIds) {
          uploadId = multipartIds.uploadId;
          videoUuid = multipartIds.videoUuid;
        } else {
          // Wait for 1 second before checking again, to see if the first part has been uploaded and the uploadId and videoUuid are available.
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        counter++;
        if (counter > 10) {
          toast.error(
            "Das Hochladen des Videos ist nicht möglich. Bitte lade die Seite neu und versuche es erneut.",
          );
        }
      }
    }

    // Already fetch a pre-signed url, so the upload can start immediately, when the pipeline gets to the upload step.
    const preSignedUrlPromise =
      client.createPresignedS3RecordingMultipartUploadUrl({
        mimeType: file.type,
        partNumber,
        uploadId,
        videoUuid,
      });

    useRecordingUploadStore.getState().addRecordingToUpload({
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
            toast.error(
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
      useUploadedRecordingPartsStore.getState().setMultipartIds({
        questionUuid,
        videoUuid,
        uploadId,
      });
    }
    if (signal.aborted) {
      return this.removeUpload({ fileIndex });
    }
    const uploadUrlObj = new URL(uploadUrl);
    const signDate = uploadUrlObj.searchParams.get("X-Amz-Date");
    const expires = uploadUrlObj.searchParams.get("X-Amz-Expires");
    if (!signDate || !expires) {
      throw new Error("Invalid pre-signed URL: missing required parameters");
    }
    const signDateTime = new Date(
      Date.UTC(
        parseInt(signDate.substring(0, 4), 10), // year
        parseInt(signDate.substring(4, 6), 10) - 1, // month (0-based)
        parseInt(signDate.substring(6, 8), 10), // day
        parseInt(signDate.substring(9, 11), 10), // hour
        parseInt(signDate.substring(11, 13), 10), // minute
        parseInt(signDate.substring(13, 15), 10), // second
      ),
    );
    if (
      Date.now() >
      signDateTime.getTime() + parseInt(expires, 10) * 1000 - 60 * 1000
    ) {
      // If the current time is past the expiration time minus a buffer (e.g., 1 minute), we consider the URL expired and get a new one.
      ({ uploadUrl, videoUuid, uploadId } =
        await client.createPresignedS3RecordingMultipartUploadUrl({
          mimeType: file.type,
          partNumber,
        }));
    }

    const uploadWasAborted = await new Promise<boolean>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const abortUpload = () => {
        xhr.abort();
      };

      signal.addEventListener("abort", abortUpload, { once: true });

      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          useRecordingUploadStore
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
        useUploadedRecordingPartsStore.getState().addUploadedPart({
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

    if (uploadWasAborted || signal.aborted) {
      return this.removeUpload({ fileIndex });
    }

    // Fire and forget the syncing to the ui, so the next upload can begin.
    void (async () => {
      try {
        await this.deleteFileFromIndexedDB(fileIndex);
      } catch (error) {
        console.error(`Failed to delete file with index ${fileIndex}:`, error);
      }
      useRecordingUploadStore.getState().removeRecordingFromUpload(fileIndex);

      if (!isLastPart) return; // The rest should only happen if it was the last part.

      try {
        await client.finishMultipartUploadForRecording({
          videoUuid,
          uploadId,
          parts:
            useUploadedRecordingPartsStore.getState().uploadedParts[
              questionUuid
            ].parts,
        });
      } catch (error) {
        toast.error(
          "Das Abschließen des Video-Uploads ist fehlgeschlagen. Bitte versuche es erneut.",
        );
        console.error("Error finishing multipart upload:", error);
      }

      let updatedAnswer: z.infer<typeof AnswerSelectSchema> | null = null;
      try {
        updatedAnswer = await client.saveAnswer({
          interviewUuid,
          questionUuid,
          answerPayload: {
            videoUuid,
            status: "uploaded",
          },
        });
      } catch (error) {
        toast.error(
          "Das Hochladen des Videos ist fehlgeschlagen. Bitte versuche es erneut.",
        );
        console.error("Error adding recording to answer:", error);
      }

      if (updatedAnswer) {
        getQueryClient().setQueryData<
          Awaited<
            ReturnType<typeof client.getInterviewRelatedDataByInterviewUuid>
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
      await getQueryClient().invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      });

      useUploadedRecordingPartsStore
        .getState()
        .removeUploadedPartsForQuestion(questionUuid);
    })();
  }

  private async removeUpload({ fileIndex }: { fileIndex: number }) {
    try {
      await this.deleteFileFromIndexedDB(fileIndex);
    } catch (error) {
      console.error(`Failed to delete file with index ${fileIndex}:`, error);
    }
    useRecordingUploadStore.getState().removeRecordingFromUpload(fileIndex);
  }
}

export const recordingUploadService = new RecordingUploadService();

// TODO think about how to start the upload pipeline on page reload

// TODO think about aborting, and how it works now
