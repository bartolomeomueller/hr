import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
import {
  Interview,
  InterviewStep,
  Question,
  QuestionSet,
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
      await db.delete(InterviewStep);
      await db.delete(Interview);
      await db.delete(Question);
      await db.delete(QuestionSet);
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
      const [questionSet] = await db
        .insert(QuestionSet)
        .values({
          roleUuid: role.uuid,
          version: 1,
        })
        .returning();

      await db.insert(Question).values([
        {
          questionSetUuid: questionSet.uuid,
          position: 1,
          questionType: "text",
          questionPayload: {
            text: "Dies ist eine Beispiel-Frage?",
          },
          answerType: "text",
        },
        {
          questionSetUuid: questionSet.uuid,
          position: 2,
          questionType: "text",
          questionPayload: {
            text: "Welche Technologien würdest du für die Entwicklung einer Webanwendung verwenden?",
          },
          answerType: "video",
        },
        {
          questionSetUuid: questionSet.uuid,
          position: 3,
          questionType: "multiple_choice",
          questionPayload: {
            prompt:
              "Wie würdest du deine Expertise in React auf einer Skala von 1 bis 10 bewerten?",
            min: 1,
            max: 10,
            step: 1,
            minLabel: "Einsteiger",
            maxLabel: "Experte",
          },
          answerType: "number",
        },
        {
          questionSetUuid: questionSet.uuid,
          position: 4,
          questionType: "pick",
          questionPayload: {
            prompt: "Welche Arbeitsweise passt am besten zu dir?",
            options: [
              "Teamarbeit vor Ort",
              "Hybrid mit flexiblen Tagen",
              "Remote-first",
            ],
          },
          answerType: "single_choice",
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
