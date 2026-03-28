import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v7 as uuidv7 } from "uuid";

export const s3Config = {
  // FIXME use credentials with less priveleges and refactor them to env vars
  credentials: {
    accessKeyId: "admin",
    secretAccessKey: "key",
  },
  bucketName: "hr-app-data",
  endpoint: "http://localhost:8333",
  region: "us-east-1", // is ignored by S3Client when using a custom endpoint
} as const;

const s3Client = new S3Client({
  credentials: s3Config.credentials,
  endpoint: s3Config.endpoint,
  forcePathStyle: true,
  region: s3Config.region,
});

export async function createPresignedUploadUrlForDocument({
  mimeType,
}: {
  mimeType: string;
}) {
  const uuid = uuidv7();
  const uploadUrl = await createPresignedUploadUrl({
    objectKey: getObjectKeyForDocumentUuid(uuid),
    mimeType,
  });

  return { uuid, uploadUrl };
}

export async function createPresignedUploadUrlForVideo({
  mimeType,
}: {
  mimeType: string;
}) {
  const uuid = uuidv7();
  const uploadUrl = await createPresignedUploadUrl({
    objectKey: getObjectKeyForVideoUuid(uuid),
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
  expiresInSeconds = 300,
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

export async function deleteObject(objectKey: string) {
  const deleteCommand = new DeleteObjectCommand({
    Bucket: s3Config.bucketName,
    Key: objectKey,
  });

  await s3Client.send(deleteCommand);
}

export function getObjectKeyForDocumentUuid(documentUuid: string) {
  return `documents/uploads/${documentUuid}`;
}

export function getObjectKeyForVideoUuid(videoUuid: string) {
  return `videos/uploads/${videoUuid}`;
}
