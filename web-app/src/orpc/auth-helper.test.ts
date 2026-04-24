import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { Organization, Team, TeamMember, User } from "@/db/auth-schema";
import { FlowVersion, Interview, Role } from "@/db/schema";
import { canUserAccessInterview } from "./auth-helper";

describe("canUserAccessInterview", () => {
  const createdRecords: Array<{
    userId: string;
    organizationId: string;
    teamId: string;
    teamMemberId: string;
    roleUuid: string;
    flowVersionUuid: string;
    interviewUuid: string;
  }> = [];

  afterEach(async () => {
    for (const record of createdRecords.splice(0).reverse()) {
      await db
        .delete(Interview)
        .where(eq(Interview.uuid, record.interviewUuid));
      await db
        .delete(FlowVersion)
        .where(eq(FlowVersion.uuid, record.flowVersionUuid));
      await db.delete(Role).where(eq(Role.uuid, record.roleUuid));
      await db.delete(TeamMember).where(eq(TeamMember.id, record.teamMemberId));
      await db.delete(Team).where(eq(Team.id, record.teamId));
      await db.delete(User).where(eq(User.id, record.userId));
      await db
        .delete(Organization)
        .where(eq(Organization.id, record.organizationId));
    }
  });

  it("returns true when the user is a member of the interview role team", async () => {
    const fixture = await createInterviewAccessFixture();
    createdRecords.push(fixture);

    await expect(
      canUserAccessInterview({
        interviewUuid: fixture.interviewUuid,
        userId: fixture.userId,
      }),
    ).resolves.toBe(true);
  });

  it("returns false when the user is not a member of the interview role team", async () => {
    const fixture = await createInterviewAccessFixture();
    createdRecords.push(fixture);

    await expect(
      canUserAccessInterview({
        interviewUuid: fixture.interviewUuid,
        userId: uuidv7(),
      }),
    ).resolves.toBe(false);
  });

  it("returns false when the interview does not exist", async () => {
    await expect(
      canUserAccessInterview({
        interviewUuid: uuidv7(),
        userId: uuidv7(),
      }),
    ).resolves.toBe(false);
  });
});

async function createInterviewAccessFixture() {
  const userId = uuidv7();
  const organizationId = uuidv7();
  const teamId = uuidv7();
  const teamMemberId = uuidv7();

  const [user] = await db
    .insert(User)
    .values({
      id: userId,
      name: "Interview Access Reviewer",
      email: `interview-access-reviewer-${userId}@example.com`,
    })
    .returning({ id: User.id });

  const [organization] = await db
    .insert(Organization)
    .values({
      id: organizationId,
      name: "Interview Access Test Organization",
      slug: `interview-access-test-org-${organizationId}`,
    })
    .returning({ id: Organization.id });

  const [team] = await db
    .insert(Team)
    .values({
      id: teamId,
      name: "Interview Access Test Team",
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
    .insert(Role)
    .values({
      slug: `interview-access-test-role-${uuidv7()}`,
      roleName: "Interview Access Test Role",
      teamId: team.id,
    })
    .returning({ uuid: Role.uuid });

  const [flowVersion] = await db
    .insert(FlowVersion)
    .values({
      roleUuid: role.uuid,
      version: 1,
    })
    .returning({ uuid: FlowVersion.uuid });

  const [interview] = await db
    .insert(Interview)
    .values({
      flowVersionUuid: flowVersion.uuid,
      isFinished: true,
    })
    .returning({ uuid: Interview.uuid });

  return {
    userId: user.id,
    organizationId: organization.id,
    teamId: team.id,
    teamMemberId: teamMember.id,
    roleUuid: role.uuid,
    flowVersionUuid: flowVersion.uuid,
    interviewUuid: interview.uuid,
  };
}
