import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCandidateFlowForm } from "@/components/CandidateFlowFormContext";
import { orpc } from "@/orpc/client";
import { QuestionBlock } from "./QuestionBlock";
import { VideoQuestion } from "./VideoQuestion";

export function Interview({
  uuid,
  roleSlug,
  flowVersion,
  currentFlowStep,
  onFlowStepChange,
  onResourceNotFound,
  finalizeInterview,
}: {
  uuid: string;
  roleSlug: string;
  flowVersion: number;
  currentFlowStep?: number;
  onFlowStepChange: (step: number) => void;
  onResourceNotFound: () => never;
  finalizeInterview: () => void;
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
    orpc.getQuestionsByRoleSlugAndFlowVersion.queryOptions({
      input: {
        roleSlug,
        flowVersion,
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

  // NOTE this is unidiomatic. use mutate (without async) and use the provided hooks
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

  // To show or to hide the CandidateGreetingForm
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

  // On dismount of the component we want to make sure the CandidateGreetingForm is hidden again.
  // Otherwise on using the browser back button the form would still be visible, while the role component loads.
  useEffect(() => {
    return () => {
      hideForm();
    };
  }, [hideForm]);

  const interviewRelatedData = interviewRelatedDataQuery.data;
  const questionsData = questionsQuery.data;
  if (!interviewRelatedData || !questionsData) {
    return onResourceNotFound();
  }

  if (
    interviewRelatedData.interview.flowVersionUuid !==
    questionsData.flowVersion.uuid
  )
    throw new Error(
      "Mismatched flow version data. This should never happen, please report this bug.",
    );

  // In this case, only the CandidateGreetingForm will be shown
  if (interviewRelatedData.candidate === null) {
    return null;
  }

  const flowSteps = questionsData.flowSteps;
  const activeFlowStepPosition = currentFlowStep ?? flowSteps[0].position; // if search param is not yet defined
  const activeFlowStepIndex = flowSteps.findIndex(
    (step) => step.position === activeFlowStepPosition,
  );
  if (activeFlowStepIndex === -1)
    throw new Error(
      `Current flow step ${String(activeFlowStepPosition)} does not exist in the provided flow steps. Possible values are ${flowSteps
        .map((step) => step.position)
        .join(", ")}.`,
    );

  const currentFlowStepData = flowSteps[activeFlowStepIndex];
  const currentFlowStepKind = currentFlowStepData.kind;
  if (!currentFlowStepKind)
    throw new Error(
      "Current flow step does not exist in the provided flow steps. This should never happen, please report it.",
    );
  const currentFlowStepQuestions = questionsData.questions.filter(
    (question) => question.flowStepUuid === currentFlowStepData.uuid,
  );
  const previousFlowStep = flowSteps.at(activeFlowStepIndex - 1) ?? null;
  const nextFlowStep = flowSteps.at(activeFlowStepIndex + 1) ?? null;

  return (
    <div>
      <h2>{questionsData.role.roleName}</h2>
      <div>
        <button
          type="button"
          className="disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => {
            if (!previousFlowStep) return;
            onFlowStepChange(previousFlowStep.position);
          }}
          disabled={!previousFlowStep}
        >
          Previous
        </button>
        <button
          type="button"
          className=""
          onClick={() => {
            if (!nextFlowStep) return finalizeInterview();
            onFlowStepChange(nextFlowStep.position);
          }}
        >
          Next
        </button>
      </div>
      {currentFlowStepKind === "question_block" && (
        <QuestionBlock
          questions={currentFlowStepQuestions}
          interviewUuid={interviewRelatedData.interview.uuid}
          queryKeyToInvalidateAnswers={
            interviewRelatedDataQueryOptions.queryKey
          }
          answers={interviewRelatedData.answers}
        />
      )}
      {currentFlowStepKind === "video" && (
        <VideoQuestion
          questions={currentFlowStepQuestions}
          interviewUuid={interviewRelatedData.interview.uuid}
          queryKeyToInvalidateAnswers={
            interviewRelatedDataQueryOptions.queryKey
          }
          answers={interviewRelatedData.answers}
        />
      )}
    </div>
  );
}
