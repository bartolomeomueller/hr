import { create } from "zustand";

export type Documents = {
  questionUuid: string;
  indexedDBId: number;
  fileName: string;
  progress: number;
  abortController: AbortController;
};

export type DocumentUploadStore = {
  documentsToUpload: Documents[];
  getDocumentsToUploadForQuestionUuid: (questionUuid: string) => Documents[];
  addDocumentToUpload: (document: Omit<Documents, "progress">) => void;
  removeDocumentFromUpload: (indexedDBId: number) => void;
  updateDocumentProgress: (indexedDBId: number, progress: number) => void;
};

export const useDocumentUploadStore = create<DocumentUploadStore>(
  (set, get) => ({
    documentsToUpload: [],
    getDocumentsToUploadForQuestionUuid: (questionUuid: string) =>
      get().documentsToUpload.filter(
        (doc) => doc.questionUuid === questionUuid,
      ),
    addDocumentToUpload: (document: Omit<Documents, "progress">) =>
      set((state) => ({
        documentsToUpload: [
          ...state.documentsToUpload,
          { ...document, progress: 0 },
        ],
      })),
    removeDocumentFromUpload: (indexedDBId: number) =>
      set((state) => ({
        documentsToUpload: state.documentsToUpload.filter(
          (doc) => doc.indexedDBId !== indexedDBId,
        ),
      })),
    updateDocumentProgress: (indexedDBId: number, progress: number) =>
      set((state) => ({
        documentsToUpload: state.documentsToUpload.map((doc) =>
          doc.indexedDBId === indexedDBId ? { ...doc, progress } : doc,
        ),
      })),
  }),
);
