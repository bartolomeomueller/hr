import { os } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import z from "zod";
import { db } from "@/db";
import { FlowVersion, Role } from "@/db/schema";
import { FlowVersionSelectSchema, RoleSelectSchema } from "@/orpc/schema";
import { debugMiddleware } from "../debug-middleware";

export const getRoleAndItsFlowVersionBySlug = os
  .use(debugMiddleware)
  .input(RoleSelectSchema.pick({ slug: true }))
  .output(
    z
      .object({
        role: RoleSelectSchema,
        flowVersion: FlowVersionSelectSchema,
      })
      .nullable(),
  )
  .handler(async ({ input }) => {
    const [result] = await db
      .select({
        role: Role,
        flowVersion: FlowVersion,
      })
      .from(Role)
      .innerJoin(FlowVersion, eq(FlowVersion.roleUuid, Role.uuid)) // When no flow version exists, the role should not be visible to the user
      .where(eq(Role.slug, input.slug))
      .orderBy(desc(FlowVersion.version))
      .limit(1);

    if (!result) return null;

    return result;
  });
