import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  PutObjectCommand,
  paginateListObjectsV2,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v7 as uuidv7 } from "uuid";
import { getRequiredEnvironmentVariable } from "@/lib/utils";

const PDF_MIME_TYPE = "application/pdf";

export function getS3ConfigFromEnvironment() {
  return {
    credentials: {
      accessKeyId: getRequiredEnvironmentVariable("S3_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnvironmentVariable("S3_SECRET_ACCESS_KEY"),
    },
    bucketName: getRequiredEnvironmentVariable("S3_BUCKET_NAME"),
    endpoint: getRequiredEnvironmentVariable("S3_ENDPOINT"),
    region: "us-east-1", // is ignored by S3Client when using a custom endpoint
  } as const;
}

type S3Dependencies = {
  config: ReturnType<typeof getS3ConfigFromEnvironment>;
  client: S3Client;
  getSignedUrl: typeof getSignedUrl;
  paginateListObjectsV2: typeof paginateListObjectsV2;
};

let defaultS3Dependencies: S3Dependencies | null = null;

function getDefaultS3Dependencies() {
  if (defaultS3Dependencies) {
    return defaultS3Dependencies;
  }

  const config = getS3ConfigFromEnvironment();
  defaultS3Dependencies = {
    config,
    client: new S3Client({
      credentials: config.credentials,
      endpoint: config.endpoint,
      forcePathStyle: true,
      region: config.region,
    }),
    getSignedUrl,
    paginateListObjectsV2,
  };

  return defaultS3Dependencies;
}

export async function createPresignedUploadUrlForDocument(
  {
    mimeType,
  }: {
    mimeType: string;
  },
  dependencies = getDefaultS3Dependencies(),
) {
  if (mimeType !== PDF_MIME_TYPE) {
    throw new Error("Only PDF documents are allowed.");
  }

  const uuid = uuidv7();
  const uploadUrl = await createPresignedUploadUrl(
    {
      objectKey: getObjectKeyForDocumentUuid(uuid),
      mimeType,
    },
    dependencies,
  );

  return { uuid, uploadUrl };
}

async function createPresignedUploadUrl(
  {
    objectKey,
    mimeType,
  }: {
    objectKey: string;
    mimeType: string;
  },
  dependencies: S3Dependencies,
) {
  const uploadCommand = new PutObjectCommand({
    Bucket: dependencies.config.bucketName,
    ContentType: mimeType,
    Key: objectKey,
  });

  // Does only local math, does not communicate with the bucket
  return await dependencies.getSignedUrl(dependencies.client, uploadCommand, {
    expiresIn: 300, // URL expires in 5 minutes
  });
}

export async function createPresignedDownloadUrl(
  objectKey: string,
  expiresInSeconds = 900,
  dependencies = getDefaultS3Dependencies(),
) {
  const downloadCommand = new GetObjectCommand({
    Bucket: dependencies.config.bucketName,
    Key: objectKey,
  });

  const downloadUrl = await dependencies.getSignedUrl(
    dependencies.client,
    downloadCommand,
    {
      expiresIn: expiresInSeconds,
    },
  );

  return {
    bucketName: dependencies.config.bucketName,
    downloadUrl,
    objectKey,
    objectUrl: `${dependencies.config.endpoint}/${dependencies.config.bucketName}/${objectKey}`,
  };
}

export async function initiateMultipartUploadForVideo(
  {
    mimeType,
  }: {
    mimeType: string;
  },
  dependencies = getDefaultS3Dependencies(),
) {
  const uuid = uuidv7();
  const command = new CreateMultipartUploadCommand({
    Bucket: dependencies.config.bucketName,
    Key: getObjectKeyForVideoUuid(uuid),
    ContentType: mimeType,
  });
  const response = await dependencies.client.send(command);

  if (!response.UploadId) {
    throw new Error(
      "Failed to initiate multipart upload: No UploadId returned",
    );
  }

  return {
    uuid,
    uploadId: response.UploadId,
  };
}

export async function createPresignedUploadUrlForVideoPart(
  {
    partNumber,
    uploadId,
    videoUuid,
    expiresInSeconds = 900,
  }: {
    partNumber: number;
    uploadId: string;
    videoUuid: string;
    expiresInSeconds?: number;
  },
  dependencies = getDefaultS3Dependencies(),
) {
  const command = new UploadPartCommand({
    Bucket: dependencies.config.bucketName,
    Key: getObjectKeyForVideoUuid(videoUuid),
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  return await dependencies.getSignedUrl(dependencies.client, command, {
    expiresIn: expiresInSeconds,
  });
}

export async function completeMultipartUploadForVideo(
  {
    uploadId,
    videoUuid,
    parts,
  }: {
    uploadId: string;
    videoUuid: string;
    parts: { ETag: string; PartNumber: number }[];
  },
  dependencies = getDefaultS3Dependencies(),
) {
  parts.sort((a, b) => a.PartNumber - b.PartNumber);
  const completeCommand = new CompleteMultipartUploadCommand({
    Bucket: dependencies.config.bucketName,
    Key: getObjectKeyForVideoUuid(videoUuid),
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts,
    },
  });

  await dependencies.client.send(completeCommand);
}

export async function deleteObject(
  objectKey: string,
  dependencies = getDefaultS3Dependencies(),
) {
  const deleteCommand = new DeleteObjectCommand({
    Bucket: dependencies.config.bucketName,
    Key: objectKey,
  });

  await dependencies.client.send(deleteCommand);
}

export async function deleteObjectsForPrefix(
  prefix: string,
  dependencies = getDefaultS3Dependencies(),
) {
  const paginator = dependencies.paginateListObjectsV2(
    {
      client: dependencies.client,
      pageSize: 1000,
    },
    {
      Bucket: dependencies.config.bucketName,
      Prefix: prefix,
    },
  );

  for await (const page of paginator) {
    if (!page.Contents) {
      break;
    }

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: dependencies.config.bucketName,
      Delete: {
        Objects: page.Contents.map((object) => ({ Key: object.Key })),
      },
    });

    await dependencies.client.send(deleteCommand);
  }
}

export function getObjectKeyForDocumentUuid(documentUuid: string) {
  return `documents/uploads/${documentUuid}`;
}

export function getObjectKeyForVideoUuid(videoUuid: string) {
  return `videos/uploads/${videoUuid}`;
}

export function getObjectKeyForProcessedVideoUuid(videoUuid: string) {
  return `videos/processed/${videoUuid}`;
}

export async function createObjectDownloadResponse(
  {
    objectKey,
    range,
  }: {
    objectKey: string;
    range: string | null;
  },
  dependencies = getDefaultS3Dependencies(),
) {
  const downloadCommand = new GetObjectCommand({
    Bucket: dependencies.config.bucketName,
    Key: objectKey,
    Range: range ?? undefined,
  });

  const object = await dependencies.client.send(downloadCommand);
  const body = getResponseBodyStream(object);

  return new Response(body, {
    status: object.ContentRange ? 206 : 200,
    headers: getObjectDownloadHeaders(object, objectKey),
  });
}

function getResponseBodyStream(object: GetObjectCommandOutput) {
  const body = object.Body;
  if (!body) {
    throw new Error("Object download response did not include a body.");
  }

  if (
    typeof body === "object" &&
    "transformToWebStream" in body &&
    typeof body.transformToWebStream === "function"
  ) {
    return body.transformToWebStream();
  }

  throw new Error("Object download response body is not a web stream.");
}

function getObjectDownloadHeaders(
  object: GetObjectCommandOutput,
  objectKey: string,
) {
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Type": object.ContentType ?? getContentTypeForObjectKey(objectKey),
  });

  if (object.ContentLength !== undefined) {
    headers.set("Content-Length", String(object.ContentLength));
  }

  if (object.ContentRange) {
    headers.set("Content-Range", object.ContentRange);
  }

  return headers;
}

function getContentTypeForObjectKey(objectKey: string) {
  if (objectKey.endsWith(".mpd")) return "application/dash+xml";
  if (objectKey.endsWith(".webm")) return "video/webm";
  if (objectKey.endsWith(".mp4")) return "video/mp4";
  if (objectKey.endsWith(".m4s")) return "video/iso.segment";
  return "application/octet-stream";
}
