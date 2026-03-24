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
  }: {
    file: File;
    interviewUuid: string;
    questionUuid: string;
    queryKeyToInvalidateAnswers: QueryKey;
  }) {
    const abortController = new AbortController();

    const fileIndex = await this.storeFileInIndexedDB({ file });

    this.uploadPipeline = this.uploadPipeline
      .catch(() => {
        // The user will see the failed upload in the UI and may retry the upload
        useDocumentUploadStore.getState().setDocumentUploadAsFailed(fileIndex);
      })
      .then(async () => {
        await this.uploadDocument({
          fileIndex,
          interviewUuid,
          questionUuid,
          queryKeyToInvalidateAnswers,
          signal: abortController.signal,
        });
      });

    return { fileIndex, abortController };
  }

  // TODO somewhere best ui near check file.size to be under 5GiB

  private async uploadDocument({
    fileIndex,
    interviewUuid,
    questionUuid,
    queryKeyToInvalidateAnswers,
    signal,
  }: {
    fileIndex: number;
    interviewUuid: string;
    questionUuid: string;
    queryKeyToInvalidateAnswers: QueryKey;
    signal: AbortSignal;
  }) {
    if (signal.aborted) {
      return;
    }

    const file = await this.getFileFromIndexedDB(fileIndex);
    const { uuid, uploadUrl } = await client.createPresignedS3DocumentUploadUrl(
      {
        mimeType: file.type,
      },
    );

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

    // FIXME this needs another endpoint to append the document to the answer instead of overwriting it
    await client.saveAnswer({
      interviewUuid,
      questionUuid,
      answerPayload: {
        documents: [
          {
            documentUuid: uuid,
            fileName: file.name,
            mimeType: file.type,
          },
        ],
      },
    });
    await this.deleteFileFromIndexedDB(fileIndex);
    await getQueryClient().invalidateQueries({
      queryKey: queryKeyToInvalidateAnswers,
    });
    // TODO remove the document from the upload store, without ui hickup
  }
}

export const documentUploadService = new DocumentUploadService();

// TODO think about how to start the upload pipeline on page reload
