import {
  addNewDocumentToAnswer,
  deleteDocumentFromObjectStorageAndFromAnswer,
  saveAnswer,
} from "./answer";
import { insertNewCandidateWithNameAndEmail } from "./candidate";
import {
  addParticipantToInterview,
  createInterviewForRoleAndFlowVersion,
  getInterviewRelatedDataByInterviewUuid,
} from "./interview";
import {
  getQuestionsByRoleSlugAndFlowVersion,
  getRoleAndItsFlowVersionBySlug,
  getRoleSlugAndFlowVersionByInterviewUuid,
} from "./role";
import {
  createPresignedS3DocumentDownloadUrlByUuid,
  createPresignedS3DocumentUploadUrl,
  createPresignedS3WebmUploadUrl,
} from "./storage";

export default {
  // These exports are sorted in the order of intended usage in the interview process.
  getRoleAndItsFlowVersionBySlug,
  // TODO add function getQuestionsByInterviewUuid
  getQuestionsByRoleSlugAndFlowVersion,
  createInterviewForRoleAndFlowVersion,
  getInterviewRelatedDataByInterviewUuid,
  insertNewCandidateWithNameAndEmail,
  addParticipantToInterview,
  saveAnswer,
  addNewDocumentToAnswer,
  deleteDocumentFromObjectStorageAndFromAnswer,

  // Helper functions for the interview process
  getRoleSlugAndFlowVersionByInterviewUuid,

  // Storage utilities
  createPresignedS3DocumentDownloadUrlByUuid,
  createPresignedS3WebmUploadUrl,
  createPresignedS3DocumentUploadUrl,
};
