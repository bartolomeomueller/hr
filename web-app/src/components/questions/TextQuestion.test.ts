// @vitest-environment jsdom

import { useForm } from "@tanstack/react-form";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { v7 as uuidv7 } from "uuid";
import { afterEach, describe, expect, it, vi } from "vitest";
import type z from "zod";
import { TextQuestion, isTextQuestionAnswered } from "@/components/questions/TextQuestion";
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

function renderTextQuestion() {
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
    questionType: "text",
    questionPayload: {
      question: "Why do you want this role?",
    },
    isCv: false,
  };

  function TestForm() {
    const form = useForm({
      defaultValues: {
        [question.uuid]: "",
      },
    });

    return React.createElement(TextQuestion, {
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

describe("TextQuestion", () => {
  afterEach(() => {
    cleanup();
    deleteAnswerMutationFnMock.mockClear();
    saveAnswerMutationFnMock.mockClear();
  });

  it("saves the answer when text is entered", async () => {
    renderTextQuestion();

    fireEvent.change(screen.getByPlaceholderText("Deine Antwort"), {
      target: { value: "I like the team." },
    });

    await waitFor(() => {
      expect(saveAnswerMutationFnMock).toHaveBeenCalledWith(
        {
          interviewUuid: "interview-1",
          questionUuid: "question-1",
          answerPayload: {
            answer: "I like the team.",
          },
        },
        expect.anything(),
      );
    }, { timeout: 1500 });

    expect(deleteAnswerMutationFnMock).not.toHaveBeenCalled();
  });

  it("deletes the answer when the text becomes invalid", async () => {
    renderTextQuestion();

    fireEvent.change(screen.getByPlaceholderText("Deine Antwort"), {
      target: { value: "Temporary answer" },
    });

    await waitFor(() => {
      expect(saveAnswerMutationFnMock).toHaveBeenCalledTimes(1);
    }, { timeout: 1500 });

    saveAnswerMutationFnMock.mockClear();

    fireEvent.change(screen.getByPlaceholderText("Deine Antwort"), {
      target: { value: "" },
    });

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

describe("isTextQuestionAnswered", () => {
  it("returns false when no answer exists", () => {
    expect(isTextQuestionAnswered(undefined)).toBe(false);
  });

  it("returns true when an answer exists", () => {
    const answer: z.infer<typeof AnswerSelectSchema> = {
      uuid: uuidv7(),
      interviewUuid: uuidv7(),
      questionUuid: uuidv7(),
      answerPayload: {
        answer: "My answer",
      },
      answeredAt: new Date(),
    };

    expect(isTextQuestionAnswered(answer)).toBe(true);
  });
});
