import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/role/$uuid/")({
  component: RouteComponent,
});

function isRole(value: unknown): value is { uuid: string; roleName: string } {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "uuid" in value && "roleName" in value;
}

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

  if (!isRole(roleQuery.data)) {
    return <div>Role response has an unexpected shape.</div>;
  }

  return (
    <div>
      Role {roleQuery.data.uuid}: {roleQuery.data.roleName}
    </div>
  );
}
