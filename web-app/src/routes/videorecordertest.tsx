import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { VideoRecorder } from "@/components/interview/questions/VideoRecorder";
// import { addChunkAndTryUpload } from "@/services/RecordingUploadService.client";

export const Route = createFileRoute("/videorecordertest")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <ClientOnly>
      <VideoRecorder
        maxDurationSec={3 * 60}
        maxOvertimeSec={60}
        transferNewChunk={async (chunk) => {}}
      />
    </ClientOnly>
  );
}
