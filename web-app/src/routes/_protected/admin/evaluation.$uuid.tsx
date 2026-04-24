import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Suspense } from "react";
import { DocumentDownloadButton } from "@/components/admin/DocumentDownloadButton";
import { GenericLoader } from "@/components/layout/GenericLoader";
import { Bold, H1, Large, Muted, Small } from "@/components/ui/typography";
import {
  DocumentAnswerPayloadType,
  DocumentQuestionPayloadType,
  MultipleChoiceAnswerPayloadType,
  MultipleChoiceQuestionPayloadType,
  QuestionType,
  SingleChoiceAnswerPayloadType,
  SingleChoiceQuestionPayloadType,
  TextAnswerPayloadType,
  TextQuestionPayloadType,
  VideoAnswerPayloadType,
  VideoQuestionPayloadType,
} from "@/db/payload-types";
import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/_protected/admin/evaluation/$uuid")({
  loader: ({ params, context }) => {
    context.queryClient.ensureQueryData(
      orpc.getEvaluationRelatedDataByInterviewUuid.queryOptions({
        input: { uuid: params.uuid },
      }),
    );
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Suspense fallback={<GenericLoader />}>
      <Evaluation uuid={Route.useParams().uuid} />
    </Suspense>
  );
}

function Evaluation({ uuid }: { uuid: string }) {
  const evaluationRelatedDataQuery = useSuspenseQuery(
    orpc.getEvaluationRelatedDataByInterviewUuid.queryOptions({
      input: { uuid },
    }),
  );
  const evaluationRelatedData = evaluationRelatedDataQuery.data;

  if (!evaluationRelatedData) {
    return <div className="p-6">Interview nicht gefunden.</div>;
  }

  const { candidate, questions, answers, interview } = evaluationRelatedData;
  const cvQuestion = questions.find((question) => question.isCv);
  const cvAnswer = answers.find(
    (answer) => answer.questionUuid === cvQuestion?.uuid,
  );
  const cvAnswerPayload = DocumentAnswerPayloadType.safeParse(
    cvAnswer?.answerPayload,
  );
  const cvDocument =
    cvAnswerPayload.success && cvAnswerPayload.data.kind === "documents"
      ? cvAnswerPayload.data.documents[0]
      : undefined;
  const otherQuestions = questions.filter((question) => !question.isCv);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <header className="space-y-2">
        <H1 className="text-left">{candidate.name}</H1>
        <Muted>{candidate.email}</Muted>
      </header>

      <section>
        <Muted className="italic">Lebenslauf</Muted>

        {cvDocument && (
          <DocumentDownloadButton
            key={cvDocument.documentUuid}
            documentUuid={cvDocument.documentUuid}
            interviewUuid={interview.uuid}
            variant="outline"
            size="sm"
          >
            <FileText className="size-4" />
            {cvDocument.fileName}
          </DocumentDownloadButton>
        )}
        {cvDocument === undefined && <Small>Kein Lebenslauf gefunden</Small>}
      </section>

      <div className="space-y-4">
        {otherQuestions.map((question) => (
          <section key={question.uuid}>
            <Muted className="italic">{getQuestionText(question)}</Muted>
            <div>
              {renderAnswer(
                answers.find((answer) => answer.questionUuid === question.uuid)
                  ?.answerPayload,
                question.questionType,
                interview.uuid,
              )}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function getQuestionText(question: {
  questionType: string;
  questionPayload: unknown;
}) {
  switch (question.questionType) {
    case QuestionType.video: {
      const parseResult = VideoQuestionPayloadType.safeParse(
        question.questionPayload,
      );
      if (parseResult.success) return parseResult.data.question;
      break;
    }
    case QuestionType.text: {
      const parseResult = TextQuestionPayloadType.safeParse(
        question.questionPayload,
      );
      if (parseResult.success) return parseResult.data.question;
      break;
    }
    case QuestionType.single_choice: {
      const parseResult = SingleChoiceQuestionPayloadType.safeParse(
        question.questionPayload,
      );
      if (parseResult.success) return parseResult.data.question;
      break;
    }
    case QuestionType.multiple_choice: {
      const parseResult = MultipleChoiceQuestionPayloadType.safeParse(
        question.questionPayload,
      );
      if (parseResult.success) return parseResult.data.question;
      break;
    }
    case QuestionType.document: {
      const parseResult = DocumentQuestionPayloadType.safeParse(
        question.questionPayload,
      );
      if (parseResult.success) return parseResult.data.prompt;
      break;
    }
  }

  throw new Error("This is a bug, please report it.");
}

function renderAnswer(
  answerPayload: unknown,
  questionType: string,
  interviewUuid: string,
) {
  switch (questionType) {
    case QuestionType.video: {
      const parseResult = VideoAnswerPayloadType.safeParse(answerPayload);
      if (parseResult.success) return <Bold>{parseResult.data.status}</Bold>;
      break;
    }
    case QuestionType.text: {
      const parseResult = TextAnswerPayloadType.safeParse(answerPayload);
      if (parseResult.success) return <Bold>{parseResult.data.answer}</Bold>;
      break;
    }
    case QuestionType.single_choice: {
      const parseResult =
        SingleChoiceAnswerPayloadType.safeParse(answerPayload);
      if (parseResult.success)
        return <Bold>{parseResult.data.selectedOption}</Bold>;
      break;
    }
    case QuestionType.multiple_choice: {
      const parseResult =
        MultipleChoiceAnswerPayloadType.safeParse(answerPayload);
      if (parseResult.success) {
        return <Bold>{parseResult.data.selectedOptions.join(", ")}</Bold>;
      }
      break;
    }
    case QuestionType.document: {
      const parseResult = DocumentAnswerPayloadType.safeParse(answerPayload);
      if (parseResult.success && parseResult.data.kind === "no_documents") {
        return <Bold>Keine Dokumente angegeben</Bold>;
      }
      if (parseResult.success && parseResult.data.kind === "documents") {
        return (
          <div>
            {parseResult.data.documents.map((document) => (
              <DocumentDownloadButton
                key={document.documentUuid}
                documentUuid={document.documentUuid}
                interviewUuid={interviewUuid}
                variant="outline"
                size="sm"
              >
                <FileText className="size-4" />
                {document.fileName}
              </DocumentDownloadButton>
            ))}
          </div>
        );
      }
      break;
    }
  }

  return <Bold>Keine Antwort angegeben</Bold>;
}
