import { toast } from "sonner";
import { getQueryClient } from "@/lib/query-client";
import { isPreSignedURLStillValid } from "@/lib/utils";
import { client } from "@/orpc/client";
import {
  useRecordingUploadStore,
  useUploadedRecordingPartsStore,
} from "@/stores/recordingUploadStore";
import { RecordingUploadService } from "./RecordingUploadService";

const defaultRecordingUploadServiceDependencies = {
  client,
  getQueryClient,
  isPreSignedURLStillValid,
  toast,
  recordingUploadStore: useRecordingUploadStore,
  uploadedRecordingPartsStore: useUploadedRecordingPartsStore,
  createXmlHttpRequest: () => new XMLHttpRequest(),
  indexedDb: indexedDB,
};

export const recordingUploadService = new RecordingUploadService(
  defaultRecordingUploadServiceDependencies,
);

function resumePersistedRecordingUploadsWhenHydrated() {
  // The service must not inspect persisted stores before hydration completes,
  // otherwise it can race with sessionStorage rehydration and conclude that
  // there is nothing to resume. This bootstrap waits for both stores because
  // queued uploads and multipart state must be restored together.
  const maybeResumePersistedUploads = () => {
    if (
      !useRecordingUploadStore.persist.hasHydrated() ||
      !useUploadedRecordingPartsStore.persist.hasHydrated()
    ) {
      return;
    }

    unsubscribeRecordingHydration();
    unsubscribeUploadedPartsHydration();
    recordingUploadService.resumePersistedUploads();
  };

  const unsubscribeRecordingHydration =
    useRecordingUploadStore.persist.onFinishHydration(
      maybeResumePersistedUploads,
    );
  const unsubscribeUploadedPartsHydration =
    useUploadedRecordingPartsStore.persist.onFinishHydration(
      maybeResumePersistedUploads,
    );

  // Also check immediately in case hydration already finished before these
  // listeners were registered.
  maybeResumePersistedUploads();
}

resumePersistedRecordingUploadsWhenHydrated();
