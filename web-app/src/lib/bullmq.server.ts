import { Queue, QueueEvents } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { Answer } from "@/db/schema";

const VIDEO_PROCESSING_QUEUE_NAME = "video-processing";
const VIDEO_PROCESSING_CANCELLATION_CHANNEL = `${VIDEO_PROCESSING_QUEUE_NAME}:cancel`;
const redisConnection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? "6379"),
  password: process.env.REDIS_PASSWORD,
};

export const videoProcessingQueue = new Queue(VIDEO_PROCESSING_QUEUE_NAME, {
  connection: redisConnection,
});

// This will be started at the start of the server since this module is imported indirectly by the router.
const queueEvents = new QueueEvents(VIDEO_PROCESSING_QUEUE_NAME, {
  connection: redisConnection,
});

// Make enqueuing idempotent, as the orpc handler calling this may be retried.
export async function enqueueVideoProcessingJob(uuid: string) {
  await videoProcessingQueue.add(
    VIDEO_PROCESSING_QUEUE_NAME,
    { uuid },
    { jobId: uuid },
  );
}

export async function cancelVideoProcessingJob(uuid: string) {
  const job = await videoProcessingQueue.getJob(uuid);

  if (!job) {
    return false;
  }

  try {
    const jobState = await job.getState();

    if (jobState !== "active") {
      await job.remove();
      return true;
    }
  } catch {
    // If removal raced with the worker taking the job, fall through to publishing a cancellation request.
  }

  await publishVideoProcessingCancellation({
    jobId: String(job.id),
    reason: `Video processing cancelled for ${uuid}`,
  });

  return true;
}

async function publishVideoProcessingCancellation(input: {
  jobId: string;
  reason: string;
}) {
  const client = await videoProcessingQueue.client;
  await client.publish(
    VIDEO_PROCESSING_CANCELLATION_CHANNEL,
    JSON.stringify(input),
  );
}

queueEvents.on("completed", async (job) => {
  const completedJob = await videoProcessingQueue.getJob(job.jobId);
  const uuid = completedJob?.data.uuid;
  if (!uuid) {
    console.error(`No UUID found in completed job with id ${job.jobId}`);
    throw new Error(`No UUID found in completed job with id ${job.jobId}`);
  }
  console.log(`Processing completion of video with UUID ${uuid}`);

  await db.transaction(async (_) => {
    const [existingAnswer] = await db
      .select({
        answer: Answer,
      })
      .from(Answer)
      .where(sql`${Answer.answerPayload} ->> 'videoUuid' = ${uuid}`)
      .limit(1);

    if (!existingAnswer) {
      console.log(
        `No answer found for video UUID ${uuid}. It is assumed that this is because a new video has been recorded.`,
      );
      return;
    }
    await db
      .update(Answer)
      .set({
        answerPayload: {
          ...(existingAnswer.answer.answerPayload as JSON),
          status: "processed",
        },
      })
      .where(eq(Answer.uuid, existingAnswer.answer.uuid))
      .returning();

    console.log(
      `Sucessfully updated answer with processed video status for uuid ${uuid}`,
    );
  });
});
