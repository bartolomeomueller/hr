import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Recording = {
  questionUuid: string;
  indexedDBId: number;
  progress: number;
  abortController: AbortController;
  partNumber: number;
  isLastPart: boolean;
};

export type RecordingUploadStore = {
  recordings: Recording[];
  getRecordingToUploadForQuestionUuid: (
    questionUuid: string,
  ) => Recording | null;
  addRecordingToUpload: (document: Omit<Recording, "progress">) => void;
  removeRecordingFromUpload: (indexedDBId: number) => void;
  updateRecordingProgress: (indexedDBId: number, progress: number) => void;
};

export const useRecordingUploadStore = create<RecordingUploadStore>()(
  persist(
    (set, get) => ({
      recordings: [],
      getRecordingToUploadForQuestionUuid: (questionUuid: string) =>
        get().recordings.find((rec) => rec.questionUuid === questionUuid) ??
        null,
      addRecordingToUpload: (recording: Omit<Recording, "progress">) =>
        set((state) => ({
          recordings: [...state.recordings, { ...recording, progress: 0 }],
        })),
      removeRecordingFromUpload: (indexedDBId: number) =>
        set((state) => ({
          recordings: state.recordings.filter(
            (rec) => rec.indexedDBId !== indexedDBId,
          ),
        })),
      updateRecordingProgress: (indexedDBId: number, progress: number) =>
        set((state) => ({
          recordings: state.recordings.map((rec) =>
            rec.indexedDBId === indexedDBId ? { ...rec, progress } : rec,
          ),
        })),
    }),
    {
      name: "RecordingUploadStore",
      // Both stores are stored in session storage, so they are resilient to page reloads, but cleared when the tab is closed.
      // Local storage would be shared between tabs, which could cause issues if the user has multiple tabs open and we try to resume operations in one of them, of items the tab does not own.
      // When the user uses "duplicate tab", the state will be copied to the new tab, this could cause problems, but we assume this will never happen while the store has data.
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);

export type RecordingUploadLifecycleStatus = "uploading" | "finalizing";

type UploadedRecordingParts = {
  [questionUuid: string]: {
    videoUuid: string;
    uploadId: string;
    status: RecordingUploadLifecycleStatus;
    parts: {
      PartNumber: number;
      ETag: string;
    }[];
  };
};

type UploadedRecordingPartsStore = {
  uploadedParts: UploadedRecordingParts;
  addUploadedPart: ({
    questionUuid,
    PartNumber,
    ETag,
  }: {
    questionUuid: string;
    PartNumber: number;
    ETag: string;
  }) => void;
  setMultipartIds: ({
    questionUuid,
    videoUuid,
    uploadId,
  }: {
    questionUuid: string;
    videoUuid: string;
    uploadId: string;
  }) => void;
  setUploadLifecycleStatus: ({
    questionUuid,
    status,
  }: {
    questionUuid: string;
    status: RecordingUploadLifecycleStatus;
  }) => void;
  removeUploadedPartsForQuestion: (questionUuid: string) => void;
};

// The recording upload service owns writes to the recording upload stores.
// The UI may read these stores, but it should delegate upload orchestration,
// resume/finalization, cancellation, and cleanup to the service.
export const useUploadedRecordingPartsStore =
  create<UploadedRecordingPartsStore>()(
    persist(
      (set) => ({
        uploadedParts: {},
        addUploadedPart: ({ questionUuid, PartNumber, ETag }) =>
          set((state) => ({
            uploadedParts: {
              ...state.uploadedParts,
              [questionUuid]: {
                videoUuid: state.uploadedParts[questionUuid]?.videoUuid ?? "",
                uploadId: state.uploadedParts[questionUuid]?.uploadId ?? "",
                status:
                  state.uploadedParts[questionUuid]?.status ?? "uploading",
                parts: [
                  ...(state.uploadedParts[questionUuid]?.parts ?? []),
                  { PartNumber, ETag },
                ],
              },
            },
          })),
        // Only happens once per question, always before the call to addUploadedPart
        setMultipartIds: ({ questionUuid, videoUuid, uploadId }) =>
          set((state) => {
            if (state.uploadedParts[questionUuid]) {
              throw new Error(
                `Invariant violation: multipart upload state for question ${questionUuid} was initialized more than once. Please report this bug.`,
              );
            }

            return {
              uploadedParts: {
                ...state.uploadedParts,
                [questionUuid]: {
                  videoUuid,
                  uploadId,
                  status: "uploading",
                  parts: [],
                },
              },
            };
          }),
        // Only happens after setMultipartIds initialized the multipart session for the question.
        setUploadLifecycleStatus: ({ questionUuid, status }) =>
          set((state) => {
            if (!state.uploadedParts[questionUuid]) {
              throw new Error(
                `Invariant violation: missing multipart upload state for question ${questionUuid}. Please report this bug.`,
              );
            }

            return {
              uploadedParts: {
                ...state.uploadedParts,
                [questionUuid]: {
                  ...state.uploadedParts[questionUuid],
                  status,
                },
              },
            };
          }),
        removeUploadedPartsForQuestion: (questionUuid: string) =>
          set((state) => {
            const { [questionUuid]: _removedQuestion, ...remainingParts } =
              state.uploadedParts;

            return {
              uploadedParts: remainingParts,
            };
          }),
      }),
      {
        name: "UploadedRecordingPartsStore",
        storage: createJSONStorage(() => sessionStorage),
      },
    ),
  );
