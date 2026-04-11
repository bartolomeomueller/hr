import "@/polyfill";

import { LoggingHandlerPlugin } from "@orpc/experimental-pino";
import { RPCHandler } from "@orpc/server/fetch";
import { createFileRoute } from "@tanstack/react-router";
import { logger } from "@/lib/logger";
import router from "@/orpc/router";

const handler = new RPCHandler(router, {
  plugins: [
    new LoggingHandlerPlugin({
      logger,
      // logRequestResponse: true,
      logRequestAbort: true,
    }),
  ],
});

async function handle({ request }: { request: Request }) {
  const { response } = await handler.handle(request, {
    prefix: "/api/v1/rpc",
    context: {
      headers: request.headers,
    },
  });

  return response ?? new Response("Not Found", { status: 404 });
}

export const Route = createFileRoute("/api/v1/rpc/$")({
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
