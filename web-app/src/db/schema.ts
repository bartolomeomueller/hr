import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const Role = pgTable("role", {
  uuid: uuid()
    .default(sql`uuidv7()`)
    .primaryKey(),
  slug: text("slug").notNull().unique(),
  roleName: text("role_name").notNull(),
});

// TODO run cleanup query every night to delete orphaned question sets, but do not delete the vids of questions that still exist
export const QuestionSet = pgTable(
  "question_set",
  {
    uuid: uuid()
      .default(sql`uuidv7()`)
      .primaryKey(),
    roleUuid: uuid("role_uuid")
      .notNull()
      .references(() => Role.uuid, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("question_set_role_uuid_version_unique").on(
      table.roleUuid,
      table.version,
    ),
  ],
);

export const Question = pgTable(
  "question",
  {
    uuid: uuid()
      .default(sql`uuidv7()`)
      .primaryKey(),
    questionSetUuid: uuid("question_set_uuid")
      .notNull()
      // prevent video questions from being orphaned
      .references(() => QuestionSet.uuid, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    questionType: text("question_type").notNull(),
    questionPayload: jsonb("question_payload").notNull().default("{}"),
    answerType: text("answer_type").notNull(),
  },
  (table) => [
    unique("question_question_set_uuid_position_unique").on(
      table.questionSetUuid,
      table.position,
    ),
  ],
);

export const Candidate = pgTable("candidate", {
  uuid: uuid()
    .default(sql`uuidv7()`)
    .primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
});

export const Interview = pgTable("interview", {
  uuid: uuid()
    .default(sql`uuidv7()`)
    .primaryKey(),
  questionSetUuid: uuid("question_set_uuid")
    .notNull()
    .references(() => QuestionSet.uuid, { onDelete: "restrict" }),
  candidateUuid: uuid("candidate_uuid").references(() => Candidate.uuid, {
    onDelete: "cascade",
  }),
});

export const InterviewStep = pgTable(
  "interview_step",
  {
    uuid: uuid()
      .default(sql`uuidv7()`)
      .primaryKey(),
    interviewUuid: uuid("interview_uuid")
      .notNull()
      // restrict on delete to prevent accidental orphaning of video sources
      .references(() => Interview.uuid, { onDelete: "restrict" }),
    questionUuid: uuid("question_uuid")
      .notNull()
      .references(() => Question.uuid, { onDelete: "restrict" }),
    answerPayload: jsonb("answer_payload").notNull().default("{}"),
    answeredAt: timestamp("answered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("interview_step_interview_question_unique").on(
      table.interviewUuid,
      table.questionUuid,
    ),
  ],
);
