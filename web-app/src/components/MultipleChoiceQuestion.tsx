import { type QueryKey, useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import type z from "zod";
import {
  MultipleChoiceAnswerPayloadType,
  MultipleChoiceQuestionPayloadType,
} from "@/db/payload-types";
import { orpc } from "@/orpc/client";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";

// TODO implement min and max selections logic
export function MultipleChoiceQuestion({
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
