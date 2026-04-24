import "shaka-player/dist/controls.css";
import { useEffect, useRef } from "react";

type ShakaNamespace =
  (typeof import("shaka-player/dist/shaka-player.ui"))["default"];

type ShakaEvent = Event & {
  detail?: unknown;
};

type ShakaOverlay = InstanceType<ShakaNamespace["ui"]["Overlay"]>;

export function ShakaPlayer({ manifestUrl }: { manifestUrl: string }) {
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
    <div ref={containerRef} className="overflow-hidden rounded-xl shadow">
      <video ref={videoRef} playsInline>
        <track kind="captions" />
      </video>
    </div>
  );
}
