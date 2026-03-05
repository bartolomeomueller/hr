import { insertNewCandidateWithNameAndEmail } from "./candidate";
import {
  addParticipantToInterview,
  createInterviewForRole,
  getInterviewByUuid,
  getInterviewRelatedDataByInterviewUuid,
  saveInterviewStepAnswer,
} from "./interview";
import { getRoleAndItsQuestionsBySlug } from "./role";

export default {
  getRoleAndItsQuestionsBySlug,
  createInterviewForRole,
  insertNewCandidateWithNameAndEmail,
  getInterviewByUuid,
  getInterviewRelatedDataByInterviewUuid,
  addParticipantToInterview,
  saveInterviewStepAnswer,
};
