import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { Team } from "./auth-schema";

export const flowStepKindEnum = pgEnum("flow_step_kind", [
  "video",
  "question_block",
]);

export const Role = pgTable("role", {
  uuid: uuid()
    .default(sql`uuidv7()`)
    .primaryKey(),
  slug: text("slug").notNull().unique(),
  roleName: text("role_name").notNull(),
  teamId: text("team_id")
    .notNull()
    .references(() => Team.id, { onDelete: "cascade" }),
});

export const FlowVersion = pgTable(
  "flow_version",
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
    unique("flow_version_role_uuid_version_unique").on(
      table.roleUuid,
      table.version,
    ),
  ],
);

export const FlowStep = pgTable(
  "flow_step",
  {
    uuid: uuid()
      .default(sql`uuidv7()`)
      .primaryKey(),
    flowVersionUuid: uuid("flow_version_uuid")
      .notNull()
      .references(() => FlowVersion.uuid, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    kind: flowStepKindEnum("kind").notNull(),
  },
  (table) => [
    unique("flow_step_flow_version_uuid_position_unique").on(
      table.flowVersionUuid,
      table.position,
    ),
  ],
);

export const Question = pgTable(
  "question",
  {
    uuid: uuid()
      .default(sql`uuidv7()`)
      .primaryKey(),
    flowStepUuid: uuid("flow_step_uuid")
      .notNull()
      // prevent video questions from being orphaned
      .references(() => FlowStep.uuid, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    questionType: text("question_type").notNull(),
    questionPayload: jsonb("question_payload").notNull().default("{}"),
    isCv: boolean("is_cv").notNull().default(false),
  },
  (table) => [
    unique("question_flow_step_uuid_position_unique").on(
      table.flowStepUuid,
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
  flowVersionUuid: uuid("flow_version_uuid")
    .notNull()
    .references(() => FlowVersion.uuid, { onDelete: "restrict" }),
  candidateUuid: uuid("candidate_uuid").references(() => Candidate.uuid, {
    onDelete: "cascade",
  }),
});

export const Answer = pgTable(
  "answer",
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
    unique("answer_interview_question_unique").on(
      table.interviewUuid,
      table.questionUuid,
    ),
  ],
);
