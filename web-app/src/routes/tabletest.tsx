import { createFileRoute } from "@tanstack/react-router";
import {
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    cell: ({ row }) => {
      const user = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(user.name)}
            >
              Copy name
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>View customer</DropdownMenuItem>
            <DropdownMenuItem>View payment details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];

function RouteComponent() {
  return <DataTable columns={columns} data={users} />;
}

export function DataTable<TData>({
  columns,
  data,
}: {
  columns: ColumnDef<TData>[];
  data: TData[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        <TableFooter>
          {table.getFooterGroups().map((footerGroup) => (
            <TableRow key={footerGroup.id}>
              {footerGroup.headers.map((header) => (
                <TableCell key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.footer,
                        header.getContext(),
                      )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableFooter>
      </Table>
    </div>
  );
}

export function SortingHeader({
  label,
  column,
  sortedState,
  sortIndex,
}: {
  label: string;
  column: Column<UserWithAssessment, unknown>;
  sortedState: false | "asc" | "desc";
  sortIndex: number;
}) {
  return (
    <Button
      variant="ghost"
      onClick={() => {
        const currentSortedState = column.getIsSorted();

        if (currentSortedState === false) {
          column.toggleSorting(false, true);
          return;
        }

        if (currentSortedState === "asc") {
          column.toggleSorting(true, true);
          return;
        }

        column.clearSorting();
      }}
    >
      {label}
      {sortedState === "asc" ? (
        <div className="ml-0.5 inline-flex items-start gap-0.5">
          <ArrowUp className="h-4 w-4" />
          <span className="-translate-y-0.5 font-mono text-[10px] leading-none text-muted-foreground">
            {sortIndex + 1}
          </span>
        </div>
      ) : sortedState === "desc" ? (
        <div className="ml-0.5 inline-flex items-start gap-0.5">
          <ArrowDown className="h-4 w-4" />
          <span className="-translate-y-0.5 font-mono text-[10px] leading-none text-muted-foreground">
            {sortIndex + 1}
          </span>
        </div>
      ) : (
        <div className="ml-0.5 inline-flex items-start gap-0.5">
          <ArrowUpDown className="h-4 w-4" />
          <span className="invisible -translate-y-0.5 font-mono text-[10px] leading-none">
            0
          </span>
        </div>
      )}
    </Button>
  );
}

function getAverageValue(values: number[]) {
  if (values.length === 0) {
    return "-";
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  return (total / values.length).toFixed(1);
}
