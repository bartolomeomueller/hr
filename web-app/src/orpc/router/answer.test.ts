import { createRouterClient } from "@orpc/server";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentAnswerPayloadType } from "@/db/payload-types";
import { setupIntegrationTestDatabase } from "@/test/integration-test-database";

await setupIntegrationTestDatabase();

const [{ Organization, Team }, { db }, schema, { default: router }] =
  await Promise.all([
    import("@/db/auth-schema"),
    import("@/db"),
    import("@/db/schema"),
    import("@/orpc/router"),
  ]);

vi.mock("@/lib/bullmq.server", () => ({
  enqueueVideoProcessingJob: vi.fn(),
  cancelVideoProcessingJob: vi.fn(),
}));

const client = createRouterClient(router, {
  context: () => ({
    headers: new Headers(),
  }),
});

describe("addNewDocumentToAnswer", () => {
  const createdRecords: Array<{
    organizationId: string;
    teamId: string;
    roleUuid: string;
    flowVersionUuid: string;
    flowStepUuid: string;
    questionUuid: string;
    interviewUuid: string;
  }> = [];

  afterEach(async () => {
    for (const record of createdRecords.splice(0).reverse()) {
      await db
        .delete(schema.Answer)
        .where(eq(schema.Answer.interviewUuid, record.interviewUuid));
      await db
        .delete(schema.Interview)
        .where(eq(schema.Interview.uuid, record.interviewUuid));
      await db
        .delete(schema.Question)
        .where(eq(schema.Question.uuid, record.questionUuid));
      await db
        .delete(schema.FlowStep)
        .where(eq(schema.FlowStep.uuid, record.flowStepUuid));
      await db
        .delete(schema.FlowVersion)
        .where(eq(schema.FlowVersion.uuid, record.flowVersionUuid));
      await db.delete(schema.Role).where(eq(schema.Role.uuid, record.roleUuid));
      await db.delete(Team).where(eq(Team.id, record.teamId));
      await db
        .delete(Organization)
        .where(eq(Organization.id, record.organizationId));
    }
  });

  it("keeps all concurrently uploaded documents on the same answer", async () => {
    const fixture = await createDocumentQuestionFixture();
    createdRecords.push(fixture);

    const documents = Array.from({ length: 10 }, (_, index) => ({
      documentUuid: uuidv7(),
      fileName: `concurrent-document-${index + 1}.pdf`,
      mimeType: "application/pdf",
    }));

    await Promise.all(
      documents.map((document) =>
        client.addNewDocumentToAnswer({
          interviewUuid: fixture.interviewUuid,
          questionUuid: fixture.questionUuid,
          document,
          isSingleFileUpload: false,
        }),
      ),
    );

    const interviewRelatedData =
      await client.getInterviewRelatedDataByInterviewUuid({
        uuid: fixture.interviewUuid,
      });
    if (!interviewRelatedData) {
      throw new Error(
        "Expected interview related data for the seeded interview.",
      );
    }

    const documentAnswer = interviewRelatedData.answers.find(
      (answer) => answer.questionUuid === fixture.questionUuid,
    );
    const answerPayloadResult = DocumentAnswerPayloadType.safeParse(
      documentAnswer?.answerPayload,
    );
    if (
      !answerPayloadResult.success ||
      answerPayloadResult.data.kind !== "documents"
    ) {
      throw new Error("Expected a document answer for the seeded question.");
    }
    const answerPayload = answerPayloadResult.data;
    expect(answerPayload.kind).toBe("documents");
    expect(answerPayload.documents).toHaveLength(documents.length);
    expect(
      [...answerPayload.documents].sort((left, right) =>
        left.fileName.localeCompare(right.fileName),
      ),
    ).toEqual(
      [...documents].sort((left, right) =>
        left.fileName.localeCompare(right.fileName),
      ),
    );
  });
});

async function createDocumentQuestionFixture() {
  const organizationId = uuidv7();
  const teamId = uuidv7();

  const [organization] = await db
    .insert(Organization)
    .values({
      id: organizationId,
      name: "Concurrency Test Organization",
      slug: `concurrency-test-org-${organizationId}`,
    })
    .returning({ id: Organization.id });

  const [team] = await db
    .insert(Team)
    .values({
      id: teamId,
      name: "Concurrency Test Team",
      organizationId: organization.id,
    })
    .returning({ id: Team.id });

  const [role] = await db
    .insert(schema.Role)
    .values({
      slug: `concurrency-test-role-${uuidv7()}`,
      roleName: "Concurrency Test Role",
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

  const [flowStep] = await db
    .insert(schema.FlowStep)
    .values({
      flowVersionUuid: flowVersion.uuid,
      position: 1,
      kind: "question_block",
    })
    .returning({ uuid: schema.FlowStep.uuid });

  const [question] = await db
    .insert(schema.Question)
    .values({
      flowStepUuid: flowStep.uuid,
      position: 1,
      questionType: "document",
      questionPayload: {
        prompt: "Upload your documents",
        minUploads: 0,
        maxUploads: 20,
      },
      isCv: false,
    })
    .returning({ uuid: schema.Question.uuid });

  const [interview] = await db
    .insert(schema.Interview)
    .values({
      flowVersionUuid: flowVersion.uuid,
    })
    .returning({ uuid: schema.Interview.uuid });

  return {
    organizationId: organization.id,
    teamId: team.id,
    roleUuid: role.uuid,
    flowVersionUuid: flowVersion.uuid,
    flowStepUuid: flowStep.uuid,
    questionUuid: question.uuid,
    interviewUuid: interview.uuid,
  };
}
