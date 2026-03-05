import { insertNewCandidateWithNameAndEmail } from "./candidate";
import {
  addParticipantToInterview,
  createInterviewForRole,
  getInterviewByUuid,
  getInterviewRelatedDataByInterviewUuid,
  saveInterviewStepAnswer,
} from "./interview";
import { getRoleAndItsQuestionsByUuid } from "./role";

export default {
  getRoleAndItsQuestionsByUuid,
  createInterviewForRole,
  insertNewCandidateWithNameAndEmail,
  getInterviewByUuid,
  getInterviewRelatedDataByInterviewUuid,
  addParticipantToInterview,
  saveInterviewStepAnswer,
};
