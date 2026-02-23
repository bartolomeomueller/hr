import { interviewSelectSchema } from "@/db/schema";

export const InterviewSchema = interviewSelectSchema;

export const GetInterviewByUuidInputSchema = InterviewSchema.pick({
  uuid: true,
});

export const NullableInterviewSchema = InterviewSchema.nullable();
