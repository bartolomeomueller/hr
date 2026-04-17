import { createReadStream, createWriteStream } from "node:fs";
import { readdir } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import pLimit from "p-limit";

const s3Config = loadS3Config();
function loadS3Config() {
  // TODO use credentials with less priveleges
  const accessKeyId = requiredEnv("S3_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnv("S3_SECRET_ACCESS_KEY");
  const bucketName = requiredEnv("S3_BUCKET_NAME");
  const endpoint = requiredEnv("S3_ENDPOINT");

  const region = process.env.S3_REGION ?? "us-east-1"; // is ignored by S3Client when using a custom endpoint

  return {
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    bucketName,
    endpoint,
    region,
  } as const;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const s3Client = new S3Client({
  credentials: s3Config.credentials,
  endpoint: s3Config.endpoint,
  forcePathStyle: true,
  region: s3Config.region,
});

export async function streamingDownload({
  uuid,
  downloadPrefix,
  downloadsDir,
}: {
  uuid: string;
  downloadPrefix: string;
  downloadsDir: string;
}): Promise<string> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: s3Config.bucketName,
        Key: `${downloadPrefix}/${uuid}`,
      }),
    );
    if (!response.Body) {
      throw new Error(`Missing S3 body for video ${uuid}`);
    }

    const writer = createWriteStream(`${downloadsDir}/${uuid}.webm`);
    await pipeline(response.Body as NodeJS.ReadableStream, writer);
    return `${downloadsDir}/${uuid}.webm`;
  } catch (error) {
    console.error(`Error downloading video ${uuid} from S3:`, error);
    throw error;
  }
}

export async function recursiveStreamingUpload({
  uuid,
  localDirectory,
  uploadPrefix,
}: {
  uuid: string;
  localDirectory: string;
  uploadPrefix: string;
}) {
  const files = await readdir(localDirectory);

  const sortedFiles = files.sort();
  // Manifest is the last file when sorting all dash files.
  if (sortedFiles.at(-1) !== "manifest.mpd")
    // So that users cannot access the manifest before all segments are uploaded.
    throw new Error("Manifest file should be uploaded last.");

  const limit = pLimit(4); // Limit concurrent file uploads to 4

  const uploadPromises = sortedFiles.map(async (file) =>
    limit(async () => {
      const filePath = `${localDirectory}/${file}`;
      const fileStream = createReadStream(filePath);
      const contentType = getContentTypeForDashArtifact(file);

      const uploadParams = {
        Bucket: s3Config.bucketName,
        Key: `${uploadPrefix}/${uuid}/${file}`,
        Body: fileStream,
        ContentType: contentType,
      };

      return new Upload({
        client: s3Client,
        params: uploadParams,

        // explicit defaults
        queueSize: 4, // upload concurrency of parts/chunks per file
        partSize: 5 * 1024 * 1024, // default size
        leavePartsOnError: false, // upload all or nothing of the file
      }).done();
    }),
  );

  await Promise.all(uploadPromises);
}

export function getContentTypeForDashArtifact(filename: string): string {
  if (filename.endsWith(".mpd") || filename === "manifest.mpd") {
    return "application/dash+xml";
  }
  if (filename.endsWith(".webm")) {
    return "video/webm";
  }
  if (filename.endsWith(".m4s") || filename.endsWith(".mp4")) {
    return "video/mp4";
  }
  if (filename.endsWith(".m4a")) {
    return "audio/mp4";
  }
  return "application/octet-stream";
}

export async function moveObjectToBackupPrefix({
  uuid,
  sourcePrefix,
  backupPrefix,
}: {
  uuid: string;
  sourcePrefix: string;
  backupPrefix: string;
}) {
  const sourceKey = `${sourcePrefix}/${uuid}`;
  const destinationKey = `${backupPrefix}/${uuid}`;

  await s3Client.send(
    new CopyObjectCommand({
      Bucket: s3Config.bucketName,
      CopySource: `${s3Config.bucketName}/${sourceKey}`,
      Key: destinationKey,
    }),
  );

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: s3Config.bucketName,
      Key: sourceKey,
    }),
  );
}
