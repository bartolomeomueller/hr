import { os } from "@orpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import z from "zod";
import { db } from "@/db";
import {
  Answer,
  Candidate,
  FlowStep,
  FlowVersion,
  Interview,
  Question,
  Role,
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
                'questionPayload', ${Question.questionPayload},
                'isCv', ${Question.isCv}
              )
              order by ${Question.position}
            )
          `,
      })
      .from(FlowVersion)
      .innerJoin(Role, eq(Role.uuid, FlowVersion.roleUuid))
      .innerJoin(FlowStep, eq(FlowStep.flowVersionUuid, FlowVersion.uuid))
      .innerJoin(Question, eq(Question.flowStepUuid, FlowStep.uuid))
      .innerJoin(Interview, eq(Interview.flowVersionUuid, FlowVersion.uuid))
      .where(eq(Interview.uuid, input.uuid))
      // groupBy is not hierarchical, it just creates groups of rows with the same role and flow version
      // It is not needed here, as there is only one interview and thus one role and flow version.
      .groupBy(Role.uuid, FlowVersion.uuid);

    if (!result) return null;

    // Because of the joins, there is one row for each question, so flow steps are duplicated
    // This keeps the order of flow steps intact, but removes duplicates
    result.flowSteps = [
      ...new Map(result.flowSteps.map((step) => [step.uuid, step])).values(),
    ];

    return result;
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
    try {
      return await db.transaction(async (_) => {
        const [roleAndInterview] = await db
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

        const answers = await db.query.Answer.findMany({
          where: eq(Answer.interviewUuid, input.uuid),
        });

        return {
          interview: roleAndInterview.interview,
          candidate: roleAndInterview.candidate,
          answers,
        };
      });
    } catch (error) {
      throw new Error(
        `Failed to fetch role and interview for interview uuid ${input.uuid}: ${String(error)}`,
      );
    }
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
