import { describe, expect, it, vi } from "vitest";
import type z from "zod";
import {
  getCurrentFlowStepFormDefaultValues,
  getQuestionTypeHelper,
  renderQuestionBlockQuestion,
} from "@/components/questions/QuestionBlock";
import { QuestionType } from "@/db/payload-types";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";

vi.mock("@/orpc/client", () => ({
  client: {
    deleteDocumentFromObjectStorageAndFromAnswer: vi.fn(),
  },
  orpc: {
    deleteAnswer: {
      mutationOptions: vi.fn(() => ({})),
    },
    saveAnswer: {
      mutationOptions: vi.fn(() => ({})),
    },
  },
}));

vi.mock("@/lib/query-client", () => ({
  getQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock("@/services/DocumentUploadService", () => ({
  documentUploadService: {
    addToUploadPipeline: vi.fn(),
    cancelUpload: vi.fn(),
  },
}));

vi.mock("@/services/RecordingUploadService.client", () => ({
  recordingUploadService: {
    addToUploadPipeline: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("getCurrentFlowStepFormDefaultValues", () => {
  it("returns only form-backed defaults for the current flow step", () => {
    const questions: Array<z.infer<typeof QuestionSelectSchema>> = [
      {
        uuid: "text-question",
        flowStepUuid: "flow-step-1",
        position: 1,
        questionType: QuestionType.text,
        questionPayload: {
          question: "Tell us about yourself",
        },
        isCv: false,
      },
      {
        uuid: "single-choice-question",
        flowStepUuid: "flow-step-1",
        position: 2,
        questionType: QuestionType.single_choice,
        questionPayload: {
          question: "Choose one",
          options: ["A", "B"],
        },
        isCv: false,
      },
      {
        uuid: "multiple-choice-question",
        flowStepUuid: "flow-step-1",
        position: 3,
        questionType: QuestionType.multiple_choice,
        questionPayload: {
          question: "Choose many",
          options: ["A", "B"],
        },
        isCv: false,
      },
      {
        uuid: "document-question",
        flowStepUuid: "flow-step-1",
        position: 4,
        questionType: QuestionType.document,
        questionPayload: {
          prompt: "Upload a document",
          minUploads: 0,
          maxUploads: 1,
        },
        isCv: false,
      },
      {
        uuid: "video-question",
        flowStepUuid: "flow-step-2",
        position: 1,
        questionType: QuestionType.video,
        questionPayload: {
          question: "Record a video",
          maxDurationSeconds: 60,
          maxOvertimeSeconds: 10,
        },
        isCv: false,
      },
    ];
    const answers: Array<z.infer<typeof AnswerSelectSchema>> = [
      {
        uuid: "answer-1",
        interviewUuid: "interview-1",
        questionUuid: "text-question",
        answerPayload: {
          answer: "Hello there",
        },
        answeredAt: new Date(),
      },
      {
        uuid: "answer-2",
        interviewUuid: "interview-1",
        questionUuid: "single-choice-question",
        answerPayload: {
          selectedOption: "B",
        },
        answeredAt: new Date(),
      },
      {
        uuid: "answer-3",
        interviewUuid: "interview-1",
        questionUuid: "multiple-choice-question",
        answerPayload: {
          selectedOptions: ["A"],
        },
        answeredAt: new Date(),
      },
      {
        uuid: "answer-4",
        interviewUuid: "interview-1",
        questionUuid: "document-question",
        answerPayload: {
          kind: "no_documents",
        },
        answeredAt: new Date(),
      },
    ];

    expect(
      getCurrentFlowStepFormDefaultValues({
        questions,
        answers,
        currentFlowStepUuid: "flow-step-1",
      }),
    ).toEqual({
      "text-question": "Hello there",
      "single-choice-question": "B",
      "multiple-choice-question": ["A"],
    });
  });

  it("falls back to empty values for unanswered form-backed questions", () => {
    const questions: Array<z.infer<typeof QuestionSelectSchema>> = [
      {
        uuid: "text-question",
        flowStepUuid: "flow-step-1",
        position: 1,
        questionType: QuestionType.text,
        questionPayload: {
          question: "Tell us about yourself",
        },
        isCv: false,
      },
      {
        uuid: "single-choice-question",
        flowStepUuid: "flow-step-1",
        position: 2,
        questionType: QuestionType.single_choice,
        questionPayload: {
          question: "Choose one",
          options: ["A", "B"],
        },
        isCv: false,
      },
      {
        uuid: "multiple-choice-question",
        flowStepUuid: "flow-step-1",
        position: 3,
        questionType: QuestionType.multiple_choice,
        questionPayload: {
          question: "Choose many",
          options: ["A", "B"],
        },
        isCv: false,
      },
    ];

    expect(
      getCurrentFlowStepFormDefaultValues({
        questions,
        answers: [],
        currentFlowStepUuid: "flow-step-1",
      }),
    ).toEqual({
      "text-question": "",
      "single-choice-question": "",
      "multiple-choice-question": [],
    });
  });

  it("fails hard when a persisted answer payload does not match the question type", () => {
    const questions: Array<z.infer<typeof QuestionSelectSchema>> = [
      {
        uuid: "text-question",
        flowStepUuid: "flow-step-1",
        position: 1,
        questionType: QuestionType.text,
        questionPayload: {
          question: "Tell us about yourself",
        },
        isCv: false,
      },
    ];
    const answers: Array<z.infer<typeof AnswerSelectSchema>> = [
      {
        uuid: "answer-1",
        interviewUuid: "interview-1",
        questionUuid: "text-question",
        answerPayload: {
          selectedOption: "Wrong payload shape",
        },
        answeredAt: new Date(),
      },
    ];

    expect(() =>
      getCurrentFlowStepFormDefaultValues({
        questions,
        answers,
        currentFlowStepUuid: "flow-step-1",
      }),
    ).toThrowError(/text question/i);
  });
});

describe("getQuestionTypeHelper", () => {
  it("fails hard for unsupported question types", () => {
    expect(() =>
      getQuestionTypeHelper("not_a_real_question_type"),
    ).toThrowError(/not supported/i);
  });
});

describe("renderQuestionBlockQuestion", () => {
  it("fails hard when asked to render a video question inside a question block", () => {
    const question: z.infer<typeof QuestionSelectSchema> = {
      uuid: "video-question",
      flowStepUuid: "flow-step-1",
      position: 1,
      questionType: QuestionType.video,
      questionPayload: {
        question: "Record a video",
        maxDurationSeconds: 60,
        maxOvertimeSeconds: 10,
      },
      isCv: false,
    };

    expect(() =>
      renderQuestionBlockQuestion({
        form: {} as never,
        question,
        interviewUuid: "interview-1",
        queryKeyToInvalidateAnswers: ["answers", "interview-1"],
        answer: undefined,
      }),
    ).toThrowError(/not supported in question blocks/i);
  });
});
