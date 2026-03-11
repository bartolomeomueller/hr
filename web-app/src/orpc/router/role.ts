import { os } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import z from "zod";
import { db } from "@/db";
import { Interview, Question, QuestionSet, Role } from "@/db/schema";
import {
  InterviewSelectSchema,
  QuestionSelectSchema,
  QuestionSetSelectSchema,
  RoleSelectSchema,
} from "@/orpc/schema";
import { debugMiddleware } from "../debug-middleware";

export const getRoleAndItsQuestionSetBySlug = os
  .use(debugMiddleware)
  .input(RoleSelectSchema.pick({ slug: true }))
  .output(
    z
      .object({
        role: RoleSelectSchema,
        questionSet: QuestionSetSelectSchema,
      })
      .nullable(),
  )
  .handler(async ({ input }) => {
    try {
      const [result] = await db
        .select({
          role: Role,
          questionSet: QuestionSet,
        })
        .from(Role)
        .innerJoin(QuestionSet, eq(QuestionSet.roleUuid, Role.uuid)) // When no question set exists, the role should not be visible to the user
        .where(eq(Role.slug, input.slug))
        .orderBy(desc(QuestionSet.version))
        .limit(1);

      if (!result) return null;

      return result;
    } catch (error) {
      throw new Error(`Failed to fetch role ${input.slug}: ${String(error)}`);
    }
  });

export const getQuestionsByRoleSlugAndQuestionSetVersion = os
  .use(debugMiddleware)
  .input(
    z.object({
      roleSlug: RoleSelectSchema.shape.slug,
      questionSetVersion: QuestionSetSelectSchema.shape.version,
    }),
  )
  .output(
    z
      .object({
        role: RoleSelectSchema,
        questionSet: QuestionSetSelectSchema,
        questions: z.array(QuestionSelectSchema),
      })
      .nullable(),
  )
  .handler(async ({ input }) => {
    try {
      const [result] = await db
        .select({
          role: Role,
          questionSet: QuestionSet,
          questions: sql<z.infer<typeof QuestionSelectSchema>[]>`
            json_agg(
              json_build_object(
                'uuid', ${Question.uuid},
                'questionSetUuid', ${Question.questionSetUuid},
                'position', ${Question.position},
                'questionType', ${Question.questionType},
                'questionPayload', ${Question.questionPayload},
                'answerType', ${Question.answerType}
              )
              order by ${Question.position}
            )
          `,
        })
        .from(QuestionSet)
        .innerJoin(Role, eq(Role.uuid, QuestionSet.roleUuid))
        .innerJoin(Question, eq(Question.questionSetUuid, QuestionSet.uuid))
        .where(
          and(
            eq(Role.slug, input.roleSlug),
            eq(QuestionSet.version, input.questionSetVersion),
          ),
        )
        // groupBy is not hirachical, it just creates groups of rows with the same role and question set
        .groupBy(Role.uuid, QuestionSet.uuid);

      if (!result) return null;

      return result;
    } catch (error) {
      throw new Error(
        `Failed to fetch questions for role ${input.roleSlug} and question set version ${input.questionSetVersion}: ${String(error)}`,
      );
    }
  });

// This function exists only as a helper function for the interview page, when the user modified the url and removed these params.
export const getRoleSlugAndQuestionSetVersionByInterviewUuid = os
  .use(debugMiddleware)
  .input(InterviewSelectSchema.pick({ uuid: true }))
  .output(
    z
      .object({
        roleSlug: RoleSelectSchema.shape.slug,
        questionSetVersion: QuestionSetSelectSchema.shape.version,
      })
      .nullable(),
  )
  .handler(async ({ input }) => {
    try {
      const [result] = await db
        .select({
          roleSlug: Role.slug,
          questionSetVersion: QuestionSet.version,
        })
        .from(Interview)
        .innerJoin(QuestionSet, eq(QuestionSet.uuid, Interview.questionSetUuid))
        .innerJoin(Role, eq(Role.uuid, QuestionSet.roleUuid))
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
