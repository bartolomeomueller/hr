import { os } from "@orpc/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { Role } from "@/db/schema";
import { RoleSelectSchema } from "@/orpc/schema";

export const getRoleByUuid = os
  .input(RoleSelectSchema.pick({ uuid: true }))
  .output(RoleSelectSchema.nullable())
  .handler(async ({ input }) => {
    try {
      const get_role = await db.query.Role.findFirst({
        where: eq(Role.uuid, input.uuid),
        columns: {
          uuid: true,
          roleName: true,
          questions: true,
        },
      });

      return get_role ?? null;
    } catch (error) {
      throw new Error(`Failed to fetch role ${input.uuid}: ${String(error)}`);
    }
  });
