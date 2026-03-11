import { createFileRoute, notFound } from "@tanstack/react-router";
import { Suspense } from "react";
import z from "zod";
import { GenericLoader } from "@/components/GenericLoader";
import { Interview } from "@/components/Interview";
import { orpc } from "@/orpc/client";
import { QuestionSetSelectSchema, RoleSelectSchema } from "@/orpc/schema";

const InterviewSearch = z.object({
  slug: RoleSelectSchema.shape.slug.optional(),
  version: QuestionSetSelectSchema.shape.version.optional(),
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
        orpc.getQuestionsByRoleSlugAndQuestionSetVersion.queryOptions({
          input: {
            roleSlug: deps.search.slug,
            questionSetVersion: deps.search.version,
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
      const roleSlugAndQuestionSetVersion =
        await context.queryClient.fetchQuery(
          orpc.getRoleSlugAndQuestionSetVersionByInterviewUuid.queryOptions({
            input: { uuid },
          }),
        );
      if (!roleSlugAndQuestionSetVersion) {
        throw notFound({
          routeId: Route.id,
          data: { uuid },
        });
      }
      context.queryClient.ensureQueryData(
        orpc.getQuestionsByRoleSlugAndQuestionSetVersion.queryOptions({
          input: {
            roleSlug: roleSlugAndQuestionSetVersion.roleSlug,
            questionSetVersion:
              roleSlugAndQuestionSetVersion.questionSetVersion,
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

  const handleResourceNotFound = () => {
    throw notFound({ routeId: Route.id, data: { uuid } });
  };

  return (
    <Suspense fallback={<GenericLoader />}>
      <Interview
        uuid={uuid}
        roleSlug={search.slug ?? ""} // FIXME
        questionSetVersion={search.version ?? -1} // FIXME
        onResourceNotFound={handleResourceNotFound}
      />
    </Suspense>
  );
}
