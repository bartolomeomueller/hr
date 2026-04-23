import {
  type FormAsyncValidateOrFn,
  type FormValidateOrFn,
  type ReactFormExtendedApi,
  useForm,
} from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type z from "zod";
import { useCandidateFlowForm } from "@/components/interview/CandidateFlowFormContext";
import {
  getCurrentFlowStepFormDefaultValues,
  QuestionBlock,
} from "@/components/interview/questions/QuestionBlock";
import { useCurrentFlowStepIsAnswered } from "@/components/interview/questions/useCurrentFlowStepIsAnswered";
import { VideoQuestion } from "@/components/interview/questions/VideoQuestion";
import { Button } from "@/components/ui/button";
import { H1 } from "@/components/ui/typography";
import { orpc } from "@/orpc/client";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";

// TODO think about what to do with the questions that have not been answered by a applicant, should they get an empty answer or no answer

// TODO think about how to lock down an interview
// a finished interview should not be accessible anymore
// a unfinished interview should promt a email, if the candidate would like to continue his interview, or if should be deleted
// unfinished interviews should be deleted after a certain time

export function Interview({
  uuid,
  currentFlowStep,
  navigateToStep,
  onResourceNotFound,
  navigateToFinalize,
}: {
  uuid: string;
  currentFlowStep?: number;
  navigateToStep: (step: number) => void;
  onResourceNotFound: () => never;
  navigateToFinalize: () => void;
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
    orpc.getQuestionsByInterviewUuid.queryOptions({ input: { uuid } }),
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

  const interviewRelatedData =
    interviewRelatedDataQuery.data ?? onResourceNotFound();
  const questionsData = questionsQuery.data ?? onResourceNotFound();

  const initialFlowStep = questionsData.flowSteps[0];
  if (!initialFlowStep) {
    throw new Error(
      "At least one flow step is required to render an interview. This should never happen, please report it.",
    );
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

  return (
    <InterviewStepContent
      currentFlowStep={currentFlowStep}
      flowSteps={questionsData.flowSteps}
      questions={questionsData.questions}
      roleName={questionsData.role.roleName}
      interviewUuid={interviewRelatedData.interview.uuid}
      answers={interviewRelatedData.answers}
      queryKeyToInvalidateAnswers={interviewRelatedDataQueryOptions.queryKey}
      navigateToStep={navigateToStep}
      navigateToFinalize={navigateToFinalize}
    />
  );
}

function InterviewStepContent({
  currentFlowStep,
  flowSteps,
  questions,
  roleName,
  interviewUuid,
  answers,
  queryKeyToInvalidateAnswers,
  navigateToStep,
  navigateToFinalize,
}: {
  currentFlowStep?: number;
  flowSteps: Array<{ uuid: string; position: number; kind: string | null }>;
  questions: Array<z.infer<typeof QuestionSelectSchema>>;
  roleName: string;
  interviewUuid: string;
  answers: Array<z.infer<typeof AnswerSelectSchema>>;
  queryKeyToInvalidateAnswers: ReturnType<
    typeof orpc.getInterviewRelatedDataByInterviewUuid.queryOptions
  >["queryKey"];
  navigateToStep: (step: number) => void;
  navigateToFinalize: () => void;
}) {
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
  const currentFlowStepQuestions = questions.filter(
    (question) => question.flowStepUuid === currentFlowStepData.uuid,
  );
  const form = useForm({
    formId: currentFlowStepData.uuid,
    defaultValues: getCurrentFlowStepFormDefaultValues({
      questions,
      answers,
      currentFlowStepUuid: currentFlowStepData.uuid,
    }),
  });
  const previousFlowStep =
    activeFlowStepIndex > 0 ? flowSteps.at(activeFlowStepIndex - 1) : null;
  const nextFlowStep = flowSteps.at(activeFlowStepIndex + 1) ?? null;
  const currentFlowStepIsAnswered = useCurrentFlowStepIsAnswered({
    currentFlowStepKind,
    currentFlowStepQuestions,
    answers,
  });

  return (
    <div className="flex justify-center px-2 sm:px-4 md:px-8">
      <div className="flex w-full flex-col gap-4 lg:w-9/12">
        <H1>{roleName}</H1>
        <InterviewNavigation
          previousFlowStepPosition={previousFlowStep?.position}
          nextFlowStepPosition={nextFlowStep?.position}
          currentFlowStepIsAnswered={currentFlowStepIsAnswered}
          navigateToStep={navigateToStep}
          navigateToFinalize={navigateToFinalize}
        />
        {currentFlowStepKind === "question_block" && (
          <QuestionBlock
            form={form}
            questions={currentFlowStepQuestions}
            interviewUuid={interviewUuid}
            queryKeyToInvalidateAnswers={queryKeyToInvalidateAnswers}
            answers={answers}
          />
        )}
        {currentFlowStepKind === "video" && (
          <VideoQuestion
            questions={currentFlowStepQuestions}
            interviewUuid={interviewUuid}
            queryKeyToInvalidateAnswers={queryKeyToInvalidateAnswers}
            answers={answers}
          />
        )}
        <InterviewNavigation
          previousFlowStepPosition={previousFlowStep?.position}
          nextFlowStepPosition={nextFlowStep?.position}
          currentFlowStepIsAnswered={currentFlowStepIsAnswered}
          navigateToStep={navigateToStep}
          navigateToFinalize={navigateToFinalize}
        />
      </div>
    </div>
  );
}

function InterviewNavigation({
  previousFlowStepPosition,
  nextFlowStepPosition,
  currentFlowStepIsAnswered,
  navigateToStep,
  navigateToFinalize,
}: {
  previousFlowStepPosition?: number;
  nextFlowStepPosition?: number;
  currentFlowStepIsAnswered: boolean;
  navigateToStep: (step: number) => void;
  navigateToFinalize: () => void;
}) {
  return (
    <div className="flex justify-between">
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          if (previousFlowStepPosition === undefined) return;
          navigateToStep(previousFlowStepPosition);
        }}
        disabled={previousFlowStepPosition === undefined}
      >
        Zurück
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          if (!currentFlowStepIsAnswered) return;
          if (nextFlowStepPosition === undefined) return navigateToFinalize();
          navigateToStep(nextFlowStepPosition);
        }}
        disabled={!currentFlowStepIsAnswered}
      >
        {nextFlowStepPosition === undefined
          ? "Bewerbung abschließen"
          : "Weiter"}
      </Button>
    </div>
  );
}

type getFormDefaultValuesReturnType = ReturnType<
  typeof getCurrentFlowStepFormDefaultValues
>;

// Generated by hovering over form variable in the Interview component.
export type InterviewFormType = ReactFormExtendedApi<
  getFormDefaultValuesReturnType,
  FormValidateOrFn<getFormDefaultValuesReturnType> | undefined,
  FormValidateOrFn<getFormDefaultValuesReturnType> | undefined,
  FormAsyncValidateOrFn<getFormDefaultValuesReturnType> | undefined,
  FormValidateOrFn<getFormDefaultValuesReturnType> | undefined,
  FormAsyncValidateOrFn<getFormDefaultValuesReturnType> | undefined,
  FormValidateOrFn<getFormDefaultValuesReturnType> | undefined,
  FormAsyncValidateOrFn<getFormDefaultValuesReturnType> | undefined,
  FormValidateOrFn<getFormDefaultValuesReturnType> | undefined,
  FormAsyncValidateOrFn<getFormDefaultValuesReturnType> | undefined,
  FormAsyncValidateOrFn<getFormDefaultValuesReturnType> | undefined,
  unknown
>;
