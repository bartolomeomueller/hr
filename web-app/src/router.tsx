import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { routeTree } from "./routeTree.gen";

// For why QueryClient is created this way:
// see https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr#streaming-with-server-components

// global variable for the client, not for the server
let browserQueryClient: QueryClient | undefined;

export const getQueryClient = createIsomorphicFn()
  .client(() => {
    if (!browserQueryClient) browserQueryClient = new QueryClient();
    return browserQueryClient;
  })
  .server(() => {
    return new QueryClient();
  });

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
