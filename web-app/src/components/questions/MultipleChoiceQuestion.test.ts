// @vitest-environment jsdom

import { useForm } from "@tanstack/react-form";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import React from "react";
import { v7 as uuidv7 } from "uuid";
import { afterEach, describe, expect, it, vi } from "vitest";
import type z from "zod";
import type { InterviewFormType } from "@/components/Interview";
import {
  MultipleChoiceQuestion,
  multipleChoiceQuestionBehavior,
} from "@/components/questions/MultipleChoiceQuestion";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";

const { deleteAnswerMutationFnMock, saveAnswerMutationFnMock } = vi.hoisted(
  () => ({
    deleteAnswerMutationFnMock: vi.fn().mockResolvedValue(null),
    saveAnswerMutationFnMock: vi.fn().mockResolvedValue(null),
  }),
);

vi.mock("@/orpc/client", () => ({
  orpc: {
    deleteAnswer: {
      mutationOptions: vi.fn(() => ({
        mutationFn: deleteAnswerMutationFnMock,
      })),
    },
    saveAnswer: {
      mutationOptions: vi.fn(() => ({
        mutationFn: saveAnswerMutationFnMock,
      })),
    },
  },
}));

vi.mock("@/components/ui/checkbox", async () => {
  const React = await import("react");

  return {
    Checkbox({
      checked,
      id,
      onCheckedChange,
    }: {
      checked?: boolean;
      id?: string;
      onCheckedChange?: (checked: boolean) => void;
    }) {
      return React.createElement(
        "button",
        {
          type: "button",
          "data-testid": id,
          "data-state": checked ? "checked" : "unchecked",
          onClick: () => onCheckedChange?.(!checked),
        },
        id,
      );
    },
  };
});

function renderMultipleChoiceQuestion() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const question: z.infer<typeof QuestionSelectSchema> = {
    uuid: "question-1",
    flowStepUuid: "flow-step-1",
    position: 1,
    questionType: "multiple_choice",
    questionPayload: {
      question: "Choose one or more options",
      options: ["Option A", "Option B"],
    },
    isCv: false,
  };

  function TestForm() {
    const defaultValues: Record<string, string | string[]> = {
      [question.uuid]: [] as string[],
    };
    const form = useForm({
      defaultValues,
    }) as InterviewFormType;

    return React.createElement(MultipleChoiceQuestion, {
      form,
      question,
      interviewUuid: "interview-1",
      queryKeyToInvalidateAnswers: ["answers", "interview-1"],
      answer: undefined,
    });
  }

  return render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(TestForm),
    ),
  );
}

describe("MultipleChoiceQuestion", () => {
  afterEach(() => {
    cleanup();
    deleteAnswerMutationFnMock.mockClear();
    saveAnswerMutationFnMock.mockClear();
  });

  it("saves the answer when at least one option is selected", async () => {
    renderMultipleChoiceQuestion();

    fireEvent.click(screen.getByTestId("Option A"));

    await waitFor(
      () => {
        expect(saveAnswerMutationFnMock).toHaveBeenCalledWith(
          {
            interviewUuid: "interview-1",
            questionUuid: "question-1",
            answerPayload: {
              selectedOptions: ["Option A"],
            },
          },
          expect.anything(),
        );
      },
      { timeout: 1500 },
    );

    expect(deleteAnswerMutationFnMock).not.toHaveBeenCalled();
  });

  it("deletes the answer when the last selected option is removed", async () => {
    renderMultipleChoiceQuestion();

    fireEvent.click(screen.getByTestId("Option A"));
    await waitFor(
      () => {
        expect(saveAnswerMutationFnMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 1500 },
    );

    saveAnswerMutationFnMock.mockClear();

    fireEvent.click(screen.getByTestId("Option A"));

    await waitFor(
      () => {
        expect(deleteAnswerMutationFnMock).toHaveBeenCalledWith(
          {
            interviewUuid: "interview-1",
            questionUuid: "question-1",
          },
          expect.anything(),
        );
      },
      { timeout: 1500 },
    );

    expect(saveAnswerMutationFnMock).not.toHaveBeenCalled();
  });
});

describe("multipleChoiceQuestionBehavior", () => {
  it("returns false when no answer exists", () => {
    expect(
      multipleChoiceQuestionBehavior.isAnswered({
        question: {
          uuid: uuidv7(),
          flowStepUuid: uuidv7(),
          position: 1,
          questionType: "multiple_choice",
          questionPayload: {
            question: "Question",
            options: ["Option A"],
          },
          isCv: false,
        },
        answer: undefined,
        questionUuidsWithUploadingDocuments: new Set(),
        questionUuidsWithUploadingRecordings: new Set(),
      }),
    ).toBe(false);
  });

  it("returns true when an answer exists", () => {
    const answer: z.infer<typeof AnswerSelectSchema> = {
      uuid: uuidv7(),
      interviewUuid: uuidv7(),
      questionUuid: uuidv7(),
      answerPayload: {
        selectedOptions: ["Option A"],
      },
      answeredAt: new Date(),
    };

    expect(
      multipleChoiceQuestionBehavior.isAnswered({
        question: {
          uuid: answer.questionUuid,
          flowStepUuid: uuidv7(),
          position: 1,
          questionType: "multiple_choice",
          questionPayload: {
            question: "Question",
            options: ["Option A"],
          },
          isCv: false,
        },
        answer,
        questionUuidsWithUploadingDocuments: new Set(),
        questionUuidsWithUploadingRecordings: new Set(),
      }),
    ).toBe(true);
  });
});
