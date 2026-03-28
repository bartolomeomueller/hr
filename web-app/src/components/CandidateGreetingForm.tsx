import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    // TODO think about using the react-hook-form library via shadcs field components
    <form onSubmit={handleSubmit}>
      <p className="text-lg font-semibold">
        Willkommen! Damit wir dich korrekt ansprechen können:
      </p>
      <Label htmlFor={nameId}>Wie dürfen wir dich nennen?</Label>
      <Input
        id={nameId}
        name="name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />

      <Label htmlFor={emailId}>
        Unter welcher E-Mail willst du kontaktiert werden?
      </Label>
      <Input
        id={emailId}
        name="email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <Button
        type="submit"
        disabled={!canSubmit}
        className="disabled:cursor-not-allowed disabled:opacity-70"
      >
        Los geht's!
      </Button>

      {errorMessage ? <p>{errorMessage}</p> : null}
    </form>
  );
}
