import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { useId, useRef } from "react";
import z from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { orpc } from "@/orpc/client";

// TODO maybe use resizable shadcn component for notes

type EvaluationScoreValues = {
  hardSkillsScore: number;
  softSkillsScore: number;
  culturalAddScore: number;
  potentialScore: number;
  finalScore: number;
};

type EvaluationScoreFields = {
  hardSkillsScore: number | string;
  softSkillsScore: number | string;
  culturalAddScore: number | string;
  potentialScore: number | string;
};

type EvaluationScoreFormValues = EvaluationScoreFields & {
  finalScore: number | string;
};

const scoreFields = [
  ["hardSkillsScore", "Hard Skills"],
  ["softSkillsScore", "Soft Skills"],
  ["culturalAddScore", "Cultural Add"],
  ["potentialScore", "Potential"],
] as const;

export function EvaluationScoreForm({
  interviewUuid,
  initialValues,
}: {
  interviewUuid: string;
  initialValues?: Partial<EvaluationScoreValues>;
}) {
  const finalScoreId = useId();
  const defaultValues = {
    hardSkillsScore: initialValues?.hardSkillsScore ?? "",
    softSkillsScore: initialValues?.softSkillsScore ?? "",
    culturalAddScore: initialValues?.culturalAddScore ?? "",
    potentialScore: initialValues?.potentialScore ?? "",
  };
  const defaultFinalScore =
    initialValues?.finalScore ?? getFinalScore(defaultValues);
  const finalScoreWasOverridden = useRef(
    initialValues?.finalScore !== undefined &&
      initialValues.finalScore !== getFinalScore(defaultValues),
  );
  const createEvaluationMutation = useMutation({
    ...orpc.createEvaluation.mutationOptions(),
  });
  const form = useForm({
    defaultValues: {
      ...defaultValues,
      finalScore: defaultFinalScore,
    },
    onSubmit: ({ value }) => {
      const scoreValues = parseScoreValues(value);
      if (!scoreValues) return;
      createEvaluationMutation.mutate({
        interviewUuid,
        hardSkillsScore: scoreValues.hardSkillsScore,
        softSkillsScore: scoreValues.softSkillsScore,
        culturalAddScore: scoreValues.culturalAddScore,
        potentialScore: scoreValues.potentialScore,
        finalScore: scoreValues.finalScore.toString(),
      });
    },
  });

  return (
    <div className="flex justify-center">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          form.handleSubmit();
        }}
        className="w-md"
      >
        <FieldSet>
          <FieldLegend>Bewertung</FieldLegend>
          <FieldGroup className="gap-4">
            {scoreFields.map(([name, label]) => (
              <form.Field
                key={name}
                name={name}
                validators={{
                  onChange: z
                    .int("Bitte eine ganze Zahl von 1 bis 10 nutzen.")
                    .min(1, "Bitte mindestens 1 nutzen.")
                    .max(10, "Die Zahl darf maximal 10 sein."),
                }}
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isBlurred && !field.state.meta.isValid;

                  return (
                    <div>
                      <Field data-invalid={isInvalid} orientation="responsive">
                        <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
                        <Input
                          id={field.name}
                          name={field.name}
                          value={field.state.value}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            const nextValue = value === "" ? "" : Number(value);
                            field.handleChange(nextValue);
                            if (finalScoreWasOverridden.current) return;

                            form.setFieldValue(
                              "finalScore",
                              getFinalScore({
                                ...form.state.values,
                                [name]: nextValue,
                              }),
                              // This is a non user action.
                              { dontUpdateMeta: true },
                            );
                          }}
                          onBlur={field.handleBlur}
                          aria-invalid={isInvalid}
                          type="number"
                          min={1}
                          max={10}
                          step={1}
                          className="w-24!"
                        />
                      </Field>
                      <FieldError errors={field.state.meta.errors} />
                    </div>
                  );
                }}
              />
            ))}

            <form.Field
              name="finalScore"
              validators={{
                onChange: z
                  .number()
                  .min(1, "Bitte mindestens 1 nutzen.")
                  .max(10, "Die Zahl darf maximal 10 sein.")
                  .refine(
                    (score) =>
                      (score.toString().split(".")[1]?.length ?? 0) <= 1,
                    "Bitte maximal eine Nachkommastelle nutzen.",
                  ),
              }}
              children={(field) => {
                const isInvalid =
                  field.state.meta.isBlurred && !field.state.meta.isValid;

                return (
                  <div>
                    <Field data-invalid={isInvalid} orientation="responsive">
                      <FieldLabel htmlFor={finalScoreId}>Gesamt</FieldLabel>
                      <Input
                        id={finalScoreId}
                        name={field.name}
                        value={field.state.value}
                        onChange={(event) => {
                          const value = event.currentTarget.value;
                          const nextValue = value === "" ? "" : Number(value);
                          if (nextValue === "") {
                            finalScoreWasOverridden.current = false;
                          } else {
                            finalScoreWasOverridden.current = true;
                          }
                          field.handleChange(nextValue);
                        }}
                        onBlur={field.handleBlur}
                        aria-invalid={isInvalid}
                        type="number"
                        min={1}
                        max={10}
                        step={0.1}
                        className="w-24!"
                      />
                    </Field>
                    <FieldError errors={field.state.meta.errors} />
                  </div>
                );
              }}
            />

            <form.Subscribe
              selector={(state) => state.canSubmit}
              children={(canSubmit) => (
                <Button
                  type="submit"
                  disabled={!canSubmit || createEvaluationMutation.isPending}
                >
                  Speichern
                </Button>
              )}
            />
          </FieldGroup>
        </FieldSet>
      </form>
    </div>
  );
}

// These schemas only exist for parsing from strings to numbers.
const evaluationScoreValuesSchema = z.object({
  hardSkillsScore: z.number(),
  softSkillsScore: z.number(),
  culturalAddScore: z.number(),
  potentialScore: z.number(),
  finalScore: z.number(),
});
const evaluationScoreFieldsSchema = evaluationScoreValuesSchema.omit({
  finalScore: true,
});

function getFinalScore({
  hardSkillsScore,
  softSkillsScore,
  culturalAddScore,
  potentialScore,
}: EvaluationScoreFields) {
  const result = evaluationScoreFieldsSchema.safeParse({
    hardSkillsScore,
    softSkillsScore,
    culturalAddScore,
    potentialScore,
  });

  if (!result.success) {
    return "";
  }

  const scores = result.data;
  const average =
    (scores.hardSkillsScore +
      scores.softSkillsScore +
      scores.culturalAddScore +
      scores.potentialScore) /
    4;

  return Math.round(average * 10) / 10;
}

function parseScoreValues(
  values: EvaluationScoreFormValues,
): EvaluationScoreValues | null {
  const result = evaluationScoreValuesSchema.safeParse(values);
  return result.success ? result.data : null;
}
