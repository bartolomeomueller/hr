import { insertNewCandidateWithNameAndEmail } from "./candidate";
import {
  addParticipantToInterview,
  createInterviewForRoleAndQuestionSet,
  getInterviewRelatedDataByInterviewUuid,
  saveInterviewStep,
} from "./interview";
import {
  getQuestionsByRoleSlugAndQuestionSetVersion,
  getRoleAndItsQuestionSetBySlug,
  getRoleSlugAndQuestionSetVersionByInterviewUuid,
} from "./role";

export default {
  // These exports are sorted in the order of intended usage in the interview process.
  getRoleAndItsQuestionSetBySlug,
  getQuestionsByRoleSlugAndQuestionSetVersion,
  createInterviewForRoleAndQuestionSet,
  getInterviewRelatedDataByInterviewUuid,
  insertNewCandidateWithNameAndEmail,
  addParticipantToInterview,
  saveInterviewStep,

  // Helper functions for the interview process
  getRoleSlugAndQuestionSetVersionByInterviewUuid,
};
