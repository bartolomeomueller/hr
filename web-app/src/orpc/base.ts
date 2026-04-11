import type { LoggerContext } from "@orpc/experimental-pino";
import { os } from "@orpc/server";

// For logging, see https://orpc.dev/docs/integrations/pino
type ORPCContext = LoggerContext & {
  headers: Headers;
};

export const base = os.$context<ORPCContext>();
