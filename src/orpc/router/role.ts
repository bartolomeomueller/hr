import { os } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { Question, QuestionSet, Role } from "@/db/schema";
import { RoleSelectSchema, RoleWithQuestionsSchema } from "@/orpc/schema";

export const getRoleAndItsQuestionsByUuid = os
  .input(RoleSelectSchema.pick({ uuid: true }))
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
          .where(eq(Role.uuid, input.uuid))
          .orderBy(desc(QuestionSet.version))
          .limit(1);

        if (result.length === 0) {
          return null;
        }

        const { role, questionSet } = result[0];
        if (!questionSet) {
          return {
            role,
            questionSet: null,
            questions: [],
          };
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
      throw new Error(`Failed to fetch role ${input.uuid}: ${String(error)}`);
    }
  });
