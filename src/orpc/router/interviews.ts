import { os } from "@orpc/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { interviews } from "@/db/schema";
import {
  GetInterviewByUuidInputSchema,
  NullableInterviewSchema,
} from "@/orpc/schema";

export const getInterviewByUuid = os
  .input(GetInterviewByUuidInputSchema)
  .output(NullableInterviewSchema)
  .handler(async ({ input }) => {
    try {
      const interview = await db.query.interviews.findFirst({
        where: eq(interviews.uuid, input.uuid),
        columns: {
          uuid: true,
          roleName: true,
        },
      });

      return interview ?? null;
    } catch (error) {
      throw new Error(
        `Failed to fetch interview ${input.uuid}: ${String(error)}`,
      );
    }
  });
