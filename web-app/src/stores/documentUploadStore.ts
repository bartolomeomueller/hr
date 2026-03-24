import { create } from "zustand";

export type Documents = {
  indexedDBId: number;
  fileName: string;
  progress: number;
  abortController: AbortController;
  hasFailed: boolean;
};

export type DocumentUploadStore = {
  documentsToUpload: Documents[];
  addDocumentToUpload: (
    document: Omit<Documents, "progress" | "hasFailed">,
  ) => void;
  removeDocumentFromUpload: (indexedDBId: number) => void;
  updateDocumentProgress: (indexedDBId: number, progress: number) => void;
  setDocumentUploadAsFailed: (indexedDBId: number) => void;
};

export const useDocumentUploadStore = create<DocumentUploadStore>((set) => ({
  documentsToUpload: [],
  addDocumentToUpload: (document: Omit<Documents, "progress" | "hasFailed">) =>
    set((state) => ({
      documentsToUpload: [
        ...state.documentsToUpload,
        { ...document, progress: 0, hasFailed: false },
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
  setDocumentUploadAsFailed: (indexedDBId: number) =>
    set((state) => ({
      documentsToUpload: state.documentsToUpload.map((doc) =>
        doc.indexedDBId === indexedDBId ? { ...doc, hasFailed: true } : doc,
      ),
    })),
}));
