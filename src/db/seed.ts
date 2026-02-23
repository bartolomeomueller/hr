import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const seed = async () => {
	const { db } = await import("./index");
	const { interviews } = await import("./schema");

	const [interview] = await db
		.insert(interviews)
		.values({ roleName: "Senior Frontend Engineer at funpany" })
		.returning({ uuid: interviews.uuid, roleName: interviews.roleName });

	console.log("Seeded interview:", interview);
};

seed().catch((error) => {
	console.error("Failed to seed interview:", error);
	process.exit(1);
});
