import { ORPCError } from "@orpc/server";
import { and, desc, eq, exists } from "drizzle-orm";
import z from "zod";
import { db } from "@/db";
import { Team, TeamMember } from "@/db/auth-schema";
import { DocumentAnswerPayloadType } from "@/db/payload-types";
import { Answer, FlowVersion, Interview, Question, Role } from "@/db/schema";
import {
  CandidateSelectSchema,
  EvaluationSelectSchema,
  FlowVersionSelectSchema,
  InterviewSelectSchema,
  RoleSelectSchema,
} from "@/orpc/schema";
import { base } from "../base";
import { authMiddleware, debugMiddleware } from "../middlewares";

export const getRoleAndItsFlowVersionBySlug = base
  .use(debugMiddleware)
  .input(RoleSelectSchema.pick({ slug: true }))
  .output(
    z
      .object({
        role: RoleSelectSchema,
        flowVersion: FlowVersionSelectSchema,
      })
      .nullable(),
  )
  .handler(async ({ input }) => {
    const [result] = await db
      .select({
        role: Role,
        flowVersion: FlowVersion,
      })
      .from(Role)
      .innerJoin(FlowVersion, eq(FlowVersion.roleUuid, Role.uuid)) // When no flow version exists, the role should not be visible to the user
      .where(eq(Role.slug, input.slug))
      .orderBy(desc(FlowVersion.version))
      .limit(1);

    if (!result) return null;

    return result;
  });

export const getAllRolesForCurrentUser = base
  .use(authMiddleware)
  .use(debugMiddleware)
  .output(z.array(RoleSelectSchema))
  .handler(async ({ context }) => {
    const roles = await db
      .select({ role: Role })
      .from(Role)
      .innerJoin(Team, eq(Team.id, Role.teamId))
      .innerJoin(TeamMember, eq(TeamMember.teamId, Team.id))
      .where(eq(TeamMember.userId, context.user.id));

    return roles.map(({ role }) => role);
  });

export const getAllFinishedInterviewsForRoleByRoleSlug = base
  .use(authMiddleware)
  .use(debugMiddleware)
  .input(RoleSelectSchema.pick({ slug: true }))
  .output(
    z.array(
      z.object({
        interview: InterviewSelectSchema,
        candidate: CandidateSelectSchema,
        cvDocument: DocumentAnswerPayloadType.options[0].shape.documents.element,
        evaluations: z.array(EvaluationSelectSchema),
      }),
    ),
  )
  .handler(async ({ input, context }) => {
    const [authorizedRole] = await db
      .select({ uuid: Role.uuid })
      .from(Role)
      .innerJoin(Team, eq(Team.id, Role.teamId))
      .innerJoin(TeamMember, eq(TeamMember.teamId, Team.id))
      .where(
        and(eq(Role.slug, input.slug), eq(TeamMember.userId, context.user.id)),
      )
      .limit(1);

    if (!authorizedRole) {
      throw new ORPCError("FORBIDDEN");
    }

    const flowVersions = await db.query.FlowVersion.findMany({
      where: eq(FlowVersion.roleUuid, authorizedRole.uuid),
      with: {
        interviews: {
          where: eq(Interview.isFinished, true),
          with: {
            candidate: true,
            evaluations: true,
            answers: {
              where: exists(
                db
                  .select({ uuid: Question.uuid })
                  .from(Question)
                  .where(
                    and(
                      eq(Question.uuid, Answer.questionUuid),
                      eq(Question.isCv, true),
                    ),
                  ),
              ),
            },
          },
        },
      },
    });

    return flowVersions.flatMap((flowVersion) =>
      flowVersion.interviews.flatMap((interviewWithRelations) => {
        const { candidate, evaluations, answers, ...interview } =
          interviewWithRelations;

        if (!candidate) return [];

        const cvAnswer = answers[0];

        if (!cvAnswer) return [];

        const parsedCvAnswer = DocumentAnswerPayloadType.safeParse(
          cvAnswer.answerPayload,
        );
        const cvDocument = parsedCvAnswer.success
          ? parsedCvAnswer.data.kind === "documents"
            ? parsedCvAnswer.data.documents[0]
            : undefined
          : undefined;

        if (!cvDocument) return [];

        return {
          interview,
          candidate,
          cvDocument,
          evaluations,
        };
      }),
    );
  });
