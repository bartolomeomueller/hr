import {
  addNewDocumentToAnswer,
  deleteDocumentFromObjectStorageAndFromAnswer,
  saveAnswer,
} from "./answer";
import { insertNewCandidateWithNameAndEmail } from "./candidate";
import {
  addParticipantToInterview,
  createInterviewForRoleUuid,
  getInterviewRelatedDataByInterviewUuid,
  getQuestionsByInterviewUuid,
} from "./interview";
import {
  getAllRolesForCurrentUser,
  getRoleAndItsFlowVersionBySlug,
} from "./role";
import {
  createPresignedS3DocumentDownloadUrlByUuid,
  createPresignedS3DocumentUploadUrl,
  createPresignedS3WebmUploadUrl,
} from "./storage";

export default {
  // These exports are sorted in the order of intended usage in the interview process.
  getRoleAndItsFlowVersionBySlug,
  createInterviewForRoleUuid,
  getQuestionsByInterviewUuid,
  getInterviewRelatedDataByInterviewUuid,
  insertNewCandidateWithNameAndEmail,
  addParticipantToInterview,
  saveAnswer,
  addNewDocumentToAnswer,
  deleteDocumentFromObjectStorageAndFromAnswer,

  // Storage utilities
  createPresignedS3DocumentDownloadUrlByUuid,
  createPresignedS3WebmUploadUrl,
  createPresignedS3DocumentUploadUrl,

  // Admin
  getAllRolesForCurrentUser,
};
