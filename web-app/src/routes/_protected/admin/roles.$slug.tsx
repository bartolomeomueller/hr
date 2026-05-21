import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { FileText } from "lucide-react";
import { Suspense } from "react";
import { DataTable, SortingHeader } from "@/components/admin/DataTable";
import { DocumentDownloadButton } from "@/components/admin/DocumentDownloadButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Muted } from "@/components/ui/typography";
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
    evaluations: {
      uuid: string;
      hardSkillsScore: number;
      softSkillsScore: number;
      culturalAddScore: number;
      potentialScore: number;
      finalScore: string;
      user: { name: string };
    }[];
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
        <DocumentDownloadButton
          documentUuid={row.original.cvDocument.documentUuid}
          interviewUuid={row.original.interview.uuid}
          variant="ghost"
          size="icon-sm"
          aria-label="CV ansehen"
          title="CV ansehen"
        >
          <FileText className="size-4" />
        </DocumentDownloadButton>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "evaluations",
      meta: { label: "Bewertungen", align: "right" },
      header: "Bewertungen",
      cell: ({ row }) => (
        <EvaluationSummary evaluations={row.original.evaluations} />
      ),
    },
    // TODO if the user already has evaluated the candidate, show "change evaluation" button
    {
      id: "evaluate",
      meta: { label: "Bewerten", align: "right" },
      cell: ({ row }) => (
        <Button asChild>
          <Link
            to="/admin/evaluation/$uuid"
            params={{ uuid: row.original.interview.uuid }}
          >
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

function EvaluationSummary({
  evaluations,
}: {
  evaluations: {
    uuid: string;
    hardSkillsScore: number;
    softSkillsScore: number;
    culturalAddScore: number;
    potentialScore: number;
    finalScore: string;
    user: { name: string };
  }[];
}) {
  if (evaluations.length === 0) {
    return <Muted>Keine Bewertung</Muted>;
  }

  const averageFinalScore = (
    evaluations.reduce(
      (sum, evaluation) => sum + Number(evaluation.finalScore),
      0,
    ) / evaluations.length
  ).toFixed(1);

  return (
    <HoverCard openDelay={0}>
      <HoverCardTrigger asChild>
        <Badge variant="outline" tabIndex={0} className="font-mono">
          {averageFinalScore}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent align="end">
        <div className="flex flex-col gap-3">
          {evaluations.map((evaluation) => (
            <div key={evaluation.uuid} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {evaluation.user.name}
                </span>
                <Badge variant="secondary" className="font-mono">
                  {evaluation.finalScore}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <EvaluationScoreDetail
                  label="Hard Skills"
                  score={evaluation.hardSkillsScore}
                />
                <EvaluationScoreDetail
                  label="Soft Skills"
                  score={evaluation.softSkillsScore}
                />
                <EvaluationScoreDetail
                  label="Cultural Add"
                  score={evaluation.culturalAddScore}
                />
                <EvaluationScoreDetail
                  label="Potential"
                  score={evaluation.potentialScore}
                />
              </dl>
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function EvaluationScoreDetail({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{score}</dd>
    </div>
  );
}
