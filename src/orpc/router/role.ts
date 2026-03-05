import { os } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { Question, QuestionSet, Role } from "@/db/schema";
import { RoleSelectSchema, RoleWithQuestionsSchema } from "@/orpc/schema";

export const getRoleAndItsQuestionsBySlug = os
  .input(RoleSelectSchema.pick({ slug: true }))
  .output(RoleWithQuestionsSchema.nullable())
  .handler(async ({ input }) => {
    try {
      return await db.transaction(async (_) => {
        const result = await db
          .select({
            role: Role,
            questionSet: QuestionSet,
          })
          .from(Role)
          .leftJoin(QuestionSet, eq(QuestionSet.roleUuid, Role.uuid))
          .where(eq(Role.slug, input.slug))
          .orderBy(desc(QuestionSet.version))
          .limit(1);

        if (result.length === 0) {
          return null;
        }
        const { role, questionSet } = result[0];

        if (!role || !questionSet) {
          return null;
        }

        const questions = await db.query.Question.findMany({
          where: eq(Question.questionSetUuid, questionSet.uuid),
        });

        return {
          role,
          questionSet,
          questions,
        };
      });
    } catch (error) {
      throw new Error(`Failed to fetch role ${input.slug}: ${String(error)}`);
    }
  });
