import { type QueryKey, useMutation } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import type z from "zod";
import { useShallow } from "zustand/shallow";
import {
  DocumentAnswerPayloadType,
  DocumentQuestionPayloadType,
} from "@/db/payload-types";
import { getQueryClient } from "@/lib/query-client";
import { client, orpc } from "@/orpc/client";
import type {
  AnswerSelectSchema,
  QuestionSelectSchema,
} from "@/orpc/schema";
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
  const documents = answerPayloadParseResult.success
    ? answerPayloadParseResult.data.documents
    : [];

  const documentsToUpload = useDocumentUploadStore(
    useShallow((state) =>
      state.getDocumentsToUploadForQuestionUuid(question.uuid),
    ),
  );
  const [mutationError, setMutationError] = useState<string | null>(null);

  async function appendFiles(nextFiles: File[], isSingleFileUpload: boolean) {
    let filesToAddToUpload = nextFiles.sort(
      (a, b) => a.name.localeCompare(b.name), // sort files by name to make the behavior deterministic, when we have to cut out files, because there are too many
    );

    if (isSingleFileUpload) {
      // For single file upload, if there is already a document with the same name, we want to replace it.
      filesToAddToUpload = nextFiles.slice(0, 1);
      console.log("filesToAddToUpload", filesToAddToUpload[0]);
      if (
        documents.some(
          (document) => document.fileName !== filesToAddToUpload[0].name,
        )
      ) {
        const uploadedDocumentToReplace = documents.at(0);
        console.log("uploadedDocumentToReplace", uploadedDocumentToReplace);
        if (uploadedDocumentToReplace) {
          // NOTE Think about what should happen if the deletion fails, because then we will violate the single file upload constraint. Just let it be and show the recruiter the last element of the array? Or make the replace atomic?
          void (async () => {
            const updatedAnswer =
              await client.deleteDocumentFromObjectStorageAndFromAnswer({
                interviewUuid,
                questionUuid: question.uuid,
                documentUuid: uploadedDocumentToReplace.documentUuid,
              });
            getQueryClient().setQueryData<
              Awaited<
                ReturnType<typeof client.getInterviewRelatedDataByInterviewUuid>
              >
            >(queryKeyToInvalidateAnswers, (old) => {
              if (!old) return old;
              return {
                ...old,
                answers: old.answers.map((answer) =>
                  answer.questionUuid === question.uuid
                    ? updatedAnswer
                    : answer,
                ),
              };
            });
            await getQueryClient().invalidateQueries({
              queryKey: queryKeyToInvalidateAnswers,
            });
          })();
        }
      }
      // If a file is already uploading, then remove the upload and start the new one.
      if (documentsToUpload.at(0)) {
        documentsToUpload.at(0)?.abortController.abort();
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
      }
    }

    for (const fileToAddToUpload of filesToAddToUpload) {
      const { fileIndex, abortController } =
        await documentUploadService.addToUploadPipeline({
          file: fileToAddToUpload,
          interviewUuid,
          questionUuid: question.uuid,
          queryKeyToInvalidateAnswers,
        });
      useDocumentUploadStore.getState().addDocumentToUpload({
        questionUuid: question.uuid,
        indexedDBId: fileIndex,
        fileName: fileToAddToUpload.name,
        abortController,
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Label htmlFor={id}>{questionPayload.prompt}</Label>
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
      <p
        className={mutationError ? "text-red-500" : "invisible"}
        // NOTE go over these accessibility attributes, when time is available
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        aria-hidden={!mutationError}
      >
        {mutationError ?? "\u00A0"} {/* non breaking space*/}
      </p>
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
        Awaited<ReturnType<typeof client.getInterviewRelatedDataByInterviewUuid>>
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
      className={`flex ${deletionIsPending ? "pointer-events-none opacity-30" : ""}`}
    >
      <div aria-hidden="true">📄</div>
      <p className="bold">{fileName}</p>
      {uploadedDocument && (
        <div>
          <button
            type="button"
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
            {!viewIsClicked || !viewIsPending ? "View" : "Loading..."}
          </button>
          <button
            type="button"
            onClick={() =>
              deletionMutate({
                documentUuid: uploadedDocument.documentUuid,
                interviewUuid: uploadedDocument.interviewUuid,
                questionUuid: uploadedDocument.questionUuid,
              })
            }
            disabled={deletionIsPending}
          >
            Delete
          </button>
        </div>
      )}
      {uploadingDocument && (
        <>
          <div>
            {/* TODO implement the todo button */}
            <button type="button">View</button>
            <button
              type="button"
              onClick={() => uploadingDocument.abortController.abort()}
            >
              Cancel
            </button>
          </div>
          <div className="mt-2 h-2.5 w-full rounded-full bg-gray-200">
            <div
              className="h-2.5 rounded-full bg-blue-600"
              style={{ width: `${uploadingDocument.progress}%` }}
            ></div>
          </div>
        </>
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
