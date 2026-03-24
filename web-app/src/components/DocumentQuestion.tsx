import { type QueryKey, useMutation } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import type z from "zod";
import {
  DocumentAnswerPayloadType,
  DocumentQuestionPayloadType,
} from "@/db/payload-types";
import { client, orpc } from "@/orpc/client";
import type { AnswerSelectSchema, QuestionSelectSchema } from "@/orpc/schema";
import { documentUploadService } from "@/services/DocumentUploadService";
import { useDocumentUploadStore } from "@/stores/documentUploadStore";

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
  // TODO think about whether i want updates from the query to be reflected in the component state as soon as they arrive
  const [documents, setDocuments] = useState(
    answerPayloadParseResult.success
      ? answerPayloadParseResult.data.documents
      : [],
  );
  const documentsToUpload = useDocumentUploadStore(
    (state) => state.documentsToUpload,
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
        indexedDBId: fileIndex,
        fileName: nextFile.name,
        abortController,
      });
    }
  }

  const removeDocument = () => {};
  const downloadDocument = () => {};

  return (
    <div>
      <label htmlFor={id}>{questionPayload.prompt}</label>
      <FileDragAndDrop
        id={id}
        appendFiles={appendFiles}
        fileCount={documents.length}
      />
      {documents.map((document) => {
        return (
          <File
            key={document.documentUuid}
            fileName={document.fileName}
            downloadDocument={downloadDocument}
            removeDocument={removeDocument}
          />
        );
      })}
      {documentsToUpload.map((doc) => {
        return <UploadingFile key={doc.indexedDBId} fileName={doc.fileName} />;
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
  fileCount,
}: {
  id: string;
  appendFiles: (files: File[]) => void;
  fileCount: number;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const remainingCapacity = getRemainingCapacity(fileCount);

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
      <input
        type="file"
        id={id}
        accept="image/*, .pdf, .doc, .docx, .txt, .rtf, .odt, .md"
        className="hidden"
        ref={fileInputRef}
        onChange={(e) => {
          const files = e.target.files;
          if (files) {
            appendFiles(normalizeFiles(files));
          }
          // The duplication will be checked by appendFiles TODO
          e.target.value = ""; // reset file input, so that the same file can be uploaded again
        }}
        multiple
      />
    </div>
  );
}

function File({
  fileName,
  downloadDocument,
  removeDocument,
}: {
  fileName: string;
  downloadDocument: () => void;
  removeDocument: () => void;
}) {
  return (
    <div>
      <div aria-hidden="true">📄</div>
      <p className="bold">{fileName}</p>
      <div>
        <button type="button" onClick={downloadDocument}>
          Download
        </button>
        <button type="button" onClick={removeDocument}>
          Delete
        </button>
      </div>
    </div>
  );
}

function UploadingFile({ fileName }: { fileName: string }) {
  return (
    <div>
      <div aria-hidden="true">📄</div>
      <p className="bold">{fileName}</p>
      <p>Uploading...</p>
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

  const collectedFiles: File[] = [];

  for (const item of items) {
    if (collectedFiles.length >= remainingCapacity) {
      break;
    }

    // If the item is a string (dragged text or HTML), skip it
    if (item.kind !== "file") {
      continue;
    }

    const entry = item.webkitGetAsEntry();
    if (entry) {
      const nestedFiles = await getFilesFromDroppedEntry(
        entry,
        remainingCapacity - collectedFiles.length,
      );
      collectedFiles.push(...nestedFiles);
    }
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

function normalizeFiles(files: FileList | File[]): File[] {
  return Array.from(files);
}

function getRemainingCapacity(currentFileCount: number): number {
  return Math.max(0, MAX_DOCUMENT_COUNT - currentFileCount);
}
