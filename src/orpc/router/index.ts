import { insertNewCandidateWithNameAndEmail } from "./candidate";
import {
  addParticipantToInterview,
  createInterviewForRoleAndQuestionSet,
  getInterviewRelatedDataByInterviewUuid,
  saveInterviewStepAnswer,
} from "./interview";
import { getRoleAndItsQuestionsBySlug } from "./role";

export default {
  // These exports are sorted in the order of intended usage in the interview process.
  getRoleAndItsQuestionsBySlug,
  createInterviewForRoleAndQuestionSet,
  getInterviewRelatedDataByInterviewUuid,
  insertNewCandidateWithNameAndEmail,
  addParticipantToInterview,
  saveInterviewStepAnswer,
};
