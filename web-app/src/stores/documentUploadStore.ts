import { create } from "zustand";

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
