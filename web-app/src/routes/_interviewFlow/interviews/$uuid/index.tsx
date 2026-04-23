import { createFileRoute, notFound } from "@tanstack/react-router";
import { Suspense } from "react";
import z from "zod";
import { FinalizeInterview } from "@/components/interview/FinalizeInterview";
import { Interview } from "@/components/interview/Interview";
import { GenericLoader } from "@/components/layout/GenericLoader";
import { orpc } from "@/orpc/client";
import { FlowStepSelectSchema } from "@/orpc/schema";

// TODO prevent that a user may record a video but may not upload it, check availablity first of backend somehow

const InterviewSearch = z.object({
  step: FlowStepSelectSchema.shape.position.optional(),
  finalize: z.boolean().optional(),
});

export const Route = createFileRoute("/_interviewFlow/interviews/$uuid/")({
  component: RouteComponent,
  validateSearch: InterviewSearch, // automatically parses and validates the search params
  loaderDeps: ({ search }) => ({ search }), // make search params available in the loader
  loader: async ({ params, context, deps }) => {
    const { uuid } = params;
    context.queryClient.ensureQueryData(
      orpc.getQuestionsByInterviewUuid.queryOptions({ input: { uuid } }),
    );
    context.queryClient.ensureQueryData(
      orpc.getInterviewRelatedDataByInterviewUuid.queryOptions({
        input: { uuid },
      }),
    );
  },
  // TODO clean this code up
  notFoundComponent: ({ data }) => {
    if (!data || typeof data !== "object" || !("uuid" in data)) {
      return <div>Interview not found. Please return to home.</div>;
    }
    return (
      <div>
        Interview with uuid "{String(data.uuid)}" not found. Please return to
        home.
      </div>
    );
  },
});

function RouteComponent() {
  const { uuid } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const handleResourceNotFound = () => {
    throw notFound({ routeId: Route.id, data: { uuid } });
  };

  const handleFlowStepChange = (step: number) => {
    void navigate({
      search: (previousSearch) => ({
        ...previousSearch,
        step,
      }),
    });
  };

  const finalizeInterview = () => {
    void navigate({
      search: (previousSearch) => ({
        ...previousSearch,
        step: undefined,
        finalize: true,
      }),
    });
  };

  return (
    <Suspense fallback={<GenericLoader />}>
      {search.finalize ? (
        <FinalizeInterview
          uuid={uuid}
          onResourceNotFound={handleResourceNotFound}
        />
      ) : (
        <Interview
          uuid={uuid}
          currentFlowStep={search.step}
          onFlowStepChange={handleFlowStepChange}
          onResourceNotFound={handleResourceNotFound}
          finalizeInterview={finalizeInterview}
        />
      )}
    </Suspense>
  );
}
