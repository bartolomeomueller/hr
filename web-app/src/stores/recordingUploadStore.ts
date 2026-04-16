import type { QueryKey } from "@tanstack/react-query";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Recording = {
  questionUuid: string;
  interviewUuid: string;
  queryKeyToInvalidateAnswers: QueryKey;
  indexedDBId: number;
  progress: number;
  partNumber: number;
  isLastPart: boolean;
};

export type RecordingUploadStore = {
  recordings: Recording[];
  getRecordingToUploadForQuestionUuid: (
    questionUuid: string,
  ) => Recording | null;
  addRecordingToUpload: (document: Omit<Recording, "progress">) => Recording;
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
      addRecordingToUpload: (recording: Omit<Recording, "progress">) => {
        set((state) => ({
          recordings: [...state.recordings, { ...recording, progress: 0 }],
        }));
        return { ...recording, progress: 0 };
      },
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
      // This store is reload-safe metadata only. It persists the queued uploads
      // needed to reconstruct service runtime state after a refresh.
      //
      // We use sessionStorage so uploads survive reloads in the same tab but do
      // not become a shared cross-tab coordination mechanism.
      // Duplicate-tab behavior is not treated as a supported scenario.
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

// This store persists multipart session identity and uploaded S3 parts per
// question. That persisted state is the reload-safe source of truth for resumed
// uploads, especially once part 1 has already received uploadId and videoUuid.
//
// The recording upload service still owns all writes. The UI may read state,
// but it should delegate orchestration, resume/finalization, cancellation, and
// cleanup to the service.
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
        // A question has at most one active multipart session at a time.
        // Initializing this more than once means the client lost track of that
        // invariant and should fail loudly instead of silently corrupting state.
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
        // `finalizing` is persisted so the UI can reflect that state after a
        // reload, even though the exact resume behavior for already-finalizing
        // uploads is still a separate design decision.
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
