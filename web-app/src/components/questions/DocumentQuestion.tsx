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
import { type client, orpc } from "@/orpc/client";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import { documentUploadService } from "@/services/DocumentUploadService.client";
import { useDocumentUploadStore } from "@/stores/documentUploadStore";
import { Button } from "../ui/button";
import { Label } from "../ui/label";

// NOTE implement option that you can get a mail later to upload your documents, if you currently do not have them

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
      ? answerPayloadParseResult.data.documents
      : [],
  );
  // Always update the uploaded documents state, when the corresponding answer changes, as updates will happen outside of this component.
  useEffect(() => {
    const answerPayloadParseResult = DocumentAnswerPayloadType.safeParse(
      answer?.answerPayload,
    );
    if (!answerPayloadParseResult.success) {
      toast.error(
        "Es gab einen Fehler beim Laden der Dokumente. Bitte laden sie diese Seite neu.",
      );
      return;
    }

    setDocuments(answerPayloadParseResult.data.documents);
  }, [answer]);

  const documentsToUpload = useDocumentUploadStore(
    useShallow((state) =>
      state.getDocumentsToUploadForQuestionUuid(question.uuid),
    ),
  );

  async function appendFiles(nextFiles: File[], isSingleFileUpload: boolean) {
    // Sort files by name to make the behavior deterministic, when we have to cut out files, because there are too many
    let filesToAddToUpload = nextFiles.sort((a, b) =>
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
      if (documentsToUpload.at(0)) {
        documentsToUpload.at(0)?.abortController.abort();
      }

      filesToAddToUpload = nextFiles.slice(0, 1);
      console.log("filesToAddToUpload", filesToAddToUpload[0]);

      // For single file upload, if there is already a document that was uploaded, we want to replace it.
      const uploadedDocumentToReplace = documents.at(0);
      if (uploadedDocumentToReplace) {
        setDocuments([]); // Deletion of the old document from object storage and answer payload will be handled in the orpc handler of the new upload.
      }
    } else {
      // For multiple file upload, if there is already a document with the same name, we want to keep it.
      filesToAddToUpload = nextFiles.filter((file) => {
        if (
          documents.some((document) => document.fileName === file.name) ||
          documentsToUpload.some((doc) => doc.fileName === file.name)
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
              key={doc.indexedDBId}
              fileName={doc.fileName}
              uploadingDocument={{
                progress: doc.progress,
                abortController: doc.abortController,
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
        // TODO think about whether supporting paste events for files and folders also
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
          Ziehe deine Dateien hierher, klick hier oder füg sie ein
        </p>
      </Button>
      {/* Allow directories on click also */}
      <input
        type="file"
        id={id}
        accept="image/*, .pdf, .doc, .docx, .txt, .rtf, .odt, .md"
        className="hidden"
        ref={fileInputRef}
        onChange={(e) => {
          const files = e.target.files;

          if (files) {
            appendFiles(Array.from(files), isSingleFileUpload);
          }
          // The duplication will be checked by appendFiles TODO
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
    progress: number;
    abortController: AbortController;
  };
  queryKeyToInvalidateAnswers: QueryKey;
}) {
  const [viewIsClicked, setViewIsClicked] = useState(false);
  const preSignedUrlRef = useRef<Promise<{
    url: string;
    timestamp: number;
  }> | null>(null);
  const { mutateAsync: viewMutateAsync, isPending: viewIsPending } =
    useMutation({
      ...orpc.createPresignedS3DocumentDownloadUrlByUuid.mutationOptions(),
      onMutate(_variables, _context) {
        let resolve!: (value: { url: string; timestamp: number }) => void;
        let reject!: (reason?: unknown) => void;
        preSignedUrlRef.current = new Promise<{
          url: string;
          timestamp: number;
        }>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        return { resolve, reject };
      },
      // TODO add error indication to try again
      onSuccess: (data, _variables, onMutateResult, _context) => {
        onMutateResult.resolve({
          url: data.downloadUrl,
          timestamp: Date.now(),
        });
      },
    });
  const fetchNewPresignedUrlIfNeeded = async () => {
    if (!uploadedDocument)
      throw new Error(
        "Document UUID should always be defined if this function is called.",
      );

    // For the first time get a new presigned url
    const currentPreSignedUrlPromise = preSignedUrlRef.current;
    if (currentPreSignedUrlPromise == null) {
      await viewMutateAsync({ documentUuid: uploadedDocument.documentUuid });
      return;
    }

    // If we got here after the first time await the promise to the presigned url
    const currentPreSignedUrl = await currentPreSignedUrlPromise;
    const fourMinutesInMs = 4 * 60 * 1000;
    // if the url is older than 4 minutes, get a new one
    if (Date.now() - currentPreSignedUrl.timestamp > fourMinutesInMs) {
      await viewMutateAsync({ documentUuid: uploadedDocument.documentUuid });
      return;
    }

    // otherwise the url is still valid for longer than a minute
  };

  const { mutate: deletionMutate, isPending: deletionIsPending } = useMutation({
    ...orpc.deleteDocumentFromObjectStorageAndFromAnswer.mutationOptions(),
    // TODO add error indication to try again

    // onSuccess update the query cache to remove the deleted document. Without this, the refetching by onSettled would be invalidated by later deletions.
    // This would lead to documents coming back with full opacity, confusing the user, because the mutation is not pending anymore, but the data was also not yet updated.
    onSuccess(data, _variables, _onMutateResult, context) {
      context.client.setQueryData<
        Awaited<
          ReturnType<typeof client.getInterviewRelatedDataByInterviewUuid>
        >
      >(queryKeyToInvalidateAnswers, (old) => {
        if (!old) return old;
        return {
          ...old,
          answers: old.answers.map((answer) =>
            answer.questionUuid === data.questionUuid ? data : answer,
          ),
        };
      });
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
              onMouseEnter={fetchNewPresignedUrlIfNeeded}
              onClick={async () => {
                setViewIsClicked(true);
                await fetchNewPresignedUrlIfNeeded();
                if (preSignedUrlRef.current == null)
                  throw new Error(
                    "Pre-signed URL is not available. This should not be possible. Please report this.",
                  );
                setViewIsClicked(false);
                window.open((await preSignedUrlRef.current).url, "_blank");
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
                variant="ghost"
                onClick={() => uploadingDocument.abortController.abort()}
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
