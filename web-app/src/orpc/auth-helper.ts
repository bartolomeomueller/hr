import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { TeamMember } from "@/db/auth-schema";
import { FlowVersion, Interview, Role } from "@/db/schema";

export async function canUserAccessInterview({
  interviewUuid,
  userId,
}: {
  interviewUuid: string;
  userId: string;
}) {
  const [accessibleInterview] = await db
    .select({ uuid: Interview.uuid })
    .from(Interview)
    .innerJoin(FlowVersion, eq(FlowVersion.uuid, Interview.flowVersionUuid))
    .innerJoin(Role, eq(Role.uuid, FlowVersion.roleUuid))
    .innerJoin(
      TeamMember,
      and(eq(TeamMember.teamId, Role.teamId), eq(TeamMember.userId, userId)),
    )
    .where(eq(Interview.uuid, interviewUuid))
    .limit(1);

  return Boolean(accessibleInterview);
}
