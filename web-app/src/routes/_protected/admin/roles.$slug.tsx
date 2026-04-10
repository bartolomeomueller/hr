import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Suspense } from "react";
import { DataTable, SortingHeader } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/_protected/admin/roles/$slug")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RoleTable roleSlug={Route.useParams().slug} />
    </Suspense>
  );
}

// Add the cv of the candidates, and their evaluation
const columns: ColumnDef<any>[] = [
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
    accessorKey: "candidate.name",
    meta: { label: "Name" },
    cell: ({ row }) => row.original.candidate.name,
    header: ({ column }) => (
      <SortingHeader
        column={column}
        sortedState={column.getIsSorted()}
        sortIndex={column.getSortIndex()}
      />
    ),
  },
  // TODO if the user already has evaluated the candidate, show "change evaluation" button
  {
    id: "evaluate",
    meta: { label: "Bewerten", align: "right" },
    cell: ({ row }) => (
      <Button asChild>
        <Link to="/admin/roles/$slug" params={{ slug: row.original.slug }}>
          Kandidat bewerten
        </Link>
      </Button>
    ),
    enableSorting: false,
    enableHiding: false,
  },
];

export function RoleTable({ roleSlug }: { roleSlug: string }) {
  const { data } = useSuspenseQuery(
    orpc.getAllFinishedInterviewsForRoleByRoleSlug.queryOptions({
      input: { slug: roleSlug },
    }),
  );

  return (
    <div className="m-4">
      <DataTable columns={columns} data={data} />
    </div>
  );
}
