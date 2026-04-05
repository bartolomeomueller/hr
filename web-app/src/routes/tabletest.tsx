import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ActionsDropdown,
  DataTable,
  SortingHeader,
} from "@/components/admin/DataTable";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/tabletest")({
  component: RouteComponent,
});

type UserWithAssessment = {
  id: string;
  name: string;
  hardSkills: number;
  softSkills: number;
  culturalAdd: number;
  potential: number;
};

const users: UserWithAssessment[] = [
  {
    id: "1",
    name: "Alice",
    hardSkills: 4,
    softSkills: 5,
    culturalAdd: 3,
    potential: 4,
  },
  {
    id: "2",
    name: "Bob",
    hardSkills: 4,
    softSkills: 4,
    culturalAdd: 5,
    potential: 3,
  },
  {
    id: "3",
    name: "Charlie",
    hardSkills: 5,
    softSkills: 3,
    culturalAdd: 4,
    potential: 5,
  },
  {
    id: "4",
    name: "David",
    hardSkills: 3,
    softSkills: 4,
    culturalAdd: 5,
    potential: 4,
  },
  {
    id: "5",
    name: "Eve",
    hardSkills: 4,
    softSkills: 5,
    culturalAdd: 4,
    potential: 3,
  },
];

const columns: ColumnDef<UserWithAssessment>[] = [
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
    accessorKey: "name",
    cell: ({ row }) => row.original.name,
    header: ({ column }) => (
      <SortingHeader
        label="Name"
        column={column}
        sortedState={column.getIsSorted()}
        sortIndex={column.getSortIndex()}
      />
    ),
    footer: (info) =>
      `${info.table.getRowModel().rows.length} candidate${info.table.getRowModel().rows.length === 1 ? "" : "s"}`,
  },
  {
    accessorKey: "hardSkills",
    meta: { align: "right" },
    cell: ({ row }) => row.original.hardSkills,
    header: ({ column }) => (
      <SortingHeader
        label="Hard Skills"
        column={column}
        sortedState={column.getIsSorted()}
        sortIndex={column.getSortIndex()}
      />
    ),
    footer: (info) =>
      getAverageValue(
        info.table.getRowModel().rows.map((row) => row.original.hardSkills),
      ),
  },
  {
    accessorKey: "softSkills",
    meta: { align: "right" },
    cell: ({ row }) => row.original.softSkills,
    header: ({ column }) => (
      <SortingHeader
        label="Soft Skills"
        column={column}
        sortedState={column.getIsSorted()}
        sortIndex={column.getSortIndex()}
      />
    ),
    footer: (info) =>
      getAverageValue(
        info.table.getRowModel().rows.map((row) => row.original.softSkills),
      ),
  },
  {
    accessorKey: "culturalAdd",
    meta: { align: "right" },
    cell: ({ row }) => row.original.culturalAdd,
    header: ({ column }) => (
      <SortingHeader
        label="Cultural Add"
        column={column}
        sortedState={column.getIsSorted()}
        sortIndex={column.getSortIndex()}
      />
    ),
    footer: (info) =>
      getAverageValue(
        info.table.getRowModel().rows.map((row) => row.original.culturalAdd),
      ),
  },
  {
    accessorKey: "potential",
    meta: { align: "right" },
    cell: ({ row }) => row.original.potential,
    header: ({ column }) => (
      <SortingHeader
        label="Potential"
        column={column}
        sortedState={column.getIsSorted()}
        sortIndex={column.getSortIndex()}
      />
    ),
    footer: (info) =>
      getAverageValue(
        info.table.getRowModel().rows.map((row) => row.original.potential),
      ),
  },
  {
    id: "totalScore",
    meta: { align: "right" },
    cell: ({ row }) => {
      const user = row.original;
      const totalScore =
        user.hardSkills + user.softSkills + user.culturalAdd + user.potential;
      return totalScore;
    },
    header: ({ column }) => (
      <SortingHeader
        label="Total Score"
        column={column}
        sortedState={column.getIsSorted()}
        sortIndex={column.getSortIndex()}
      />
    ),
    footer: (info) =>
      getAverageValue(
        info.table
          .getRowModel()
          .rows.map(
            (row) =>
              row.original.hardSkills +
              row.original.softSkills +
              row.original.culturalAdd +
              row.original.potential,
          ),
      ),
  },
  {
    id: "actions",
    meta: { align: "center" },
    size: 40,
    minSize: 40,
    maxSize: 40,
    cell: ({ row }) => {
      const user = row.original;

      return (
        <ActionsDropdown
          actions={[
            {
              label: "Copy name",
              action: () => navigator.clipboard.writeText(user.name),
            },
            {
              label: "View customer",
              action: () => {},
            },
            {
              label: "View payment details",
              action: () => {},
            },
          ]}
        />
      );
    },
  },
];

function RouteComponent() {
  return (
    <div className="m-4">
      <DataTable columns={columns} data={users} />
    </div>
  );
}

function getAverageValue(values: number[]) {
  if (values.length === 0) {
    return "-";
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return (total / values.length).toFixed(1);
}
