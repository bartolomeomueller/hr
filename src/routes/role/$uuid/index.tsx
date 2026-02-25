import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/role/$uuid/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { uuid } = Route.useParams();
  const roleQuery = useQuery(
    orpc.getRoleByUuid.queryOptions({
      input: { uuid },
    }),
  );

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
      Role {roleQuery.data.uuid}: {roleQuery.data.roleName}
    </div>
  );
}
