// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { v7 as uuidv7 } from "uuid";
import { afterEach, describe, expect, it, vi } from "vitest";
import type z from "zod";
import {
  VideoQuestion,
  videoQuestionBehavior,
} from "@/components/questions/VideoQuestion";
import { QuestionType } from "@/db/payload-types";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import { useRecordingUploadStore } from "@/stores/recordingUploadStore";

const { deleteAnswerMutationFnMock, addToUploadPipelineMock, toastErrorMock } =
  vi.hoisted(() => ({
    deleteAnswerMutationFnMock: vi.fn().mockResolvedValue(null),
    addToUploadPipelineMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }));

vi.mock("@/orpc/client", () => ({
  orpc: {
    deleteAnswer: {
      mutationOptions: vi.fn(() => ({
        mutationFn: deleteAnswerMutationFnMock,
      })),
    },
  },
}));

vi.mock("@/services/RecordingUploadService.client", () => ({
  recordingUploadService: {
    addToUploadPipeline: addToUploadPipelineMock,
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}));

function renderVideoQuestion({
  answer,
}: {
  answer?: z.infer<typeof AnswerSelectSchema>;
}) {
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
    questionType: "video",
    questionPayload: {
      question: "Record your answer",
      maxDurationSeconds: 60,
      maxOvertimeSeconds: 10,
    },
    isCv: false,
  };

  return {
    question,
    ...render(
      <QueryClientProvider client={queryClient}>
        <VideoQuestion
          questions={[question]}
          interviewUuid="interview-1"
          queryKeyToInvalidateAnswers={["answers", "interview-1"]}
          answers={answer ? [answer] : []}
        />
      </QueryClientProvider>,
    ),
  };
}

function createVideoQuestion(): z.infer<typeof QuestionSelectSchema> {
  return {
    uuid: uuidv7(),
    flowStepUuid: uuidv7(),
    position: 1,
    questionType: QuestionType.video,
    questionPayload: {
      question: "Please record your answer",
      maxDurationSeconds: 60,
      maxOvertimeSeconds: 10,
    },
    isCv: false,
  };
}

describe("VideoQuestion", () => {
  afterEach(() => {
    cleanup();
    deleteAnswerMutationFnMock.mockClear();
    addToUploadPipelineMock.mockClear();
    toastErrorMock.mockClear();
    useRecordingUploadStore.setState({ recordings: [] });
  });

  it("deletes the existing answer when the replacement button is clicked", async () => {
    renderVideoQuestion({
      answer: {
        uuid: "answer-1",
        interviewUuid: "interview-1",
        questionUuid: "question-1",
        answerPayload: {
          videoUuid: "video-1",
          status: "uploaded",
        },
        answeredAt: new Date(),
      },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /du hast bereits eine anwort aufgenommen/i,
      }),
    );

    await waitFor(() => {
      expect(deleteAnswerMutationFnMock).toHaveBeenCalledWith(
        {
          interviewUuid: "interview-1",
          questionUuid: "question-1",
        },
        expect.anything(),
      );
    });
  });
});

describe("videoQuestionBehavior", () => {
  it("returns false when no answer exists and no upload is in progress", () => {
    const question = createVideoQuestion();

    expect(
      videoQuestionBehavior.isAnswered({
        question,
        answer: undefined,
        questionUuidsWithUploadingDocuments: new Set(),
        questionUuidsWithUploadingRecordings: new Set(),
      }),
    ).toBe(false);
  });

  it("returns true when an answer exists", () => {
    const question = createVideoQuestion();
    const answer: z.infer<typeof AnswerSelectSchema> = {
      uuid: uuidv7(),
      interviewUuid: uuidv7(),
      questionUuid: question.uuid,
      answerPayload: {
        videoUuid: uuidv7(),
        status: "uploaded",
      },
      answeredAt: new Date(),
    };

    expect(
      videoQuestionBehavior.isAnswered({
        question,
        answer,
        questionUuidsWithUploadingDocuments: new Set(),
        questionUuidsWithUploadingRecordings: new Set(),
      }),
    ).toBe(true);
  });

  it("returns false when no final upload is in progress", () => {
    const question = createVideoQuestion();

    expect(
      videoQuestionBehavior.isAnswered({
        question,
        answer: undefined,
        questionUuidsWithUploadingDocuments: new Set(),
        questionUuidsWithUploadingRecordings: new Set(),
      }),
    ).toBe(false);
  });

  it("returns true when the final upload is in progress", () => {
    const question = createVideoQuestion();

    expect(
      videoQuestionBehavior.isAnswered({
        question,
        answer: undefined,
        questionUuidsWithUploadingDocuments: new Set(),
        questionUuidsWithUploadingRecordings: new Set([question.uuid]),
      }),
    ).toBe(true);
  });
});
