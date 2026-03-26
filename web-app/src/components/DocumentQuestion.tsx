import { type QueryKey, useMutation } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import type z from "zod";
import { useShallow } from "zustand/shallow";
import {
  DocumentAnswerPayloadType,
  DocumentQuestionPayloadType,
} from "@/db/payload-types";
import { orpc } from "@/orpc/client";
import type {
  AnswerSelectSchema,
  InterviewWithCandidateAndAnswersSchema,
  QuestionSelectSchema,
} from "@/orpc/schema";
import { documentUploadService } from "@/services/DocumentUploadService.client";
import { useDocumentUploadStore } from "@/stores/documentUploadStore";

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

  async function appendFiles(nextFiles: File[]) {
    // TODO change this around, new files should be uploaded again, replacing the old ones, mind the db state here

    for (const nextFile of nextFiles) {
      const { fileIndex, abortController } =
        await documentUploadService.addToUploadPipeline({
          file: nextFile,
          interviewUuid,
          questionUuid: question.uuid,
          queryKeyToInvalidateAnswers,
        });
      useDocumentUploadStore.getState().addDocumentToUpload({
        questionUuid: question.uuid,
        indexedDBId: fileIndex,
        fileName: nextFile.name,
        abortController,
      });
    }
  }

  return (
    <div>
      <label htmlFor={id}>{questionPayload.prompt}</label>
      <FileDragAndDrop
        id={id}
        appendFiles={appendFiles}
        remainingCapacity={questionPayload.maxUploads - documents.length}
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
  appendFiles,
  remainingCapacity,
}: {
  id: string;
  appendFiles: (files: File[]) => void;
  remainingCapacity: number;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div>
      <button
        // TODO think about whether supporting paste events for files and folders also
        type="button"
        className={`flex h-20 flex-row items-center justify-center rounded-xl border border-gray-200 pt-5 pb-5 text-center text-lg shadow transition ${
          isDragging ? "-translate-y-0.5 shadow-xl" : ""
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
              remainingCapacity,
            );
            appendFiles(nextFiles);
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
        {/* <Image src="/upload.svg" alt="Upload" width={80} height={80} /> */}
        <p>Ziehe deine Dateien hierher, klick hier oder füg sie ein</p>
      </button>
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
            appendFiles(Array.from(files));
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
        z.infer<typeof InterviewWithCandidateAndAnswersSchema>
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
  remainingCapacity: number,
): Promise<File[]> {
  if (remainingCapacity <= 0) {
    return [];
  }

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
    if (collectedFiles.length >= remainingCapacity) {
      break;
    }

    const nestedFiles = await getFilesFromDroppedEntry(
      entry,
      remainingCapacity - collectedFiles.length,
    );
    collectedFiles.push(...nestedFiles);
  }

  return collectedFiles;
}

async function getFilesFromDroppedEntry(
  entry: FileSystemEntry,
  remainingCapacity: number,
): Promise<File[]> {
  if (remainingCapacity <= 0) {
    return [];
  }

  if (entry.isFile) {
    const file = await new Promise<File>((resolve) =>
      (entry as FileSystemFileEntry).file(resolve),
    );

    return [file];
  }

  return getFilesFromDirectoryEntry(
    entry as FileSystemDirectoryEntry,
    remainingCapacity,
  );
}

async function getFilesFromDirectoryEntry(
  entry: FileSystemDirectoryEntry,
  remainingCapacity: number,
): Promise<File[]> {
  if (remainingCapacity <= 0) {
    return [];
  }

  const reader = entry.createReader();
  const collectedFiles: File[] = [];

  while (collectedFiles.length < remainingCapacity) {
    const entries = await new Promise<FileSystemEntry[]>((resolve) =>
      reader.readEntries(resolve),
    );

    if (entries.length === 0) {
      break;
    }

    for (const nestedEntry of entries) {
      if (collectedFiles.length >= remainingCapacity) {
        break;
      }

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
