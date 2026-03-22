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

// TODO refactor those both schemas
export const CreatePresignedS3TestUploadUrlInputSchema = z.object({});
export const CreatePresignedS3TestDownloadUrlInputSchema = z.object({
  objectKey: z.string().min(1),
});
export const PresignedS3TestUploadSchema = z.object({
  bucketName: z.string().min(1),
  contentType: z.string(),
  objectKey: z.string().min(1),
  objectUrl: z.string().url(),
  uploadUrl: z.string().url(),
});
export const PresignedS3TestDownloadSchema = z.object({
  bucketName: z.string().min(1),
  downloadUrl: z.string().url(),
  objectKey: z.string().min(1),
  objectUrl: z.string().url(),
});

export const InterviewWithCandidateAndAnswersSchema = z.object({
  interview: InterviewSelectSchema,
  candidate: CandidateSelectSchema.nullable(),
  answers: z.array(AnswerSelectSchema),
});
