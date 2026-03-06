import { insertNewCandidateWithNameAndEmail } from "./candidate";
import {
  addParticipantToInterview,
  createInterviewForRole,
  getInterviewRelatedDataByInterviewUuid,
  saveInterviewStepAnswer,
} from "./interview";
import { getRoleAndItsQuestionsBySlug } from "./role";

export default {
  getRoleAndItsQuestionsBySlug,
  createInterviewForRole,
  getInterviewRelatedDataByInterviewUuid,
  insertNewCandidateWithNameAndEmail,
  addParticipantToInterview,
  saveInterviewStepAnswer,
};
