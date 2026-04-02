import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { orpc } from "@/orpc/client";
import {
  candidateFlowNoopSubmit,
  useCandidateFlowForm,
} from "./CandidateFlowFormContext";

// For better performance this site creates a waterfall system of queries:
// 1. In the Role component prefetch the role.
// 2. Immediately show the CandidateGreeting component. Then create the interview via a mutation.
// 3. On success of this mutation prefetch the queries for the interview related data and questions, which are needed for the interview component, and then navigate to the interview route.
// The user won't see the switch between the routes visually, because the interview route will show the CandidateGreeting component as well.
export function CreateInterview({
  slug,
  onNavigateToInterview,
  onResourceNotFound,
}: {
  slug: string;
  onNavigateToInterview: (interviewUuid: string) => Promise<void>;
  onResourceNotFound: () => never;
}) {
  const { showForm } = useCandidateFlowForm();

  const roleQuery = useSuspenseQuery(
    orpc.getRoleAndItsFlowVersionBySlug.queryOptions({ input: { slug } }),
  );
  const roleData = roleQuery.data;
  const roleUuid = roleData?.role.uuid;

  const hasStartedMutation = useRef(false); // Because react in dev mode mounts components twice, we need to keep track of whether the mutation has already been started to avoid creating two interviews.
  const createInterviewMutation = useMutation({
    ...orpc.createInterviewForRoleUuid.mutationOptions(),
    onError: (_error, _variables, _context) => {
      throw new Error("Failed to create interview"); // FIXME
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
    },
  });

  useEffect(() => {
    if (!roleUuid) {
      return;
    }

    showForm({
      canSubmit: false,
      errorMessage: null,
      onSubmit: candidateFlowNoopSubmit,
    });
    void (async () => {
      if (hasStartedMutation.current) return;
      hasStartedMutation.current = true;
      const interview = await createInterviewMutation.mutateAsync({
        roleUuid,
      });

      await onNavigateToInterview(interview.uuid);
    })();
  }, [
    roleUuid,
    showForm,
    createInterviewMutation.mutateAsync,
    onNavigateToInterview,
  ]);

  if (!roleData) {
    return onResourceNotFound();
  }

  return null;
}
