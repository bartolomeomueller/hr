import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type z from "zod";
import { useCandidateFlowForm } from "@/components/CandidateFlowFormContext";
import { QuestionType } from "@/db/payload-types";
import { orpc } from "@/orpc/client";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";

export function Interview({
  uuid,
  roleSlug,
  flowVersion,
  onResourceNotFound,
}: {
  uuid: string;
  roleSlug: string;
  flowVersion: number;
  onResourceNotFound: () => never;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [currentFlowStep, setCurrentFlowStep] = useState(1); // TODO think about whether to put this as a search param
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

  const saveInverviewStepMutation = useMutation<
    z.infer<typeof AnswerSelectSchema>,
    Error,
    Pick<
      z.infer<typeof AnswerSelectSchema>,
      "interviewUuid" | "questionUuid" | "answerPayload"
    >,
    { previousData: typeof interviewRelatedDataQuery.data | undefined }
  >({
    ...orpc.saveAnswer.mutationOptions(),
    onMutate: async (variables, context) => {
      await context.client.cancelQueries({
        queryKey: interviewRelatedDataQueryOptions.queryKey,
      });
      const previousData = context.client.getQueryData(
        interviewRelatedDataQueryOptions.queryKey,
      );

      // if questionUuid is already in answers, then update it, otherwise append
      const existingStepIndex = previousData?.answers.findIndex(
        (step) => step.questionUuid === variables.questionUuid,
      );
      let answers = previousData?.answers ?? [];
      if (existingStepIndex !== undefined && existingStepIndex >= 0) {
        answers[existingStepIndex] = {
          ...answers[existingStepIndex],
          answerPayload: variables.answerPayload,
          answeredAt: new Date(),
        };
      } else {
        answers = [
          ...answers,
          {
            uuid: "optimistic-interview-step-uuid",
            interviewUuid: variables.interviewUuid,
            questionUuid: variables.questionUuid,
            answerPayload: variables.answerPayload,
            answeredAt: new Date(),
          },
        ];
      }

      context.client.setQueryData(
        interviewRelatedDataQueryOptions.queryKey,
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            answers,
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
    },
    onSettled: (_data, _error, _variables, _onMutateResult, context) => {
      context.client.invalidateQueries({
        queryKey: interviewRelatedDataQueryOptions.queryKey,
      });
    },
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
      "Mismatched flow version data. This should never happen, please try again.",
    ); // TODO think about a better error handling strategy

  // In this case, only the CandidateGreetingForm will be shown
  if (interviewRelatedData.candidate === null) {
    return null;
  }

  const currentFlowStepData = questionsData.flowSteps.find(
    (step) => step.position === currentFlowStep,
  );
  if (!currentFlowStepData)
    throw new Error(
      "Current flow step does not exist in the provided flow steps. This should never happen, please report it.",
    );
  const currentFlowStepKind = currentFlowStepData.kind;
  if (!currentFlowStepKind)
    throw new Error(
      "Current flow step does not exist in the provided flow steps. This should never happen, please report it.",
    );
  const currentFlowStepQuestions = questionsData.questions.filter(
    (question) => question.flowStepUuid === currentFlowStepData.uuid,
  );

  return (
    <div>
      <h2>{questionsData.role.roleName}</h2>
      {currentFlowStepKind === "question_block" && (
        <QuestionBlock questions={currentFlowStepQuestions} />
      )}
      {currentFlowStepKind === "video" && (
        <p>Video question type not supported yet.</p>
      )}
    </div>
  );
}

function QuestionBlock({
  questions,
}: {
  questions: Array<z.infer<typeof QuestionSelectSchema>>;
}) {
  return (
    <div>
      {questions.map((question) => {
        switch (question.questionType) {
          case QuestionType.video:
            throw new Error("This is a bug, please report it");
          case QuestionType.text:
            return <TextQuestion key={question.uuid} onSubmit={(_) => {}} />;
          case QuestionType.single_choice:
            throw new Error("This question type is not supported yet.");
          case QuestionType.multiple_choice:
            throw new Error("This question type is not supported yet.");
          default:
            throw new Error(
              `Question type ${question.questionType} not supported yet. Please report this bug.`,
            );
        }
      })}
    </div>
  );
}

function TextQuestion({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(text);
      }}
    >
      <input
        type="text"
        name="answer"
        value={text}
        onChange={(event) => setText(event.target.value)}
        required
      />
      <button type="submit">Weiter</button>
    </form>
  );
}

function SingleChoiceQuestion({
  onSubmit,
}: {
  onSubmit: (selectedOption: string) => void;
}) {
  const [option, setOption] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(option);
      }}
    >
      <label>
        <input
          type="radio"
          name="option"
          value="option1"
          checked={option === "option1"}
          onChange={(event) => setOption(event.target.value)}
          required
        />
        Option 1
      </label>
    </form>
  );
}
