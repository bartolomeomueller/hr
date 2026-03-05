import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Suspense } from "react";
import { GenericLoader } from "@/components/GenericLoader";
import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/roles/$uuid/")({
  component: RouteComponent,
  loader: ({ params, context }) => {
    const { uuid } = params;
    context.queryClient.ensureQueryData(
      orpc.getRoleByUuid.queryOptions({
        input: { uuid },
      }),
    );
  },
});

function RouteComponent() {
  return (
    <Suspense fallback={<GenericLoader />}>
      <RoleDetails />
    </Suspense>
  );
}

function RoleDetails() {
  const { uuid } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });

  const roleQuery = useSuspenseQuery(
    orpc.getRoleByUuid.queryOptions({
      input: { uuid },
    }),
  );

  const createInterviewMutation = useMutation(
    orpc.createInterviewForRole.mutationOptions(),
  );

  const handleStartInterview = async () => {
    const interview = await createInterviewMutation.mutateAsync({
      uuid: uuid,
    });

    await navigate({
      to: "/interviews/$uuid",
      params: { uuid: interview.uuid },
    });
  };

  if (!roleQuery.data) {
    return <div>No role found for {uuid}</div>;
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
