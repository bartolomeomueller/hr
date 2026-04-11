import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  Account,
  Invitation,
  Member,
  Organization,
  Session,
  Team,
  TeamMember,
  User,
  Verification,
} from "./auth-schema";
import * as schema from "./schema";
import {
  Answer,
  Candidate,
  FlowStep,
  FlowVersion,
  Interview,
  Question,
  Role,
} from "./schema";

config({ path: [".env.local", ".env"] });

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  let closeError: Error | undefined;

  try {
    const db = drizzle(pool, { schema });

    try {
      await db.delete(Answer);
      await db.delete(Interview);
      await db.delete(Candidate);
      await db.delete(Question);
      await db.delete(FlowStep);
      await db.delete(FlowVersion);
      await db.delete(Role);

      await db.delete(User);
      await db.delete(Session);
      await db.delete(Account);
      await db.delete(Verification);
      await db.delete(Organization);
      await db.delete(Team);
      await db.delete(TeamMember);
      await db.delete(Member);
      await db.delete(Invitation);
    } catch (error) {
      throw new Error(
        `Failed to delete tables`,
        error instanceof Error ? { cause: error } : undefined,
      );
    }

    try {
      const [test_user] = await db
        .insert(User)
        .values({
          id: "LNPFNwMIY9FeqCPqnPKuvxOFgS4Y2NtH",
          name: "asdf",
          email: "asdf@asdf.com",
        })
        .returning();
      const [test_user_account] = await db
        .insert(Account)
        .values({
          id: "V1ODmSxr5mCu7apfMkuC7ySkfUcPheCD",
          accountId: test_user.id,
          userId: test_user.id,
          providerId: "credential",
          // This password is "asdfjklöasdfjklö" hashed.
          password:
            "66f79abeabc5ad928aa174bd50583ae0:8bb3f5fa6944aaa9b1fd0227446c165e0f981bcb636ce73a6474b344971b855179cda8add7376b6508ec78424cdfbab145330aa5c3cf05cfa75c33a5ab46ef25",
        })
        .returning();
      const [test_organization] = await db
        .insert(Organization)
        .values({
          id: "e5e65997-55da-43c8-9ef0-08f7245faa3a",
          name: "asdf Personal Organization",
          slug: "personal-lnpfnwmiy9feqcpqnpkuvxofgs4y2nth",
          metadata: JSON.stringify({ personal: true }),
        })
        .returning();
      const [test_member] = await db
        .insert(Member)
        .values({
          id: "de6846a2-5109-4751-968c-82747070a960",
          organizationId: test_organization.id,
          userId: test_user.id,
          role: "owner",
        })
        .returning();
      const [test_team] = await db
        .insert(Team)
        .values({
          id: "14972e03-b4c3-4c41-b304-b7a44332566f",
          name: "asdf Personal Team",
          organizationId: test_organization.id,
        })
        .returning();
      const [test_team_member] = await db
        .insert(TeamMember)
        .values({
          id: "ed780955-e776-47a2-b859-88bf5f29863d",
          teamId: test_team.id,
          userId: test_user.id,
        })
        .returning();

      // Create sample role
      const [role] = await db
        .insert(Role)
        .values({
          slug: "frontend-engineer-at-funpany",
          roleName: "Frontend Engineer at funpany",
          teamId: test_team.id,
        })
        .returning();

      const [flowVersion] = await db
        .insert(FlowVersion)
        .values({
          roleUuid: role.uuid,
          version: 1,
        })
        .returning();

      const [introStep] = await db
        .insert(FlowStep)
        .values({
          flowVersionUuid: flowVersion.uuid,
          position: 1,
          kind: "question_block",
        })
        .returning();

      const [techStackStep] = await db
        .insert(FlowStep)
        .values({
          flowVersionUuid: flowVersion.uuid,
          position: 2,
          kind: "video",
        })
        .returning();

      const [documentsStep] = await db
        .insert(FlowStep)
        .values({
          flowVersionUuid: flowVersion.uuid,
          position: 3,
          kind: "question_block",
        })
        .returning();

      await db.insert(Question).values([
        {
          flowStepUuid: introStep.uuid,
          position: 1,
          questionType: "text",
          questionPayload: {
            question: "Dies ist eine Beispiel-Frage?",
          },
        },
        {
          flowStepUuid: introStep.uuid,
          position: 2,
          questionType: "single_choice",
          questionPayload: {
            question:
              "Wie würdest du deine Expertise in React auf einer Skala von 1 bis 10 bewerten?",
            options: [
              "1 - Anfänger",
              "2 - Grundkenntnisse",
              "3 - Fortgeschrittene Kenntnisse",
              "4 - Gute Kenntnisse",
              "5 - Sehr gute Kenntnisse",
              "6 - Experte",
              "7 - Senior Experte",
              "8 - Lead Experte",
              "9 - Principal Experte",
              "10 - Weltklasse Experte",
            ],
          },
        },
        {
          flowStepUuid: introStep.uuid,
          position: 3,
          questionType: "multiple_choice",
          questionPayload: {
            question: "Welche Arbeitsweisen passen gut zu dir?",
            options: [
              "Teamarbeit vor Ort",
              "Hybrid mit flexiblen Tagen",
              "Remote-first",
            ],
            minSelections: 1,
            maxSelections: 2,
          },
        },
        {
          flowStepUuid: techStackStep.uuid,
          position: 1,
          questionType: "video",
          questionPayload: {
            question:
              "Welche Technologien würdest du für die Entwicklung einer Webanwendung verwenden?",
            maxDurationSeconds: 3 * 60,
            maxOvertimeSeconds: 60,
          },
        },
        {
          flowStepUuid: documentsStep.uuid,
          position: 1,
          questionType: "document",
          questionPayload: {
            prompt: "Lege hier deinen Lebenslauf ab",
            maxUploads: 1,
          },
          isCv: true,
        },
        {
          flowStepUuid: documentsStep.uuid,
          position: 2,
          questionType: "document",
          questionPayload: {
            prompt: "Lege hier deine Zeugnisse ab",
            maxUploads: 10,
          },
        },
        {
          flowStepUuid: documentsStep.uuid,
          position: 3,
          questionType: "document",
          questionPayload: {
            prompt: "Lege hier deine Arbeitszeugnisse ab",
            maxUploads: 10,
          },
        },
      ]);

      console.log("Seeded role:", role);
    } catch (error) {
      throw new Error(`Failed to seed question rows: ${String(error)}`);
    }
  } finally {
    try {
      await pool.end();
    } catch (error) {
      closeError = new Error(`Failed to close database pool: ${String(error)}`);
    }
  }

  if (closeError) {
    throw closeError;
  }
}

seed().catch((error) => {
  console.error("Failed to seed role:", error);
  process.exit(1);
});
