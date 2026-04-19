import { type QueryKey, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type z from "zod";
import {
  SingleChoiceAnswerPayloadType,
  SingleChoiceQuestionPayloadType,
} from "@/db/payload-types";
import type { InterviewRelatedDataQueryData } from "@/lib/interview-related-data-cache";
import {
  removeAnswerFromInterviewRelatedDataCache,
  upsertAnswerInInterviewRelatedDataCache,
} from "@/lib/interview-related-data-cache";
import { orpc } from "@/orpc/client";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import type { InterviewFormType } from "../Interview";
import {
  Field,
  FieldContent,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "../ui/field";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

export function isSingleChoiceQuestionAnswered(
  answer: z.infer<typeof AnswerSelectSchema> | undefined,
) {
  return answer !== undefined;
}

// TODO With fewer than 10 options, radio buttons are used, with more a dropdown
export function SingleChoiceQuestion({
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
  const questionPayloadResult = SingleChoiceQuestionPayloadType.safeParse(
    question.questionPayload,
  );
  if (!questionPayloadResult.success)
    throw new Error(
      `Question payload does not match expected type for single choice question. This should never happen, please report it. ${questionPayloadResult.error.message}`,
    );
  const questionPayload = questionPayloadResult.data;
  const answerValidator = SingleChoiceAnswerPayloadType.shape.selectedOption;

  const { mutate } = useMutation({
    ...orpc.saveAnswer.mutationOptions(),
    onSuccess: (updatedAnswer, _variables, _onMutateResult, context) => {
      context.client.setQueryData<InterviewRelatedDataQueryData>(
        queryKeyToInvalidateAnswers,
        (oldData) => upsertAnswerInInterviewRelatedDataCache(oldData, updatedAnswer),
      );
      toast.success("Answer saved.");
    },
    onError() {
      toast.error(
        "Could not save your answer. Please modify your answer to trigger a new save attempt.",
      );
    },
    // isPending is false as soon as the new (previously invalidated) query data arrives, since we are returning the promise
    onSettled: (_data, _error, _variables, _onMutateResult, context) =>
      context.client.invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      }),
    retry: 1,
  });
  const { mutate: deleteAnswer } = useMutation({
    ...orpc.deleteAnswer.mutationOptions(),
    onSuccess: (_data, variables, _onMutateResult, context) =>
      context.client.setQueryData<InterviewRelatedDataQueryData>(
        queryKeyToInvalidateAnswers,
        (oldData) =>
          removeAnswerFromInterviewRelatedDataCache(oldData, variables.questionUuid),
      ),
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
      // Listeners will be run even if the component unmounts
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
              selectedOption: value,
            },
          });
        },
      }}
      children={(field) => {
        const isInvalid =
          field.state.meta.isBlurred && !field.state.meta.isValid;
        return (
          <FieldSet>
            <FieldLegend variant="label">
              {questionPayload.question}
            </FieldLegend>
            {/* <FieldDescription>{questionPayload.question}</FieldDescription> */}
            <RadioGroup
              name={field.name}
              value={field.state.value as string}
              onValueChange={field.handleChange}
              onBlur={field.handleBlur}
            >
              {questionPayload.options.map((option) => (
                <FieldLabel
                  key={option}
                  htmlFor={option}
                  // The lint is wrong.
                  className="[&>*]:data-[slot=field]:p-2"
                >
                  <Field orientation="horizontal" data-invalid={isInvalid}>
                    <FieldContent>
                      <FieldTitle>{option}</FieldTitle>
                      {/* <FieldDescription>{option}</FieldDescription> */}
                    </FieldContent>
                    <RadioGroupItem
                      id={option}
                      value={option}
                      aria-invalid={isInvalid}
                    />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
            {/* <SlideInFromTop isVisible={isInvalid}>
              <FieldError errors={field.state.meta.errors} />
            </SlideInFromTop> */}
          </FieldSet>
        );
      }}
    />
  );
}
