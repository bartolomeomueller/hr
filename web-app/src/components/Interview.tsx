import {
  type FormAsyncValidateOrFn,
  type FormValidateOrFn,
  type ReactFormExtendedApi,
  useForm,
} from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type z from "zod";
import { useCandidateFlowForm } from "@/components/CandidateFlowFormContext";
import {
  MultipleChoiceAnswerPayloadType,
  QuestionType,
  SingleChoiceAnswerPayloadType,
  TextAnswerPayloadType,
} from "@/db/payload-types";
import { orpc } from "@/orpc/client";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import { QuestionBlock } from "./questions/QuestionBlock";
import { VideoQuestion } from "./questions/VideoQuestion";
import { Button } from "./ui/button";
import { H1 } from "./ui/typography";

// TODO think about what to do with the questions that have not been answered by a applicant, should they get an empty answer or no answer

export function Interview({
  uuid,
  currentFlowStep,
  onFlowStepChange,
  onResourceNotFound,
  finalizeInterview,
}: {
  uuid: string;
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

  // TODO maybe hook the buttons of next and previous to the form state, only let next button enabled if all required questions have an answer
  const form = useForm({
    defaultValues: getFormDefaultValues({
      questions: questionsQuery.data?.questions,
      answers: interviewRelatedDataQuery.data?.answers,
      currentFlowStepUuid: questionsQuery.data?.flowSteps.find(
        (step) =>
          step.position ===
          (currentFlowStep ?? questionsQuery.data?.flowSteps[0].position),
      )?.uuid,
    }),
  });

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
  const previousFlowStep =
    activeFlowStepIndex > 0 ? flowSteps.at(activeFlowStepIndex - 1) : null;
  const nextFlowStep = flowSteps.at(activeFlowStepIndex + 1) ?? null;

  return (
    <div className="flex justify-center px-2 sm:px-4 md:px-8">
      <div className="flex w-full flex-col gap-2 lg:w-9/12">
        <H1>{questionsData.role.roleName}</H1>
        <div className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!previousFlowStep) return;
              onFlowStepChange(previousFlowStep.position);
            }}
            disabled={!previousFlowStep}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!nextFlowStep) return finalizeInterview();
              onFlowStepChange(nextFlowStep.position);
            }}
          >
            Next
          </Button>
        </div>
        {currentFlowStepKind === "question_block" && (
          <QuestionBlock
            form={form}
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
    </div>
  );
}

type getFormDefaultValuesReturnType = ReturnType<typeof getFormDefaultValues>;

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

// TODO somehow export the form type
function getFormDefaultValues({
  questions,
  answers,
  currentFlowStepUuid,
}: {
  questions?: Array<z.infer<typeof QuestionSelectSchema>>;
  answers?: Array<z.infer<typeof AnswerSelectSchema>>;
  currentFlowStepUuid?: string;
}): Record<string, string | string[]> {
  // answers may be [] but not undefined
  if (!questions || !answers)
    throw new Error("Questions and answers are required to get form options");

  const currentQuestions = questions.filter(
    (q) => q.flowStepUuid === currentFlowStepUuid,
  );

  const formOptions = currentQuestions.reduce((options, question) => {
    const answer = answers.find((a) => a.questionUuid === question.uuid);

    // biome-ignore lint/suspicious/noExplicitAny: Shut up
    let initialValue: any;
    switch (question.questionType) {
      case QuestionType.video: {
        initialValue = ""; //TODO
        break;
      }
      case QuestionType.text: {
        if (!answer) {
          initialValue = "";
          break;
        }
        const textAnswerPayloadResult = TextAnswerPayloadType.safeParse(
          answer.answerPayload,
        );
        if (!textAnswerPayloadResult.success)
          throw new Error("Report this bug.");
        initialValue = textAnswerPayloadResult.data.answer;
        break;
      }
      case QuestionType.single_choice: {
        if (!answer) {
          initialValue = "";
          break;
        }
        const singleChoiceAnswerPayloadResult =
          SingleChoiceAnswerPayloadType.safeParse(answer.answerPayload);
        if (!singleChoiceAnswerPayloadResult.success)
          throw new Error("Report this bug.");
        initialValue = singleChoiceAnswerPayloadResult.data.selectedOption;
        break;
      }
      case QuestionType.multiple_choice: {
        if (!answer) {
          initialValue = [];
          break;
        }
        const multipleChoiceAnswerPayloadResult =
          MultipleChoiceAnswerPayloadType.safeParse(answer.answerPayload);
        if (!multipleChoiceAnswerPayloadResult.success)
          throw new Error("Report this bug.");
        initialValue =
          multipleChoiceAnswerPayloadResult.data.selectedOptions ?? [];
        break;
      }
      case QuestionType.document: {
        initialValue = ""; //TODO
        break;
      }
      default:
        throw new Error(
          `Unknown question type ${question.questionType}. This should never happen, please report it.`,
        );
    }

    return {
      ...options,
      [question.uuid]: initialValue ?? "",
    };
  }, {});
  console.log("Form options:", formOptions);
  return formOptions;
}
