import { os } from "@orpc/server";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { db } from "@/db";
import { interviews } from "@/db/schema";
import {
	GetInterviewByUuidInputSchema,
	NullableInterviewSchema,
} from "@/orpc/schema";

export const getInterviewByUuid = os
	.input(GetInterviewByUuidInputSchema)
	.output(NullableInterviewSchema)
	.handler(({ input }) =>
		Effect.runPromise(
			Effect.tryPromise({
				try: () =>
					db.query.interviews
						.findFirst({
							where: eq(interviews.uuid, input.uuid),
							columns: {
								uuid: true,
								roleName: true,
							},
						})
						.then((interview) => interview ?? null),
				catch: (error) =>
					new Error(
						`Failed to fetch interview ${input.uuid}: ${String(error)}`,
					),
			}),
		),
	);
