import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText } from "lucide-react";
import { Suspense, useState } from "react";
import { DataTable, SortingHeader } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { isPreSignedURLStillValid } from "@/lib/utils";
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

// Add the evaluations of the candidates to the table

export function RoleTable({ roleSlug }: { roleSlug: string }) {
  const { data } = useSuspenseQuery(
    orpc.getAllFinishedInterviewsForRoleByRoleSlug.queryOptions({
      input: { slug: roleSlug },
    }),
  );
  const columns: ColumnDef<{
    interview: { uuid: string };
    candidate: { name: string };
    cvDocument: { documentUuid: string };
  }>[] = [
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
    {
      id: "cv",
      meta: { label: "Lebenslauf", align: "center" },
      header: "Lebenslauf",
      cell: ({ row }) => (
        <CvButton
          documentUuid={row.original.cvDocument.documentUuid}
          interviewUuid={row.original.interview.uuid}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    // TODO if the user already has evaluated the candidate, show "change evaluation" button
    {
      id: "evaluate",
      meta: { label: "Bewerten", align: "right" },
      cell: () => (
        <Button asChild>
          <Link to="/admin/roles/$slug" params={{ slug: roleSlug }}>
            Kandidat bewerten
          </Link>
        </Button>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];

  return (
    <div className="m-4">
      <DataTable columns={columns} data={data} />
    </div>
  );
}

function CvButton({
  documentUuid,
  interviewUuid,
}: {
  documentUuid: string;
  interviewUuid: string;
}) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [shouldOpenWhenReady, setShouldOpenWhenReady] = useState(false);
  const { mutate, isPending } = useMutation({
    ...orpc.createPresignedS3DocumentDownloadUrlByUuid.mutationOptions(),
    onSuccess: (data) => {
      setDownloadUrl(data.downloadUrl);

      if (!shouldOpenWhenReady) return;

      window.open(data.downloadUrl, "_blank");
      setShouldOpenWhenReady(false);
    },
    onError: () => {
      setShouldOpenWhenReady(false);
    },
  });

  const hasFreshDownloadUrl =
    downloadUrl !== null && isPreSignedURLStillValid(downloadUrl);
  const openCv = () => {
    if (hasFreshDownloadUrl) {
      window.open(downloadUrl, "_blank");
      return;
    }

    setShouldOpenWhenReady(true);
    mutate({
      documentUuid,
      interviewUuid,
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="CV ansehen"
      title="CV ansehen"
      onMouseEnter={() => {
        if (hasFreshDownloadUrl || isPending) return;

        mutate({
          documentUuid,
          interviewUuid,
        });
      }}
      onClick={openCv}
      onAuxClick={(event) => {
        if (event.button !== 1) return;

        event.preventDefault();
        openCv();
      }}
    >
      <FileText className="size-4" />
    </Button>
  );
}
