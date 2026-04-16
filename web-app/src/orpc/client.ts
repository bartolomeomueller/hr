import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { ClientRetryPlugin } from "@orpc/client/plugins";
import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import router from "@/orpc/router";

const getORPCClient = createIsomorphicFn()
  .server(() =>
    createRouterClient(router, {
      context: () => ({
        headers: getRequestHeaders(),
      }),
    }),
  )
  .client((): RouterClient<typeof router> => {
    const link = new RPCLink({
      url: `${window.location.origin}/api/v1/rpc`,
      plugins: [new ClientRetryPlugin()],
    });
    return createORPCClient(link);
  });

export const client: RouterClient<typeof router> = getORPCClient();

export const orpc = createTanstackQueryUtils(client);
