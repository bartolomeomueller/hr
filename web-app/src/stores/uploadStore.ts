import { create } from "zustand";

export type Recording = {
  recordingId: string;
  mimeType: string;
  chunks: ChunkWithStreamingState[];
  isComplete: boolean;
  isUploading: boolean;
};

export type ChunkWithStreamingState = {
  chunk: Blob;
  gotEnqueuedToUploadStream: boolean;
};

export type RecordingChunk = {
  recordingId: string;
  mimeType: string;
  chunk: Blob;
  isLastChunk: boolean;
};

export type UploadStore = {
  recordings: Recording[];
  addChunk: (chunk: RecordingChunk) => void;
  setFirstRecordingAsUploading: () => void;
  removeFirstRecordingInQueue: () => void;
  setChunkAsEnqueuedToUploadStreamForFirstRecording: (
    chunkIndex: number,
  ) => void;
  resetChunksStreamingStateForFirstRecording: () => void;
};

export const useUploadStore = create<UploadStore>((set) => ({
  recordings: [],
  addChunk: (chunk: RecordingChunk) =>
    set((state) => {
      let exists = state.recordings.some(
        (r) => r.recordingId === chunk.recordingId,
      );
      if (exists) {
        return {
          recordings: state.recordings.map((r) =>
            r.recordingId === chunk.recordingId
              ? {
                  ...r,
                  // The last chunk is always an empty blob with isLastChunk=true
                  chunks: [
                    ...r.chunks,
                    {
                      chunk: chunk.chunk,
                      gotEnqueuedToUploadStream: false,
                    },
                  ],
                  isComplete: chunk.isLastChunk,
                }
              : r,
          ),
        };
      }
      return {
        recordings: [
          ...state.recordings,
          {
            recordingId: chunk.recordingId,
            mimeType: chunk.mimeType,
            chunks: [{ chunk: chunk.chunk, gotEnqueuedToUploadStream: false }],
            isComplete: chunk.isLastChunk,
            isUploading: false,
          },
        ],
      };
    }),
  setFirstRecordingAsUploading: () => {
    set((state) => {
      if (state.recordings.length === 0) {
        return state;
      }
      const firstRecording = state.recordings[0];
      return {
        recordings: [
          {
            ...firstRecording,
            isUploading: true,
          },
          ...state.recordings.slice(1),
        ],
      };
    });
  },
  setChunkAsEnqueuedToUploadStreamForFirstRecording: (chunkIndex: number) => {
    set((state) => {
      const recording = state.recordings.at(0);
      if (!recording) {
        return state;
      }
      const updatedChunks = recording.chunks.map((c, index) =>
        index === chunkIndex ? { ...c, gotEnqueuedToUploadStream: true } : c,
      );
      return {
        recordings: [
          { ...recording, chunks: updatedChunks },
          ...state.recordings.slice(1),
        ],
      };
    });
  },
  removeFirstRecordingInQueue: () =>
    set((state) => ({
      recordings: state.recordings.slice(1),
    })),
  resetChunksStreamingStateForFirstRecording: () =>
    set((state) => {
      const recording = state.recordings.at(0);
      if (!recording) {
        return state;
      }
      const updatedChunks = recording.chunks.map((c) => ({
        ...c,
        gotEnqueuedToUploadStream: false,
      }));
      return {
        recordings: [
          { ...recording, chunks: updatedChunks },
          ...state.recordings.slice(1),
        ],
      };
    }),
}));
