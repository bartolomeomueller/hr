import { create } from "zustand";

// Architectural boundary for this store:
// Only the DocumentUploadService may perform writes to this store.
// UI components may subscribe to this store for rendering, but should not call its write methods directly.
// UI components should also not use control objects from this store to drive behavior; actions such as cancellation should be delegated back to the service.
// abortController remains in store state for service-owned cancellation plumbing,
// even though UI components should not use it directly.

export type Documents = {
  localUuid: string;
  questionUuid: string;
  file: File;
  progress: number;
  abortController: AbortController;
};

export type DocumentUploadStore = {
  documentsToUpload: Documents[];
  getDocumentsToUploadForQuestionUuid: (questionUuid: string) => Documents[];
  addDocumentToUpload: (
    document: Omit<Documents, "progress" | "localUuid">,
  ) => string;
  removeDocumentFromUpload: (localUuid: string) => void;
  updateDocumentProgress: (localUuid: string, progress: number) => void;
};

export const useDocumentUploadStore = create<DocumentUploadStore>(
  (set, get) => ({
    documentsToUpload: [],
    getDocumentsToUploadForQuestionUuid: (questionUuid: string) =>
      get().documentsToUpload.filter(
        (doc) => doc.questionUuid === questionUuid,
      ),
    addDocumentToUpload: (
      document: Omit<Documents, "progress" | "localUuid">,
    ) => {
      const localUuid = crypto.randomUUID();
      set((state) => ({
        documentsToUpload: [
          ...state.documentsToUpload,
          { ...document, progress: 0, localUuid },
        ],
      }));
      return localUuid;
    },
    removeDocumentFromUpload: (localUuid: string) =>
      set((state) => ({
        documentsToUpload: state.documentsToUpload.filter(
          (doc) => doc.localUuid !== localUuid,
        ),
      })),
    updateDocumentProgress: (localUuid: string, progress: number) =>
      set((state) => ({
        documentsToUpload: state.documentsToUpload.map((doc) =>
          doc.localUuid === localUuid ? { ...doc, progress } : doc,
        ),
      })),
  }),
);
