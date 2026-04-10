import { AuthQueryProvider } from "@daveyplate/better-auth-tanstack";
import { AuthUIProviderTanstack } from "@daveyplate/better-auth-ui/tanstack";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";

export function BetterAuthProviders({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // TODO check if this is the best way to get the current organization slug
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const currentOrganizationSlug = pathname.match(
    /^\/organization\/([^/]+)/,
  )?.[1];

  return (
    <AuthQueryProvider>
      <AuthUIProviderTanstack
        authClient={authClient}
        navigate={(href) => router.navigate({ href })}
        replace={(href) => router.navigate({ href, replace: true })}
        onSessionChange={async () => {
          queryClient.clear(); // Clear all query caches to ensure no stale data is shown based on the old session.
          await router.invalidate(); // Invalidate all routes to ensure they re-run their loaders and fetch fresh data based on the new session.
        }}
        persistClient={false}
        organization={{
          pathMode: "slug",
          basePath: "/organization",
          slug: currentOrganizationSlug,
        }}
        Link={({ href, ...props }) => <Link to={href} {...props} />}
        social={{
          providers: ["google"],
        }}
        teams={{
          enabled: true,
        }}
      >
        {children}
      </AuthUIProviderTanstack>
    </AuthQueryProvider>
  );
}
