import { type QueryKey, useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import type z from "zod";
import {
  SingleChoiceAnswerPayloadType,
  SingleChoiceQuestionPayloadType,
} from "@/db/payload-types";
import { orpc } from "@/orpc/client";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";

// TODO With fewer than 10 options, radio buttons are used, with more a dropdown
export function SingleChoiceQuestion({
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
