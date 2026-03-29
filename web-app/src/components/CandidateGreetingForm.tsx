import { useForm } from "@tanstack/react-form";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
    await onSubmit({
      name: name.trim(),
      email: email.trim(),
    });
  };

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldGroup>
        <p className="text-lg font-semibold">
          Willkommen! Damit wir dich korrekt ansprechen können:
        </p>
        <form.Field
          name="name"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>
                  Wie dürfen wir dich nennen?
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                  type="text"
                  placeholder="Erika Mustermann"
                  autoComplete="name"
                  required
                />
              </Field>
            );
          }}
        />
        {/* <Label htmlFor={nameId}>Wie dürfen wir dich nennen?</Label>
         */}

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
      </FieldGroup>
    </form>
  );
}
