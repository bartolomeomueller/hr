import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { getQueryClient } from "@/lib/query-client";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const queryClient = getQueryClient();

  const router = createRouter({
    routeTree,

    context: {
      queryClient,
    },

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,

    defaultNotFoundComponent: () => (
      <div>Not found. Please return to home.</div>
    ),
    defaultErrorComponent: ({ error, reset }) => (
      <div>
        <p>Error: {String(error)}</p>
        <button type="button" onClick={() => reset()}>
          Retry
        </button>
      </div>
    ),
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    wrapQueryClient: false,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
