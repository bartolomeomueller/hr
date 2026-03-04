import { os } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  Candidate,
  Interview,
  InterviewStep,
  Question,
  QuestionSet,
  Role,
} from "@/db/schema";
import {
  CandidateInsertSchema,
  InterviewDetailsSchema,
  InterviewSelectSchema,
  InterviewStepSelectSchema,
  RoleSelectSchema,
} from "@/orpc/schema";

export const createInterviewForRole = os
  .input(
    RoleSelectSchema.pick({
      uuid: true,
    }),
  )
  .output(InterviewSelectSchema.pick({ uuid: true }))
  // TODO put in transaction
  .handler(async ({ input }) => {
    try {
      const latestQuestionSet = await db.query.QuestionSet.findFirst({
        where: eq(QuestionSet.roleUuid, input.uuid),
        orderBy: [desc(QuestionSet.version)],
      });

      if (!latestQuestionSet) {
        throw new Error(`No question set found for role ${input.uuid}`);
      }

      const new_interview = await db
        .insert(Interview)
        .values({
          questionSetUuid: latestQuestionSet.uuid,
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
          questionSetUuid: true,
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

// NOTE Maybe have a look into json aggregation to make it one roundtrip for better performance
export const getInterviewRelatedDataByInterviewUuid = os
  .input(InterviewSelectSchema.pick({ uuid: true }))
  .output(InterviewDetailsSchema.nullable())
  .handler(async ({ input }) => {
    try {
      // // sleep for testing loading states for a second
      // await new Promise((resolve) => setTimeout(resolve, 5000));
      // console.log(
      //   "Fetching interview related data for interview uuid",
      //   input.uuid,
      // );

      return await db.transaction(async (_) => {
        const [roleAndInterview] = await db
          .select({
            questionSet: QuestionSet,
            role: Role,
            interview: Interview,
            candidate: Candidate,
          })
          .from(Interview)
          .innerJoin(
            QuestionSet,
            eq(Interview.questionSetUuid, QuestionSet.uuid),
          )
          .innerJoin(Role, eq(QuestionSet.roleUuid, Role.uuid))
          .leftJoin(Candidate, eq(Interview.candidateUuid, Candidate.uuid)) // might be null
          .where(eq(Interview.uuid, input.uuid))
          .limit(1);

        if (!roleAndInterview) return null;

        const questions = await db.query.Question.findMany({
          where: eq(
            Question.questionSetUuid,
            roleAndInterview.questionSet.uuid,
          ),
        });

        const steps = await db.query.InterviewStep.findMany({
          where: eq(InterviewStep.interviewUuid, input.uuid),
        });

        return {
          role: roleAndInterview.role,
          questionSet: roleAndInterview.questionSet,
          interview: roleAndInterview.interview,
          candidate: roleAndInterview.candidate,
          questions,
          steps,
        };
      });
    } catch (error) {
      throw new Error(
        `Failed to fetch role and interview for interview uuid ${input.uuid}: ${String(error)}`,
      );
    }
  });

export const saveInterviewStepAnswer = os
  .input(
    InterviewStepSelectSchema.pick({
      interviewUuid: true,
      questionUuid: true,
      answerPayload: true,
    }),
  )
  .output(InterviewStepSelectSchema)
  .handler(async ({ input }) => {
    try {
      const [existingStep] = await db
        .select({
          uuid: InterviewStep.uuid,
        })
        .from(InterviewStep)
        .where(
          and(
            eq(InterviewStep.interviewUuid, input.interviewUuid),
            eq(InterviewStep.questionUuid, input.questionUuid),
          ),
        )
        .limit(1);

      if (existingStep) {
        const [updatedStep] = await db
          .update(InterviewStep)
          .set({
            answerPayload: input.answerPayload,
            answeredAt: new Date(),
          })
          .where(eq(InterviewStep.uuid, existingStep.uuid))
          .returning();

        return updatedStep;
      }

      const [insertedStep] = await db
        .insert(InterviewStep)
        .values({
          interviewUuid: input.interviewUuid,
          questionUuid: input.questionUuid,
          answerPayload: input.answerPayload,
          answeredAt: new Date(),
        })
        .returning();

      return insertedStep;
    } catch (error) {
      throw new Error(
        `Failed to save interview step for interview ${input.interviewUuid}: ${String(error)}`,
      );
    }
  });

// NOTE This handler needs two roundtrips from the server to the database. This can be optimized for performance by using a CTE.
export const addParticipantToInterview = os
  .input(
    CandidateInsertSchema.extend({
      interviewUuid: InterviewSelectSchema.shape.uuid,
    }),
  )
  .output(InterviewSelectSchema.pick({ uuid: true, candidateUuid: true }))
  .handler(async ({ input }) => {
    try {
      return await db.transaction(async (tx) => {
        const [candidate] = await tx
          .insert(Candidate)
          .values({
            name: input.name,
            email: input.email,
          })
          .returning({
            uuid: Candidate.uuid,
          });

        const [updatedInterview] = await tx
          .update(Interview)
          .set({
            candidateUuid: candidate.uuid,
          })
          .where(eq(Interview.uuid, input.interviewUuid))
          .returning({
            uuid: Interview.uuid,
            candidateUuid: Interview.candidateUuid,
          });

        if (!updatedInterview) {
          tx.rollback();
        }

        return updatedInterview;
      });
    } catch (error) {
      throw new Error(
        `Failed to add participant to interview ${input.interviewUuid}: ${String(error)}`,
      );
    }
  });
