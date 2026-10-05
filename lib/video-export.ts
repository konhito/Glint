import type { EditorState } from "@/lib/editor-store";
import type { OutputPreset } from "@/lib/gradients";
import { renderCanvas } from "@/lib/canvas-renderer";

function seekToStart(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    if (video.currentTime === 0) return resolve();
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("The video could not seek to its first frame.")); };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = 0;
  });
}

export async function recordCanvasVideo(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  state: EditorState,
  backgroundImage: HTMLImageElement | null,
  preset: OutputPreset,
  onProgress: (seconds: number) => void,
  shaderCanvas: HTMLCanvasElement | null = null,
  pixelRatio = 1,
) {
  if (!canvas.captureStream || typeof MediaRecorder === "undefined") {
    throw new Error("This browser cannot record canvas video. Try the latest Chrome or Firefox.");
  }
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    throw new Error("Wait for the video to finish loading, then try again.");
  }

  video.pause();
  video.loop = false;
  const wasMuted = video.muted;
  await seekToStart(video);
  renderCanvas(canvas, state, video, backgroundImage, preset.width, preset.height, 0, undefined, shaderCanvas, pixelRatio);

  const stream = canvas.captureStream(30);
  const captureVideo = video as HTMLVideoElement & { captureStream?: () => MediaStream };
  const capturedMedia = captureVideo.captureStream?.() ?? null;
  capturedMedia?.getAudioTracks().forEach((track: MediaStreamTrack) => stream.addTrack(track));
  const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    .find((type) => MediaRecorder.isTypeSupported(type));
  const videoBitsPerSecond = Math.min(35_000_000, Math.max(16_000_000, Math.round(canvas.width * canvas.height * 7)));
  const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond, audioBitsPerSecond: 192_000 });
  const chunks: BlobPart[] = [];
  let lastSecond = -1;
  const onTimeUpdate = () => {
    const second = Math.floor(video.currentTime);
    if (second !== lastSecond) {
      lastSecond = second;
      onProgress(video.currentTime);
    }
  };
  video.addEventListener("timeupdate", onTimeUpdate);

  const recording = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("error", (event) => {
      reject((event as Event & { error?: DOMException }).error ?? new Error("Video recording stopped unexpectedly."));
    }, { once: true });
    recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" })), { once: true });
  });
  const ended = new Promise<void>((resolve, reject) => {
    video.addEventListener("ended", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("The video stopped before export finished.")), { once: true });
  });
  let frame = 0;
  const startedAt = performance.now();

  try {
    recorder.start(1000);
    video.muted = false;
    await video.play();
    const draw = () => {
      renderCanvas(canvas, state, video, backgroundImage, preset.width, preset.height, (performance.now() - startedAt) / 1000, undefined, shaderCanvas, pixelRatio);
      if (!video.paused && !video.ended) frame = requestAnimationFrame(draw);
    };
    draw();
    await Promise.race([ended, recording.then(() => { throw new Error("The video recorder stopped unexpectedly."); })]);
    renderCanvas(canvas, state, video, backgroundImage, preset.width, preset.height, 0, undefined, shaderCanvas, pixelRatio);
    if (recorder.state !== "inactive") recorder.stop();
    return await recording;
  } catch (error) {
    if (recorder.state !== "inactive") recorder.stop();
    throw error;
  } finally {
    cancelAnimationFrame(frame);
    video.removeEventListener("timeupdate", onTimeUpdate);
    stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    capturedMedia?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    video.loop = true;
    video.muted = wasMuted;
    video.currentTime = 0;
  }
}
