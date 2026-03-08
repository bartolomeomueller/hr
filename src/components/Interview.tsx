import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCandidateFlowForm } from "@/components/CandidateFlowFormContext";
import { orpc } from "@/orpc/client";

export function Interview({
  uuid,
  roleSlug,
  questionSetVersion,
  onResourceNotFound,
}: {
  uuid: string;
  roleSlug: string;
  questionSetVersion: number;
  onResourceNotFound: () => never;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { hideForm, showForm } = useCandidateFlowForm();

  // NOTE both queries will not run in parallel
  // see https://tanstack.com/query/latest/docs/framework/react/guides/parallel-queries#manual-parallel-queries
  // i think it is fine, since those queries should be prefetched already by the role component or the loader
  // but in the future this should be determined and if needed useSuspenseQueries should be used
  const interviewRelatedDataQueryOptions =
    orpc.getInterviewRelatedDataByInterviewUuid.queryOptions({
      input: { uuid },
    });
  const interviewRelatedDataQuery = useSuspenseQuery(
    interviewRelatedDataQueryOptions,
  );

  const questionsQuery = useSuspenseQuery(
    orpc.getQuestionsByRoleSlugAndQuestionSetVersion.queryOptions({
      input: {
        roleSlug,
        questionSetVersion,
      },
    }),
  );

  const addParticipantMutation = useMutation({
    ...orpc.addParticipantToInterview.mutationOptions(),
    onMutate: async (variables, context) => {
      await context.client.cancelQueries({
        queryKey: interviewRelatedDataQueryOptions.queryKey,
      });

      const previousData = context.client.getQueryData(
        interviewRelatedDataQueryOptions.queryKey,
      );

      context.client.setQueryData(
        interviewRelatedDataQueryOptions.queryKey,
        (oldData) => {
          if (!oldData) return oldData;

          const newCandiadate = {
            uuid: "optimistic-candidate-uuid",
            name: variables.name,
            email: variables.email,
          };
          return {
            ...oldData,
            interview: {
              ...oldData.interview,
              candidateUuid: newCandiadate.uuid,
            },
            candidate: newCandiadate,
          };
        },
      );

      return { previousData };
    },
    onError: (_error, _variables, onMutateResult, context) => {
      context.client.setQueryData(
        interviewRelatedDataQueryOptions.queryKey,
        onMutateResult?.previousData,
      );
      // NOTE we could try to show the error here to the user somehow
      // better would be with the onError function at the component level
    },
    onSettled: (_data, _error, _variables, _onMutateResult, context) => {
      context.client.invalidateQueries({
        queryKey: interviewRelatedDataQueryOptions.queryKey,
      });
    },
  });

  const handleParticipantSubmit = async ({
    name,
    email,
  }: {
    name: string;
    email: string;
  }) => {
    setSubmitError(null);
    // NOTE before running the mutation we should verify that the input will not be rejected by the backend
    // Therefore we could shake (animate) the component to then show why the input is invalid.

    try {
      await addParticipantMutation.mutateAsync({
        interviewUuid: uuid,
        name,
        email,
      });
    } catch (_) {
      // NOTE to accompany the optimistic update we could show a toast message indicating the update is in flight
      // but that may also be too much, as it kills the positives things of optimistic updates
      // We should just make sure this never fails for users as it is our first and most important impression
      setSubmitError(
        "Deine Daten konnten leider nicht gespeichert werden. Bitte versuche es erneut.",
      );
    }
  };

  useEffect(() => {
    return () => {
      hideForm();
    };
  }, [hideForm]);

  useEffect(() => {
    if (interviewRelatedDataQuery.data?.candidate === null) {
      showForm({
        canSubmit: true,
        errorMessage: submitError,
        onSubmit: handleParticipantSubmit,
      });
      return;
    }

    hideForm();
  }, [
    // biome-ignore lint/correctness/useExhaustiveDependencies: React Compiler stabilizes handleParticipantSubmit
    handleParticipantSubmit,
    hideForm,
    interviewRelatedDataQuery.data?.candidate,
    showForm,
    submitError,
  ]);

  if (!interviewRelatedDataQuery.data || !questionsQuery.data) {
    return onResourceNotFound();
  }

  if (
    interviewRelatedDataQuery.data.interview.questionSetUuid !==
    questionsQuery.data.questionSet.uuid
  )
    throw new Error(
      "Mismatching question set data. This should never happen, please try again.",
    ); // TODO think about a better error handling strategy

  if (interviewRelatedDataQuery.data.candidate === null) {
    return null;
  }

  return (
    <div>
      <h2>{questionsQuery.data.role.roleName}</h2>
      <ul>
        {questionsQuery.data.questions.map((question) => (
          <li key={question.uuid}>
            <strong>#{question.position}</strong>{" "}
            {getQuestionPrompt(question.questionPayload)} (
            {question.questionType} → {question.answerType})
          </li>
        ))}
      </ul>
      <p>Recorded answers: {interviewRelatedDataQuery.data.steps.length}</p>
    </div>
  );
}

function getQuestionPrompt(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Untitled question";
  }

  const prompt = (payload as Record<string, unknown>).prompt;

  return typeof prompt === "string" && prompt.length > 0
    ? prompt
    : "Untitled question";
}
