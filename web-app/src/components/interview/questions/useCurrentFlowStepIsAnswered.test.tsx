// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { v7 as uuidv7 } from "uuid";
import { afterEach, describe, expect, it, vi } from "vitest";
import type z from "zod";
import { QuestionType } from "@/db/payload-types";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import { useDocumentUploadStore } from "@/stores/documentUploadStore";
import { useRecordingUploadStore } from "@/stores/recordingUploadStore";

vi.mock("@/orpc/client", () => ({
  client: {},
  orpc: {
    saveAnswer: {
      mutationOptions: vi.fn(() => ({})),
    },
    deleteAnswer: {
      mutationOptions: vi.fn(() => ({})),
    },
    deleteDocumentFromObjectStorageAndFromAnswer: {
      mutationOptions: vi.fn(() => ({})),
    },
    createPresignedS3DocumentDownloadUrlByUuid: {
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

import { useCurrentFlowStepIsAnswered } from "./useCurrentFlowStepIsAnswered";

function HookProbe({
  currentFlowStepKind,
  currentFlowStepQuestions,
  answers,
}: {
  currentFlowStepKind: string;
  currentFlowStepQuestions: Array<z.infer<typeof QuestionSelectSchema>>;
  answers: Array<z.infer<typeof AnswerSelectSchema>>;
}) {
  const isAnswered = useCurrentFlowStepIsAnswered({
    currentFlowStepKind,
    currentFlowStepQuestions,
    answers,
  });

  return <div>{isAnswered ? "answered" : "unanswered"}</div>;
}

function createDocumentQuestion(): z.infer<typeof QuestionSelectSchema> {
  return {
    uuid: uuidv7(),
    flowStepUuid: uuidv7(),
    position: 1,
    questionType: QuestionType.document,
    questionPayload: {
      prompt: "Upload your supporting documents",
      minUploads: 0,
      maxUploads: 3,
    },
    isCv: false,
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

function createTextQuestion(): z.infer<typeof QuestionSelectSchema> {
  return {
    uuid: uuidv7(),
    flowStepUuid: uuidv7(),
    position: 1,
    questionType: QuestionType.text,
    questionPayload: {
      question: "Tell us about yourself",
    },
    isCv: false,
  };
}

function createSingleChoiceQuestion(): z.infer<typeof QuestionSelectSchema> {
  return {
    uuid: uuidv7(),
    flowStepUuid: uuidv7(),
    position: 1,
    questionType: QuestionType.single_choice,
    questionPayload: {
      question: "Choose one",
      options: ["A", "B"],
    },
    isCv: false,
  };
}

describe("useCurrentFlowStepIsAnswered", () => {
  afterEach(() => {
    cleanup();
    useDocumentUploadStore.setState({ documentsToUpload: [] });
    useRecordingUploadStore.setState({ recordings: [] });
  });

  it("treats a question block as answered when a document upload is in progress", () => {
    const question = createDocumentQuestion();
    useDocumentUploadStore.setState({
      documentsToUpload: [
        {
          localUuid: uuidv7(),
          questionUuid: question.uuid,
          file: new File(["resume"], "resume.pdf", {
            type: "application/pdf",
          }),
          progress: 20,
          abortController: new AbortController(),
        },
      ],
    });

    render(
      <HookProbe
        currentFlowStepKind="question_block"
        currentFlowStepQuestions={[question]}
        answers={[]}
      />,
    );

    expect(screen.getByText("answered")).toBeTruthy();
  });

  it("treats a video step as answered when the last recording part is uploading", () => {
    const question = createVideoQuestion();
    useRecordingUploadStore.setState({
      recordings: [
        {
          questionUuid: question.uuid,
          interviewUuid: uuidv7(),
          queryKeyToInvalidateAnswers: ["answers", uuidv7()],
          indexedDBId: 1,
          progress: 10,
          partNumber: 2,
          isLastPart: true,
        },
      ],
    });

    render(
      <HookProbe
        currentFlowStepKind="video"
        currentFlowStepQuestions={[question]}
        answers={[]}
      />,
    );

    expect(screen.getByText("answered")).toBeTruthy();
  });

  it("treats a question block as unanswered when neither an answer nor an upload exists", () => {
    render(
      <HookProbe
        currentFlowStepKind="question_block"
        currentFlowStepQuestions={[createDocumentQuestion()]}
        answers={[]}
      />,
    );

    expect(screen.getByText("unanswered")).toBeTruthy();
  });

  it("treats a mixed question block as answered when each question type is satisfied", () => {
    const textQuestion = createTextQuestion();
    const singleChoiceQuestion = createSingleChoiceQuestion();
    const documentQuestion = createDocumentQuestion();

    useDocumentUploadStore.setState({
      documentsToUpload: [
        {
          localUuid: uuidv7(),
          questionUuid: documentQuestion.uuid,
          file: new File(["resume"], "resume.pdf", {
            type: "application/pdf",
          }),
          progress: 20,
          abortController: new AbortController(),
        },
      ],
    });

    render(
      <HookProbe
        currentFlowStepKind="question_block"
        currentFlowStepQuestions={[
          textQuestion,
          singleChoiceQuestion,
          documentQuestion,
        ]}
        answers={[
          {
            uuid: uuidv7(),
            interviewUuid: uuidv7(),
            questionUuid: textQuestion.uuid,
            answerPayload: {
              answer: "Because I care.",
            },
            answeredAt: new Date(),
          },
          {
            uuid: uuidv7(),
            interviewUuid: uuidv7(),
            questionUuid: singleChoiceQuestion.uuid,
            answerPayload: {
              selectedOption: "A",
            },
            answeredAt: new Date(),
          },
        ]}
      />,
    );

    expect(screen.getByText("answered")).toBeTruthy();
  });
});
