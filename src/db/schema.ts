import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";

export const roles = pgTable("roles", {
  uuid: uuid().defaultRandom().primaryKey(),
  roleName: text("role_name").notNull(),
});

export const roleSelectSchema = createSelectSchema(roles);
