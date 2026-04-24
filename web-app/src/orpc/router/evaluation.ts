import { ORPCError } from "@orpc/server";
import { asc, eq } from "drizzle-orm";
import z from "zod";
import { db } from "@/db";
import { FlowStep, Interview, Question } from "@/db/schema";
import { base } from "../base";
import { authMiddleware, debugMiddleware } from "../middlewares";
import {
  AnswerSelectSchema,
  CandidateSelectSchema,
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
        candidate: CandidateSelectSchema.nullable(),
        answers: z.array(AnswerSelectSchema),
        evaluations: z.array(EvaluationSelectSchema),
      })
      .nullable(),
  )
  .handler(async ({ input, context }) => {
    const interviewWithRelations = await db.query.Interview.findFirst({
      where: eq(Interview.uuid, input.uuid),
      with: {
        candidate: true,
        answers: true,
        evaluations: true,
        flowVersion: {
          with: {
            role: {
              with: {
                team: {
                  with: {
                    teamMembers: true,
                  },
                },
              },
            },
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
    const { team: _team, ...roleData } = role;

    if (
      !role.team.teamMembers.some(
        (teamMember) => teamMember.userId === context.user.id,
      )
    ) {
      throw new ORPCError("FORBIDDEN");
    }

    return {
      role: roleData,
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
