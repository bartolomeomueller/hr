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
