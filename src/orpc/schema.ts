import { Schema } from "effect";

const TodoModelSchema = Schema.Struct({
	id: Schema.Number,
	name: Schema.String,
});

const InterviewModelSchema = Schema.Struct({
	uuid: Schema.UUID,
	roleName: Schema.String,
});

export const TodoSchema = Schema.standardSchemaV1(TodoModelSchema);
export const InterviewSchema = Schema.standardSchemaV1(InterviewModelSchema);

export const GetInterviewByUuidInputSchema = Schema.standardSchemaV1(
	Schema.Struct({
		uuid: Schema.UUID,
	}),
);

export const NullableInterviewSchema = Schema.standardSchemaV1(
	Schema.Union(InterviewModelSchema, Schema.Null),
);
