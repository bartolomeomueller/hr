// In this file we only define schemas used by multiple orpc files.

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
import {
  Account,
  Invitation,
  Member,
  Organization,
  Session,
  Team,
  TeamMember,
  User,
  Verification,
} from "@/db/auth-schema";
import {
  Answer,
  Candidate,
  FlowStep,
  FlowVersion,
  Interview,
  Question,
  Role,
} from "@/db/schema";

export const RoleSelectSchema = createSelectSchema(Role);
export const RoleInsertSchema = createInsertSchema(Role);
export const RoleUpdateSchema = createUpdateSchema(Role);

export const FlowVersionSelectSchema = createSelectSchema(FlowVersion);
export const FlowVersionInsertSchema = createInsertSchema(FlowVersion);
export const FlowVersionUpdateSchema = createUpdateSchema(FlowVersion);

export const FlowStepSelectSchema = createSelectSchema(FlowStep);
export const FlowStepInsertSchema = createInsertSchema(FlowStep);
export const FlowStepUpdateSchema = createUpdateSchema(FlowStep);

export const QuestionSelectSchema = createSelectSchema(Question);
export const QuestionInsertSchema = createInsertSchema(Question);
export const QuestionUpdateSchema = createUpdateSchema(Question);

export const CandidateSelectSchema = createSelectSchema(Candidate);
export const CandidateInsertSchema = createInsertSchema(Candidate);
export const CandidateUpdateSchema = createUpdateSchema(Candidate);

export const InterviewSelectSchema = createSelectSchema(Interview);
export const InterviewInsertSchema = createInsertSchema(Interview);
export const InterviewUpdateSchema = createUpdateSchema(Interview);

export const AnswerSelectSchema = createSelectSchema(Answer);
export const AnswerInsertSchema = createInsertSchema(Answer);
export const AnswerUpdateSchema = createUpdateSchema(Answer);

export const UserSelectSchema = createSelectSchema(User);
export const UserInsertSchema = createInsertSchema(User);
export const UserUpdateSchema = createUpdateSchema(User);

export const SessionSelectSchema = createSelectSchema(Session);
export const SessionInsertSchema = createInsertSchema(Session);
export const SessionUpdateSchema = createUpdateSchema(Session);

export const AccountSelectSchema = createSelectSchema(Account);
export const AccountInsertSchema = createInsertSchema(Account);
export const AccountUpdateSchema = createUpdateSchema(Account);

export const VerificationSelectSchema = createSelectSchema(Verification);
export const VerificationInsertSchema = createInsertSchema(Verification);
export const VerificationUpdateSchema = createUpdateSchema(Verification);

export const OrganizationSelectSchema = createSelectSchema(Organization);
export const OrganizationInsertSchema = createInsertSchema(Organization);
export const OrganizationUpdateSchema = createUpdateSchema(Organization);

export const TeamSelectSchema = createSelectSchema(Team);
export const TeamInsertSchema = createInsertSchema(Team);
export const TeamUpdateSchema = createUpdateSchema(Team);

export const TeamMemberSelectSchema = createSelectSchema(TeamMember);
export const TeamMemberInsertSchema = createInsertSchema(TeamMember);
export const TeamMemberUpdateSchema = createUpdateSchema(TeamMember);

export const MemberSelectSchema = createSelectSchema(Member);
export const MemberInsertSchema = createInsertSchema(Member);
export const MemberUpdateSchema = createUpdateSchema(Member);

export const InvitationSelectSchema = createSelectSchema(Invitation);
export const InvitationInsertSchema = createInsertSchema(Invitation);
export const InvitationUpdateSchema = createUpdateSchema(Invitation);

export const InterviewWithCandidateAndAnswersSchema = z.object({
  interview: InterviewSelectSchema,
  candidate: CandidateSelectSchema.nullable(),
  answers: z.array(AnswerSelectSchema),
});
