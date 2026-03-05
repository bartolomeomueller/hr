import { os } from "@orpc/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { Question, QuestionSet, Role } from "@/db/schema";
import { RoleSelectSchema, RoleWithQuestionsSchema } from "@/orpc/schema";

// FIXME the fetching of the question set is not necessary, remove in the future
export const getRoleByUuid = os
  .input(RoleSelectSchema.pick({ uuid: true }))
  .output(RoleWithQuestionsSchema.nullable())
  .handler(async ({ input }) => {
    try {
      // sleep 5 seconds for timing testing of streaming ssr
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const role = await db.query.Role.findFirst({
        where: eq(Role.uuid, input.uuid),
        columns: {
          uuid: true,
          roleName: true,
        },
      });

      if (!role) {
        return null;
      }

      const questionSet = await db.query.QuestionSet.findFirst({
        where: eq(QuestionSet.roleUuid, input.uuid),
        orderBy: (table, { desc }) => [desc(table.version)],
      });

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
    } catch (error) {
      throw new Error(`Failed to fetch role ${input.uuid}: ${String(error)}`);
    }
  });
