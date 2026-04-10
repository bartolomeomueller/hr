import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/_protected/admin/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RolesTable />
    </Suspense>
  );
}

export function RolesTable() {
  const { data: allRolesForThisUser } = useSuspenseQuery(
    orpc.getAllRolesForCurrentUser.queryOptions(),
  );

  return <pre>{JSON.stringify(allRolesForThisUser, null, 2)}</pre>;
}
