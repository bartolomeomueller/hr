import type { LoggerContext } from "@orpc/experimental-pino";
import { os } from "@orpc/server";

// For logging, see https://orpc.dev/docs/integrations/pino
interface ORPCContext extends LoggerContext {}

export const base = os.$context<ORPCContext>().$context<{ headers: Headers }>();
