import { os } from "@orpc/server";

export const debugMiddleware = os.middleware(async ({ next }) => {
  if (process.env.NODE_ENV === "development") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return next();
});
