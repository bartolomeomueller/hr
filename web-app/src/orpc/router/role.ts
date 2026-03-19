import { os } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import z from "zod";
import { db } from "@/db";
import { FlowStep, FlowVersion, Interview, Question, Role } from "@/db/schema";
import {
  FlowStepSelectSchema,
  FlowVersionSelectSchema,
  InterviewSelectSchema,
  QuestionSelectSchema,
  RoleSelectSchema,
} from "@/orpc/schema";
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
    try {
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
    } catch (error) {
      throw new Error(`Failed to fetch role ${input.slug}: ${String(error)}`);
    }
  });

export const getQuestionsByRoleSlugAndFlowVersion = os
  .use(debugMiddleware)
  .input(
    z.object({
      roleSlug: RoleSelectSchema.shape.slug,
      flowVersion: FlowVersionSelectSchema.shape.version,
    }),
  )
  .output(
    z
      .object({
        role: RoleSelectSchema,
        flowVersion: FlowVersionSelectSchema,
        flowSteps: z.array(FlowStepSelectSchema),
        questions: z.array(QuestionSelectSchema),
      })
      .nullable(),
  )
  .handler(async ({ input }) => {
    try {
      const [result] = await db
        .select({
          role: Role,
          flowVersion: FlowVersion,
          flowSteps: sql<z.infer<typeof FlowStepSelectSchema>[]>`
            json_agg(
              json_build_object(
                'uuid', ${FlowStep.uuid},
                'flowVersionUuid', ${FlowStep.flowVersionUuid},
                'position', ${FlowStep.position},
                'kind', ${FlowStep.kind}
              )
              order by ${FlowStep.position}
            )
          `,
          questions: sql<z.infer<typeof QuestionSelectSchema>[]>`
            json_agg(
              json_build_object(
                'uuid', ${Question.uuid},
                'flowStepUuid', ${Question.flowStepUuid},
                'position', ${Question.position},
                'questionType', ${Question.questionType},
                'questionPayload', ${Question.questionPayload}
              )
              order by ${Question.position}
            )
          `,
        })
        .from(FlowVersion)
        .innerJoin(Role, eq(Role.uuid, FlowVersion.roleUuid))
        .innerJoin(FlowStep, eq(FlowStep.flowVersionUuid, FlowVersion.uuid))
        .innerJoin(Question, eq(Question.flowStepUuid, FlowStep.uuid))
        .where(
          and(
            eq(Role.slug, input.roleSlug),
            eq(FlowVersion.version, input.flowVersion),
          ),
        )
        // groupBy is not hierarchical, it just creates groups of rows with the same role and flow version
        .groupBy(Role.uuid, FlowVersion.uuid);

      if (!result) return null;

      // Because of the joins, there is one row for each question, so flow steps are duplicated
      // This keeps the order of flow steps intact, but removes duplicates
      result.flowSteps = [
        ...new Map(result.flowSteps.map((step) => [step.uuid, step])).values(),
      ];

      return result;
    } catch (error) {
      throw new Error(
        `Failed to fetch questions for role ${input.roleSlug} and flow version ${input.flowVersion}: ${String(error)}`,
      );
    }
  });

// This function exists only as a helper function for the interview page, when the user modified the url and removed these params.
export const getRoleSlugAndFlowVersionByInterviewUuid = os
  .use(debugMiddleware)
  .input(InterviewSelectSchema.pick({ uuid: true }))
  .output(
    z
      .object({
        roleSlug: RoleSelectSchema.shape.slug,
        flowVersion: FlowVersionSelectSchema.shape.version,
      })
      .nullable(),
  )
  .handler(async ({ input }) => {
    try {
      const [result] = await db
        .select({
          roleSlug: Role.slug,
          flowVersion: FlowVersion.version,
        })
        .from(Interview)
        .innerJoin(FlowVersion, eq(FlowVersion.uuid, Interview.flowVersionUuid))
        .innerJoin(Role, eq(Role.uuid, FlowVersion.roleUuid))
        .where(eq(Interview.uuid, input.uuid))
        .limit(1);
      if (!result) return null;
      return result;
    } catch (error) {
      throw new Error(
        `Failed to fetch role slug and question set version for interview ${input.uuid}: ${String(error)}`,
      );
    }
  });
