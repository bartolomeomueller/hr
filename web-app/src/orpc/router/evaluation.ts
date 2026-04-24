import { ORPCError } from "@orpc/server";
import { asc, eq } from "drizzle-orm";
import z from "zod";
import { db } from "@/db";
import { Evaluation, FlowStep, Interview, Question } from "@/db/schema";
import { canUserAccessInterview } from "../auth-helper";
import { base } from "../base";
import { authMiddleware, debugMiddleware } from "../middlewares";
import {
  AnswerSelectSchema,
  CandidateSelectSchema,
  EvaluationInsertSchema,
  EvaluationSelectSchema,
  FlowStepSelectSchema,
  FlowVersionSelectSchema,
  InterviewSelectSchema,
  QuestionSelectSchema,
  RoleSelectSchema,
} from "../schema";

export const getEvaluationRelatedDataByInterviewUuid = base
  .use(authMiddleware)
  .use(debugMiddleware)
  .input(InterviewSelectSchema.pick({ uuid: true }))
  .output(
    z
      .object({
        role: RoleSelectSchema,
        flowVersion: FlowVersionSelectSchema,
        flowSteps: z.array(FlowStepSelectSchema),
        questions: z.array(QuestionSelectSchema),
        interview: InterviewSelectSchema,
        candidate: CandidateSelectSchema,
        answers: z.array(AnswerSelectSchema),
        evaluations: z.array(EvaluationSelectSchema),
      })
      .nullable(),
  )
  .handler(async ({ input, context }) => {
    if (
      !(await canUserAccessInterview({
        interviewUuid: input.uuid,
        userId: context.user.id,
      }))
    ) {
      throw new ORPCError("FORBIDDEN");
    }

    const interviewWithRelations = await db.query.Interview.findFirst({
      where: eq(Interview.uuid, input.uuid),
      with: {
        candidate: true,
        answers: true,
        evaluations: true,
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

    if (!interviewWithRelations) return null;

    const { candidate, answers, evaluations, flowVersion, ...interview } =
      interviewWithRelations;
    const { role, flowSteps, ...flowVersionData } = flowVersion;

    if (!candidate) return null;

    return {
      role,
      flowVersion: flowVersionData,
      flowSteps: flowSteps.map(
        ({ questions: _questions, ...flowStep }) => flowStep,
      ),
      questions: flowSteps.flatMap((flowStep) => flowStep.questions),
      interview,
      candidate,
      answers,
      evaluations,
    };
  });

export const createEvaluation = base
  .use(authMiddleware)
  .use(debugMiddleware)
  .input(
    EvaluationInsertSchema.pick({
      interviewUuid: true,
      hardSkillsScore: true,
      softSkillsScore: true,
      culturalAddScore: true,
      potentialScore: true,
      finalScore: true,
    }),
  )
  .output(EvaluationSelectSchema)
  .handler(async ({ input, context }) => {
    const evaluationScores = {
      hardSkillsScore: input.hardSkillsScore,
      softSkillsScore: input.softSkillsScore,
      culturalAddScore: input.culturalAddScore,
      potentialScore: input.potentialScore,
      finalScore: input.finalScore,
    };

    if (
      !(await canUserAccessInterview({
        interviewUuid: input.interviewUuid,
        userId: context.user.id,
      }))
    ) {
      throw new ORPCError("FORBIDDEN");
    }

    const [evaluation] = await db
      .insert(Evaluation)
      .values({
        interviewUuid: input.interviewUuid,
        userId: context.user.id,
        ...evaluationScores,
      })
      .onConflictDoUpdate({
        target: [Evaluation.interviewUuid, Evaluation.userId],
        set: evaluationScores,
      })
      .returning();

    if (!evaluation) {
      throw new Error("Failed to create or update evaluation.");
    }

    return evaluation;
  });
