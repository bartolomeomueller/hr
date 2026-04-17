import {
  addNewDocumentToAnswer,
  deleteAnswer,
  deleteDocumentFromObjectStorageAndFromAnswer,
  saveAnswer,
} from "./answer";
import {
  addParticipantToInterview,
  createInterviewForRoleUuid,
  getInterviewRelatedDataByInterviewUuid,
  getQuestionsByInterviewUuid,
} from "./interview";
import {
  getAllFinishedInterviewsForRoleByRoleSlug,
  getAllRolesForCurrentUser,
  getRoleAndItsFlowVersionBySlug,
} from "./role";
import {
  createPresignedS3DocumentDownloadUrlByUuid,
  createPresignedS3DocumentUploadUrl,
  createPresignedS3RecordingMultipartUploadUrl,
  finishMultipartUploadForRecording,
} from "./storage";

export default {
  // These exports are sorted in the order of intended usage in the interview process.
  getRoleAndItsFlowVersionBySlug,
  createInterviewForRoleUuid,
  getQuestionsByInterviewUuid,
  getInterviewRelatedDataByInterviewUuid,
  addParticipantToInterview,
  saveAnswer,
  deleteAnswer,
  addNewDocumentToAnswer,
  deleteDocumentFromObjectStorageAndFromAnswer,

  // Storage utilities
  createPresignedS3DocumentDownloadUrlByUuid,
  createPresignedS3DocumentUploadUrl,
  createPresignedS3RecordingMultipartUploadUrl,
  finishMultipartUploadForRecording,

  // Admin
  getAllRolesForCurrentUser,
  getAllFinishedInterviewsForRoleByRoleSlug,
};
