import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { CreateInterview } from "@/components/CreateInterview";
import { orpc } from "@/orpc/client";

export const Route = createFileRoute(
  "/_interviewFlow/roles/$slug/create-interview",
)({
  component: RouteComponent,
  loader: ({ params, context }) => {
    const { slug } = params;
    context.queryClient.ensureQueryData(
      orpc.getRoleAndItsFlowVersionBySlug.queryOptions({
        input: { slug },
      }),
    );
  },
});

function RouteComponent() {
  const { slug } = Route.useParams();

  const navigate = useNavigate({ from: Route.fullPath });
  const handleNavigateToInterview = async (uuid: string) => {
    await navigate({
      to: "/interviews/$uuid",
      params: { uuid },
      replace: true,
    });
  };

  const handleResourceNotFound = () => {
    throw notFound({ routeId: Route.id, data: { slug } });
  };

  return (
    <CreateInterview
      slug={slug}
      onNavigateToInterview={handleNavigateToInterview}
      onResourceNotFound={handleResourceNotFound}
    />
  );
}
