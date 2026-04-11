import { and, asc, desc, eq, sql } from "drizzle-orm";
import z from "zod";
import { db } from "@/db";
import {
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
import { base } from "../base";
import { debugMiddleware } from "../middlewares";

export const createInterviewForRoleUuid = base
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

export const getQuestionsByInterviewUuid = base
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
      flowSteps: flowSteps.map(
        ({ questions: _questions, ...flowStep }) => flowStep,
      ),
      questions: flowSteps.flatMap((flowStep) => flowStep.questions),
    };
  });

export const getInterviewRelatedDataByInterviewUuid = base
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
    const interviewWithRelations = await db.query.Interview.findFirst({
      where: eq(Interview.uuid, input.uuid),
      with: {
        candidate: true,
        answers: true,
      },
    });

    if (!interviewWithRelations) return null;

    const { candidate, answers, ...interview } = interviewWithRelations;

    return {
      interview,
      candidate,
      answers,
    };
  });

// This handler needs two roundtrips from the server to the database. This could be optimized for performance by using a CTE,
// but then the candidate creation and interview update would not be atomic together anymore. The candidate would be created,
// but if the interview update fails, the candidate would be orphaned without an associated interview.
// You could also use a conditional insert, but that would detriment the readability of the code.
export const addParticipantToInterview = base
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
