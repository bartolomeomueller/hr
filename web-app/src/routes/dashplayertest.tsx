import { createFileRoute } from "@tanstack/react-router";
import * as dashjs from "dashjs";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/dashplayertest")({
  component: RouteComponent,
});

function RouteComponent() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<dashjs.MediaPlayerClass | null>(null);
  const [representations, setRepresentations] = useState<
    dashjs.Representation[]
  >([]);
  const [currentRepId, setCurrentRepId] = useState<string | null>(null);

  const url = "http://localhost:3002/dash-output/manifest.mpd";

  useEffect(() => {
    if (!videoRef.current) return;

    playerRef.current = dashjs.MediaPlayer().create();
    playerRef.current.initialize(videoRef.current, url, true);

    playerRef.current.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
      const representations =
        playerRef.current?.getRepresentationsByType("video");
      setRepresentations(representations ?? []);
      playerRef.current?.updateSettings({
        streaming: {
          abr: { autoSwitchBitrate: { video: true } },
          buffer: { flushBufferAtTrackSwitch: true, fastSwitchEnabled: true },
        },
      });
    });

    return () => {
      playerRef.current?.reset();
    };
  }, []);

  function handleQualityChange(rep: dashjs.Representation) {
    playerRef.current?.updateSettings({
      streaming: {
        abr: { autoSwitchBitrate: { video: false } },
        buffer: { flushBufferAtTrackSwitch: true, fastSwitchEnabled: true },
      },
    });
    playerRef.current?.setRepresentationForTypeById("video", rep.id);
    setCurrentRepId(rep.id);
  }

  function handleAutoQuality() {
    playerRef.current?.updateSettings({
      streaming: {
        abr: { autoSwitchBitrate: { video: true } },
        buffer: { flushBufferAtTrackSwitch: true, fastSwitchEnabled: true },
      },
    });
    setCurrentRepId(null);
  }

  const currentRep = representations.find((r) => r.id === currentRepId);

  return (
    <div>
      <video ref={videoRef} controls>
        <track kind="captions" />
      </video>
      <div>
        <button
          type="button"
          onClick={handleAutoQuality}
          style={{ fontWeight: currentRepId === null ? "bold" : "normal" }}
        >
          Auto
        </button>
        {representations.map((rep) => (
          <button
            type="button"
            key={rep.id}
            onClick={() => handleQualityChange(rep)}
            style={{ fontWeight: rep.id === currentRepId ? "bold" : "normal" }}
          >
            {rep.height}p ({Math.round(rep.bitrateInKbit)} kbps)
          </button>
        ))}
      </div>
    </div>
  );
}
