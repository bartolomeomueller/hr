// @vitest-environment jsdom

import { useForm } from "@tanstack/react-form";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { v7 as uuidv7 } from "uuid";
import { afterEach, describe, expect, it, vi } from "vitest";
import type z from "zod";
import { SingleChoiceQuestion, isSingleChoiceQuestionAnswered } from "@/components/questions/SingleChoiceQuestion";
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

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/ui/radio-group", async () => {
  const React = await import("react");
  const radioGroupContext = React.createContext<(value: string) => void>(
    () => {},
  );

  return {
    RadioGroup({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
    }) {
      return React.createElement(
        radioGroupContext.Provider,
        { value: onValueChange ?? (() => {}) },
        React.createElement(
          "div",
          null,
          children,
          React.createElement(
            "button",
            {
              type: "button",
              onClick: () => onValueChange?.(""),
            },
            "Clear selection",
          ),
        ),
      );
    },
    RadioGroupItem({
      id,
      value,
    }: {
      id?: string;
      value: string;
    }) {
      const onValueChange = React.useContext(radioGroupContext);
      return React.createElement(
        "button",
        {
          type: "button",
          "data-testid": id,
          onClick: () => onValueChange(value),
        },
        value,
      );
    },
  };
});

function renderSingleChoiceQuestion() {
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
    questionType: "single_choice",
    questionPayload: {
      question: "Choose one option",
      options: ["Option A", "Option B"],
    },
    isCv: false,
  };

  function TestForm() {
    const form = useForm({
      defaultValues: {
        [question.uuid]: "",
      },
    });

    return React.createElement(SingleChoiceQuestion, {
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

describe("SingleChoiceQuestion", () => {
  afterEach(() => {
    cleanup();
    deleteAnswerMutationFnMock.mockClear();
    saveAnswerMutationFnMock.mockClear();
  });

  it("saves the answer when an option is selected", async () => {
    renderSingleChoiceQuestion();

    fireEvent.click(screen.getByTestId("Option A"));

    await waitFor(() => {
      expect(saveAnswerMutationFnMock).toHaveBeenCalledWith(
        {
          interviewUuid: "interview-1",
          questionUuid: "question-1",
          answerPayload: {
            selectedOption: "Option A",
          },
        },
        expect.anything(),
      );
    }, { timeout: 1500 });

    expect(deleteAnswerMutationFnMock).not.toHaveBeenCalled();
  });

  it("deletes the answer when the selection becomes invalid", async () => {
    renderSingleChoiceQuestion();

    fireEvent.click(screen.getByText("Clear selection"));

    await waitFor(() => {
      expect(deleteAnswerMutationFnMock).toHaveBeenCalledWith(
        {
          interviewUuid: "interview-1",
          questionUuid: "question-1",
        },
        expect.anything(),
      );
    }, { timeout: 1500 });

    expect(saveAnswerMutationFnMock).not.toHaveBeenCalled();
  });
});

describe("isSingleChoiceQuestionAnswered", () => {
  it("returns false when no answer exists", () => {
    expect(isSingleChoiceQuestionAnswered(undefined)).toBe(false);
  });

  it("returns true when an answer exists", () => {
    const answer: z.infer<typeof AnswerSelectSchema> = {
      uuid: uuidv7(),
      interviewUuid: uuidv7(),
      questionUuid: uuidv7(),
      answerPayload: {
        selectedOption: "Option A",
      },
      answeredAt: new Date(),
    };

    expect(isSingleChoiceQuestionAnswered(answer)).toBe(true);
  });
});
