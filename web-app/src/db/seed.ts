import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
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
    } catch (error) {
      throw new Error(`Failed to clear roles table: ${String(error)}`);
    }

    let role: { uuid: string; roleName: string } | undefined;
    try {
      [role] = await db
        .insert(Role)
        .values({
          slug: "frontend-engineer-at-funpany",
          roleName: "Frontend Engineer at funpany",
        })
        .returning();
    } catch (error) {
      throw new Error(`Failed to seed role row: ${String(error)}`);
    }

    try {
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
          questionType: "text",
          questionPayload: {
            question:
              "Welche Technologien würdest du für die Entwicklung einer Webanwendung verwenden?",
            maxDurationSeconds: 3 * 60,
            maxOvertimeSeconds: 60,
          },
        },
      ]);
    } catch (error) {
      throw new Error(`Failed to seed question rows: ${String(error)}`);
    }

    console.log("Seeded role:", role);
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
