import { os } from "@orpc/server";
import { db } from "@/db";
import { Interview } from "@/db/schema";
import {
  ByUuidInterviewSelectSchema,
  ByUuidRoleSelectSchema,
} from "@/orpc/schema";

export const createInterviewForRole = os
  .input(ByUuidRoleSelectSchema)
  .output(ByUuidInterviewSelectSchema)
  .handler(async ({ input }) => {
    try {
      const new_interview = await db
        .insert(Interview)
        .values({
          roleUuid: input.uuid,
        })
        .returning({
          uuid: Interview.uuid,
        });
      return new_interview[0];
    } catch (error) {
      throw new Error(
        `Failed to create interview for role ${input.uuid}: ${String(error)}`,
      );
    }
  });
