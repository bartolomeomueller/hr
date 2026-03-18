import { createFileRoute } from "@tanstack/react-router";
import { VideoRecorder } from "@/components/VideoRecorder";
import { addChunkAndTryUpload } from "@/services/UploadService";

export const Route = createFileRoute("/videorecordertest")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <VideoRecorder
      maxDurationMs={3 * 60 * 1000}
      maxOvertimeMs={60 * 1000}
      hasRecording={false}
      transferNewChunk={addChunkAndTryUpload}
    />
  );
}
