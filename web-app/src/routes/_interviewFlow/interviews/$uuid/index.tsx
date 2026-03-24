import { createFileRoute, notFound } from "@tanstack/react-router";
import { Suspense } from "react";
import z from "zod";
import { FinalizeInterview } from "@/components/FinalizeInterview";
import { GenericLoader } from "@/components/GenericLoader";
import { Interview } from "@/components/Interview";
import { orpc } from "@/orpc/client";
import {
  FlowStepSelectSchema,
  FlowVersionSelectSchema,
  RoleSelectSchema,
} from "@/orpc/schema";

// TODO prevent that a user may record a video but may not upload it, check availablity first of backend somehow

const InterviewSearch = z.object({
  slug: RoleSelectSchema.shape.slug.optional(),
  version: FlowVersionSelectSchema.shape.version.optional(),
  step: FlowStepSelectSchema.shape.position.optional(),
  finalize: z.boolean().optional(),
});

export const Route = createFileRoute("/_interviewFlow/interviews/$uuid/")({
  component: RouteComponent,
  validateSearch: InterviewSearch, // automatically parses and validates the search params
  loaderDeps: ({ search }) => ({ search }), // make search params available in the loader
  loader: async ({ params, context, deps }) => {
    const { uuid } = params;
    if (deps.search.slug && deps.search.version) {
      // The user got to this route via the role page, this is the normal flow, we can use streaming ssr
      context.queryClient.ensureQueryData(
        orpc.getQuestionsByRoleSlugAndFlowVersion.queryOptions({
          input: {
            roleSlug: deps.search.slug,
            flowVersion: deps.search.version,
          },
        }),
      );
      context.queryClient.ensureQueryData(
        orpc.getInterviewRelatedDataByInterviewUuid.queryOptions({
          input: { uuid },
        }),
      );
    } else {
      // The user modified the created url manually. We cannot directly get all data, but we still get the data
      const interviewRelatedData = await context.queryClient.fetchQuery(
        orpc.getInterviewRelatedDataByInterviewUuid.queryOptions({
          input: { uuid },
        }),
      );
      if (!interviewRelatedData) {
        throw notFound({ routeId: Route.id, data: { uuid } });
      }
      const roleSlugAndFlowVersion = await context.queryClient.fetchQuery(
        orpc.getRoleSlugAndFlowVersionByInterviewUuid.queryOptions({
          input: { uuid },
        }),
      );
      if (!roleSlugAndFlowVersion) {
        throw notFound({
          routeId: Route.id,
          data: { uuid },
        });
      }
      context.queryClient.ensureQueryData(
        orpc.getQuestionsByRoleSlugAndFlowVersion.queryOptions({
          input: {
            roleSlug: roleSlugAndFlowVersion.roleSlug,
            flowVersion: roleSlugAndFlowVersion.flowVersion,
          },
        }),
      );
    }
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
          roleSlug={search.slug ?? ""} // FIXME
          flowVersion={search.version ?? -1} // FIXME
          onResourceNotFound={handleResourceNotFound}
        />
      ) : (
        <Interview
          uuid={uuid}
          roleSlug={search.slug ?? ""} // FIXME
          flowVersion={search.version ?? -1} // FIXME
          currentFlowStep={search.step}
          onFlowStepChange={handleFlowStepChange}
          onResourceNotFound={handleResourceNotFound}
          finalizeInterview={finalizeInterview}
        />
      )}
    </Suspense>
  );
}
