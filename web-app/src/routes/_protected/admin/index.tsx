import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Suspense } from "react";
import type z from "zod";
import { DataTable, SortingHeader } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { orpc } from "@/orpc/client";
import type { RoleSelectSchema } from "@/orpc/schema";

export const Route = createFileRoute("/_protected/admin/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(
      orpc.getAllRolesForCurrentUser.queryOptions(),
    );
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RolesTable />
    </Suspense>
  );
}

// TODO add how many candidates have applied to each role, how many are not yet assessed by the user
const columns: ColumnDef<z.infer<typeof RoleSelectSchema>>[] = [
  {
    id: "select",
    meta: { align: "center" },
    size: 40,
    minSize: 40,
    maxSize: 40,
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label={`Select row ${row.id}`}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "roleName",
    meta: { label: "Name" },
    cell: ({ row }) => row.original.roleName,
    header: ({ column }) => (
      <SortingHeader
        column={column}
        sortedState={column.getIsSorted()}
        sortIndex={column.getSortIndex()}
      />
    ),
    footer: (info) =>
      `${info.table.getRowModel().rows.length} candidate${info.table.getRowModel().rows.length === 1 ? "" : "s"}`,
  },
  {
    id: "navigateToRole",
    meta: { label: "Navigate", align: "right" },
    cell: ({ row }) => (
      <Button asChild>
        <Link to="/admin/roles/$slug" params={{ slug: row.original.slug }}>
          Details ansehen
        </Link>
      </Button>
    ),
    enableSorting: false,
    enableHiding: false,
  },
];

export function RolesTable() {
  const { data: allRolesForThisUser } = useSuspenseQuery(
    orpc.getAllRolesForCurrentUser.queryOptions(),
  );

  if (!allRolesForThisUser) {
    return <Button>Erstelle deine erste Stellenanzeige!</Button>;
  }

  return (
    <div className="m-4">
      <DataTable columns={columns} data={allRolesForThisUser} />
    </div>
  );
}
