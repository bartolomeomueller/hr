import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { GenericLoader } from "@/components/GenericLoader";
import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/roles/$slug/")({
  component: RouteComponent,
  loader: ({ params, context }) => {
    const { slug } = params;
    context.queryClient.ensureQueryData(
      orpc.getRoleAndItsQuestionsBySlug.queryOptions({
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
        Role with slug "{String(data.slug)}"" not found. Please return to home.
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
  return (
    <Suspense fallback={<GenericLoader />}>
      <RoleDetails />
    </Suspense>
  );
}

function RoleDetails() {
  const { slug } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });

  const roleQuery = useSuspenseQuery(
    orpc.getRoleAndItsQuestionsBySlug.queryOptions({
      input: { slug },
    }),
  );

  // TODO for a better flow change this mutation process to directly redirect to the interview page since the questions are already fetched -> so optimistic update
  const createInterviewMutation = useMutation(
    orpc.createInterviewForRole.mutationOptions(),
  );

  const handleStartInterview = async () => {
    if (!roleQuery.data) return; // if no role exists, no interview can be created for this role

    const interview = await createInterviewMutation.mutateAsync({
      uuid: roleQuery.data.role.uuid,
    });

    await navigate({
      to: "/interviews/$uuid",
      params: { uuid: interview.uuid },
    });
  };

  if (!roleQuery.data) {
    throw notFound({ routeId: Route.id, data: { slug } });
  }

  return (
    <div>
      <h2>
        Role {roleQuery.data.role.uuid}: {roleQuery.data.role.roleName}
      </h2>
      <div>
        <button
          type="button"
          onClick={handleStartInterview}
          disabled={createInterviewMutation.isPending}
        >
          {createInterviewMutation.isPending
            ? "Starting interview..."
            : "Start interview"}
        </button>
      </div>
    </div>
  );
}
