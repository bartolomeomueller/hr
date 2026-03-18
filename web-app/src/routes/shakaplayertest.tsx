import "shaka-player/dist/controls.css"; // Styles for Shaka Player UI
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";
import { ShakaPlayer } from "@/components/ShakaPlayer";

const ShakaPlayerSearch = z.object({
  videoUuid: z.string().optional(),
});

export const Route = createFileRoute("/shakaplayertest")({
  component: RouteComponent,
  validateSearch: ShakaPlayerSearch,
});

const DASH_FALLBACK_URL =
  "https://localhost:3001/api/v1/stream/dash-output/manifest.mpd";

function RouteComponent() {
  const search = Route.useSearch();
  const manifestUrl = search.videoUuid
    ? `https://localhost:3001/api/v1/stream/${search.videoUuid}/manifest.mpd`
    : DASH_FALLBACK_URL;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.16),transparent_32%),linear-gradient(180deg,#111827_0%,#020617_100%)] px-6 py-10 text-white">
      <section className="mx-auto flex max-w-5xl flex-col gap-4">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-[0.32em] text-amber-300/80 uppercase">
            Shaka Player UI
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            DASH stream test
          </h1>
          <p className="max-w-2xl text-sm text-slate-300">
            This route now uses Shaka&apos;s UI overlay for built-in playback
            controls, quality switching, captions, picture-in-picture, and
            fullscreen.
          </p>
          <ShakaPlayer manifestUrl={manifestUrl} />
        </div>
      </section>
    </main>
  );
}
