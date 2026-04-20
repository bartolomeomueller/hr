import { config } from "dotenv";
import { pushSchema } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

config({ path: [".env.local", ".env"] });

let setupPromise: Promise<void> | null = null;

export async function setupIntegrationTestDatabase() {
  const testDatabaseUrl = getTestDatabaseUrl(process.env.DATABASE_URL);
  process.env.DATABASE_URL = testDatabaseUrl;

  if (!setupPromise) {
    setupPromise = ensureTestDatabaseIsReady(testDatabaseUrl);
  }

  await setupPromise;
}

function getTestDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const parsedDatabaseUrl = new URL(databaseUrl);
  const databaseName = parsedDatabaseUrl.pathname.slice(1);
  if (!databaseName) {
    throw new Error(
      "DATABASE_URL should include a database name so the test database url can be derived.",
    );
  }

  parsedDatabaseUrl.pathname = `/${databaseName}-test`;

  return parsedDatabaseUrl.toString();
}

async function ensureTestDatabaseIsReady(testDatabaseUrl: string) {
  const adminPool = new Pool({
    connectionString: getAdminDatabaseUrl(testDatabaseUrl),
  });

  try {
    const testDatabaseName = new URL(testDatabaseUrl).pathname.slice(1);
    const databaseAlreadyExists = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [testDatabaseName],
    );
    if (databaseAlreadyExists.rowCount === 0) {
      await adminPool.query(
        `CREATE DATABASE "${escapeSqlIdentifier(testDatabaseName)}"`,
      );
    }
  } finally {
    await adminPool.end();
  }

  const testPool = new Pool({
    connectionString: testDatabaseUrl,
  });

  try {
    const schemaImports = {
      ...(await import("@/db/schema")),
      ...(await import("@/db/auth-schema")),
    };
    const testDb = drizzle(testPool, {
      logger: false,
    });
    const schemaPush = await pushSchema(schemaImports, testDb);

    await schemaPush.apply();
  } finally {
    await testPool.end();
  }
}

function getAdminDatabaseUrl(databaseUrl: string) {
  const parsedDatabaseUrl = new URL(databaseUrl);
  parsedDatabaseUrl.pathname = "/postgres";
  return parsedDatabaseUrl.toString();
}

function escapeSqlIdentifier(value: string) {
  return value.replaceAll('"', '""');
}
