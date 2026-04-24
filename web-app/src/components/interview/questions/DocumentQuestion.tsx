import { type QueryKey, useMutation } from "@tanstack/react-query";
import {
  CircleX,
  Eye,
  File as FileSvg,
  LoaderCircle,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import type z from "zod";
import { useShallow } from "zustand/shallow";
import {
  DocumentAnswerPayloadType,
  DocumentQuestionPayloadType,
} from "@/db/payload-types";
import type { InterviewRelatedDataQueryData } from "@/lib/interview-related-data-cache";
import {
  createOptimisticAnswer,
  findAnswerInInterviewRelatedDataCache,
  removeAnswerFromInterviewRelatedDataCache,
  upsertAnswerInInterviewRelatedDataCache,
} from "@/lib/interview-related-data-cache";
import { getQueryClient } from "@/lib/query-client";
import { isPreSignedURLStillValid } from "@/lib/utils";
import { client, orpc } from "@/orpc/client";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import { documentUploadService } from "@/services/DocumentUploadService";
import { useDocumentUploadStore } from "@/stores/documentUploadStore";
import type { QuestionBehavior } from "@/components/interview/questions/QuestionBlock";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

const PDF_MIME_TYPE = "application/pdf";

// NOTE implement option that you can get a mail later to upload your documents, if you currently do not have them

// TODO maybe use shadcn progress bar instead

export const documentQuestionBehavior: QuestionBehavior = {
  getFormDefaultValue: getDocumentQuestionFormDefaultValue,
  isAnswered: ({ question, answer, questionUuidsWithUploadingDocuments }) =>
    isDocumentQuestionAnswered(
      answer,
      questionUuidsWithUploadingDocuments.has(question.uuid),
    ),
  renderQuestionBlockQuestion: ({
    question,
    interviewUuid,
    queryKeyToInvalidateAnswers,
    answer,
  }) => (
    <DocumentQuestion
      key={question.uuid}
      question={question}
      interviewUuid={interviewUuid}
      queryKeyToInvalidateAnswers={queryKeyToInvalidateAnswers}
      answer={answer}
    />
  ),
};

function isDocumentQuestionAnswered(
  answer: z.infer<typeof AnswerSelectSchema> | undefined,
  isUploadingDocumentForQuestion = false,
) {
  if (answer) {
    return true;
  }

  return isUploadingDocumentForQuestion;
}

// Tanstack Form is not used for this component.
function getDocumentQuestionFormDefaultValue() {
  return undefined;
}

export function DocumentQuestion({
  question,
  interviewUuid,
  queryKeyToInvalidateAnswers,
  answer,
}: {
  question: z.infer<typeof QuestionSelectSchema>;
  interviewUuid: string;
  queryKeyToInvalidateAnswers: QueryKey;
  answer: z.infer<typeof AnswerSelectSchema> | undefined;
}) {
  const questionPayloadResult = DocumentQuestionPayloadType.safeParse(
    question.questionPayload,
  );
  if (!questionPayloadResult.success)
    throw new Error(
      `Question payload does not match expected type for document question. This should never happen, please report it. ${questionPayloadResult.error.message}`,
    );
  const questionPayload = questionPayloadResult.data;

  const id = useId();
  const answerPayloadParseResult = DocumentAnswerPayloadType.safeParse(
    answer?.answerPayload,
  );
  const [documents, setDocuments] = useState(
    answerPayloadParseResult.success
      ? answerPayloadParseResult.data.kind === "documents"
        ? answerPayloadParseResult.data.documents
        : []
      : [],
  );
  const [userHasNoAptDocuments, setUserHasNoAptDocuments] = useState(
    answerPayloadParseResult.success
      ? answerPayloadParseResult.data.kind === "no_documents"
      : false,
  );
  // Always update the uploaded documents state, when the corresponding answer changes, as updates will happen outside of this component.
  useEffect(() => {
    if (!answer) {
      setDocuments([]);
      setUserHasNoAptDocuments(false);
      return;
    }

    const answerPayloadParseResult = DocumentAnswerPayloadType.safeParse(
      answer?.answerPayload,
    );
    if (!answerPayloadParseResult.success) {
      toast.error(
        "Es gab einen Fehler beim Laden der Dokumente. Bitte laden sie diese Seite neu.",
      );
      return;
    }

    setDocuments(
      answerPayloadParseResult.data.kind === "documents"
        ? answerPayloadParseResult.data.documents
        : [],
    );
    setUserHasNoAptDocuments(
      answerPayloadParseResult.data.kind === "no_documents",
    );
  }, [answer]);

  const documentsToUpload = useDocumentUploadStore(
    useShallow((state) =>
      state.getDocumentsToUploadForQuestionUuid(question.uuid),
    ),
  );
  const {
    mutate: saveDocumentAnswerMutate,
    isPending: saveDocumentAnswerIsPending,
  } = useMutation({
    ...orpc.saveAnswer.mutationOptions(),
    onMutate: async (variables, context) => {
      await context.client.cancelQueries({
        queryKey: queryKeyToInvalidateAnswers,
      });

      const previousData =
        context.client.getQueryData<InterviewRelatedDataQueryData>(
          queryKeyToInvalidateAnswers,
        );

      context.client.setQueryData<InterviewRelatedDataQueryData>(
        queryKeyToInvalidateAnswers,
        (oldData) =>
          upsertAnswerInInterviewRelatedDataCache(
            oldData,
            createOptimisticAnswer({
              interviewUuid: variables.interviewUuid,
              questionUuid: variables.questionUuid,
              answerPayload: variables.answerPayload as z.infer<
                typeof DocumentAnswerPayloadType
              >,
              previousAnswer:
                findAnswerInInterviewRelatedDataCache(
                  oldData,
                  variables.questionUuid,
                ) ?? answer,
            }),
          ),
      );

      return {
        previousData,
      };
    },
    onError: (_error, _variables, onMutateResult, context) => {
      context.client.setQueryData(
        queryKeyToInvalidateAnswers,
        onMutateResult?.previousData,
      );
    },
    onSettled: (_data, _error, _variables, _onMutateResult, context) =>
      context.client.invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      }),
    retry: 1,
  });
  const {
    mutate: deleteDocumentAnswerMutate,
    isPending: deleteDocumentAnswerIsPending,
  } = useMutation({
    ...orpc.deleteAnswer.mutationOptions(),
    onMutate: async (variables, context) => {
      await context.client.cancelQueries({
        queryKey: queryKeyToInvalidateAnswers,
      });

      const previousData =
        context.client.getQueryData<InterviewRelatedDataQueryData>(
          queryKeyToInvalidateAnswers,
        );

      context.client.setQueryData<InterviewRelatedDataQueryData>(
        queryKeyToInvalidateAnswers,
        (oldData) =>
          removeAnswerFromInterviewRelatedDataCache(
            oldData,
            variables.questionUuid,
          ),
      );

      return {
        previousData,
      };
    },
    onError: (_error, _variables, onMutateResult, context) => {
      context.client.setQueryData(
        queryKeyToInvalidateAnswers,
        onMutateResult?.previousData,
      );
    },
    onSettled: (_data, _error, _variables, _onMutateResult, context) =>
      context.client.invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      }),
    retry: 1,
  });
  const noDocumentsAnswerIsPending =
    saveDocumentAnswerIsPending || deleteDocumentAnswerIsPending;

  // This component owns question-specific file selection policy such as
  // single-vs-multi upload behavior, duplicate filtering, max-upload trimming,
  // and replacement of already uploaded documents. The upload service owns the
  // actual upload pipeline, store writes, cancellation, and cache updates.
  async function appendFiles(nextFiles: File[], isSingleFileUpload: boolean) {
    const pdfFiles = nextFiles.filter((file) => file.type === PDF_MIME_TYPE);
    if (pdfFiles.length !== nextFiles.length) {
      toast.info("Es können hier nur PDF-Dateien hochgeladen werden.");
    }

    if (pdfFiles.length === 0) {
      return;
    }

    // Immediately set that the user has documents to upload, when they try to upload documents.
    if (userHasNoAptDocuments) {
      setUserHasNoAptDocuments(false);
    }

    // Sort files by name to make the behavior deterministic, when we have to cut out files, because there are too many
    let filesToAddToUpload = pdfFiles.sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    if (isSingleFileUpload) {
      // If the user tries to upload multiple files, toast him that only one file is allowed and do not upload any file, since it is not clear which file should be uploaded.
      if (filesToAddToUpload.length > 1) {
        toast.info(
          "Es kann für diese Frage nur genau eine Datei hochgeladen werden.",
        );
        return;
      }

      // If a file is already uploading, then cancel the upload.
      const currentUploadingDocument = documentsToUpload.at(0);
      if (currentUploadingDocument) {
        documentUploadService.cancelUpload(currentUploadingDocument.localUuid);
      }

      filesToAddToUpload = pdfFiles.slice(0, 1);

      // For single file upload, if there is already a document that was uploaded, we want to replace it.
      const uploadedDocumentToReplace = documents.at(0);
      if (uploadedDocumentToReplace) {
        setDocuments([]);
        // Deletion of the old document from object storage and answer payload will also be handled in the orpc handler for the new upload.
        // But if the new upload is aborted, we would get into a state, where the old document was never deleted, but is not shown in the ui.
        void (async () => {
          await client.deleteDocumentFromObjectStorageAndFromAnswer({
            interviewUuid,
            questionUuid: question.uuid,
            documentUuid: uploadedDocumentToReplace.documentUuid,
          });
          await getQueryClient().invalidateQueries({
            queryKey: queryKeyToInvalidateAnswers,
          });
        })();
      }
    } else {
      // For multiple file upload, if there is already a document with the same name, we want to keep it.
      filesToAddToUpload = pdfFiles.filter((file) => {
        if (
          documents.some((document) => document.fileName === file.name) ||
          documentsToUpload.some((doc) => doc.file.name === file.name)
        ) {
          return false;
        }
        return true;
      });
      // If there are still too many files, cut them out
      if (
        filesToAddToUpload.length >
        questionPayload.maxUploads - documents.length
      ) {
        filesToAddToUpload = filesToAddToUpload.slice(
          0,
          questionPayload.maxUploads - documents.length,
        );
        toast.info(
          `Es können maximal ${questionPayload.maxUploads} Dateien für diese Frage hochgeladen werden.`,
        );
      }
    }

    for (const fileToAddToUpload of filesToAddToUpload) {
      void documentUploadService.addToUploadPipeline({
        file: fileToAddToUpload,
        interviewUuid,
        questionUuid: question.uuid,
        queryKeyToInvalidateAnswers,
        isSingleFileUpload,
      });
    }
  }

  const zeroUploadsAreAllowed = questionPayload.minUploads === 0;
  const questionHasNoDocuments =
    documents.length === 0 && documentsToUpload.length === 0;
  const showNoDocumentsCheckbox =
    zeroUploadsAreAllowed && (userHasNoAptDocuments || questionHasNoDocuments);

  return (
    <div className="flex flex-col gap-2 p-2">
      <Label htmlFor={id}>{questionPayload.prompt}</Label>
      {/* Maybe add next to the question promt the maximum amount of possible uploads. */}
      <div>
        <FileDragAndDrop
          id={id}
          isSingleFileUpload={questionPayload.maxUploads === 1}
          appendFiles={appendFiles}
        />
        {showNoDocumentsCheckbox && (
          <Label
            htmlFor={`${id}-no-documents`}
            className={`flex w-full items-center justify-end gap-2 px-2 py-2 text-xs text-muted-foreground transition-opacity ${
              noDocumentsAnswerIsPending
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer"
            }`}
            aria-disabled={noDocumentsAnswerIsPending}
          >
            <span>Ich habe keine passenden Dokumente</span>
            <Checkbox
              id={`${id}-no-documents`}
              checked={userHasNoAptDocuments}
              disabled={noDocumentsAnswerIsPending}
              onCheckedChange={(checked) => {
                const nextDocumentsWereNotProvided = checked === true;
                setUserHasNoAptDocuments(nextDocumentsWereNotProvided);
                if (nextDocumentsWereNotProvided) {
                  saveDocumentAnswerMutate({
                    interviewUuid,
                    questionUuid: question.uuid,
                    answerPayload: {
                      kind: "no_documents",
                    },
                  });
                  return;
                }

                deleteDocumentAnswerMutate({
                  interviewUuid,
                  questionUuid: question.uuid,
                });
              }}
            />
          </Label>
        )}
        {documents.map((document) => {
          return (
            <File
              key={document.documentUuid}
              fileName={document.fileName}
              uploadedDocument={{
                documentUuid: document.documentUuid,
                interviewUuid,
                questionUuid: question.uuid,
              }}
              queryKeyToInvalidateAnswers={queryKeyToInvalidateAnswers}
            />
          );
        })}
        {documentsToUpload.map((doc) => {
          return (
            <File
              key={doc.localUuid}
              fileName={doc.file.name}
              uploadingDocument={{
                localUuid: doc.localUuid,
                progress: doc.progress,
              }}
              queryKeyToInvalidateAnswers={queryKeyToInvalidateAnswers}
            />
          );
        })}
      </div>
    </div>
  );
}

function FileDragAndDrop({
  id,
  isSingleFileUpload,
  appendFiles,
}: {
  id: string;
  isSingleFileUpload: boolean;
  appendFiles: (files: File[], isSingleFileUpload: boolean) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div>
      <Button
        // NOTE evaluate optional paste support for files, currently not well supported across browsers
        type="button"
        variant="outline"
        className={`flex h-20 w-full flex-row items-center justify-center rounded-xl border border-dashed border-gray-200 py-5 shadow transition ${
          isDragging ? "-translate-y-0.5 border-solid shadow-xl" : ""
        }`}
        // onClick trigger the hidden file input
        onClick={() => {
          if (fileInputRef.current) {
            fileInputRef.current.click();
          }
        }}
        // drag and drop handlers
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          try {
            const nextFiles = await getFilesFromDataTransferItems(
              e.dataTransfer.items,
            );
            appendFiles(nextFiles, isSingleFileUpload);
          } finally {
            setIsDragging(false);
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          // currentTarget is the div, where onDragLeave was triggered (so this button), relatedTarget is the element that the mouse is leaving to
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
          }
        }}
      >
        <Upload className="text-muted-foreground" />
        <p className="text-muted-foreground">
          Ziehe deine Dateien hierher oder wähle sie aus
        </p>
      </Button>
      {/* Allowing directories on click, is not really supported :/ */}
      <input
        type="file"
        id={id}
        accept=".pdf"
        className="hidden"
        ref={fileInputRef}
        onChange={(e) => {
          const files = e.target.files;
          if (files) {
            appendFiles(Array.from(files), isSingleFileUpload);
          }
          e.target.value = ""; // reset file input, so that the same file can be uploaded again
        }}
        multiple
      />
    </div>
  );
}

// Either define uploadedDocument or define uploadingDocument
function File({
  uploadedDocument,
  fileName,
  uploadingDocument,
  queryKeyToInvalidateAnswers,
}: {
  fileName: string;
  uploadedDocument?: {
    documentUuid: string;
    interviewUuid: string;
    questionUuid: string;
  };
  uploadingDocument?: {
    localUuid: string;
    progress: number;
  };
  queryKeyToInvalidateAnswers: QueryKey;
}) {
  const [viewIsClicked, setViewIsClicked] = useState(false);
  const preSignedUrlRef = useRef<Promise<string> | null>(null);
  const { mutateAsync: viewMutateAsync, isPending: viewIsPending } =
    useMutation({
      ...orpc.createPresignedS3DocumentDownloadUrlByUuid.mutationOptions(),
      onMutate(_variables, _context) {
        let resolve!: (value: string) => void;
        preSignedUrlRef.current = new Promise<string>((res) => {
          resolve = res;
        });
        return { resolve };
      },
      onSuccess: (data, _variables, onMutateResult, _context) => {
        onMutateResult.resolve(data.downloadUrl);
      },
      onError: (error, _variables, _onMutateResult, _context) => {
        preSignedUrlRef.current = null;
        toast.error(
          "Das Dokument konnte nicht geöffnet werden. Bitte versuchen Sie es erneut.",
        );
        console.error("Error fetching presigned url for document", error);
      },
    });
  // This function may throw since mutateAsync may throw.
  const fetchNewPresignedUrlIfNeeded = async () => {
    if (!uploadedDocument)
      throw new Error(
        "Document UUID should always be defined if this function is called.",
      );

    // For the first time get a new presigned url
    const currentPreSignedUrlPromise = preSignedUrlRef.current;
    if (currentPreSignedUrlPromise == null) {
      await viewMutateAsync({
        documentUuid: uploadedDocument.documentUuid,
        interviewUuid: uploadedDocument.interviewUuid,
      });
      return preSignedUrlRef.current;
    }

    // If we got here after the first time await the promise to the presigned url
    const currentPreSignedUrl = await currentPreSignedUrlPromise;
    if (!isPreSignedURLStillValid(currentPreSignedUrl)) {
      await viewMutateAsync({
        documentUuid: uploadedDocument.documentUuid,
        interviewUuid: uploadedDocument.interviewUuid,
      });
      return preSignedUrlRef.current;
    }

    // otherwise the url is still valid
    return currentPreSignedUrlPromise;
  };

  const { mutate: deletionMutate, isPending: deletionIsPending } = useMutation({
    ...orpc.deleteDocumentFromObjectStorageAndFromAnswer.mutationOptions(),
    // Deleting a document should update the cache immediately so the list and next-button state react
    // before the invalidation roundtrip finishes.
    onMutate: async (_variables, context) => {
      if (!uploadedDocument) {
        throw new Error(
          "Uploaded document metadata should always be defined for document deletion.",
        );
      }

      await context.client.cancelQueries({
        queryKey: queryKeyToInvalidateAnswers,
      });

      const previousData =
        context.client.getQueryData<InterviewRelatedDataQueryData>(
          queryKeyToInvalidateAnswers,
        );

      context.client.setQueryData<InterviewRelatedDataQueryData>(
        queryKeyToInvalidateAnswers,
        (oldData) => {
          if (!oldData) {
            return oldData;
          }

          return {
            ...oldData,
            answers: oldData.answers.flatMap((currentAnswer) => {
              if (
                currentAnswer.questionUuid !== uploadedDocument.questionUuid
              ) {
                return [currentAnswer];
              }

              const answerPayloadParseResult =
                DocumentAnswerPayloadType.safeParse(
                  currentAnswer.answerPayload,
                );
              if (!answerPayloadParseResult.success) {
                throw new Error(
                  "Document answer payload should always be valid while deleting a document.",
                );
              }

              if (answerPayloadParseResult.data.kind !== "documents") {
                throw new Error(
                  "Document deletion should only happen for answers with uploaded documents.",
                );
              }

              const remainingDocuments =
                answerPayloadParseResult.data.documents.filter(
                  (document) =>
                    document.documentUuid !== uploadedDocument.documentUuid,
                );

              if (remainingDocuments.length === 0) {
                return [];
              }

              return [
                {
                  ...currentAnswer,
                  answerPayload: {
                    kind: "documents" as const,
                    documents: remainingDocuments,
                  },
                },
              ];
            }),
          };
        },
      );

      return {
        previousData,
      };
    },
    onError(error, _variables, onMutateResult, context) {
      context.client.setQueryData(
        queryKeyToInvalidateAnswers,
        onMutateResult?.previousData,
      );
      toast.error(
        "Das Dokument konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.",
      );
      console.error("Error deleting document", error);
    },
    onSettled: (_data, _error, _variables, _onMutateResult, context) =>
      context.client.invalidateQueries({
        queryKey: queryKeyToInvalidateAnswers,
      }),
  });

  return (
    <div
      className={`h-8 text-sm font-medium ${deletionIsPending ? "pointer-events-none opacity-30" : ""}`}
    >
      {uploadedDocument && (
        <div className="flex w-full flex-row items-center justify-between">
          <div>
            <span className="align-text-bottom" aria-hidden="true">
              <FileSvg className="inline h-4 w-4" />
            </span>
            <span className="align-text-top"> {fileName}</span>
          </div>
          <div>
            <Button
              type="button"
              variant="ghost"
              aria-label="Dokument ansehen"
              onMouseEnter={fetchNewPresignedUrlIfNeeded}
              onClick={async () => {
                setViewIsClicked(true);
                try {
                  const preSignedUrlPromise =
                    await fetchNewPresignedUrlIfNeeded();
                  if (preSignedUrlPromise)
                    window.open(await preSignedUrlPromise, "_blank");
                } catch {}
                setViewIsClicked(false);
              }}
              disabled={viewIsClicked}
            >
              {/* Read it inverted :) */}
              {/* {!viewIsClicked || !viewIsPending ? "View" : "Loading..."} */}
              {!viewIsClicked || !viewIsPending ? (
                <Eye />
              ) : (
                <LoaderCircle className="animate-spin" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-label="Dokument löschen"
              onClick={() =>
                deletionMutate({
                  documentUuid: uploadedDocument.documentUuid,
                  interviewUuid: uploadedDocument.interviewUuid,
                  questionUuid: uploadedDocument.questionUuid,
                })
              }
              disabled={deletionIsPending}
            >
              {/* Delete */}
              <Trash2 />
            </Button>
          </div>
        </div>
      )}
      {uploadingDocument && (
        <div className="relative w-full">
          <div className="flex w-full flex-row items-center justify-between">
            <div>
              <span className="align-text-bottom" aria-hidden="true">
                <FileSvg className="inline h-4 w-4" />
              </span>
              <span className="align-text-top"> {fileName}</span>
            </div>
            <div>
              {/* While this button could be implemented, the file would have to be accessed from indexedDB which would mean work. */}
              {/* <Button variant="ghost">
              <Eye />
            </Button> */}
              <Button
                // The type="button" is needed, otherwise this button would submit the form (type="submit"), which would trigger unwanted side effects.
                type="button"
                variant="ghost"
                onClick={() =>
                  documentUploadService.cancelUpload(
                    uploadingDocument.localUuid,
                  )
                }
              >
                {/* Cancel */}
                <CircleX />
              </Button>
            </div>
          </div>
          <div className="absolute bottom-0 h-1 w-full rounded-full bg-primary-foreground">
            <div
              className="h-1 rounded-full bg-primary"
              style={{ width: `${uploadingDocument.progress}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
}

async function getFilesFromDataTransferItems(
  items: DataTransferItemList,
): Promise<File[]> {
  // Make a snapshot of the entries, because awaiting too much will result in the items being cleared.
  const entries: FileSystemEntry[] = [];
  for (const item of items) {
    // If the item is a string (dragged text or HTML), skip it
    if (item.kind !== "file") {
      continue;
    }
    const entry = item.webkitGetAsEntry();
    if (entry) {
      entries.push(entry);
    }
  }

  const collectedFiles: File[] = [];
  for (const entry of entries) {
    const nestedFiles = await getFilesFromDroppedEntry(entry);
    collectedFiles.push(...nestedFiles);
  }

  return collectedFiles;
}

async function getFilesFromDroppedEntry(
  entry: FileSystemEntry,
): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve) =>
      (entry as FileSystemFileEntry).file(resolve),
    );

    return [file];
  }

  return getFilesFromDirectoryEntry(entry as FileSystemDirectoryEntry);
}

async function getFilesFromDirectoryEntry(
  entry: FileSystemDirectoryEntry,
): Promise<File[]> {
  const reader = entry.createReader();
  const collectedFiles: File[] = [];

  while (true) {
    const entries = await new Promise<FileSystemEntry[]>((resolve) =>
      reader.readEntries(resolve),
    );

    if (entries.length === 0) {
      break;
    }

    for (const nestedEntry of entries) {
      // no nested directories will be searched
      if (!nestedEntry.isFile) {
        continue;
      }

      const file = await new Promise<File>((resolve) =>
        (nestedEntry as FileSystemFileEntry).file(resolve),
      );
      collectedFiles.push(file);
    }
  }

  return collectedFiles;
}
