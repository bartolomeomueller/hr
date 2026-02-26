import { os } from "@orpc/server";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { db } from "@/db";
import { Interview, Role } from "@/db/schema";
import { InterviewSelectSchema, RoleSelectSchema } from "@/orpc/schema";

export const createInterviewForRole = os
  .input(
    RoleSelectSchema.pick({
      uuid: true,
    }),
  )
  .output(InterviewSelectSchema.pick({ uuid: true }))
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

export const getInterviewByUuid = os
  .input(InterviewSelectSchema.pick({ uuid: true }))
  .output(InterviewSelectSchema.nullable())
  .handler(async ({ input }) => {
    try {
      const interview = await db.query.Interview.findFirst({
        where: eq(Interview.uuid, input.uuid),
        columns: {
          uuid: true,
          roleUuid: true,
          candidateUuid: true,
        },
      });

      return interview ?? null;
    } catch (error) {
      throw new Error(
        `Failed to fetch interview ${input.uuid}: ${String(error)}`,
      );
    }
  });

export const getRoleForInterview = os
  .input(InterviewSelectSchema.pick({ uuid: true }))
  .output(RoleSelectSchema.nullable())
  .handler(async ({ input }) => {
    try {
      const [role] = await db
        .select({
          role: Role,
        })
        .from(Interview)
        .innerJoin(Role, eq(Interview.roleUuid, Role.uuid))
        .where(eq(Interview.uuid, input.uuid))
        .limit(1);

      return role?.role ?? null;
    } catch (error) {
      throw new Error(
        `Failed to fetch role for interview ${input.uuid}: ${String(error)}`,
      );
    }
  });
