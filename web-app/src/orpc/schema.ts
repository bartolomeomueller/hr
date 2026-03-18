import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
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

export const InterviewWithCandidateAndAnswersSchema = z.object({
  interview: InterviewSelectSchema,
  candidate: CandidateSelectSchema.nullable(),
  answers: z.array(AnswerSelectSchema),
});
