import { insertNewCandidateWithNameAndEmail } from "./candidate";
import {
  createInterviewForRole,
  getInterviewByUuid,
  getRoleForInterview,
} from "./interview";
import { getRoleByUuid } from "./role";

export default {
  getRoleByUuid,
  createInterviewForRole,
  insertNewCandidateWithNameAndEmail,
  getInterviewByUuid,
  getRoleForInterview,
};
