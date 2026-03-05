import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type SubmitEvent, useId, useState } from "react";

import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/interviews/$uuid/")({
  component: RouteComponent,
  loader: ({ params, context }) => {
    const { uuid } = params;
    context.queryClient.ensureQueryData(
      orpc.getInterviewByUuid.queryOptions({
        input: { uuid },
      }),
    );
  },
});

function getQuestionPrompt(payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Untitled question";
  }

  const prompt = (payload as Record<string, unknown>).prompt;

  return typeof prompt === "string" && prompt.length > 0
    ? prompt
    : "Untitled question";
}

function RouteComponent() {
  const { uuid } = Route.useParams();
  const queryClient = useQueryClient();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const interviewRelatedDataQueryOptions =
    orpc.getInterviewRelatedDataByInterviewUuid.queryOptions({
      input: { uuid },
    });
  const interviewRelatedDataQuery = useQuery(interviewRelatedDataQueryOptions);

  const addParticipantMutation = useMutation({
    ...orpc.addParticipantToInterview.mutationOptions(),
    onMutate: async (variables, context) => {
      await context.client.cancelQueries({
        queryKey: interviewRelatedDataQueryOptions.queryKey,
      });

      const previousData = context.client.getQueryData(
        interviewRelatedDataQueryOptions.queryKey,
      );

      context.client.setQueryData(
        interviewRelatedDataQueryOptions.queryKey,
        (oldData) => {
          if (!oldData) return oldData;

          const newCandiadate = {
            uuid: "optimistic-candidate-uuid",
            name: variables.name,
            email: variables.email,
          };
          return {
            ...oldData,
            interview: {
              ...oldData.interview,
              candidateUuid: newCandiadate.uuid,
            },
            candidate: newCandiadate,
          };
        },
      );

      return { previousData };
    },
    onError: (error, variables, onMutateResult, context) => {
      context.client.setQueryData(
        interviewRelatedDataQueryOptions.queryKey,
        onMutateResult?.previousData,
      );
      // NOTE we could try to show the error here to the user somehow
      // better would be with the onError function at the component level
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: interviewRelatedDataQueryOptions.queryKey,
      });
    },
  });

  const handleParticipantSubmit = async ({
    name,
    email,
  }: {
    name: string;
    email: string;
  }) => {
    setSubmitError(null);
    // NOTE before running the mutation we should verify that the input will not be rejected by the backend
    // Therefore we could shake (animate) the component to then show why the input is invalid.

    try {
      await addParticipantMutation.mutateAsync({
        interviewUuid: uuid,
        name,
        email,
      });
    } catch (_) {
      // NOTE to accompany the optimistic update we could show a toast message indicating the update is in flight
      // but that may also be too much, as it kills the positives things of optimistic updates
      // We should just make sure this never fails for users as it is our first and most important impression
      setSubmitError(
        "Deine Daten konnten leider nicht gespeichert werden. Bitte versuche es erneut.",
      );
    }
  };

  if (interviewRelatedDataQuery.isPending) {
    return <div>Loading interview...</div>;
  }

  if (interviewRelatedDataQuery.isError) {
    return <div>Could not load interview.</div>;
  }

  if (!interviewRelatedDataQuery.data) {
    return (
      <div>No interview found for {uuid}. This is a bug, please report it.</div>
    );
  }

  if (interviewRelatedDataQuery.data.candidate === null) {
    return (
      <div>
        <NameAndEmailGreeting
          errorMessage={submitError}
          onSubmit={handleParticipantSubmit}
        />
      </div>
    );
  }

  return (
    <div>
      <h2>{interviewRelatedDataQuery.data.role.roleName}</h2>
      <ul>
        {interviewRelatedDataQuery.data.questions.map((question) => (
          <li key={question.uuid}>
            <strong>#{question.position}</strong>{" "}
            {getQuestionPrompt(question.questionPayload)} (
            {question.questionType} → {question.answerType})
          </li>
        ))}
      </ul>
      <p>Recorded answers: {interviewRelatedDataQuery.data.steps.length}</p>
    </div>
  );
}

function NameAndEmailGreeting({
  errorMessage,
  onSubmit,
}: {
  errorMessage: string | null;
  onSubmit: (values: { name: string; email: string }) => Promise<void>;
}) {
  const nameId = useId();
  const emailId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    await onSubmit({
      name: name.trim(),
      email: email.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <p>Willkommen! Damit wir dich korrekt ansprechen können:</p>
      <label htmlFor={nameId}>Wie dürfen wir dich nennen?</label>
      <input
        id={nameId}
        name="name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />

      <label htmlFor={emailId}>
        Unter welcher E-Mail willst du kontaktiert werden?
      </label>
      <input
        id={emailId}
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <button type="submit">Los geht's!</button>

      {errorMessage ? <p>{errorMessage}</p> : null}
    </form>
  );
}
