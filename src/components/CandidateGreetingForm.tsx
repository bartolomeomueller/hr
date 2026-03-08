import { useId, useState } from "react";

export function CandidateGreetingForm({
  canSubmit,
  errorMessage, // TODO maybe delete this prop
  onSubmit,
}: {
  canSubmit: boolean;
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

      <button type="submit" disabled={!canSubmit}>
        Los geht's!
      </button>

      {errorMessage ? <p>{errorMessage}</p> : null}
    </form>
  );
}
