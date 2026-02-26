import { os } from "@orpc/server";
import { db } from "@/db";
import { Candidate } from "@/db/schema";
import { CandidateInsertSchema, CandidateSelectSchema } from "@/orpc/schema";

export const insertNewCandidateWithNameAndEmail = os
  .input(CandidateInsertSchema)
  .output(CandidateSelectSchema.pick({ uuid: true }))
  .handler(async ({ input }) => {
    try {
      const candidate = await db
        .insert(Candidate)
        .values({
          name: input.name,
          email: input.email,
        })
        .returning({
          uuid: Candidate.uuid,
        });
      return candidate[0];
    } catch (error) {
      throw new Error(
        `Failed to create interview for role ${input.uuid}: ${String(error)}`,
      );
    }
  });
