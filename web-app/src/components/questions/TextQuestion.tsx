import { type QueryKey, useMutation } from "@tanstack/react-query";
import type z from "zod";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  TextAnswerPayloadType,
  TextQuestionPayloadType,
} from "@/db/payload-types";
import { orpc } from "@/orpc/client";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import type { InterviewFormType } from "../Interview";
import { SlideInFromTop } from "../ui/animation";
import { Input } from "../ui/input";

// TODO think about making each question optional possible, if the user does not want to answer a question
export function isTextQuestionAnswered(
  answer: z.infer<typeof AnswerSelectSchema> | undefined,
) {
  return answer !== undefined;
}

export function TextQuestion({
  form,
  question,
  interviewUuid,
  queryKeyToInvalidateAnswers,
  answer: _answer,
}: {
  form: InterviewFormType;
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
  const answerValidator = TextAnswerPayloadType.shape.answer;

  const { mutate } = useMutation({
    ...orpc.saveAnswer.mutationOptions(),
    // isPending is false as soon as the new (previously invalidated) query data arrives, since we are returning the promise
    onSettled: (_data, _error, _variables, _onMutateResult, context) =>
      context.client.invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      }),
    retry: 1,
  });
  const { mutate: deleteAnswer } = useMutation({
    ...orpc.deleteAnswer.mutationOptions(),
    onSettled: (_data, _error, _variables, _onMutateResult, context) =>
      context.client.invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      }),
    retry: 1,
  });

  return (
    <form.Field
      name={question.uuid}
      validators={{
        onChange: answerValidator,
      }}
      listeners={{
        onChangeDebounceMs: 500,
        onChange: ({ value }) => {
          if (!answerValidator.safeParse(value).success) {
            deleteAnswer({
              interviewUuid,
              questionUuid: question.uuid,
            });
            return;
          }

          mutate({
            interviewUuid,
            questionUuid: question.uuid,
            answerPayload: {
              answer: value,
            },
          });
        },
      }}
      children={(field) => {
        const isInvalid =
          field.state.meta.isBlurred && !field.state.meta.isValid;
        return (
          // data-invalid attribute is used in Field to style the field
          // aria-invalid attribute is used for accessibility, it indicates that the value entered in the field does not conform to the expected format
          <Field data-invalid={isInvalid}>
            <FieldLabel htmlFor={field.name}>
              {questionPayload.question}
            </FieldLabel>
            <Input
              type="text"
              id={field.name}
              name={field.name}
              value={field.state.value as string}
              // change later to without e
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={isInvalid}
              placeholder="Deine Antwort"
              required
            />
            <SlideInFromTop isVisible={isInvalid}>
              <FieldError errors={field.state.meta.errors} />
            </SlideInFromTop>
          </Field>
        );
      }}
    />
  );
}
