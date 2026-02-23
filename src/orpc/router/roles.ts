import { os } from "@orpc/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { roles } from "@/db/schema";
import { GetRoleByUuidInputSchema, NullableRoleSchema } from "@/orpc/schema";

export const getRoleByUuid = os
  .input(GetRoleByUuidInputSchema)
  .output(NullableRoleSchema)
  .handler(async ({ input }) => {
    try {
      const role = await db.query.roles.findFirst({
        where: eq(roles.uuid, input.uuid),
        columns: {
          uuid: true,
          roleName: true,
        },
      });

      return role ?? null;
    } catch (error) {
      throw new Error(`Failed to fetch role ${input.uuid}: ${String(error)}`);
    }
  });
