import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { GenericLoader } from "@/components/GenericLoader";
import { Role } from "@/components/Role";
import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/_interviewFlow/roles/$slug/")({
  component: RouteComponent,
  loader: ({ params, context }) => {
    const { slug } = params;
    context.queryClient.ensureQueryData(
      orpc.getRoleAndItsFlowVersionBySlug.queryOptions({
        input: { slug },
      }),
    );
  },
  notFoundComponent: ({ data }) => {
    if (!data || typeof data !== "object" || !("slug" in data)) {
      return <div>Role not found. Please return to home.</div>;
    }
    return (
      <div>
        Role with slug "{String(data.slug)}" not found. Please return to home.
      </div>
    );
  },
  // NOTE find out when needed
  // errorComponent: ({ error, reset }) => (
  //   <div>
  //     <p>Error loading role: {String(error)}</p>
  //     <button type="button" onClick={() => reset()}>
  //       Retry
  //     </button>
  //   </div>
  // ),
});

function RouteComponent() {
  const { slug } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });

  const handleResourceNotFound = () => {
    throw notFound({ routeId: Route.id, data: { slug } });
  };

  const handleNavigateToInterview = async (uuid: string) => {
    await navigate({ to: "/interviews/$uuid", params: { uuid } });
  };

  return (
    <Suspense fallback={<GenericLoader />}>
      <Role
        slug={slug}
        onResourceNotFound={handleResourceNotFound}
        onNavigateToInterview={handleNavigateToInterview}
      />
    </Suspense>
  );
}
