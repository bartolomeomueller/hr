import { pgTable, text, uuid } from "drizzle-orm/pg-core";

export const interviews = pgTable("interviews", {
	uuid: uuid().defaultRandom().primaryKey(),
	roleName: text("role_name").notNull(),
});
