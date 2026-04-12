import { createFileRoute } from "@tanstack/react-router";
import { VideoRecorder } from "@/components/questions/VideoRecorder";
import { addChunkAndTryUpload } from "@/services/VideoUploadService";

export const Route = createFileRoute("/videorecordertest")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <VideoRecorder
      maxDurationSec={3 * 60}
      maxOvertimeSec={60}
      transferNewChunk={addChunkAndTryUpload}
    />
  );
}
