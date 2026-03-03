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

    let dummy_role: { uuid: string; roleName: string } | undefined;
    try {
      [dummy_role] = await db
        .insert(Role)
        .values({
          uuid: "019c9a34-72d4-7898-b34f-d1d208b17fa0",
          roleName: "Frontend Engineer at funpany",
        })
        .returning({ uuid: Role.uuid, roleName: Role.roleName });
    } catch (error) {
      throw new Error(`Failed to seed role row: ${String(error)}`);
    }

    try {
      await db.insert(QuestionSet).values({
        uuid: "019c9a34-9dd7-73be-9a17-07f0eca87ea7",
        roleUuid: "019c9a34-72d4-7898-b34f-d1d208b17fa0",
        version: 1,
      });

      await db.insert(Question).values([
        {
          questionSetUuid: "019c9a34-9dd7-73be-9a17-07f0eca87ea7",
          position: 1,
          questionType: "video",
          questionPayload: {
            prompt:
              "Welche Technologien würdest du für die Entwicklung einer Webanwendung verwenden?",
            sourceUrl: "https://example.com/question-1.mp4",
          },
          answerType: "text",
        },
        {
          questionSetUuid: "019c9a34-9dd7-73be-9a17-07f0eca87ea7",
          position: 2,
          questionType: "scale",
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
          questionSetUuid: "019c9a34-9dd7-73be-9a17-07f0eca87ea7",
          position: 3,
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

    console.log("Seeded role:", dummy_role);
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
