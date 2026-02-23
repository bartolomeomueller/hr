import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Effect } from "effect";
import { Pool } from "pg";

import * as schema from "./schema";
import { interviews } from "./schema";

config({ path: [".env.local", ".env"] });

const seed = Effect.gen(function* () {
	const databaseUrl = process.env.DATABASE_URL;

	if (!databaseUrl) {
		yield* Effect.fail(new Error("DATABASE_URL is not set"));
	}

	const pool = yield* Effect.acquireRelease(
		Effect.sync(
			() =>
				new Pool({
					connectionString: databaseUrl,
				}),
		),
		(pool) =>
			Effect.promise(() => pool.end()).pipe(
				Effect.mapError(
					(error) =>
						new Error(`Failed to close database pool: ${String(error)}`),
				),
				Effect.orDie,
			),
	);

	const db = drizzle(pool, { schema });

	yield* Effect.promise(() => db.delete(interviews)).pipe(
		Effect.mapError(
			(error) =>
				new Error(`Failed to clear interviews table: ${String(error)}`),
		),
	);

	const [interview] = yield* Effect.promise(() =>
		db
			.insert(interviews)
			.values({
				uuid: "ddd4073f-a508-4535-8315-c7924b9a95c9",
				roleName: "Senior Frontend Engineer at funpany",
			})
			.returning({ uuid: interviews.uuid, roleName: interviews.roleName }),
	).pipe(
		Effect.mapError(
			(error) => new Error(`Failed to seed interview row: ${String(error)}`),
		),
	);

	yield* Effect.sync(() => {
		console.log("Seeded interview:", interview);
	});
});

Effect.runPromise(Effect.scoped(seed)).catch((error) => {
	console.error("Failed to seed interview:", error);
	process.exit(1);
});
