import {
  skipToken,
  useMutation,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  candidateFlowNoopSubmit,
  useCandidateFlowForm,
} from "@/components/CandidateFlowFormContext";
import { H1 } from "@/components/ui/typography";
import { orpc } from "@/orpc/client";
import { Button } from "./ui/button";

// For maximum performance this site creates a waterfall system of queries:
// 1. In the loader of the route fetch the role.
// 2. In the component fetch a stable question set (to not run into inconsistencies).
//   This query is also used by the interview component, so it is prefetched here.
// 3. In the component create the interview with the fetched questionset by query 2, but immediately switch to the interview component.
export function RoleContainer({
  slug,
  onResourceNotFound,
  onNavigateToInterview,
}: {
  slug: string;
  onResourceNotFound: () => never;
  onNavigateToInterview: (
    interviewUuid: string,
    slug: string,
    version: number,
  ) => Promise<void>;
}) {
  const [showCandidateGreetingForm, setShowCandidateGreetingForm] =
    useState(false);
  const { hideForm, showForm } = useCandidateFlowForm();

  const roleQueryOptions = orpc.getRoleAndItsFlowVersionBySlug.queryOptions({
    input: { slug },
  });
  const roleQuery = useSuspenseQuery(roleQueryOptions);

  const createInterviewMutation = useMutation({
    ...orpc.createInterviewForRoleAndFlowVersion.mutationOptions(),
    onMutate: async (_variables, _context) => {
      setShowCandidateGreetingForm(true);
    },
    onError: (_error, _variables, _context) => {
      // FIXME
      setShowCandidateGreetingForm(false);
    },
    onSuccess: async (data, variables, _onMutateResult, context) => {
      // NOTE This round trip could be eliminated by a refactor
      await context.client.fetchQuery(
        orpc.getInterviewRelatedDataByInterviewUuid.queryOptions({
          input: { uuid: data.uuid },
        }),
      );

      await onNavigateToInterview(
        data.uuid,
        slug, // TODO maybe update this somehow to a local variable or even better, just create an analogous query and preset it here and then refetch it immediately
        variables.flowVersion,
      );
    },
  });

  const roleData = roleQuery.data;

  // TODO think about just showing the form immediately not via useEffect
  useEffect(() => {
    if (showCandidateGreetingForm) {
      showForm({
        canSubmit: false,
        errorMessage: null,
        onSubmit: candidateFlowNoopSubmit,
      });
      return;
    }

    hideForm();
  }, [showCandidateGreetingForm, showForm, hideForm]);

  const questionsByRoleSlugAndFlowVersionQueryOptions =
    orpc.getQuestionsByRoleSlugAndFlowVersion.queryOptions({
      input: {
        roleSlug: slug,
        // Defaults to invalid version, query is disabled until roleData.flowVersion.version is defined
        flowVersion: roleData?.flowVersion.version ?? -1,
      },
    });

  const questionsAndFlowVersionQuery = useQuery({
    ...questionsByRoleSlugAndFlowVersionQueryOptions,
    queryFn: roleData
      ? questionsByRoleSlugAndFlowVersionQueryOptions.queryFn
      : skipToken,
  });

  if (!roleData) {
    return onResourceNotFound();
  }

  const handleStartInterview = async () => {
    const interview = await createInterviewMutation.mutateAsync({
      roleUuid: roleData.role.uuid,
      // Defaults to invalid version, query is disabled until roleData.flowVersion.version is defined
      flowVersion: questionsAndFlowVersionQuery.data?.flowVersion.version ?? -1,
    });

    await onNavigateToInterview(
      interview.uuid,
      slug,
      roleData.flowVersion.version,
    );
  };

  if (showCandidateGreetingForm) {
    return null;
  }

  return (
    <div className="flex justify-center">
      <div className="flex w-[75ch] flex-col items-center gap-8">
        <H1>{roleData.role.roleName}</H1>
        <Button
          type="button"
          onClick={() => handleStartInterview()}
          disabled={
            !questionsAndFlowVersionQuery.data ||
            createInterviewMutation.isPending
          }
        >
          {createInterviewMutation.isPending
            ? "Starting interview..."
            : "Start interview"}
        </Button>
      </div>
    </div>
  );
}
