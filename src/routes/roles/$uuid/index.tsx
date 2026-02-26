import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/roles/$uuid/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { uuid } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });

  const roleQuery = useQuery(
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

  if (roleQuery.isPending) {
    return <div>Loading role...</div>;
  }

  if (roleQuery.isError) {
    return <div>Could not load role.</div>;
  }

  if (!roleQuery.data) {
    return <div>No role found for {uuid}</div>;
  }

  return (
    <div>
      <h2>
        Role {roleQuery.data.uuid}: {roleQuery.data.roleName}
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
