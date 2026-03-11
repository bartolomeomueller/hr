import { useEffect, useState } from "react";

export function VideoRecorder() {
  const [mimeType, setMimeType] = useState<string | null>(
    "video/webm;codecs=av1",
  );

  useEffect(() => {
    async function runCompatibilityMatrix() {
      await compatibilityMatrix();
    }
    void runCompatibilityMatrix();
  }, []);

  return <div>fun {mimeType}</div>;
}

// async function mediaCapabilitiesApi() {
//   const av1 = 'video/webm;"avc1.42E01E, mp4a.40.2"';
//   const vp9 = "video/webm;codecs=vp9";
//   const vp8 = "video/webm;codecs=vp8";

//   const av1Config: MediaEncodingConfiguration = {
//     type: "webrtc",
//     video: {
//       contentType: av1,
//       width: 1920,
//       height: 1080,
//       bitrate: 5_000_000,
//       framerate: 30,
//     },
//   };

//   const vp9Config: MediaEncodingConfiguration = {
//     type: "webrtc",
//     video: {
//       contentType: vp9,
//       width: 1920,
//       height: 1080,
//       bitrate: 7_000_000,
//       framerate: 30,
//     },
//   };

//   const vp8Config: MediaEncodingConfiguration = {
//     type: "webrtc",
//     video: {
//       contentType: vp8,
//       width: 1920,
//       height: 1080,
//       bitrate: 10_000_000,
//       framerate: 30,
//     },
//   };

//   for (const config of [av1Config, vp9Config, vp8Config]) {
//     try {
//       console.log("checking support with mediaCapabilities.encodingInfo...");
//       const result = await navigator.mediaCapabilities.encodingInfo(config);
//       console.log(`${config.video!.contentType} support check result:`, result);

//       if (result.supported && result.smooth) {
//         console.log(`Using ${config.video!.contentType}`);
//         return config.video!.contentType;
//       }
//     } catch (e) {
//       console.error("Failed to query mediaCapabilities.encodingInfo", e);
//     }
//   }
//   return null;
// }

// async function getBestVideoConfigforPlayback() {
//   const av1 = "video/webm;codecs=av1";
//   const vp9 = "video/webm;codecs=vp9";
//   const vp8 = "video/webm;codecs=vp8";

//   for (const mimeType of [av1, vp9, vp8]) {
//     console.log(`checking playback support for ${mimeType}...`);
//     if (MediaRecorder.isTypeSupported(mimeType)) {
//       console.log(`Playback: Using ${mimeType}`);
//       return mimeType;
//     }
//   }
//   return null;
// }

async function compatibilityMatrix() {
  type CompatibilityRow = {
    mimeType: string;
    mediaRecorderSupported?: boolean;
    mediaSourceIsSupported?: boolean;
    decodingSupported?: boolean;
    decodingSmooth?: boolean;
    decodingPowerEfficient?: boolean;
    encodingSupported?: boolean;
    encodingSmooth?: boolean;
    encodingPowerEfficient?: boolean;
  };

  const mimeTypes = [
    "video/webm",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm;codecs=av1",
    "video/webm;codecs=daala",
    "video/webm;codecs=h264",
    "video/mp4",
    "video/mp4;codecs=avc1.64003E,mp4a.40.2",
    "video/mp4;codecs=avc1.64003E,opus",
    "video/mp4;codecs=avc3.64003E,mp4a.40.2",
    "video/mp4;codecs=avc3.64003E,opus",
    "video/mp4;codecs=hvc1.1.6.L186.B0,mp4a.40.2",
    "video/mp4;codecs=hvc1.1.6.L186.B0,opus",
    "video/mp4;codecs=hev1.1.6.L186.B0,mp4a.40.2",
    "video/mp4;codecs=hev1.1.6.L186.B0,opus",
    "video/mp4;codecs=av01.0.19M.08,mp4a.40.2",
    "video/mp4;codecs=av01.0.19M.08,opus",
  ];

  const results: CompatibilityRow[] = [];

  for (const mimeType of mimeTypes) {
    const row: CompatibilityRow = { mimeType };
    if (window.MediaSource) {
      row.mediaSourceIsSupported = MediaSource.isTypeSupported(mimeType);
    }
    if (window.MediaRecorder) {
      row.mediaRecorderSupported = MediaRecorder.isTypeSupported(mimeType);
    }

    const decodingConfiguration: MediaDecodingConfiguration = {
      type: "file",
      video: {
        contentType: mimeType,
        width: 1920,
        height: 1080,
        bitrate: 5_000_000,
        framerate: 30,
      },
    };

    try {
      const decodingInfo = await navigator.mediaCapabilities.decodingInfo(
        decodingConfiguration,
      );
      row.decodingSupported = decodingInfo.supported;
      row.decodingSmooth = decodingInfo.smooth;
      row.decodingPowerEfficient = decodingInfo.powerEfficient;
    } catch (error) {
      console.error(
        `Failed to query mediaCapabilities.decodingInfo for ${mimeType}`,
        error,
      );
    }

    const encodingConfiguration: MediaEncodingConfiguration = {
      type: "webrtc",
      video: {
        contentType: mimeType,
        width: 1920,
        height: 1080,
        bitrate: 5_000_000,
        framerate: 30,
      },
    };
    try {
      const encodingInfo = await navigator.mediaCapabilities.encodingInfo(
        encodingConfiguration,
      );
      row.encodingSupported = encodingInfo.supported;
      row.encodingSmooth = encodingInfo.smooth;
      row.encodingPowerEfficient = encodingInfo.powerEfficient;
    } catch (e) {
      console.error(
        `Failed to query mediaCapabilities.encodingInfo for ${mimeType}`,
        e,
      );
    }

    results.push(row);
  }

  console.table(results);
  return results;
}
