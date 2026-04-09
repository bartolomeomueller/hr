import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "@/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  emailAndPassword: {
    enabled: true,
  },
  // TODO add https://better-auth.com/docs/installation#authentication-methods
  //   socialProviders: {
  //     google: {

  //     }
  //   }
  // TODO add magic link, email otp (maybe), passkey, generic oauth (maybe), one tap (maybe)
  // TODO add admin,
  plugins: [
    organization({
      teams: {
        enabled: true,
      },
    }),
    tanstackStartCookies(),
  ],
});
