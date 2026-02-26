import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/interviews/$uuid/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { uuid } = Route.useParams();

  const roleQuery = useQuery(
    orpc.getRoleForInterview.queryOptions({
      input: { uuid },
    }),
  );

  if (roleQuery.isPending) {
    return <div>Loading interview...</div>;
  }

  if (roleQuery.isError) {
    return <div>Could not load interview.</div>;
  }

  if (!roleQuery.data) {
    return (
      <div>No interview found for {uuid}. This is a bug, please report it.</div>
    );
  }

  return <div>{roleQuery.data.questions?.toString()}</div>;
}
