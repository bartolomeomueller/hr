import { os } from "@orpc/server";
import { and, eq, sql } from "drizzle-orm";
import z from "zod";
import { db } from "@/db";
import { VideoAnswerPayloadType } from "@/db/payload-types";
import { Answer, Candidate, FlowVersion, Interview } from "@/db/schema";
import { videoProcessingQueue } from "@/lib/bullmq";
import {
  AnswerSelectSchema,
  CandidateInsertSchema,
  FlowVersionSelectSchema,
  InterviewSelectSchema,
  InterviewWithCandidateAndAnswersSchema,
  RoleSelectSchema,
} from "@/orpc/schema";
import { debugMiddleware } from "../debug-middleware";

export const createInterviewForRoleAndFlowVersion = os
  .use(debugMiddleware)
  .input(
    z.object({
      roleUuid: RoleSelectSchema.shape.uuid,
      flowVersion: FlowVersionSelectSchema.shape.version,
    }),
  )
  // Only return the interview uuid to keep the api lean and not introduce unnecessary coupling between the frontend and backend.
  .output(InterviewSelectSchema.pick({ uuid: true }))
  .handler(async ({ input }) => {
    try {
      const flowVersionUuidSubquery = db
        .select({ value: FlowVersion.uuid })
        .from(FlowVersion)
        .where(
          and(
            eq(FlowVersion.roleUuid, input.roleUuid),
            eq(FlowVersion.version, input.flowVersion),
          ),
        )
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
    } catch (error) {
      throw new Error(
        `Failed to create interview for role ${input.roleUuid}: ${String(error)}`,
      );
    }
  });

// NOTE Maybe have a look into json aggregation to make it one roundtrip for better performance
export const getInterviewRelatedDataByInterviewUuid = os
  .use(debugMiddleware)
  .input(InterviewSelectSchema.pick({ uuid: true }))
  .output(InterviewWithCandidateAndAnswersSchema.nullable())
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

// NOTE maybe move to an upsert
export const saveAnswer = os
  .use(debugMiddleware)
  .input(
    AnswerSelectSchema.pick({
      interviewUuid: true,
      questionUuid: true,
      answerPayload: true,
    }),
  )
  .output(AnswerSelectSchema)
  .handler(async ({ input }) => {
    try {
      const [existingStep] = await db
        .select({
          uuid: Answer.uuid,
        })
        .from(Answer)
        .where(
          and(
            eq(Answer.interviewUuid, input.interviewUuid),
            eq(Answer.questionUuid, input.questionUuid),
          ),
        )
        .limit(1);

      // TODO move this to a correct place
      const videoAnswerPayloadResult = VideoAnswerPayloadType.safeParse(
        input.answerPayload,
      );
      if (videoAnswerPayloadResult.success) {
        await videoProcessingQueue.add("video-processing", {
          uuid: videoAnswerPayloadResult.data.videoUuid,
        });
      }

      if (existingStep) {
        const [updatedStep] = await db
          .update(Answer)
          .set({
            answerPayload: input.answerPayload,
            answeredAt: new Date(),
          })
          .where(eq(Answer.uuid, existingStep.uuid))
          .returning();

        return updatedStep;
      }

      const [insertedStep] = await db
        .insert(Answer)
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
