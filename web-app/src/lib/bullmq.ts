import { Queue } from "bullmq";

// TODO secure this connection
export const videoProcessingQueue = new Queue("video-processing", {
  connection: { host: "localhost", port: 6379 },
});
