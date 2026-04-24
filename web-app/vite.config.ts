import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { config as loadEnvFile } from "dotenv";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { getIntegrationTestDatabaseUrl } from "./src/test/integration-test-database";

loadEnvFile({ path: [".env.local", ".env"] });

const config = defineConfig(({ mode }) => ({
  plugins: [
    mode === "test" ? undefined : devtools(),
    mode === "test"
      ? undefined
      : nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    mode === "test" ? undefined : tanstackStart(),
    viteReact({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
  ].filter(Boolean),
  test: {
    env:
      mode === "test"
        ? {
            DATABASE_URL: getIntegrationTestDatabaseUrl(),
          }
        : undefined,
    globalSetup: mode === "test" ? "./src/test/global-setup.ts" : undefined,
  },
}));

export default config;
