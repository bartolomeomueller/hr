import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  paginateListObjectsV2,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v7 as uuidv7 } from "uuid";
import { getRequiredEnvironmentVariable } from "@/lib/utils";

export const s3Config = {
  credentials: {
    accessKeyId: getRequiredEnvironmentVariable("S3_ACCESS_KEY_ID"),
    secretAccessKey: getRequiredEnvironmentVariable("S3_SECRET_ACCESS_KEY"),
  },
  bucketName: getRequiredEnvironmentVariable("S3_BUCKET_NAME"),
  endpoint: getRequiredEnvironmentVariable("S3_ENDPOINT"),
  region: "us-east-1", // is ignored by S3Client when using a custom endpoint
} as const;

const s3Client = new S3Client({
  credentials: s3Config.credentials,
  endpoint: s3Config.endpoint,
  forcePathStyle: true,
  region: s3Config.region,
});

const PDF_MIME_TYPE = "application/pdf";

export async function createPresignedUploadUrlForDocument({
  mimeType,
}: {
  mimeType: string;
}) {
  if (mimeType !== PDF_MIME_TYPE) {
    throw new Error("Only PDF documents are allowed.");
  }

  const uuid = uuidv7();
  const uploadUrl = await createPresignedUploadUrl({
    objectKey: getObjectKeyForDocumentUuid(uuid),
    mimeType,
  });

  return { uuid, uploadUrl };
}

async function createPresignedUploadUrl({
  objectKey,
  mimeType,
}: {
  objectKey: string;
  mimeType: string;
}) {
  const uploadCommand = new PutObjectCommand({
    Bucket: s3Config.bucketName,
    ContentType: mimeType,
    Key: objectKey,
  });

  // Does only local math, does not communicate with the bucket
  const uploadUrl = await getSignedUrl(s3Client, uploadCommand, {
    expiresIn: 300, // URL expires in 5 minutes
  });

  return uploadUrl;
}

export async function createPresignedDownloadUrl(
  objectKey: string,
  expiresInSeconds = 900,
) {
  const downloadCommand = new GetObjectCommand({
    Bucket: s3Config.bucketName,
    Key: objectKey,
  });

  const downloadUrl = await getSignedUrl(s3Client, downloadCommand, {
    expiresIn: expiresInSeconds,
  });

  return {
    bucketName: s3Config.bucketName,
    downloadUrl,
    objectKey,
    objectUrl: `${s3Config.endpoint}/${s3Config.bucketName}/${objectKey}`,
  };
}

export async function initiateMultipartUploadForVideo({
  mimeType,
}: {
  mimeType: string;
}) {
  const uuid = uuidv7();
  const command = new CreateMultipartUploadCommand({
    Bucket: s3Config.bucketName,
    Key: getObjectKeyForVideoUuid(uuid),
    ContentType: mimeType,
  });
  const response = await s3Client.send(command);

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

export async function createPresignedUploadUrlForVideoPart({
  partNumber,
  uploadId,
  videoUuid,
  expiresInSeconds = 900,
}: {
  partNumber: number;
  uploadId: string;
  videoUuid: string;
  expiresInSeconds?: number;
}) {
  const command = new UploadPartCommand({
    Bucket: s3Config.bucketName,
    Key: getObjectKeyForVideoUuid(videoUuid),
    UploadId: uploadId,
    PartNumber: partNumber,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: expiresInSeconds,
  });

  return uploadUrl;
}

export async function completeMultipartUploadForVideo({
  uploadId,
  videoUuid,
  parts,
}: {
  uploadId: string;
  videoUuid: string;
  parts: { ETag: string; PartNumber: number }[];
}) {
  parts.sort((a, b) => a.PartNumber - b.PartNumber);
  const completeCommand = new CompleteMultipartUploadCommand({
    Bucket: s3Config.bucketName,
    Key: getObjectKeyForVideoUuid(videoUuid),
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts,
    },
  });

  await s3Client.send(completeCommand);
}

export async function deleteObject(objectKey: string) {
  const deleteCommand = new DeleteObjectCommand({
    Bucket: s3Config.bucketName,
    Key: objectKey,
  });

  await s3Client.send(deleteCommand);
}

export async function deleteObjectsForPrefix(prefix: string) {
  const paginator = paginateListObjectsV2(
    {
      client: s3Client,
      pageSize: 1000,
    },
    {
      Bucket: s3Config.bucketName,
      Prefix: prefix,
    },
  );

  for await (const page of paginator) {
    if (!page.Contents) {
      break;
    }

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: s3Config.bucketName,
      Delete: {
        Objects: page.Contents.map((object) => ({ Key: object.Key })),
      },
    });

    await s3Client.send(deleteCommand);
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
