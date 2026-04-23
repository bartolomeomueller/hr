// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useSuspenseQueryMock,
  useMutationMock,
  useFormMock,
  hideFormMock,
  showFormMock,
} = vi.hoisted(() => ({
  useSuspenseQueryMock: vi.fn(),
  useMutationMock: vi.fn(),
  useFormMock: vi.fn(() => ({})),
  hideFormMock: vi.fn(),
  showFormMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: useMutationMock,
  useSuspenseQuery: useSuspenseQueryMock,
}));

vi.mock("@tanstack/react-form", () => ({
  useForm: useFormMock,
}));

vi.mock("@/components/interview/CandidateFlowFormContext", () => ({
  useCandidateFlowForm: () => ({
    hideForm: hideFormMock,
    showForm: showFormMock,
  }),
}));

vi.mock("@/orpc/client", () => ({
  client: {
    deleteDocumentFromObjectStorageAndFromAnswer: vi.fn(),
  },
  orpc: {
    addParticipantToInterview: {
      mutationOptions: vi.fn(() => ({})),
    },
    getInterviewRelatedDataByInterviewUuid: {
      queryOptions: vi.fn(() => ({
        queryKey: ["interview-related-data"],
      })),
    },
    getQuestionsByInterviewUuid: {
      queryOptions: vi.fn(() => ({
        queryKey: ["questions"],
      })),
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

vi.mock("./questions/QuestionBlock", () => ({
  QuestionBlock: () => <div>Question Block</div>,
}));

vi.mock("./questions/VideoQuestion", () => ({
  VideoQuestion: () => <div>Video Question</div>,
  videoQuestionBehavior: {
    getFormDefaultValue: vi.fn(),
    isAnswered: vi.fn(),
    renderQuestionBlockQuestion: vi.fn(),
  },
}));

import { Interview } from "@/components/interview/Interview";

describe("Interview invariants", () => {
  beforeEach(() => {
    useMutationMock.mockReturnValue({
      mutateAsync: vi.fn(),
    });
    useSuspenseQueryMock.mockReset();
    hideFormMock.mockReset();
    showFormMock.mockReset();
  });

  it("fails hard when no flow steps exist", () => {
    mockInterviewQueries({
      interviewRelatedData: {
        interview: {
          uuid: "interview-1",
          flowVersionUuid: "flow-version-1",
        },
        candidate: {
          uuid: "candidate-1",
          name: "Ada",
          email: "ada@example.com",
        },
        answers: [],
      },
      questionsData: {
        flowVersion: {
          uuid: "flow-version-1",
        },
        flowSteps: [],
        questions: [],
        role: {
          roleName: "Engineer",
        },
      },
    });

    expect(() =>
      render(
        <Interview
          uuid="interview-1"
          onFlowStepChange={vi.fn()}
          onResourceNotFound={() => {
            throw new Error("resource not found");
          }}
          finalizeInterview={vi.fn()}
        />,
      ),
    ).toThrowError(/at least one flow step is required/i);
  });

  it("fails hard when the requested flow step does not exist", () => {
    mockInterviewQueries({
      interviewRelatedData: {
        interview: {
          uuid: "interview-1",
          flowVersionUuid: "flow-version-1",
        },
        candidate: {
          uuid: "candidate-1",
          name: "Ada",
          email: "ada@example.com",
        },
        answers: [],
      },
      questionsData: {
        flowVersion: {
          uuid: "flow-version-1",
        },
        flowSteps: [
          {
            uuid: "flow-step-1",
            position: 1,
            kind: "question_block",
          },
        ],
        questions: [],
        role: {
          roleName: "Engineer",
        },
      },
    });

    expect(() =>
      render(
        <Interview
          uuid="interview-1"
          currentFlowStep={99}
          onFlowStepChange={vi.fn()}
          onResourceNotFound={() => {
            throw new Error("resource not found");
          }}
          finalizeInterview={vi.fn()}
        />,
      ),
    ).toThrowError(/current flow step 99 does not exist/i);
  });

  it("fails hard when interview and questions belong to different flow versions", () => {
    mockInterviewQueries({
      interviewRelatedData: {
        interview: {
          uuid: "interview-1",
          flowVersionUuid: "flow-version-1",
        },
        candidate: {
          uuid: "candidate-1",
          name: "Ada",
          email: "ada@example.com",
        },
        answers: [],
      },
      questionsData: {
        flowVersion: {
          uuid: "flow-version-2",
        },
        flowSteps: [
          {
            uuid: "flow-step-1",
            position: 1,
            kind: "question_block",
          },
        ],
        questions: [],
        role: {
          roleName: "Engineer",
        },
      },
    });

    expect(() =>
      render(
        <Interview
          uuid="interview-1"
          onFlowStepChange={vi.fn()}
          onResourceNotFound={() => {
            throw new Error("resource not found");
          }}
          finalizeInterview={vi.fn()}
        />,
      ),
    ).toThrowError(/mismatched flow version data/i);
  });
});

function mockInterviewQueries({
  interviewRelatedData,
  questionsData,
}: {
  interviewRelatedData: {
    interview: {
      uuid: string;
      flowVersionUuid: string;
    };
    candidate: {
      uuid: string;
      name: string;
      email: string;
    } | null;
    answers: unknown[];
  };
  questionsData: {
    flowVersion: {
      uuid: string;
    };
    flowSteps: Array<{ uuid: string; position: number; kind: string | null }>;
    questions: unknown[];
    role: {
      roleName: string;
    };
  };
}) {
  useSuspenseQueryMock.mockImplementation((options: { queryKey: string[] }) => {
    if (options.queryKey[0] === "interview-related-data") {
      return { data: interviewRelatedData };
    }

    if (options.queryKey[0] === "questions") {
      return { data: questionsData };
    }

    throw new Error(`Unexpected query key ${options.queryKey.join(",")}`);
  });
}
