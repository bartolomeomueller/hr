import type { QueryKey } from "@tanstack/react-query";
import type { toast } from "sonner";
import type z from "zod";
import type { getQueryClient } from "@/lib/query-client";
import type { isPreSignedURLStillValid } from "@/lib/utils";
import type { client } from "@/orpc/client";
import type { AnswerSelectSchema } from "@/orpc/schema";
import type {
  Recording,
  useRecordingUploadStore,
  useUploadedRecordingPartsStore,
} from "@/stores/recordingUploadStore";

export type RecordingUploadServiceDependencies = {
  client: Pick<
    typeof client,
    | "createPresignedS3RecordingMultipartUploadUrl"
    | "finishMultipartUploadForRecording"
    | "saveAnswer"
    | "getInterviewRelatedDataByInterviewUuid"
  >;
  getQueryClient: typeof getQueryClient;
  isPreSignedURLStillValid: typeof isPreSignedURLStillValid;
  toast: Pick<typeof toast, "error">;
  recordingUploadStore: typeof useRecordingUploadStore;
  uploadedRecordingPartsStore: typeof useUploadedRecordingPartsStore;
  createXmlHttpRequest: () => XMLHttpRequest;
  indexedDb: IDBFactory;
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

// This service is the only part allowed to write to the recording upload stores.
// The UI may read store state, but it should delegate orchestration, cancellation,
// resume behavior, multipart finalization, and cleanup to this service.
//
// The split is intentional:
// - IndexedDB stores the actual file parts.
// - Persisted Zustand stores keep reload-safe metadata such as queued uploads,
//   multipart ids, uploaded part ETags, and lifecycle state.
// - Runtime-only coordination such as abort controllers, the upload pipeline,
//   and in-flight multipart-id rendezvous stays inside this service.
//
// This service should be a singleton and only one upload at a time should be
// running to maximize throughput. It is also expected to survive accidental
// reloads within the same tab by rebuilding runtime state from persisted state.

export class RecordingUploadService {
  dbPromise: Promise<IDBDatabase> | null = null;
  uploadPipeline: Promise<void> = Promise.resolve();
  private readonly uploadAbortControllers = new Map<number, AbortController>();
  // Later parts need multipart ids from part 1 before they can request their
  // own presigned URL. Within one running page instance we coordinate that via
  // a per-question deferred promise instead of polling persisted state.
  // After reload, persisted multipart state is the source of truth again.
  private readonly multipartIdsByQuestion = new Map<
    string,
    {
      promise: Promise<{
        uploadId: string;
        videoUuid: string;
      }>;
      resolve: (value: { uploadId: string; videoUuid: string }) => void;
      reject: (reason?: unknown) => void;
    }
  >();
  private resumedPersistedUploads = false;

  static readonly DB_NAME = "UploadDatabase";
  static readonly STORE_NAME = "recordings";
  static readonly MULTIPART_FINALIZATION_RETRIES = 2;

  constructor(
    private readonly dependencies: RecordingUploadServiceDependencies,
  ) {
    this.dbPromise = this.getDB();
  }

  resumePersistedUploads() {
    if (this.resumedPersistedUploads) return;
    this.resumedPersistedUploads = true;

    // Runtime-only state such as abort controllers does not survive reload.
    // We rebuild it here from the persisted queue once the client bootstrap has
    // confirmed that both persisted stores have hydrated.
    const persistedRecordings = [
      ...this.dependencies.recordingUploadStore.getState().recordings,
    ];

    for (const recording of persistedRecordings) {
      void this.enqueueUpload({
        recording,
      });
    }
  }

  abortUpload(indexedDBId: number) {
    this.uploadAbortControllers.get(indexedDBId)?.abort();
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

  // It is not necessary to await this function.
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
    const fileIndex = await this.storeFileInIndexedDB({ file });

    const recording = this.dependencies.recordingUploadStore
      .getState()
      .addRecordingToUpload({
        questionUuid,
        interviewUuid,
        queryKeyToInvalidateAnswers,
        indexedDBId: fileIndex,
        partNumber,
        isLastPart,
      });

    void this.enqueueUpload({
      recording,
      mimeType: file.type,
    });
  }

  private async enqueueUpload({
    recording,
    mimeType,
  }: {
    recording: Recording;
    mimeType?: string;
  }) {
    const abortController = new AbortController();
    this.uploadAbortControllers.set(recording.indexedDBId, abortController);

    // Already fetch a pre-signed url, so the upload can start immediately, when the pipeline gets to the upload step.
    const preSignedUrlPromise = this.createPreSignedUrlPromise({
      fileIndex: recording.indexedDBId,
      mimeType,
      questionUuid: recording.questionUuid,
      partNumber: recording.partNumber,
    });

    this.uploadPipeline = this.uploadPipeline.then(() =>
      this.runWithRetry({
        run: () =>
          this.uploadRecording({
            fileIndex: recording.indexedDBId,
            interviewUuid: recording.interviewUuid,
            questionUuid: recording.questionUuid,
            queryKeyToInvalidateAnswers: recording.queryKeyToInvalidateAnswers,
            signal: abortController.signal,
            preSignedUrlPromise,
            partNumber: recording.partNumber,
            isLastPart: recording.isLastPart,
          }),
        maxAttempts: 3,
        getDelayMs: (attempt) => attempt * 1000,
        onFinalError: async (error) => {
          this.dependencies.toast.error(
            "Das Hochladen des Dokuments ist fehlgeschlagen. Bitte versuche es erneut.",
          );
          console.error(error);

          if (!this.isRecoverableNetworkError(error)) {
            await this.removeUploadsForQuestion({
              questionUuid: recording.questionUuid,
            });
          }
        },
      }),
    );
  }

  private async runWithRetry({
    run,
    maxAttempts,
    getDelayMs,
    onFinalError,
    attempt = 1,
  }: {
    run: () => Promise<void>;
    maxAttempts: number;
    getDelayMs: (attempt: number) => number;
    onFinalError: (error: unknown) => Promise<void> | void;
    attempt?: number;
  }): Promise<void> {
    try {
      await run();
    } catch (error) {
      if (attempt >= maxAttempts) {
        await onFinalError(error);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, getDelayMs(attempt)));
      await this.runWithRetry({
        run,
        maxAttempts,
        getDelayMs,
        onFinalError,
        attempt: attempt + 1,
      });
    }
  }

  private async createPreSignedUrlPromise({
    fileIndex,
    mimeType,
    questionUuid,
    partNumber,
  }: {
    fileIndex: number;
    mimeType?: string;
    questionUuid: string;
    partNumber: number;
  }) {
    const resolvedMimeType =
      mimeType ?? (await this.getFileFromIndexedDB(fileIndex)).type;

    if (partNumber === 1) {
      // The first part creates the multipart session. Its presign response is
      // the earliest point where later parts can safely learn uploadId and
      // videoUuid without waiting for store writes.
      const preSignedUrlPromise =
        this.dependencies.client.createPresignedS3RecordingMultipartUploadUrl({
          multipartUploadMode: "new" as const,
          mimeType: resolvedMimeType,
          partNumber: 1,
        });

      this.resolveMultipartIdsFromPromise({
        questionUuid,
        multipartIdsPromise: preSignedUrlPromise,
      });

      return preSignedUrlPromise;
    }

    // Later parts must attach to the multipart session created by part 1.
    // On reload, waitForMultipartIds can resolve immediately from persisted
    // multipart state instead of the in-memory deferred promise.
    const { uploadId, videoUuid } =
      await this.waitForMultipartIds(questionUuid);

    return this.dependencies.client.createPresignedS3RecordingMultipartUploadUrl(
      {
        multipartUploadMode: "existing" as const,
        mimeType: resolvedMimeType,
        partNumber,
        uploadId,
        videoUuid,
      },
    );
  }

  private resolveMultipartIdsFromPromise({
    questionUuid,
    multipartIdsPromise,
  }: {
    questionUuid: string;
    multipartIdsPromise: Promise<{
      uploadId: string;
      videoUuid: string;
    }>;
  }) {
    const deferredMultipartIds =
      this.getOrCreateMultipartIdsDeferred(questionUuid);

    void multipartIdsPromise.then(
      ({ uploadId, videoUuid }) => {
        deferredMultipartIds.resolve({ uploadId, videoUuid });
      },
      (error) => {
        this.multipartIdsByQuestion.delete(questionUuid);
        deferredMultipartIds.reject(error);
      },
    );
  }

  private getOrCreateMultipartIdsDeferred(questionUuid: string) {
    const existingDeferred = this.multipartIdsByQuestion.get(questionUuid);
    if (existingDeferred) {
      return existingDeferred;
    }

    let resolveMultipartIds: (value: {
      uploadId: string;
      videoUuid: string;
    }) => void = () => {};
    let rejectMultipartIds: (reason?: unknown) => void = () => {};

    const multipartIdsPromise = new Promise<{
      uploadId: string;
      videoUuid: string;
    }>((resolve, reject) => {
      resolveMultipartIds = resolve;
      rejectMultipartIds = reject;
    });

    const deferredMultipartIds = {
      promise: multipartIdsPromise,
      resolve: resolveMultipartIds,
      reject: rejectMultipartIds,
    };

    this.multipartIdsByQuestion.set(questionUuid, deferredMultipartIds);
    return deferredMultipartIds;
  }

  // Fresh uploads resolve this from the deferred promise above. Reloaded uploads
  // resolve from persisted multipart state, which is why the service can resume
  // after a page refresh without needing to recreate old promises.
  private async waitForMultipartIds(questionUuid: string) {
    const uploadedPartsForQuestion =
      this.dependencies.uploadedRecordingPartsStore.getState().uploadedParts[
        questionUuid
      ];
    if (uploadedPartsForQuestion) {
      return {
        uploadId: uploadedPartsForQuestion.uploadId,
        videoUuid: uploadedPartsForQuestion.videoUuid,
      };
    }

    return await this.getOrCreateMultipartIdsDeferred(questionUuid).promise;
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

    let { uploadUrl, videoUuid, uploadId } = await preSignedUrlPromise;
    if (!this.dependencies.isPreSignedURLStillValid(uploadUrl)) {
      // If the current time is past the expiration time minus a buffer (e.g., 1 minute), we consider the URL expired and get a new one.
      ({ uploadUrl, videoUuid, uploadId } =
        await this.dependencies.client.createPresignedS3RecordingMultipartUploadUrl(
          {
            multipartUploadMode: "existing",
            mimeType: file.type,
            partNumber,
            uploadId,
            videoUuid,
          },
        ));
    }
    if (partNumber === 1) {
      const uploadedParts =
        this.dependencies.uploadedRecordingPartsStore.getState().uploadedParts;
      if (!uploadedParts[questionUuid]) {
        this.dependencies.uploadedRecordingPartsStore
          .getState()
          .setMultipartIds({
            questionUuid,
            videoUuid,
            uploadId,
          });
      }
    }
    if (signal.aborted) {
      return this.removeUpload({ fileIndex });
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
              `Upload succeeded for file index ${fileIndex} but no ETag was returned`,
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

        resolve(false);
      };

      xhr.onerror = () => {
        signal.removeEventListener("abort", abortUpload);
        reject(
          new Error(`Network error during upload for file index ${fileIndex}`),
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

    // Finalization is a boundary: once storage finalization fails, we do not
    // attempt saveAnswer because the application-level answer state must not say
    // "uploaded" unless the multipart upload was actually completed.
    this.dependencies.uploadedRecordingPartsStore
      .getState()
      .setUploadLifecycleStatus({
        questionUuid,
        status: "finalizing",
      });

    try {
      await this.dependencies.client.finishMultipartUploadForRecording(
        {
          videoUuid,
          uploadId,
          parts:
            this.dependencies.uploadedRecordingPartsStore.getState()
              .uploadedParts[questionUuid].parts,
        },
        {
          context: {
            retry: RecordingUploadService.MULTIPART_FINALIZATION_RETRIES,
          },
        },
      );
    } catch (error) {
      this.dependencies.toast.error(
        "Das Abschließen des Video-Uploads ist fehlgeschlagen. Bitte versuche es erneut.",
      );
      console.error("Error finishing multipart upload:", error);
      return;
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

    this.multipartIdsByQuestion.delete(questionUuid);
    this.dependencies.uploadedRecordingPartsStore
      .getState()
      .removeUploadedPartsForQuestion(questionUuid);
  }

  private async removeUpload({ fileIndex }: { fileIndex: number }) {
    this.uploadAbortControllers.delete(fileIndex);
    this.dependencies.recordingUploadStore
      .getState()
      .removeRecordingFromUpload(fileIndex);
    try {
      await this.deleteFileFromIndexedDB(fileIndex);
    } catch (error) {
      console.error(`Failed to delete file with index ${fileIndex}:`, error);
    }
  }

  private async removeUploadsForQuestion({
    questionUuid,
  }: {
    questionUuid: string;
  }) {
    // Fatal cleanup is question-scoped because multipart ids and uploaded parts
    // are tracked per question. Recoverable network errors intentionally skip
    // this path so resumable state stays intact.
    const recordingsForQuestion = this.dependencies.recordingUploadStore
      .getState()
      .recordings.filter(
        (recording) => recording.questionUuid === questionUuid,
      );

    for (const recording of recordingsForQuestion) {
      await this.removeUpload({ fileIndex: recording.indexedDBId });
    }

    this.multipartIdsByQuestion.delete(questionUuid);
    this.dependencies.uploadedRecordingPartsStore
      .getState()
      .removeUploadedPartsForQuestion(questionUuid);
  }

  private isRecoverableNetworkError(error: unknown) {
    return (
      error instanceof Error &&
      error.message.startsWith("Network error during upload")
    );
  }
}

// TODO think about how to start the upload pipeline on page reload

// TODO think about aborting, and how it works now
