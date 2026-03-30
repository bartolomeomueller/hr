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

// For better performance this site creates a waterfall system of queries:
// 1. In the loader of the route fetch the role.
// 2. In the component create the interview via a mutation, but immediately switch to the CandidateGreeting component.
// 3. On success of this mutation prefetch the queries for the interview related data and questions, which are needed for the interview component, and then navigate to the interview route.
// The user won't see the switch between the routes visually, because the interview route will show the CandidateGreeting component as well.
export function RoleContainer({
  slug,
  onResourceNotFound,
  onNavigateToInterview,
}: {
  slug: string;
  onResourceNotFound: () => never;
  onNavigateToInterview: (interviewUuid: string) => Promise<void>;
}) {
  const [showCandidateGreetingForm, setShowCandidateGreetingForm] =
    useState(false);
  const { hideForm, showForm } = useCandidateFlowForm();

  const roleQueryOptions = orpc.getRoleAndItsFlowVersionBySlug.queryOptions({
    input: { slug },
  });
  const roleQuery = useSuspenseQuery(roleQueryOptions);

  const createInterviewMutation = useMutation({
    ...orpc.createInterviewForRoleUuid.mutationOptions(),
    onMutate: async (_variables, _context) => {
      setShowCandidateGreetingForm(true);
    },
    onError: (_error, _variables, _context) => {
      // FIXME
      setShowCandidateGreetingForm(false);
    },
    onSuccess: async (data, _variables, _onMutateResult, context) => {
      // NOTE This round trip could be eliminated by a refactor by letting the mutate function return the interview related data directly
      await Promise.all([
        context.client.fetchQuery(
          orpc.getInterviewRelatedDataByInterviewUuid.queryOptions({
            input: { uuid: data.uuid },
          }),
        ),
        context.client.fetchQuery(
          orpc.getQuestionsByInterviewUuid.queryOptions({
            input: { uuid: data.uuid },
          }),
        ),
      ]);

      await onNavigateToInterview(data.uuid);
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

  if (!roleData) {
    return onResourceNotFound();
  }

  const handleStartInterview = async () => {
    const interview = await createInterviewMutation.mutateAsync({
      roleUuid: roleData.role.uuid,
    });

    await onNavigateToInterview(interview.uuid);
  };

  if (showCandidateGreetingForm) {
    return null;
  }

  return (
    <div className="flex justify-center">
      <div className="flex w-[75ch] flex-col items-center gap-8">
        <H1>{roleData.role.roleName}</H1>
        {/* TODO handle click in with mouse middle button */}
        <Button
          type="button"
          onClick={() => handleStartInterview()}
          disabled={createInterviewMutation.isPending}
        >
          {createInterviewMutation.isPending
            ? "Starting interview..."
            : "Start interview"}
        </Button>
      </div>
    </div>
  );
}
