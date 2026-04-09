import { drizzle } from "drizzle-orm/node-postgres";

import * as authSchema from "./auth-schema.ts";
import * as appSchema from "./schema.ts";

const schema = { ...appSchema, ...authSchema };

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is not set");
}

export const db = drizzle(databaseUrl, { schema, logger: false });
