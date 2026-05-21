// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoleTable } from "./roles.$slug";

const { useSuspenseQueryMock } = vi.hoisted(() => ({
  useSuspenseQueryMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: useSuspenseQueryMock,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: vi.fn(() => () => null),
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode;
    to: string;
    params: Record<string, string>;
  }) => (
    <a href={to.replace("$uuid", params.uuid).replace("$slug", params.slug)}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/admin/DocumentDownloadButton", () => ({
  DocumentDownloadButton: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("@/orpc/client", () => ({
  orpc: {
    getAllFinishedInterviewsForRoleByRoleSlug: {
      queryOptions: vi.fn((options) => options),
    },
  },
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  useSuspenseQueryMock.mockReset();
  vi.unstubAllGlobals();
});

describe("RoleTable", () => {
  it("shows candidate evaluations in the table", async () => {
    useSuspenseQueryMock.mockReturnValue({
      data: [
        {
          interview: { uuid: "interview-1" },
          candidate: { name: "Ada Lovelace" },
          cvDocument: { documentUuid: "document-1" },
          evaluations: [
            {
              uuid: "evaluation-1",
              hardSkillsScore: 9,
              softSkillsScore: 8,
              culturalAddScore: 7,
              potentialScore: 10,
              finalScore: "8.5",
              user: { name: "Reviewer One" },
            },
            {
              uuid: "evaluation-2",
              hardSkillsScore: 6,
              softSkillsScore: 7,
              culturalAddScore: 8,
              potentialScore: 7,
              finalScore: "7.0",
              user: { name: "Reviewer Two" },
            },
          ],
        },
        {
          interview: { uuid: "interview-2" },
          candidate: { name: "Grace Hopper" },
          cvDocument: { documentUuid: "document-2" },
          evaluations: [],
        },
      ],
    });

    render(<RoleTable roleSlug="engineer" />);

    const adaRow = screen.getByText("Ada Lovelace").closest("tr");
    const graceRow = screen.getByText("Grace Hopper").closest("tr");

    expect(adaRow).not.toBeNull();
    expect(graceRow).not.toBeNull();
    const evaluationAverageBadge = within(
      adaRow as HTMLTableRowElement,
    ).getByText("7.8");

    expect(evaluationAverageBadge).not.toBeNull();

    fireEvent.focus(evaluationAverageBadge);

    await waitFor(() => {
      expect(screen.getAllByText("Reviewer One").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Reviewer Two").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hard Skills").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Soft Skills").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Cultural Add").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(screen.getAllByText("Potential").length).toBeGreaterThanOrEqual(2);
    expect(
      within(graceRow as HTMLTableRowElement).getByText("Keine Bewertung"),
    ).not.toBeNull();
  });
});
