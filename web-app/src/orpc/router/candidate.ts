import { os } from "@orpc/server";
import { db } from "@/db";
import { Candidate } from "@/db/schema";
import { CandidateInsertSchema, CandidateSelectSchema } from "@/orpc/schema";
import { debugMiddleware } from "../debug-middleware";

export const insertNewCandidateWithNameAndEmail = os
  .use(debugMiddleware)
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
      throw new Error(`Failed to create candidate: ${String(error)}`);
    }
  });
