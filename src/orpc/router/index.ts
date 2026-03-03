import { insertNewCandidateWithNameAndEmail } from "./candidate";
import {
  addParticipantToInterview,
  createInterviewForRole,
  getInterviewByUuid,
  getInterviewRelatedDataByInterviewUuid,
  saveInterviewStepAnswer,
} from "./interview";
import { getRoleByUuid } from "./role";

export default {
  getRoleByUuid,
  createInterviewForRole,
  insertNewCandidateWithNameAndEmail,
  getInterviewByUuid,
  getInterviewRelatedDataByInterviewUuid,
  addParticipantToInterview,
  saveInterviewStepAnswer,
};
