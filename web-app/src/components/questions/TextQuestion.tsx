import { type QueryKey, useMutation } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import type z from "zod";
import {
  TextAnswerPayloadType,
  TextQuestionPayloadType,
} from "@/db/payload-types";
import { orpc } from "@/orpc/client";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";

export function TextQuestion({
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
