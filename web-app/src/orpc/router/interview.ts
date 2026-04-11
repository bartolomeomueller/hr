import { os } from "@orpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import z from "zod";
import { db } from "@/db";
import {
  Answer,
  Candidate,
  FlowStep,
  FlowVersion,
  Interview,
  Question,
} from "@/db/schema";
import {
  AnswerSelectSchema,
  CandidateInsertSchema,
  CandidateSelectSchema,
  FlowStepSelectSchema,
  FlowVersionSelectSchema,
  InterviewSelectSchema,
  QuestionSelectSchema,
  RoleSelectSchema,
} from "@/orpc/schema";
import { debugMiddleware } from "../middlewares";

export const createInterviewForRoleUuid = os
  .use(debugMiddleware)
  .input(
    z.object({
      roleUuid: RoleSelectSchema.shape.uuid,
    }),
  )
  // Only return the interview uuid to keep the api lean and not introduce unnecessary coupling between the frontend and backend.
  .output(InterviewSelectSchema.pick({ uuid: true }))
  .handler(async ({ input }) => {
    const flowVersionUuidSubquery = db
      .select({ value: FlowVersion.uuid })
      .from(FlowVersion)
      .where(and(eq(FlowVersion.roleUuid, input.roleUuid)))
      .orderBy(desc(FlowVersion.version))
      .limit(1);

    const interview = await db
      .insert(Interview)
      .values({
        // Because of a drizzle limitation, this subquery needs to be casted to sql
        flowVersionUuid: sql`${flowVersionUuidSubquery}`,
      })
      .returning({
        uuid: Interview.uuid,
      });
    return interview[0];
  });

export const getQuestionsByInterviewUuid = os
  .use(debugMiddleware)
  .input(InterviewSelectSchema.pick({ uuid: true }))
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
    const interview = await db.query.Interview.findFirst({
      where: eq(Interview.uuid, input.uuid),
      with: {
        flowVersion: {
          with: {
            role: true,
            flowSteps: {
              orderBy: [asc(FlowStep.position)],
              with: {
                questions: {
                  orderBy: [asc(Question.position)],
                },
              },
            },
          },
        },
      },
    });

    if (!interview) return null;

    const { flowVersion } = interview;
    const { role, flowSteps, ...flowVersionData } = flowVersion;

    return {
      role,
      flowVersion: flowVersionData,
      flowSteps: flowSteps.map(({ questions: _questions, ...flowStep }) => flowStep),
      questions: flowSteps.flatMap((flowStep) => flowStep.questions),
    };
  });

// NOTE Maybe have a look into json aggregation to make it one roundtrip for better performance
export const getInterviewRelatedDataByInterviewUuid = os
  .use(debugMiddleware)
  .input(InterviewSelectSchema.pick({ uuid: true }))
  .output(
    z
      .object({
        interview: InterviewSelectSchema,
        candidate: CandidateSelectSchema.nullable(),
        answers: z.array(AnswerSelectSchema),
      })
      .nullable(),
  )
  .handler(async ({ input }) => {
    return await db.transaction(async (tx) => {
      const [roleAndInterview] = await tx
        .select({
          interview: Interview,
          candidate: Candidate,
          // TODO look into if this works as soon as it can be tested
          // answers: sql`(
          //   SELECT json_agg(answers.*)
          //   FROM ${Answer} AS answers
          //   WHERE answers.interview_uuid = ${Interview.uuid}
          // )`,
        })
        .from(Interview)
        .leftJoin(Candidate, eq(Interview.candidateUuid, Candidate.uuid)) // candidate might be null
        .where(eq(Interview.uuid, input.uuid))
        .limit(1);

      if (!roleAndInterview) return null;

      const answers = await tx
        .select()
        .from(Answer)
        .where(eq(Answer.interviewUuid, input.uuid));

      return {
        interview: roleAndInterview.interview,
        candidate: roleAndInterview.candidate,
        answers,
      };
    });
  });

// NOTE This handler needs two roundtrips from the server to the database. This can be optimized for performance by using a CTE.
export const addParticipantToInterview = os
  .use(debugMiddleware)
  .input(
    CandidateInsertSchema.extend({
      interviewUuid: InterviewSelectSchema.shape.uuid,
    }),
  )
  .output(InterviewSelectSchema.pick({ uuid: true, candidateUuid: true }))
  .handler(async ({ input }) => {
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
        throw new Error(
          `Interview ${input.interviewUuid} was not found while assigning a candidate.`,
        );
      }

      return updatedInterview;
    });
  });
