import { os } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import z from "zod";
import { db } from "@/db";
import { Team, TeamMember } from "@/db/auth-schema";
import { FlowVersion, Role } from "@/db/schema";
import { FlowVersionSelectSchema, RoleSelectSchema } from "@/orpc/schema";
import { base } from "../base";
import { authMiddleware, debugMiddleware } from "../middlewares";

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

export const getAllRolesForCurrentUser = base
  .use(authMiddleware)
  .use(debugMiddleware)
  .output(z.array(RoleSelectSchema))
  .handler(async ({ context }) => {
    const roles = await db
      .select({ role: Role })
      .from(Role)
      .innerJoin(Team, eq(Team.id, Role.teamId))
      .innerJoin(TeamMember, eq(TeamMember.teamId, Team.id))
      .where(eq(TeamMember.userId, context.user.id));

    return roles.map(({ role }) => role);
  });
