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

type ShakaPlayer = {
  addEventListener: (type: "error", listener: (event: unknown) => void) => void;
  destroy: () => Promise<unknown>;
  load: (url: string) => Promise<unknown>;
};

type ShakaModule = {
  polyfill: { installAll: () => void };
  Player: {
    isBrowserSupported: () => boolean;
    new (video: HTMLVideoElement): ShakaPlayer;
  };
};

function RouteComponent() {
  const search = Route.useSearch();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<ShakaPlayer | null>(null);

  useEffect(() => {
    let isMounted = true;

    const onError = (error: unknown) => {
      console.error("Shaka Player error", error);
    };

    const initPlayer = async () => {
      const video = videoRef.current;
      if (!video) return;

      const shakaImport = await import("shaka-player");
      const shaka = shakaImport.default as ShakaModule;

      shaka.polyfill.installAll();

      if (!shaka.Player.isBrowserSupported()) {
        console.error("Shaka Player is not supported in this browser.");
        return;
      }

      if (!isMounted) return;

      const player = new shaka.Player(video);
      playerRef.current = player;
      player.addEventListener("error", onError);

      try {
        console.log("Loading video with UUID:", search.videoUuid);
        await player.load(
          search.videoUuid
            ? `https://localhost:3001/api/v1/stream/${search.videoUuid}/manifest.mpd`
            : DASH_FALLBACK_URL,
        );
      } catch (error) {
        onError(error);
      }
    };

    void initPlayer();

    return () => {
      isMounted = false;
      const player = playerRef.current;
      playerRef.current = null;

      if (player) {
        void player.destroy();
      }
    };
  }, []);

  return (
    <div>
      <video ref={videoRef} controls autoPlay>
        <track kind="captions" />
      </video>
    </div>
  );
}
