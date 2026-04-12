import { useSuspenseQuery } from "@tanstack/react-query";
import { VideoQuestionPayloadType } from "@/db/payload-types";
import { orpc } from "@/orpc/client";
import { useUploadStore } from "@/stores/videoUploadStore";

export function FinalizeInterview({
  uuid,
  onResourceNotFound,
}: {
  uuid: string;
  onResourceNotFound: () => never;
}) {
  const uploadStore = useUploadStore((state) => state.recordings);

  const questionsQuery = useSuspenseQuery(
    orpc.getQuestionsByInterviewUuid.queryOptions({ input: { uuid } }),
  );

  const questionsData = questionsQuery.data;
  if (!questionsData) {
    return onResourceNotFound();
  }

  const allRecordingsUploaded = uploadStore.length === 0;

  if (!allRecordingsUploaded) {
    return (
      <div>
        <h2>Schließ diese Seite noch nicht!</h2>
        <p>
          Deine Aufnahmen werden derzeit noch hochgeladen. Wenn du diese Seite
          jetzt verlässt, gehen dein Daten verloren.
        </p>
        {uploadStore.map((recording) => (
          <div key={recording.recordingId}>
            <p>
              Aufnahme:{" "}
              {
                VideoQuestionPayloadType.safeParse(
                  questionsData.questions.find(
                    (q) => q.uuid === recording.questionUuid,
                  )?.questionPayload,
                )?.data?.question
              }
            </p>
            <p>
              Status:{" "}
              {recording.isUploading
                ? "Hochladen läuft..."
                : "Warte auf Hochladen..."}
            </p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <h2>Danke für deine Bewerbung</h2>
      <p>
        Deine Daten wurden erfolgreich gespeichert. Du kannst das Fenster nun
        schließen.
      </p>
    </div>
  );
}
