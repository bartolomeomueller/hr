import { useForm } from "@tanstack/react-form";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SlideInFromTop } from "./ui/animation";
import { Large } from "./ui/typography";

export function CandidateGreetingForm({
  canSubmit,
  errorMessage, // TODO maybe delete this prop
  onSubmit,
}: {
  canSubmit: boolean;
  errorMessage: string | null;
  onSubmit: (values: { name: string; email: string }) => Promise<void>;
}) {
  const formSchema = z.object({
    name: z.string().min(5, "Bitte gib deinen Namen an."),
    email: z.email("Bitte gib eine gültige E-Mail-Adresse an."),
  });

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
    },
    validators: {
      // Using two separate validators here, just leads to persisting errors until they run again. They do not share their errors.
      // Rather only count a field as invalid, if it got blurred.
      // Tanstack Form's isBlurred and isTouched will stay true, once they got set, no matter what happens.
      onChange: formSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  return (
    <div className="flex justify-center">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          form.handleSubmit();
        }}
        className="w-[75ch]"
      >
        <FieldGroup>
          <Large>Willkommen! Damit wir dich korrekt ansprechen können:</Large>
          <form.Field
            name="name"
            children={(field) => {
              const isInvalid =
                field.state.meta.isBlurred && !field.state.meta.isValid;
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
                    onBlur={field.handleBlur}
                    aria-invalid={isInvalid}
                    type="text"
                    placeholder="Erika Mustermann"
                    autoComplete="name"
                    required
                  />
                  <FieldDescription>
                    Das ist der Name, unter dem wir dich und dein Unternehmen
                    dich anprechen wird.
                  </FieldDescription>

                  <SlideInFromTop isVisible={isInvalid}>
                    <FieldError errors={field.state.meta.errors} />
                  </SlideInFromTop>
                </Field>
              );
            }}
          />

          <form.Field
            name="email"
            children={(field) => {
              const isInvalid =
                field.state.meta.isBlurred && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>
                    Unter welcher E-Mail willst du kontaktiert werden?
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={isInvalid}
                    type="email"
                    placeholder="erika.mustermann@example.com"
                    autoComplete="email"
                    required
                  />
                  <FieldDescription>
                    Diese Email-Adresse werden wir nutzen, um dich zu
                    kontaktieren. Wir werden dir keine Werbung schicken.
                  </FieldDescription>

                  <SlideInFromTop isVisible={isInvalid}>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </SlideInFromTop>
                </Field>
              );
            }}
          />

          <form.Subscribe
            selector={(state) => state.canSubmit}
            children={(formCanSubmit) => (
              <Button type="submit" disabled={!canSubmit || !formCanSubmit}>
                Los geht's!
              </Button>
            )}
          />

          {errorMessage ? <p>{errorMessage}</p> : null}
        </FieldGroup>
      </form>
    </div>
  );
}
