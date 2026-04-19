import { type QueryKey, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type z from "zod";
import {
  MultipleChoiceAnswerPayloadType,
  MultipleChoiceQuestionPayloadType,
} from "@/db/payload-types";
import type { InterviewRelatedDataQueryData } from "@/lib/interview-related-data-cache";
import {
  createOptimisticAnswer,
  findAnswerInInterviewRelatedDataCache,
  removeAnswerFromInterviewRelatedDataCache,
  upsertAnswerInInterviewRelatedDataCache,
} from "@/lib/interview-related-data-cache";
import { orpc } from "@/orpc/client";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import type { InterviewFormType } from "../Interview";
import { Checkbox } from "../ui/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../ui/field";

export function isMultipleChoiceQuestionAnswered(
  answer: z.infer<typeof AnswerSelectSchema> | undefined,
) {
  return answer !== undefined;
}

// TODO implement min and max selections logic
export function MultipleChoiceQuestion({
  form,
  question,
  interviewUuid,
  queryKeyToInvalidateAnswers,
  answer,
}: {
  form: InterviewFormType;
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
  const answerValidator = MultipleChoiceAnswerPayloadType.shape.selectedOptions;

  const { mutate } = useMutation({
    ...orpc.saveAnswer.mutationOptions(),
    onMutate: async (variables, context) => {
      await context.client.cancelQueries({
        queryKey: queryKeyToInvalidateAnswers,
      });

      const previousData =
        context.client.getQueryData<InterviewRelatedDataQueryData>(
          queryKeyToInvalidateAnswers,
        );

      context.client.setQueryData<InterviewRelatedDataQueryData>(
        queryKeyToInvalidateAnswers,
        (oldData) =>
          upsertAnswerInInterviewRelatedDataCache(
            oldData,
            createOptimisticAnswer({
              interviewUuid: variables.interviewUuid,
              questionUuid: variables.questionUuid,
              answerPayload: variables.answerPayload as z.infer<
                typeof MultipleChoiceAnswerPayloadType
              >,
              previousAnswer:
                findAnswerInInterviewRelatedDataCache(
                  oldData,
                  variables.questionUuid,
                ) ?? answer,
            }),
          ),
      );

      return {
        previousData,
      };
    },
    onError: (_error, _variables, onMutateResult, context) => {
      context.client.setQueryData(
        queryKeyToInvalidateAnswers,
        onMutateResult?.previousData,
      );
      toast.error(
        "Deine Antwort konnte nicht gespeichert werden. Bitte versuche es erneut.",
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
    onMutate: async (variables, context) => {
      await context.client.cancelQueries({
        queryKey: queryKeyToInvalidateAnswers,
      });

      const previousData =
        context.client.getQueryData<InterviewRelatedDataQueryData>(
          queryKeyToInvalidateAnswers,
        );

      context.client.setQueryData<InterviewRelatedDataQueryData>(
        queryKeyToInvalidateAnswers,
        (oldData) =>
          removeAnswerFromInterviewRelatedDataCache(
            oldData,
            variables.questionUuid,
          ),
      );

      return {
        previousData,
      };
    },
    onError: (_error, _variables, onMutateResult, context) => {
      context.client.setQueryData(
        queryKeyToInvalidateAnswers,
        onMutateResult?.previousData,
      );
      toast.error(
        "Deine Antwort konnte nicht gelöscht werden. Bitte versuche es erneut.",
      );
    },
    onSettled: (_data, _error, _variables, _onMutateResult, context) =>
      context.client.invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      }),
    retry: 1,
  });

  return (
    <form.Field
      name={question.uuid}
      mode="array"
      validators={{
        onChange: answerValidator,
      }}
      listeners={{
        // onChangeDebounceMs: 500,
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
              selectedOptions: value,
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
            <FieldGroup data-slot="checkbox-group">
              {questionPayload.options.map((option) => (
                <Field
                  key={option}
                  orientation="horizontal"
                  data-invalid={isInvalid}
                >
                  <Checkbox
                    id={option}
                    name={field.name}
                    aria-invalid={isInvalid}
                    checked={field.state.value.includes(option)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        field.pushValue(option);
                      } else {
                        const index = field.state.value.indexOf(option);
                        if (index > -1) {
                          field.removeValue(index);
                        }
                      }
                    }}
                  />
                  <FieldLabel htmlFor={option}>{option}</FieldLabel>
                </Field>
              ))}
            </FieldGroup>
            {/* <SlideInFromTop isVisible={isInvalid}>
              <FieldError errors={field.state.meta.errors} />
            </SlideInFromTop> */}
          </FieldSet>
        );
      }}
    />
  );
}
