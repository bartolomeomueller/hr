import { type QueryKey, useMutation } from "@tanstack/react-query";
import type z from "zod";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  TextAnswerPayloadType,
  TextQuestionPayloadType,
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
import { SlideInFromTop } from "../ui/animation";
import { Input } from "../ui/input";
import type { QuestionBehavior } from "./questionBehavior";

// TODO think about making each question optional possible, if the user does not want to answer a question

export const textQuestionBehavior: QuestionBehavior = {
  getFormDefaultValue: getTextQuestionFormDefaultValue,
  isAnswered: ({ answer }) => isTextQuestionAnswered(answer),
  renderQuestionBlockQuestion: ({
    form,
    question,
    interviewUuid,
    queryKeyToInvalidateAnswers,
    answer,
  }) => (
    <TextQuestion
      key={question.uuid}
      form={form}
      question={question}
      interviewUuid={interviewUuid}
      queryKeyToInvalidateAnswers={queryKeyToInvalidateAnswers}
      answer={answer}
    />
  ),
};

function isTextQuestionAnswered(
  answer: z.infer<typeof AnswerSelectSchema> | undefined,
) {
  return answer !== undefined;
}

function getTextQuestionFormDefaultValue(
  answer: z.infer<typeof AnswerSelectSchema> | undefined,
) {
  if (!answer) {
    return "";
  }

  const textAnswerPayloadResult = TextAnswerPayloadType.safeParse(
    answer.answerPayload,
  );
  if (!textAnswerPayloadResult.success)
    throw new Error(
      `Answer payload does not match expected type for text question. This should never happen, please report it. ${textAnswerPayloadResult.error.message}`,
    );

  return textAnswerPayloadResult.data.answer;
}

export function TextQuestion({
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
                typeof TextAnswerPayloadType
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
          <div className="py-2">
            {/* data-invalid attribute is used in Field to style the field
                aria-invalid attribute is used for accessibility, it indicates that the value entered in the field does not conform to the expected format */}
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>
                {questionPayload.question}
              </FieldLabel>
              <div>
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
              </div>
            </Field>
          </div>
        );
      }}
    />
  );
}
