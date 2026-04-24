import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupIntegrationTestDatabase } from "@/test/integration-test-database";

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth.server", () => ({
  auth: {
    api: {
      getSession: getSessionMock,
    },
  },
}));

vi.mock("@/lib/bullmq.server", () => ({
  enqueueVideoProcessingJob: vi.fn(),
  cancelVideoProcessingJob: vi.fn(),
}));

await setupIntegrationTestDatabase();

const [
  { Organization, Team, TeamMember, User },
  { db },
  schema,
  { default: router },
] = await Promise.all([
  import("@/db/auth-schema"),
  import("@/db"),
  import("@/db/schema"),
  import("@/orpc/router"),
]);

const client = createRouterClient(router, {
  context: () => ({
    headers: new Headers(),
  }),
});

describe("getEvaluationRelatedDataByInterviewUuid", () => {
  const createdRecords: Array<{
    userId: string;
    organizationId: string;
    teamId: string;
    teamMemberId: string;
    roleUuid: string;
    flowVersionUuid: string;
    flowStepUuids: string[];
    questionUuids: string[];
    candidateUuid: string;
    interviewUuid: string;
    answerUuid: string;
    evaluationUuid: string;
  }> = [];

  beforeEach(() => {
    getSessionMock.mockReset();
  });

  afterEach(async () => {
    for (const record of createdRecords.splice(0).reverse()) {
      await db
        .delete(schema.Evaluation)
        .where(eq(schema.Evaluation.uuid, record.evaluationUuid));
      await db
        .delete(schema.Answer)
        .where(eq(schema.Answer.uuid, record.answerUuid));
      await db
        .delete(schema.Interview)
        .where(eq(schema.Interview.uuid, record.interviewUuid));
      await db
        .delete(schema.Candidate)
        .where(eq(schema.Candidate.uuid, record.candidateUuid));
      for (const questionUuid of record.questionUuids) {
        await db
          .delete(schema.Question)
          .where(eq(schema.Question.uuid, questionUuid));
      }
      for (const flowStepUuid of record.flowStepUuids) {
        await db
          .delete(schema.FlowStep)
          .where(eq(schema.FlowStep.uuid, flowStepUuid));
      }
      await db
        .delete(schema.FlowVersion)
        .where(eq(schema.FlowVersion.uuid, record.flowVersionUuid));
      await db.delete(schema.Role).where(eq(schema.Role.uuid, record.roleUuid));
      await db.delete(TeamMember).where(eq(TeamMember.id, record.teamMemberId));
      await db.delete(Team).where(eq(Team.id, record.teamId));
      await db.delete(User).where(eq(User.id, record.userId));
      await db
        .delete(Organization)
        .where(eq(Organization.id, record.organizationId));
    }
  });

  it("returns the evaluation data for an interview owned by the current user's team", async () => {
    const fixture = await createEvaluationRelatedDataFixture();
    createdRecords.push(fixture);
    getSessionMock.mockResolvedValue({
      session: { id: "session-id" },
      user: { id: fixture.userId },
    });

    const result = await client.getEvaluationRelatedDataByInterviewUuid({
      uuid: fixture.interviewUuid,
    });

    if (!result) {
      throw new Error(
        "Expected evaluation related data for the seeded interview.",
      );
    }

    expect(result.role.uuid).toBe(fixture.roleUuid);
    expect(result.role).not.toHaveProperty("team");
    expect(result.flowVersion.uuid).toBe(fixture.flowVersionUuid);
    expect(result.flowSteps.map((flowStep) => flowStep.uuid)).toEqual(
      fixture.flowStepUuids,
    );
    expect(result.questions.map((question) => question.uuid)).toEqual(
      fixture.questionUuids,
    );
    expect(result.interview.uuid).toBe(fixture.interviewUuid);
    expect(result.candidate?.uuid).toBe(fixture.candidateUuid);
    expect(result.answers.map((answer) => answer.uuid)).toEqual([
      fixture.answerUuid,
    ]);
    expect(result.evaluations.map((evaluation) => evaluation.uuid)).toEqual([
      fixture.evaluationUuid,
    ]);
  });

  it("rejects when there is no authenticated user", async () => {
    const fixture = await createEvaluationRelatedDataFixture();
    createdRecords.push(fixture);
    getSessionMock.mockResolvedValue(null);

    await expect(
      client.getEvaluationRelatedDataByInterviewUuid({
        uuid: fixture.interviewUuid,
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("rejects when the current user is not on the role's team", async () => {
    const fixture = await createEvaluationRelatedDataFixture();
    createdRecords.push(fixture);
    getSessionMock.mockResolvedValue({
      session: { id: "session-id" },
      user: { id: uuidv7() },
    });

    await expect(
      client.getEvaluationRelatedDataByInterviewUuid({
        uuid: fixture.interviewUuid,
      }),
    ).rejects.toThrow("Forbidden");
  });

  it("returns null when the interview does not exist", async () => {
    getSessionMock.mockResolvedValue({
      session: { id: "session-id" },
      user: { id: uuidv7() },
    });

    await expect(
      client.getEvaluationRelatedDataByInterviewUuid({
        uuid: uuidv7(),
      }),
    ).resolves.toBeNull();
  });
});

async function createEvaluationRelatedDataFixture() {
  const userId = uuidv7();
  const organizationId = uuidv7();
  const teamId = uuidv7();
  const teamMemberId = uuidv7();

  const [user] = await db
    .insert(User)
    .values({
      id: userId,
      name: "Evaluation Reviewer",
      email: `evaluation-reviewer-${userId}@example.com`,
    })
    .returning({ id: User.id });

  const [organization] = await db
    .insert(Organization)
    .values({
      id: organizationId,
      name: "Evaluation Test Organization",
      slug: `evaluation-test-org-${organizationId}`,
    })
    .returning({ id: Organization.id });

  const [team] = await db
    .insert(Team)
    .values({
      id: teamId,
      name: "Evaluation Test Team",
      organizationId: organization.id,
    })
    .returning({ id: Team.id });

  const [teamMember] = await db
    .insert(TeamMember)
    .values({
      id: teamMemberId,
      teamId: team.id,
      userId: user.id,
    })
    .returning({ id: TeamMember.id });

  const [role] = await db
    .insert(schema.Role)
    .values({
      slug: `evaluation-test-role-${uuidv7()}`,
      roleName: "Evaluation Test Role",
      teamId: team.id,
    })
    .returning({ uuid: schema.Role.uuid });

  const [flowVersion] = await db
    .insert(schema.FlowVersion)
    .values({
      roleUuid: role.uuid,
      version: 1,
    })
    .returning({ uuid: schema.FlowVersion.uuid });

  const [firstFlowStep] = await db
    .insert(schema.FlowStep)
    .values({
      flowVersionUuid: flowVersion.uuid,
      position: 1,
      kind: "question_block",
    })
    .returning({ uuid: schema.FlowStep.uuid });
  const [secondFlowStep] = await db
    .insert(schema.FlowStep)
    .values({
      flowVersionUuid: flowVersion.uuid,
      position: 2,
      kind: "question_block",
    })
    .returning({ uuid: schema.FlowStep.uuid });

  const [firstQuestion] = await db
    .insert(schema.Question)
    .values({
      flowStepUuid: firstFlowStep.uuid,
      position: 1,
      questionType: "text",
      questionPayload: { question: "Why this role?" },
      isCv: false,
    })
    .returning({ uuid: schema.Question.uuid });
  const [secondQuestion] = await db
    .insert(schema.Question)
    .values({
      flowStepUuid: secondFlowStep.uuid,
      position: 1,
      questionType: "text",
      questionPayload: { question: "What are your strengths?" },
      isCv: false,
    })
    .returning({ uuid: schema.Question.uuid });

  const [candidate] = await db
    .insert(schema.Candidate)
    .values({
      name: "Evaluation Candidate",
      email: `evaluation-candidate-${uuidv7()}@example.com`,
    })
    .returning({ uuid: schema.Candidate.uuid });

  const [interview] = await db
    .insert(schema.Interview)
    .values({
      flowVersionUuid: flowVersion.uuid,
      candidateUuid: candidate.uuid,
      isFinished: true,
    })
    .returning({ uuid: schema.Interview.uuid });

  const [answer] = await db
    .insert(schema.Answer)
    .values({
      interviewUuid: interview.uuid,
      questionUuid: firstQuestion.uuid,
      answerPayload: { answer: "Because it fits." },
    })
    .returning({ uuid: schema.Answer.uuid });

  const [evaluation] = await db
    .insert(schema.Evaluation)
    .values({
      interviewUuid: interview.uuid,
      userId: user.id,
      hardSkillsScore: 4,
      softSkillsScore: 5,
      culturalAddScore: 4,
      potentialScore: 5,
      finalScore: 5,
      notes: "Strong candidate.",
    })
    .returning({ uuid: schema.Evaluation.uuid });

  return {
    userId: user.id,
    organizationId: organization.id,
    teamId: team.id,
    teamMemberId: teamMember.id,
    roleUuid: role.uuid,
    flowVersionUuid: flowVersion.uuid,
    flowStepUuids: [firstFlowStep.uuid, secondFlowStep.uuid],
    questionUuids: [firstQuestion.uuid, secondQuestion.uuid],
    candidateUuid: candidate.uuid,
    interviewUuid: interview.uuid,
    answerUuid: answer.uuid,
    evaluationUuid: evaluation.uuid,
  };
}
