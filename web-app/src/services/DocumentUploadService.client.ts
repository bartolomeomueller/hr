import type { QueryKey } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { client } from "@/orpc/client";
import { useDocumentUploadStore } from "@/stores/documentUploadStore";

const DB_NAME = "UploadDatabase";
const STORE_NAME = "documents";

class DocumentUploadService {
  dbPromise: Promise<IDBDatabase> | null = null;
  uploadPipeline: Promise<void> = Promise.resolve();

  constructor() {
    this.dbPromise = this.getDB();
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1); // version 1 of the database
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, {
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
        indexedDB.deleteDatabase(DB_NAME); // clean up any potentially corrupted database
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
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
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
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
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
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
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

    const fileIndex = await this.storeFileInIndexedDB({ file });

    // Already fetch a pre-signed url, so the upload can start immediately, when the pipeline gets to the upload step.
    const preSignedUrlPromise = client.createPresignedS3DocumentUploadUrl({
      mimeType: file.type,
    });

    useDocumentUploadStore.getState().addDocumentToUpload({
      questionUuid,
      indexedDBId: fileIndex,
      fileName: file.name,
      abortController,
    });

    this.uploadPipeline = this.uploadPipeline
      .then(async () => {
        await this.uploadDocument({
          fileIndex,
          interviewUuid,
          questionUuid,
          queryKeyToInvalidateAnswers,
          signal: abortController.signal,
          preSignedUrlPromise,
          isSingleFileUpload,
        });
      })
      .catch(() => {
        // The user will see the failed upload in the UI and may retry the upload
        useDocumentUploadStore.getState().setDocumentUploadAsFailed(fileIndex);
      });
  }

  // TODO somewhere best ui near check file.size to be under 5GiB

  private async uploadDocument({
    fileIndex,
    interviewUuid,
    questionUuid,
    queryKeyToInvalidateAnswers,
    signal,
    preSignedUrlPromise,
    isSingleFileUpload,
  }: {
    fileIndex: number;
    interviewUuid: string;
    questionUuid: string;
    queryKeyToInvalidateAnswers: QueryKey;
    signal: AbortSignal;
    preSignedUrlPromise: Promise<{ uuid: string; uploadUrl: string }>;
    isSingleFileUpload: boolean;
  }) {
    if (signal.aborted) {
      // TODO aborting does not work as expected
      return;
    }

    const file = await this.getFileFromIndexedDB(fileIndex);

    // Check if the pre-signed URL is still valid. If not, get a new one.
    // Url contains the information below as search params
    // X-Amz-Date=20260326T193627Z&X-Amz-Expires=300
    let { uploadUrl, uuid } = await preSignedUrlPromise;
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
      ({ uploadUrl, uuid } = await client.createPresignedS3DocumentUploadUrl({
        mimeType: file.type,
      }));
    }

    await new Promise<void>((resolve, reject) => {
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
          useDocumentUploadStore
            .getState()
            .updateDocumentProgress(fileIndex, progress);
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
        }
        console.log(`Upload successful for file index ${fileIndex}`);
        resolve();
      };
      xhr.onerror = () => {
        signal.removeEventListener("abort", abortUpload);
        reject(
          new Error(`Network error during upload of file index ${fileIndex}`),
        );
      };
      xhr.onabort = () => {
        signal.removeEventListener("abort", abortUpload);
        resolve();
      };

      if (signal.aborted) {
        resolve();
      }

      xhr.send(file);
    });

    // Fire and forget the syncing to the ui, so the next upload can begin.
    // TODO sync error handling with catch of pipeline
    void (async () => {
      const updatedAnswer = await client.addNewDocumentToAnswer({
        interviewUuid,
        questionUuid,
        document: {
          documentUuid: uuid,
          fileName: file.name,
          mimeType: file.type,
        },
        isSingleFileUpload,
      });
      await this.deleteFileFromIndexedDB(fileIndex);
      useDocumentUploadStore.getState().removeDocumentFromUpload(fileIndex);
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
      await getQueryClient().invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      });
    })();
  }
}

export const documentUploadService = new DocumentUploadService();

// TODO think about how to start the upload pipeline on page reload
