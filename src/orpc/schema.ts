import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
import {
  Candidate,
  Interview,
  InterviewStep,
  Question,
  QuestionSet,
  Role,
} from "@/db/schema";

export const RoleSelectSchema = createSelectSchema(Role);
export const RoleInsertSchema = createInsertSchema(Role);
export const RoleUpdateSchema = createUpdateSchema(Role);

export const InterviewSelectSchema = createSelectSchema(Interview);
export const InterviewInsertSchema = createInsertSchema(Interview);
export const InterviewUpdateSchema = createUpdateSchema(Interview);

export const QuestionSelectSchema = createSelectSchema(Question);
export const QuestionInsertSchema = createInsertSchema(Question);
export const QuestionUpdateSchema = createUpdateSchema(Question);

export const QuestionSetSelectSchema = createSelectSchema(QuestionSet);
export const QuestionSetInsertSchema = createInsertSchema(QuestionSet);
export const QuestionSetUpdateSchema = createUpdateSchema(QuestionSet);

export const InterviewStepSelectSchema = createSelectSchema(InterviewStep);
export const InterviewStepInsertSchema = createInsertSchema(InterviewStep);
export const InterviewStepUpdateSchema = createUpdateSchema(InterviewStep);

export const CandidateSelectSchema = createSelectSchema(Candidate);
export const CandidateInsertSchema = createInsertSchema(Candidate);
export const CandidateUpdateSchema = createUpdateSchema(Candidate);

export const RoleWithQuestionsSchema = z.object({
  role: RoleSelectSchema,
  questionSet: QuestionSetSelectSchema.nullable(),
  questions: z.array(QuestionSelectSchema),
});

export const InterviewDetailsSchema = z.object({
  role: RoleSelectSchema,
  questionSet: QuestionSetSelectSchema,
  interview: InterviewSelectSchema,
  candidate: CandidateSelectSchema.nullable(),
  questions: z.array(QuestionSelectSchema),
  steps: z.array(InterviewStepSelectSchema),
});
