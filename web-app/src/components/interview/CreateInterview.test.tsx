// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  useSuspenseQueryMock,
  useMutationMock,
  showFormMock,
  toastErrorMock,
  mutationOptionsFactoryMock,
} = vi.hoisted(() => ({
  useSuspenseQueryMock: vi.fn(),
  useMutationMock: vi.fn(),
  showFormMock: vi.fn(),
  toastErrorMock: vi.fn(),
  mutationOptionsFactoryMock: vi.fn(() => ({})),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: useMutationMock,
  useSuspenseQuery: useSuspenseQueryMock,
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock("@/components/interview/CandidateFlowFormContext", () => ({
  candidateFlowNoopSubmit: async () => {},
  useCandidateFlowForm: () => ({
    showForm: showFormMock,
  }),
}));

vi.mock("@/orpc/client", () => ({
  orpc: {
    getRoleAndItsFlowVersionBySlug: {
      queryOptions: vi.fn(() => ({})),
    },
    createInterviewForRoleUuid: {
      mutationOptions: mutationOptionsFactoryMock,
    },
    getInterviewRelatedDataByInterviewUuid: {
      queryOptions: vi.fn(() => ({})),
    },
    getQuestionsByInterviewUuid: {
      queryOptions: vi.fn(() => ({})),
    },
  },
}));

import { CreateInterview } from "./CreateInterview";

describe("CreateInterview", () => {
  beforeEach(() => {
    showFormMock.mockReset();
    toastErrorMock.mockReset();
    mutationOptionsFactoryMock.mockClear();
    useSuspenseQueryMock.mockReturnValue({
      data: {
        role: {
          uuid: "role-1",
        },
      },
    });
  });

  it("shows a reload toast instead of crashing when creating the interview fails", async () => {
    const navigateMock = vi.fn();
    const mutateAsyncMock = vi.fn(async () => {
      const onError = useMutationMock.mock.calls[0]?.[0]?.onError;
      onError?.(new Error("create failed"), { roleUuid: "role-1" }, undefined);
      throw new Error("create failed");
    });

    useMutationMock.mockImplementation((options) => options);
    renderCreateInterview({
      navigateMock,
      mutateAsyncMock,
    });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Dein Interview konnte nicht gestartet werden. Bitte lade die Seite neu und versuche es erneut.",
      );
    });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("navigates to the interview after a successful creation", async () => {
    const navigateMock = vi.fn(async () => {});
    const mutateAsyncMock = vi.fn(async () => ({
      uuid: "interview-1",
    }));

    useMutationMock.mockImplementation((options) => options);
    renderCreateInterview({
      navigateMock,
      mutateAsyncMock,
    });

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("interview-1");
    });
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(showFormMock).toHaveBeenCalledWith({
      canSubmit: false,
      errorMessage: null,
      onSubmit: expect.any(Function),
    });
  });
});

function renderCreateInterview({
  navigateMock,
  mutateAsyncMock,
}: {
  navigateMock: ReturnType<typeof vi.fn>;
  mutateAsyncMock: ReturnType<typeof vi.fn>;
}) {
  useMutationMock.mockReturnValue({
    mutateAsync: mutateAsyncMock,
  });

  return render(
    <CreateInterview
      slug="engineer"
      onNavigateToInterview={navigateMock}
      onResourceNotFound={() => {
        throw new Error("resource not found");
      }}
    />,
  );
}
