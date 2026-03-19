import { createFileRoute } from "@tanstack/react-router";
import { VideoRecorder } from "@/components/VideoRecorder";
import { addChunkAndTryUpload } from "@/services/UploadService";

export const Route = createFileRoute("/videorecordertest")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <VideoRecorder
      maxDurationSec={3 * 60}
      maxOvertimeSec={60}
      hasRecording={false}
      transferNewChunk={addChunkAndTryUpload}
    />
  );
}
