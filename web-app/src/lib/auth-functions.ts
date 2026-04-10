import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth.server";

// HTTP only cookies are used by better auth, to save the session_token and maybe session_data and dont_remember, see https://better-auth.com/docs/concepts/cookies
// Code copied from https://better-auth.com/docs/integrations/tanstack#protecting-resources
// NOTE maybe rewrite this function as a orpc function
export const getSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const headers = getRequestHeaders();
    const session = await auth.api.getSession({ headers });
    return session;
  },
);
