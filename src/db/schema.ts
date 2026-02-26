import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const Role = pgTable("role", {
  uuid: uuid().default(sql`uuidv7()`).primaryKey(),
  roleName: text("role_name").notNull(),
  questions: jsonb("questions").notNull(),
});

export const Interview = pgTable("interview", {
  uuid: uuid().default(sql`uuidv7()`).primaryKey(),
  roleUuid: uuid("role_uuid")
    .notNull()
    .references(() => Role.uuid, { onDelete: "cascade" }),
  candidateUuid: uuid("candidate_uuid").references(() => Candidate.uuid, {
    onDelete: "cascade",
  }),
});

export const Candidate = pgTable("candidate", {
  uuid: uuid().default(sql`uuidv7()`).primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
});
