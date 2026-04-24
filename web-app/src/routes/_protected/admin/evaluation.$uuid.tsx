import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { GenericLoader } from "@/components/layout/GenericLoader";
import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/_protected/admin/evaluation/$uuid")({
  loader: ({ params, context }) => {
    context.queryClient.ensureQueryData(
      orpc.getEvaluationRelatedDataByInterviewUuid.queryOptions({
        input: { uuid: params.uuid },
      }),
    );
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Suspense fallback={<GenericLoader />}>
      <Evaluation uuid={Route.useParams().uuid} />
    </Suspense>
  );
}

function Evaluation({ uuid }: { uuid: string }) {
  const evaluationRelatedDataQuery = useSuspenseQuery(
    orpc.getEvaluationRelatedDataByInterviewUuid.queryOptions({
      input: { uuid },
    }),
  );

  return <div>{evaluationRelatedDataQuery.data?.candidate?.name}</div>;
}
