import { os } from "@orpc/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { Role } from "@/db/schema";
import {
  ByUuidRoleSelectSchema,
  NullableRoleSelectSchema,
} from "@/orpc/schema";

export const getRoleByUuid = os
  .input(ByUuidRoleSelectSchema)
  .output(NullableRoleSelectSchema)
  .handler(async ({ input }) => {
    try {
      const get_role = await db.query.Role.findFirst({
        where: eq(Role.uuid, input.uuid),
        columns: {
          uuid: true,
          roleName: true,
        },
      });

      return get_role ?? null;
    } catch (error) {
      throw new Error(`Failed to fetch role ${input.uuid}: ${String(error)}`);
    }
  });
