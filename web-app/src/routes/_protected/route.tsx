import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/auth-functions";

export const Route = createFileRoute("/_protected")({
  beforeLoad: async ({ location }) => {
    const session = await getSession();

    if (!session) {
      throw redirect({
        to: "/auth/$authView",
        params: { authView: "sign-in" },
        search: { redirectTo: location.href },
      });
    }

    return { user: session.user };
  },
  component: RouteComponent,
});

function RouteComponent() {
  return <Outlet />;
}
