import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { cn } from "src/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const columnAlignmentClassNames = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

type ColumnAlignment = keyof typeof columnAlignmentClassNames;
type AlignMeta = { align?: ColumnAlignment };

const sortingHeaderAlignmentClassNames = {
  left: "w-full justify-start",
  center: "w-full justify-center",
  right: "w-full justify-end",
} as const;

export function DataTable<TData>({
  columns,
  data,
}: {
  columns: ColumnDef<TData>[];
  data: TData[];
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  return (
    <div className="">
      <div className="flex items-center gap-2 py-4">
        <Input
          placeholder="Filter by name..."
          value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("name")?.setFilterValue(event.target.value)
          }
        />
        <FilterColumns
          columns={table.getAllColumns()}
          columnVisibility={columnVisibility}
        />
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      columnAlignmentClassNames[
                        (header.column.columnDef.meta as AlignMeta | undefined)
                          ?.align ?? "left"
                      ]
                    }
                    style={{ width: header.getSize() }}
                  >
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
                    <TableCell
                      key={cell.id}
                      className={
                        columnAlignmentClassNames[
                          (cell.column.columnDef.meta as AlignMeta | undefined)
                            ?.align ?? "left"
                        ]
                      }
                      style={{ width: cell.column.getSize() }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter>
            {table.getFooterGroups().map((footerGroup) => (
              <TableRow key={footerGroup.id}>
                {footerGroup.headers.map((header) => (
                  <TableCell
                    key={header.id}
                    className={
                      columnAlignmentClassNames[
                        (header.column.columnDef.meta as AlignMeta | undefined)
                          ?.align ?? "left"
                      ]
                    }
                    style={{ width: header.getSize() }}
                  >
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
      <div className="flex-1 text-right text-sm text-muted-foreground">
        {table.getFilteredSelectedRowModel().rows.length} of{" "}
        {table.getFilteredRowModel().rows.length} row(s) selected
      </div>
    </div>
  );
}

function FilterColumns<TData, TValue>({
  columns,
  columnVisibility,
}: {
  columns: Column<TData, TValue>[];
  columnVisibility: VisibilityState;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="ml-auto">
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {columns
          .filter((column) => column.getCanHide())
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="capitalize"
                checked={columnVisibility[column.id] ?? true}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {column.id}
              </DropdownMenuCheckboxItem>
            );
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Since column does not change on re-render, react compiler memoizes it and does not display changes. That's why we need to pass sortedState and sortIndex as separate props to SortingHeader component.
export function SortingHeader<TData, TValue>({
  label,
  column,
  sortedState,
  sortIndex,
}: {
  label: string;
  column: Column<TData, TValue>;
  sortedState: false | "asc" | "desc";
  sortIndex: number;
}) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "p-0",
        sortingHeaderAlignmentClassNames[
          (column.columnDef.meta as AlignMeta | undefined)?.align ?? "left"
        ],
      )}
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

export function ActionsDropdown({
  actions,
}: {
  actions: { label: string; action: () => void }[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-4 w-4 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        {actions.map((action, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: actions are static
          <DropdownMenuItem key={index} onClick={action.action}>
            {action.label}
          </DropdownMenuItem>
        ))}
        {/* <DropdownMenuSeparator /> */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
