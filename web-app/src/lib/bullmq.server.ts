import { Queue, QueueEvents } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { Answer } from "@/db/schema";

// TODO secure this connection
export const videoProcessingQueue = new Queue("video-processing", {
  connection: { host: "localhost", port: 6379 },
});

// This will be started at the start of the server since this module is imported indirectly by the router.
const queueEvents = new QueueEvents("video-processing", {
  connection: { host: "localhost", port: 6379 },
});

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
      // TODO delete the old video in S3 if it exists
      return;
    }
    const [updatedAnswer] = await db
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
