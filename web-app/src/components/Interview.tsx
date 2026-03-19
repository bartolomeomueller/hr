import {
  type QueryKey,
  useMutation,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import type z from "zod";
import { useCandidateFlowForm } from "@/components/CandidateFlowFormContext";
import {
  MultipleChoiceAnswerPayloadType,
  MultipleChoiceQuestionPayloadType,
  QuestionType,
  SingleChoiceAnswerPayloadType,
  SingleChoiceQuestionPayloadType,
  TextAnswerPayloadType,
  TextQuestionPayloadType,
} from "@/db/payload-types";
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
        <p>Video question type not supported yet.</p>
      )}
    </div>
  );
}

function QuestionBlock({
  questions,
  interviewUuid,
  queryKeyToInvalidateAnswers,
  answers,
}: {
  questions: Array<z.infer<typeof QuestionSelectSchema>>;
  interviewUuid: string;
  queryKeyToInvalidateAnswers: QueryKey;
  answers: Array<z.infer<typeof AnswerSelectSchema>>;
}) {
  return (
    <div>
      {/* Add on submit handler to force devounce actions to run */}
      <form>
        {questions.map((question) => {
          const answer = answers.find((a) => a.questionUuid === question.uuid);

          switch (question.questionType) {
            case QuestionType.video:
              throw new Error("This is a bug, please report it");
            case QuestionType.text: {
              return (
                <TextQuestion
                  key={question.uuid}
                  question={question}
                  interviewUuid={interviewUuid}
                  queryKeyToInvalidateAnswers={queryKeyToInvalidateAnswers}
                  answer={answer}
                />
              );
            }
            case QuestionType.single_choice: {
              return (
                <SingleChoiceQuestion
                  key={question.uuid}
                  question={question}
                  interviewUuid={interviewUuid}
                  queryKeyToInvalidateAnswers={queryKeyToInvalidateAnswers}
                  answer={answer}
                />
              );
            }
            case QuestionType.multiple_choice: {
              return (
                <MultipleChoiceQuestion
                  key={question.uuid}
                  question={question}
                  interviewUuid={interviewUuid}
                  queryKeyToInvalidateAnswers={queryKeyToInvalidateAnswers}
                  answer={answer}
                />
              );
            }
            default:
              throw new Error(
                `Question type ${question.questionType} is not supported. Please report this bug.`,
              );
          }
        })}
      </form>
    </div>
  );
}

function TextQuestion({
  question,
  interviewUuid,
  queryKeyToInvalidateAnswers,
  answer,
}: {
  question: z.infer<typeof QuestionSelectSchema>;
  interviewUuid: string;
  queryKeyToInvalidateAnswers: QueryKey;
  answer: z.infer<typeof AnswerSelectSchema> | undefined;
}) {
  const questionPayloadResult = TextQuestionPayloadType.safeParse(
    question.questionPayload,
  );
  if (!questionPayloadResult.success)
    throw new Error(
      `Question payload does not match expected type for text question. This should never happen, please report it. ${questionPayloadResult.error.message}`,
    );
  const questionPayload = questionPayloadResult.data;

  const id = useId();
  const answerPayloadParseResult = TextAnswerPayloadType.safeParse(
    answer?.answerPayload,
  );
  // useState is only initialized on mount, so it will not be updated by invalidated queries
  const [answerState, setAnswerState] = useState(
    answerPayloadParseResult.success
      ? answerPayloadParseResult.data.answer
      : "",
  );
  const answerStateRef = useRef<string>(answerState);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { mutate } = useMutation({
    ...orpc.saveAnswer.mutationOptions(),
    // isPending is false as soon as the new (previously invalidated) query data arrives, since we are returning the promise
    onSettled: (_data, _error, _variables, _onMutateResult, context) =>
      context.client.invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      }),
    retry: 1,
  });

  const debounceFunction = (answer: string) => {
    mutate(
      {
        interviewUuid: interviewUuid,
        questionUuid: question.uuid,
        answerPayload: { answer },
      },
      {
        onError: (_error, _variables, _onMutateResult, _context) => {
          setMutationError(
            "Could not save your answer. Please modify your answer to trigger a new save attempt.",
          );
        },
      },
    );
  };

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceFunction(answerStateRef.current);
      }
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: React Compiler
  }, [debounceFunction]);

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAnswerState(event.target.value);
    answerStateRef.current = event.target.value;
    setMutationError(null);
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      debounceFunction(event.target.value);
      debounceTimeoutRef.current = null;
    }, 1000);
  };

  return (
    <div>
      <label htmlFor={id}>{questionPayload.question}</label>
      <input
        type="text"
        name="answer"
        id={id}
        value={answerState}
        onChange={onChange}
        required
      />
      <p
        className={mutationError ? "text-red-500" : "invisible"}
        // NOTE go over these accessibility attributes, when time is available
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        aria-hidden={!mutationError}
      >
        {mutationError ?? "\u00A0"} {/* non breaking space*/}
      </p>
    </div>
  );
}

// TODO With fewer than 10 options, radio buttons are used, with more a dropdown
function SingleChoiceQuestion({
  question,
  interviewUuid,
  queryKeyToInvalidateAnswers,
  answer,
}: {
  question: z.infer<typeof QuestionSelectSchema>;
  interviewUuid: string;
  queryKeyToInvalidateAnswers: QueryKey;
  answer: z.infer<typeof AnswerSelectSchema> | undefined;
}) {
  const questionPayloadResult = SingleChoiceQuestionPayloadType.safeParse(
    question.questionPayload,
  );
  if (!questionPayloadResult.success)
    throw new Error(
      `Question payload does not match expected type for single choice question. This should never happen, please report it. ${questionPayloadResult.error.message}`,
    );
  const questionPayload = questionPayloadResult.data;

  const name = useId();
  const answerPayloadParseResult = SingleChoiceAnswerPayloadType.safeParse(
    answer?.answerPayload,
  );
  // useState is only initialized on mount, so it will not be updated by invalidated queries
  const [selectedOption, setSelectedOption] = useState(
    answerPayloadParseResult.success
      ? answerPayloadParseResult.data.selectedOption
      : "",
  );
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { mutate } = useMutation({
    ...orpc.saveAnswer.mutationOptions(),
    // isPending is false as soon as the new (previously invalidated) query data arrives, since we are returning the promise
    onSettled: (_data, _error, _variables, _onMutateResult, context) =>
      context.client.invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      }),
    retry: 1,
  });

  return (
    <div>
      <fieldset>
        <legend>{questionPayload.question}</legend>
        {questionPayload.options.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={option === selectedOption}
              required
              onChange={(event) => {
                setSelectedOption(event.target.value);
                setMutationError(null);
                mutate(
                  {
                    interviewUuid: interviewUuid,
                    questionUuid: question.uuid,
                    answerPayload: { selectedOption: event.target.value },
                  },
                  {
                    onError: (
                      _error,
                      _variables,
                      _onMutateResult,
                      _context,
                    ) => {
                      setMutationError(
                        "Could not save your answer. Please modify your answer to trigger a new save attempt.",
                      );
                    },
                  },
                );
              }}
            />
            {option}
          </label>
        ))}
      </fieldset>
      <p
        className={mutationError ? "text-red-500" : "invisible"}
        // NOTE go over these accessibility attributes, when time is available
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        aria-hidden={!mutationError}
      >
        {mutationError ?? "\u00A0"} {/* non breaking space*/}
      </p>
    </div>
  );
}

// TODO implement min and max selections logic
function MultipleChoiceQuestion({
  question,
  interviewUuid,
  queryKeyToInvalidateAnswers,
  answer,
}: {
  question: z.infer<typeof QuestionSelectSchema>;
  interviewUuid: string;
  queryKeyToInvalidateAnswers: QueryKey;
  answer: z.infer<typeof AnswerSelectSchema> | undefined;
}) {
  const questionPayloadResult = MultipleChoiceQuestionPayloadType.safeParse(
    question.questionPayload,
  );
  if (!questionPayloadResult.success)
    throw new Error(
      `Question payload does not match expected type for multiple choice question. This should never happen, please report it. ${questionPayloadResult.error.message}`,
    );
  const questionPayload = questionPayloadResult.data;

  const name = useId();
  const answerPayloadParseResult = MultipleChoiceAnswerPayloadType.safeParse(
    answer?.answerPayload,
  );
  const [selectedOptions, setSelectedOptions] = useState(
    answerPayloadParseResult.success
      ? answerPayloadParseResult.data.selectedOptions
      : [],
  );
  const [mutationError, setMutationError] = useState<string | null>(null);

  const { mutate } = useMutation({
    ...orpc.saveAnswer.mutationOptions(),
    // isPending is false as soon as the new (previously invalidated) query data arrives, since we are returning the promise
    onSettled: (_data, _error, _variables, _onMutateResult, context) =>
      context.client.invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      }),
    retry: 1,
  });

  return (
    <div>
      <fieldset>
        <legend>{questionPayload.question}</legend>
        {questionPayload.options.map((option) => (
          <label key={option}>
            <input
              type="checkbox"
              name={name}
              value={option}
              checked={selectedOptions.includes(option)}
              onChange={(event) => {
                const nextSelectedOptions = event.target.checked
                  ? [...selectedOptions, option]
                  : selectedOptions.filter(
                      (selectedOption) => selectedOption !== option,
                    );

                setSelectedOptions(nextSelectedOptions);
                setMutationError(null);
                mutate(
                  {
                    interviewUuid: interviewUuid,
                    questionUuid: question.uuid,
                    answerPayload: {
                      selectedOptions: nextSelectedOptions,
                    },
                  },
                  {
                    onError: (
                      _error,
                      _variables,
                      _onMutateResult,
                      _context,
                    ) => {
                      setMutationError(
                        "Could not save your answer. Please modify your answer to trigger a new save attempt.",
                      );
                    },
                  },
                );
              }}
            />
            {option}
          </label>
        ))}
      </fieldset>
      <p
        className={mutationError ? "text-red-500" : "invisible"}
        // NOTE go over these accessibility attributes, when time is available
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        aria-hidden={!mutationError}
      >
        {mutationError ?? "\u00A0"} {/* non breaking space*/}
      </p>
    </div>
  );
}
