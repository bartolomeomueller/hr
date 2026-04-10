import { ORPCError, os } from "@orpc/server";
import { auth } from "@/lib/auth.server";
import { base } from "./base";

export const debugMiddleware = os.middleware(async ({ next }) => {
  if (process.env.NODE_ENV === "development") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return next();
});

export const authMiddleware = base.middleware(async ({ context, next }) => {
  const sessionData = await auth.api.getSession({ headers: context.headers });

  if (!sessionData?.session || !sessionData?.user) {
    throw new ORPCError("Unauthorized");
  }

  return next({
    context: {
      session: sessionData.session,
      user: sessionData.user,
    },
  });
});
