import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { FileVideo } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Large } from "@/components/ui/typography";
import { VideoQuestionPayloadType } from "@/db/payload-types";
import { orpc } from "@/orpc/client";
import { useRecordingUploadStore } from "@/stores/recordingUploadStore";

// This is now mostly AI generated, if you wanna change it, just do it anew.

export function FinalizeInterview({
  uuid,
  onResourceNotFound,
}: {
  uuid: string;
  onResourceNotFound: () => never;
}) {
  const uploadStore = useRecordingUploadStore((state) => state.recordings);

  const interviewRelatedDataQueryOptions =
    orpc.getInterviewRelatedDataByInterviewUuid.queryOptions({
      input: { uuid },
    });
  const interviewRelatedDataQuery = useSuspenseQuery(
    interviewRelatedDataQueryOptions,
  );
  const questionsQuery = useSuspenseQuery(
    orpc.getQuestionsByInterviewUuid.queryOptions({ input: { uuid } }),
  );

  const finishInterviewMutation = useMutation({
    ...orpc.finishInterview.mutationOptions(),
    onError(error, _variables, _onMutateResult, _context) {
      console.error("Error finishing interview:", error);
      toast.error(
        "Deine Bewerbung konnte gerade nicht abgeschlossen werden. Bitte lade diese Seite neu, um es erneut zu versuchen.",
      );
    },
    onSuccess: (_data, _variables, _onMutateResult, context) => {
      context.client.setQueryData(
        interviewRelatedDataQueryOptions.queryKey,
        (oldData) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            interview: {
              ...oldData.interview,
              isFinished: true,
            },
          };
        },
      );
      context.client.invalidateQueries({
        queryKey: interviewRelatedDataQueryOptions.queryKey,
      });
    },
  });

  const questionsData = questionsQuery.data;
  if (!questionsData) {
    return onResourceNotFound();
  }
  const interviewRelatedData = interviewRelatedDataQuery.data;
  if (!interviewRelatedData) {
    return onResourceNotFound();
  }

  const allRecordingsUploaded = uploadStore.length === 0;
  const questionLabelsByUuid = getQuestionLabelsByUuid(questionsData.questions);
  const recordingGroups = getRecordingGroups(uploadStore, questionLabelsByUuid);
  const interviewIsFinished =
    interviewRelatedData.interview.isFinished ||
    finishInterviewMutation.isSuccess;

  useEffect(() => {
    if (!allRecordingsUploaded) return;
    if (interviewRelatedData.interview.isFinished) return;
    if (finishInterviewMutation.isPending) return;
    if (finishInterviewMutation.isError) return;

    finishInterviewMutation.mutate({ uuid });
  }, [
    allRecordingsUploaded,
    finishInterviewMutation.mutate,
    finishInterviewMutation.isError,
    finishInterviewMutation.isPending,
    interviewRelatedData.interview.isFinished,
    uuid,
  ]);

  if (!allRecordingsUploaded) {
    return (
      <div className="flex justify-center px-2 sm:px-4 md:px-8">
        <div className="flex w-full flex-col gap-6 lg:w-9/12">
          <Large>
            Schließ diese Seite noch nicht. Deine Aufnahmen werden derzeit noch
            hochgeladen. Wenn du diese Seite jetzt verlässt, gehen deine Daten
            verloren.
          </Large>

          <div className="space-y-4">
            {recordingGroups.map((group) => (
              <section
                key={group.questionUuid}
                className="rounded-lg border bg-card p-4 shadow-xs"
              >
                <Large className="mb-3 text-base">{group.questionLabel}</Large>
                <div className="space-y-3">
                  {group.parts.map((recording) => (
                    <RecordingUploadProgress
                      key={recording.indexedDBId}
                      partNumber={recording.partNumber}
                      progress={recording.progress}
                      isLastPart={recording.isLastPart}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!interviewIsFinished) {
    return (
      <div className="flex justify-center px-2 sm:px-4 md:px-8">
        <div className="flex w-full flex-col gap-4 lg:w-9/12">
          <div className="rounded-lg border bg-card p-6 shadow-xs">
            <Large>
              {finishInterviewMutation.isError
                ? "Deine Bewerbung konnte leider nicht abgeschlossen werden. Bitte lade die Seite neu, um es erneut zu versuchen."
                : "Deine Daten werden gerade gespeichert. Bitte schließ dieses Fenster noch nicht."}
            </Large>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center px-2 sm:px-4 md:px-8">
      <div className="flex w-full flex-col gap-4 lg:w-9/12">
        <div className="rounded-lg border bg-card p-6 shadow-xs">
          <Large>
            Danke für deine Bewerbung. Deine Daten wurden erfolgreich
            gespeichert. Du kannst das Fenster nun schließen.
          </Large>
        </div>
      </div>
    </div>
  );
}

function RecordingUploadProgress({
  partNumber,
  progress,
  isLastPart,
}: {
  partNumber: number;
  progress: number;
  isLastPart: boolean;
}) {
  return (
    <div className="relative w-full pb-2 text-sm font-medium">
      <div className="flex w-full flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span
            className="align-text-bottom text-muted-foreground"
            aria-hidden="true"
          >
            <FileVideo className="inline h-4 w-4" />
          </span>
          <span className="align-text-top">
            Teil {partNumber}
            {isLastPart ? " (letzter Teil)" : ""}
          </span>
        </div>
        <span className="text-sm text-muted-foreground">
          {Math.round(progress)}%
        </span>
      </div>
      <div className="absolute bottom-0 h-1 w-full rounded-full bg-primary-foreground">
        <div
          className="h-1 rounded-full bg-primary"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
}

function getQuestionLabelsByUuid(
  questions: Array<{ uuid: string; questionPayload: unknown }>,
) {
  return new Map(
    questions.map((question) => {
      const questionPayloadResult = VideoQuestionPayloadType.safeParse(
        question.questionPayload,
      );

      return [
        question.uuid,
        questionPayloadResult.success
          ? questionPayloadResult.data.question
          : "Videofrage",
      ];
    }),
  );
}

function getRecordingGroups(
  recordings: Array<{
    questionUuid: string;
    indexedDBId: number;
    progress: number;
    partNumber: number;
    isLastPart: boolean;
  }>,
  questionLabelsByUuid: Map<string, string>,
) {
  const groups = new Map<
    string,
    {
      questionUuid: string;
      questionLabel: string;
      parts: Array<{
        questionUuid: string;
        indexedDBId: number;
        progress: number;
        partNumber: number;
        isLastPart: boolean;
      }>;
    }
  >();

  for (const recording of recordings) {
    const existingGroup = groups.get(recording.questionUuid);
    if (existingGroup) {
      existingGroup.parts.push(recording);
      continue;
    }

    groups.set(recording.questionUuid, {
      questionUuid: recording.questionUuid,
      questionLabel:
        questionLabelsByUuid.get(recording.questionUuid) ?? "Videofrage",
      parts: [recording],
    });
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    parts: [...group.parts].sort(
      (left, right) => left.partNumber - right.partNumber,
    ),
  }));
}
