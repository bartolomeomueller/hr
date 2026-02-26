import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { Candidate, Interview, Role } from "@/db/schema";

export const RoleSelectSchema = createSelectSchema(Role);
export const RoleInsertSchema = createInsertSchema(Role);
export const ByUuidRoleSelectSchema = RoleSelectSchema.pick({
  uuid: true,
});
export const NullableRoleSelectSchema = RoleSelectSchema.nullable();

export const InterviewSelectSchema = createSelectSchema(Interview);
export const InterviewInsertSchema = createInsertSchema(Interview);
export const ByUuidInterviewSelectSchema = InterviewSelectSchema.pick({
  uuid: true,
});

export const CandidateSelectSchema = createSelectSchema(Candidate);
export const CandidateInsertSchema = createInsertSchema(Candidate);
