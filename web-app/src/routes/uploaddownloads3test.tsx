// THIS FILE IS AI SLOP

import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { orpc } from "@/orpc/client";

export const Route = createFileRoute("/uploaddownloads3test")({
  component: RouteComponent,
});

const TEST_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-labelledby="title desc">
  <title id="title">S3 upload test preview</title>
  <desc id="desc">A generated SVG uploaded to SeaweedFS and downloaded directly in the browser.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
  </defs>
  <rect width="640" height="360" rx="28" fill="url(#bg)" />
  <circle cx="524" cy="104" r="72" fill="#f59e0b" fill-opacity="0.88" />
  <circle cx="140" cy="286" r="120" fill="#22c55e" fill-opacity="0.18" />
  <text x="56" y="118" fill="#e2e8f0" font-family="Georgia, serif" font-size="22" letter-spacing="6">DIRECT S3 FETCH</text>
  <text x="56" y="178" fill="#ffffff" font-family="Georgia, serif" font-size="54" font-weight="700">Upload. Download. Preview.</text>
  <text x="56" y="224" fill="#cbd5e1" font-family="ui-monospace, monospace" font-size="20">Fetched from object URL in the browser</text>
  <rect x="56" y="258" width="196" height="42" rx="21" fill="#ffffff" fill-opacity="0.14" stroke="#ffffff" stroke-opacity="0.3" />
  <text x="82" y="285" fill="#f8fafc" font-family="ui-monospace, monospace" font-size="18">image/svg+xml</text>
</svg>
`.trim();

const TEST_OBJECT_BYTES = new TextEncoder().encode(TEST_SVG);

function RouteComponent() {
  const [isUploading, setIsUploading] = useState(false);
  const [isShowing, setIsShowing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{
    bucketName: string;
    contentType: string;
    objectKey: string;
    objectUrl: string;
    uploadUrl: string;
  } | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadedObject, setDownloadedObject] = useState<{
    blobUrl: string;
    byteLength: number;
    contentType: string;
    text: string;
  } | null>(null);

  const createUploadUrlMutation = useMutation({
    ...orpc.createPresignedS3TestUploadUrl.mutationOptions(),
    retry: 1,
  });
  const createDownloadUrlMutation = useMutation({
    ...orpc.createPresignedS3TestDownloadUrl.mutationOptions(),
    retry: 1,
  });

  const isWorking =
    isUploading ||
    isShowing ||
    createUploadUrlMutation.isPending ||
    createDownloadUrlMutation.isPending;

  useEffect(() => {
    return () => {
      if (downloadedObject) {
        URL.revokeObjectURL(downloadedObject.blobUrl);
      }
    };
  }, [downloadedObject]);

  function clearDownloadedObject() {
    setDownloadedObject((currentDownloadedObject) => {
      if (currentDownloadedObject) {
        URL.revokeObjectURL(currentDownloadedObject.blobUrl);
      }

      return null;
    });
  }

  async function handleUpload() {
    setIsUploading(true);
    setStatusMessage("Requesting presigned URL...");
    setUploadResult(null);
    setDownloadUrl(null);
    clearDownloadedObject();

    try {
      const presignedUpload = await createUploadUrlMutation.mutateAsync({});

      setStatusMessage("Uploading hardcoded SVG to S3...");

      const uploadResponse = await fetch(presignedUpload.uploadUrl, {
        body: TEST_OBJECT_BYTES,
        headers: {
          "content-type": presignedUpload.contentType,
        },
        method: "PUT",
      });

      if (!uploadResponse.ok) {
        const errorBody = await uploadResponse.text();
        throw new Error(
          `Upload failed with ${uploadResponse.status} ${uploadResponse.statusText}: ${errorBody}`,
        );
      }

      setUploadResult(presignedUpload);
      setStatusMessage("Upload completed.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Upload failed.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleShow() {
    if (!uploadResult) {
      return;
    }

    setIsShowing(true);
    setStatusMessage(
      "Downloading object from S3 with a server-generated GET URL...",
    );

    try {
      const presignedDownload = await createDownloadUrlMutation.mutateAsync({
        objectKey: uploadResult.objectKey,
      });

      setDownloadUrl(presignedDownload.downloadUrl);

      const response = await fetch(presignedDownload.downloadUrl, {
        method: "GET",
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Download failed with ${response.status} ${response.statusText}: ${errorBody}`,
        );
      }

      const downloadedBlob = await response.blob();
      const downloadedText = await downloadedBlob.text();
      const contentType =
        response.headers.get("content-type") ||
        downloadedBlob.type ||
        uploadResult.contentType;

      clearDownloadedObject();
      setDownloadedObject({
        blobUrl: URL.createObjectURL(downloadedBlob),
        byteLength: downloadedBlob.size,
        contentType,
        text: downloadedText,
      });
      setStatusMessage(
        "Object downloaded from S3 with the presigned GET URL and rendered below.",
      );
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Download failed.",
      );
    } finally {
      setIsShowing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)] px-6 py-10 text-slate-950">
      <section className="mx-auto flex max-w-3xl flex-col gap-6 rounded-3xl border border-slate-200 bg-white/90 p-8 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-[0.32em] text-slate-500 uppercase">
            S3 Upload Test
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Upload and show a hardcoded SVG
          </h1>
          <p className="max-w-2xl text-sm text-slate-600">
            This route asks the server for a presigned PUT URL and uploads a
            fixed SVG asset to your local SeaweedFS S3 bucket. After that, the
            browser fetches the uploaded object from S3 through a presigned GET
            URL generated by the server and renders the returned bytes. The
            object key is generated only on the server as a UUIDv7 under
            <span className="font-mono"> videos/uploads/</span>.
          </p>
        </div>

        <div className="grid gap-4 rounded-2xl bg-slate-950 p-5 text-sm text-slate-100 sm:grid-cols-2">
          <div>
            <div className="text-slate-400">Bucket</div>
            <div className="mt-1 font-mono">hr-app-data</div>
          </div>
          <div>
            <div className="text-slate-400">Endpoint</div>
            <div className="mt-1 font-mono">http://localhost:8333</div>
          </div>
          <div>
            <div className="text-slate-400">Content-Type</div>
            <div className="mt-1 font-mono">image/svg+xml</div>
          </div>
          <div>
            <div className="text-slate-400">Payload bytes</div>
            <div className="mt-1 font-mono">{TEST_OBJECT_BYTES.byteLength}</div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium text-slate-700">
            Hex preview: {toHex(TEST_OBJECT_BYTES)}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="inline-flex w-fit items-center rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={isWorking}
              onClick={handleUpload}
              type="button"
            >
              {isUploading || createUploadUrlMutation.isPending
                ? "Uploading..."
                : "Upload hardcoded SVG"}
            </button>
            <button
              className="inline-flex w-fit items-center rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-900 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              disabled={!uploadResult || isWorking}
              onClick={handleShow}
              type="button"
            >
              {isShowing ? "Downloading..." : "Show downloaded object"}
            </button>
          </div>
          <p className="text-sm text-slate-600">
            {statusMessage ?? "No upload started yet."}
          </p>
        </div>

        {uploadResult ? (
          <dl className="grid gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-slate-800">
            <div>
              <dt className="font-medium text-slate-500">Object key</dt>
              <dd className="font-mono break-all">{uploadResult.objectKey}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">Object URL</dt>
              <dd className="font-mono break-all">{uploadResult.objectUrl}</dd>
            </div>
            {downloadUrl ? (
              <div>
                <dt className="font-medium text-slate-500">
                  Presigned GET URL
                </dt>
                <dd className="font-mono break-all">{downloadUrl}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {downloadedObject ? (
          <section className="grid gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Browser preview
                </h2>
                <p className="text-slate-600">
                  Downloaded from a server-generated presigned GET URL and
                  rendered from a blob URL.
                </p>
              </div>
              <a
                className="inline-flex w-fit items-center rounded-full border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-blue-400 hover:bg-blue-100"
                download={
                  uploadResult?.objectKey.split("/").at(-1) ??
                  "downloaded-object.svg"
                }
                href={downloadedObject.blobUrl}
              >
                Download file
              </a>
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="font-medium text-slate-500">
                  Downloaded content type
                </dt>
                <dd className="font-mono break-all">
                  {downloadedObject.contentType}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Downloaded bytes</dt>
                <dd className="font-mono">{downloadedObject.byteLength}</dd>
              </div>
            </dl>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-inner">
              <img
                alt="Preview of the SVG downloaded from S3"
                className="h-auto w-full rounded-xl"
                src={downloadedObject.blobUrl}
              />
            </div>

            <div className="grid gap-2 rounded-2xl bg-slate-950 p-4 text-slate-100">
              <div className="text-xs font-semibold tracking-[0.24em] text-slate-400 uppercase">
                Downloaded markup
              </div>
              <pre className="overflow-x-auto text-xs leading-6 wrap-break-word whitespace-pre-wrap">
                {downloadedObject.text}
              </pre>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function toHex(byteArray: Uint8Array) {
  return Array.from(byteArray)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join(" ");
}
