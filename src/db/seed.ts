import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
import { Role } from "./schema";

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
