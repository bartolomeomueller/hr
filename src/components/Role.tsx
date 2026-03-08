import {
  skipToken,
  useMutation,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "@/orpc/client";
import { CandidateGreetingForm } from "./CandidateGreetingForm";

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

  const roleQueryOptions = orpc.getRoleAndItsQuestionSetBySlug.queryOptions({
    input: { slug },
  });
  const roleQuery = useSuspenseQuery(roleQueryOptions);

  const createInterviewMutation = useMutation({
    ...orpc.createInterviewForRoleAndQuestionSet.mutationOptions(),
    onMutate: async (variables, context) => {
      setShowCandidateGreetingForm(true);
    },
    onError: (error, variables, context) => {
      // FIXME
      setShowCandidateGreetingForm(false);
    },
    onSuccess: async (data, variables, onMutateResult, context) => {
      // NOTE This round trip could be eliminated by a refactor
      await context.client.fetchQuery(
        orpc.getInterviewRelatedDataByInterviewUuid.queryOptions({
          input: { uuid: data.uuid },
        }),
      );

      await onNavigateToInterview(
        data.uuid,
        slug, // TODO maybe update this somehow to a local variable
        variables.questionSetVersion,
      );
    },
  });

  const roleData = roleQuery.data;

  const questionsByRoleSlugAndQuestionSetVersionQueryOptions =
    orpc.getQuestionsByRoleSlugAndQuestionSetVersion.queryOptions({
      input: {
        roleSlug: slug,
        // Defaults to invalid version, query is disabled until roleData.questionSet.version is defined
        questionSetVersion: roleData?.questionSet.version ?? -1,
      },
    });

  const questionsAndQuestionSetQuery = useQuery({
    ...questionsByRoleSlugAndQuestionSetVersionQueryOptions,
    queryFn: roleData
      ? questionsByRoleSlugAndQuestionSetVersionQueryOptions.queryFn
      : skipToken,
  });

  if (!roleData) {
    return onResourceNotFound();
  }

  const handleStartInterview = async () => {
    const interview = await createInterviewMutation.mutateAsync({
      roleUuid: roleData.role.uuid,
      // Defaults to invalid version, query is disabled until roleData.questionSet.version is defined
      questionSetVersion:
        questionsAndQuestionSetQuery.data?.questionSet.version ?? -1,
    });

    await onNavigateToInterview(
      interview.uuid,
      slug,
      roleData.questionSet.version,
    );
  };

  if (showCandidateGreetingForm) {
    return (
      <CandidateGreetingForm
        canSubmit={false}
        errorMessage={null}
        onSubmit={async () => {}}
      />
    );
  }

  return (
    <div>
      <h2>
        Role {roleData.role.uuid}: {roleData.role.roleName}
      </h2>
      <div>
        <button
          type="button"
          className="disabled:cursor-not-allowed disabled:opacity-70"
          onClick={() => handleStartInterview()}
          disabled={
            !questionsAndQuestionSetQuery.data ||
            createInterviewMutation.isPending
          }
        >
          {createInterviewMutation.isPending
            ? "Starting interview..."
            : "Start interview"}
        </button>
      </div>
    </div>
  );
}
