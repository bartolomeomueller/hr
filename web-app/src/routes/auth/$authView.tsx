import { AuthView } from "@daveyplate/better-auth-ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/$authView")({
  component: RouteComponent,
});

// This dynamic route covers all authentication paths, such as sign-in, sign-up, magic-link, forgot-password, two-factor, recover-account, reset-password, sign-out, and the internal callback.
function RouteComponent() {
  const { authView } = Route.useParams();

  return (
    <main className="container mx-auto flex grow flex-col items-center justify-center gap-3 self-center p-4 md:p-6">
      <AuthView pathname={authView} />
    </main>
  );
}
