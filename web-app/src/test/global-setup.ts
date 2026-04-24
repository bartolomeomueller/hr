import {
  ensureTestDatabaseIsReady,
  setIntegrationTestDatabaseUrlEnvironment,
} from "./integration-test-database";

export default async function setup() {
  await ensureTestDatabaseIsReady(setIntegrationTestDatabaseUrlEnvironment());
}
