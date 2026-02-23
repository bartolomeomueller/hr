import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
import { roles } from "./schema";

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
      await db.delete(roles);
    } catch (error) {
      throw new Error(`Failed to clear roles table: ${String(error)}`);
    }

    let role: { uuid: string; roleName: string } | undefined;
    try {
      [role] = await db
        .insert(roles)
        .values({
          uuid: "ddd4073f-a508-4535-8315-c7924b9a95c9",
          roleName: "Senior Frontend Engineer at funpany",
        })
        .returning({ uuid: roles.uuid, roleName: roles.roleName });
    } catch (error) {
      throw new Error(`Failed to seed role row: ${String(error)}`);
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
