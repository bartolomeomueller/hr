import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const testS3Config = {
  // TODO use credentials with less priveleges
  credentials: {
    accessKeyId: "admin",
    secretAccessKey: "key",
  },
  bucketName: "hr-app-data",
  endpoint: "http://localhost:8333",
  region: "us-east-1", // is ignored by S3Client when using a custom endpoint
} as const;

const s3Client = new S3Client({
  credentials: testS3Config.credentials,
  endpoint: testS3Config.endpoint,
  forcePathStyle: true,
  region: testS3Config.region,
});

export async function createPresignedStreamUploadUrl(
  objectKey: string,
  mimeType: string,
) {
  const uploadCommand = new PutObjectCommand({
    Bucket: testS3Config.bucketName,
    ContentType: mimeType,
    Key: objectKey,
  });

  // Does only local math, does not communicate with the bucket
  const uploadUrl = await getSignedUrl(s3Client, uploadCommand, {
    expiresIn: 300,
  });

  return {
    bucketName: testS3Config.bucketName,
    contentType: mimeType,
    objectKey,
    objectUrl: `${testS3Config.endpoint}/${testS3Config.bucketName}/${objectKey}`,
    uploadUrl,
  };
}

export async function createPresignedStreamDownloadUrl(objectKey: string) {
  const downloadCommand = new GetObjectCommand({
    Bucket: testS3Config.bucketName,
    Key: objectKey,
  });

  const downloadUrl = await getSignedUrl(s3Client, downloadCommand, {
    expiresIn: 300,
  });

  return {
    bucketName: testS3Config.bucketName,
    downloadUrl,
    objectKey,
    objectUrl: `${testS3Config.endpoint}/${testS3Config.bucketName}/${objectKey}`,
  };
}
