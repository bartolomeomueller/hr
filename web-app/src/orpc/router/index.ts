import { insertNewCandidateWithNameAndEmail } from "./candidate";
import {
  addParticipantToInterview,
  createInterviewForRoleAndFlowVersion,
  getInterviewRelatedDataByInterviewUuid,
  saveAnswer,
} from "./interview";
import {
  getQuestionsByRoleSlugAndFlowVersion,
  getRoleAndItsFlowVersionBySlug,
  getRoleSlugAndFlowVersionByInterviewUuid,
} from "./role";
import {
  createPresignedS3DocumentUploadUrl,
  createPresignedS3TestDownloadUrl,
  createPresignedS3WebmUploadUrl,
} from "./storage";

export default {
  // These exports are sorted in the order of intended usage in the interview process.
  getRoleAndItsFlowVersionBySlug,
  getQuestionsByRoleSlugAndFlowVersion,
  createInterviewForRoleAndFlowVersion,
  getInterviewRelatedDataByInterviewUuid,
  insertNewCandidateWithNameAndEmail,
  addParticipantToInterview,
  saveAnswer,

  // Helper functions for the interview process
  getRoleSlugAndFlowVersionByInterviewUuid,

  // Storage utilities
  createPresignedS3TestDownloadUrl,
  createPresignedS3WebmUploadUrl,
  createPresignedS3DocumentUploadUrl,
};
