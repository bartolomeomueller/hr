import { QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";

// The QueryClient is created in this file, so that ts code can call this client without introducing a dependency cycle.

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
