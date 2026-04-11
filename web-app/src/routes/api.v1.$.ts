import "@/polyfill";

import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { SmartCoercionPlugin } from "@orpc/json-schema";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createFileRoute } from "@tanstack/react-router";
import { logger } from "@/lib/logger";
import router from "@/orpc/router";
import { RoleSelectSchema } from "@/orpc/schema";

const handler = new OpenAPIHandler(router, {
  interceptors: [
    onError((error) => {
      logger.error({ error }, "OpenAPI handler error");
    }),
  ],
  plugins: [
    new LoggingHandlerPlugin({
      logger,
      logRequestResponse: true,
      logRequestAbort: true,
    }),
    new SmartCoercionPlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
      specGenerateOptions: {
        info: {
          title: "TanStack ORPC Playground",
          version: "1.0.0",
        },
        commonSchemas: {
          // NOTE if a real api is in planning, then this should be updated
          RoleSelectSchema: { schema: RoleSelectSchema },
          UndefinedError: { error: "UndefinedError" },
        },
        security: [{ bearerAuth: [] }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
            },
          },
        },
      },
      docsConfig: {
        authentication: {
          securitySchemes: {
            bearerAuth: {
              token: "default-token",
            },
          },
        },
      },
    }),
  ],
});

async function handle({ request }: { request: Request }) {
  const { response } = await handler.handle(request, {
    prefix: "/api/v1",
    context: {
      headers: request.headers,
    },
  });

  return response ?? new Response("Not Found", { status: 404 });
}

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: {
      HEAD: handle,
      GET: handle,
      POST: handle,
      PUT: handle,
      PATCH: handle,
      DELETE: handle,
    },
  },
});
