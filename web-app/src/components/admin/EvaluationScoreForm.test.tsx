// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvaluationScoreForm } from "./EvaluationScoreForm";

const { mutateMock } = vi.hoisted(() => ({
  mutateMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: vi.fn(() => ({
    mutate: mutateMock,
    isPending: false,
  })),
}));

vi.mock("@/orpc/client", () => ({
  orpc: {
    createEvaluation: {
      mutationOptions: vi.fn(() => ({})),
    },
  },
}));

afterEach(() => {
  cleanup();
  mutateMock.mockReset();
});

describe("EvaluationScoreForm", () => {
  it("starts with empty score fields when no initial values are provided", () => {
    render(<EvaluationScoreForm interviewUuid="interview-uuid" />);

    expect(screen.getByLabelText<HTMLInputElement>("Hard Skills").value).toBe(
      "",
    );
    expect(screen.getByLabelText<HTMLInputElement>("Gesamt").value).toBe("");
  });

  it("does not submit empty score fields", () => {
    render(<EvaluationScoreForm interviewUuid="interview-uuid" />);

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(mutateMock).not.toHaveBeenCalled();
  });

  it("shows the total score from the four score fields", () => {
    render(
      <EvaluationScoreForm
        interviewUuid="interview-uuid"
        initialValues={{
          hardSkillsScore: 1,
          softSkillsScore: 2,
          culturalAddScore: 3,
          potentialScore: 4,
        }}
      />,
    );

    expect(screen.getByLabelText<HTMLInputElement>("Gesamt").value).toBe("2.5");

    fireEvent.change(screen.getByLabelText("Hard Skills"), {
      target: { value: "5" },
    });

    expect(screen.getByLabelText<HTMLInputElement>("Gesamt").value).toBe("3.5");
  });

  it("creates the evaluation with the score fields", async () => {
    render(
      <EvaluationScoreForm
        interviewUuid="interview-uuid"
        initialValues={{
          hardSkillsScore: 1,
          softSkillsScore: 2,
          culturalAddScore: 3,
          potentialScore: 4,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith({
        interviewUuid: "interview-uuid",
        hardSkillsScore: 1,
        softSkillsScore: 2,
        culturalAddScore: 3,
        potentialScore: 4,
        finalScore: 2.5,
      });
    });
  });

  it("allows overriding the final score", async () => {
    render(
      <EvaluationScoreForm
        interviewUuid="interview-uuid"
        initialValues={{
          hardSkillsScore: 1,
          softSkillsScore: 2,
          culturalAddScore: 3,
          potentialScore: 4,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Gesamt"), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => {
      expect(mutateMock).toHaveBeenCalledWith({
        interviewUuid: "interview-uuid",
        hardSkillsScore: 1,
        softSkillsScore: 2,
        culturalAddScore: 3,
        potentialScore: 4,
        finalScore: 9,
      });
    });
  });

  it("does not submit scores outside 1 to 10", async () => {
    render(
      <EvaluationScoreForm
        interviewUuid="interview-uuid"
        initialValues={{
          hardSkillsScore: 1,
          softSkillsScore: 2,
          culturalAddScore: 3,
          potentialScore: 4,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText("Hard Skills"), {
      target: { value: "11" },
    });
    fireEvent.blur(screen.getByLabelText("Hard Skills"));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(
      await screen.findAllByText("Die Zahl darf maximal 10 sein."),
    ).not.toHaveLength(0);
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
