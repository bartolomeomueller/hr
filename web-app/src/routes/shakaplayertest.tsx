import "shaka-player/dist/controls.css"; // Styles for Shaka Player UI
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import z from "zod";

const ShakaPlayerSearch = z.object({
  videoUuid: z.string().optional(),
});

export const Route = createFileRoute("/shakaplayertest")({
  component: RouteComponent,
  validateSearch: ShakaPlayerSearch,
});

const DASH_FALLBACK_URL =
  "https://localhost:3001/api/v1/stream/dash-output/manifest.mpd";

type ShakaNamespace =
  (typeof import("shaka-player/dist/shaka-player.ui"))["default"];

type ShakaEvent = Event & {
  detail?: unknown;
};

type ShakaOverlay = InstanceType<ShakaNamespace["ui"]["Overlay"]>;

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

function ShakaPlayer({ manifestUrl }: { manifestUrl: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<ShakaOverlay | null>(null);

  useEffect(() => {
    let isMounted = true;

    const onError = (error: unknown) => {
      console.error("Shaka Player error", error);
    };

    const onErrorEvent = (event: ShakaEvent) => {
      onError(event.detail ?? event);
    };

    const initPlayer = async () => {
      let overlay: ShakaOverlay | null = null;

      try {
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container || !video) return;

        const shaka = (await import("shaka-player/dist/shaka-player.ui.js"))
          .default as ShakaNamespace;

        shaka.polyfill.installAll();

        if (!shaka.Player.isBrowserSupported()) {
          onError(new Error("Shaka Player is not supported in this browser."));
          return;
        }

        const player = new shaka.Player();
        overlay = new shaka.ui.Overlay(player, container, video);

        await player.attach(video);

        if (!isMounted) {
          await overlay.destroy();
          return;
        }

        const controls = overlay.getControls();
        const overlayPlayer = controls?.getPlayer();

        if (!controls || !overlayPlayer) {
          await overlay.destroy();
          return;
        }

        overlayRef.current = overlay;
        controls.addEventListener("error", onErrorEvent);
        overlayPlayer.addEventListener("error", onErrorEvent);

        console.log("Loading video manifest:", manifestUrl);
        await overlayPlayer.load(manifestUrl);
      } catch (error) {
        if (overlay && overlayRef.current !== overlay) {
          await overlay.destroy();
        }
        onError(error);
      }
    };

    void initPlayer();

    return () => {
      isMounted = false;
      const overlay = overlayRef.current;
      overlayRef.current = null;

      if (overlay) {
        void overlay.destroy();
      }
    };
  }, [manifestUrl]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_32px_80px_rgba(0,0,0,0.45)]"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="aspect-video w-full bg-black"
      >
        <track kind="captions" />
      </video>
    </div>
  );
}
