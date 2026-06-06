export interface ExtractedFrame {
  blob: Blob;
  preview: string;
  timestamp: number;
  roomName: string;
}

const ROOM_NAMES = [
  "Living Room", "Kitchen", "Master Bedroom", "Bedroom",
  "Bathroom", "Dining Room", "Office", "Hallway", "Garage", "Backyard",
];

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function seekAndCapture(video: HTMLVideoElement, time: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error(`Seek timed out at ${time.toFixed(1)}s`));
    }, 8000);

    const onSeeked = async () => {
      clearTimeout(timer);
      video.removeEventListener("seeked", onSeeked);
      await waitForFrame();

      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas context unavailable")); return; }
      ctx.drawImage(video, 0, 0, w, h);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("toBlob returned null")),
        "image/jpeg",
        0.85,
      );
    };

    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

export async function extractFrames(
  file: File,
  intervalSeconds = 5,
  onProgress?: (pct: number) => void,
): Promise<ExtractedFrame[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";

    const src = URL.createObjectURL(file);
    video.src = src;
    video.load();

    const cleanup = () => URL.revokeObjectURL(src);

    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("Couldn't load video. Try an MP4 recorded in the Camera app."));
    });

    video.addEventListener("loadeddata", async () => {
      try {
        const duration = video.duration;
        if (!duration || !isFinite(duration)) {
          cleanup();
          reject(new Error("Couldn't read video duration. Try a shorter clip."));
          return;
        }

        const times: number[] = [];
        for (let t = 1; t < duration - 0.5; t += intervalSeconds) {
          times.push(t);
        }
        if (times.length === 0) times.push(duration / 2);

        const frames: ExtractedFrame[] = [];
        for (let i = 0; i < times.length; i++) {
          const blob = await seekAndCapture(video, times[i]);
          frames.push({
            blob,
            preview: URL.createObjectURL(blob),
            timestamp: times[i],
            roomName: ROOM_NAMES[i] ?? `Room ${i + 1}`,
          });
          onProgress?.((i + 1) / times.length);
        }

        cleanup();
        resolve(frames);
      } catch (e) {
        cleanup();
        reject(e);
      }
    });
  });
}
