import type { EditorState } from "@/lib/editor-store";
import type { OutputPreset } from "@/lib/gradients";
import { renderCanvas } from "@/lib/canvas-renderer";

type GifEncoderApi = {
  GIFEncoder: () => { writeFrame: (pixels: Uint8Array, width: number, height: number, options: { palette?: number[][]; delay: number; repeat?: number }) => void; finish: () => void; bytes: () => Uint8Array };
  quantize: (rgba: Uint8Array | Uint8ClampedArray, colors: number) => number[][];
  applyPalette: (rgba: Uint8Array | Uint8ClampedArray, palette: number[][]) => Uint8Array;
};

export async function renderCanvasGif(canvas: HTMLCanvasElement, source: HTMLImageElement, state: EditorState, backgroundImage: HTMLImageElement | null, preset: OutputPreset, onProgress: (frame: number, total: number) => void, shaderCanvas: HTMLCanvasElement | null = null) {
  // gifenc is intentionally loaded only when the user asks for an animated export.
  // @ts-expect-error gifenc is a small browser library with no bundled TypeScript declarations.
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc") as GifEncoderApi;
  const frames = 18;
  const cycleRate = 0.12 + state.motionSpeed / 140;
  const cycleSeconds = (Math.PI * 2) / cycleRate;
  const captured: Uint8ClampedArray[] = [];
  const samples: number[] = [];

  for (let index = 0; index < frames; index++) {
    const phase = (cycleSeconds * index) / frames;
    renderCanvas(canvas, state, source, backgroundImage, preset.width, preset.height, phase, undefined, shaderCanvas);
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, preset.width, preset.height).data;
    captured.push(pixels);
    for (let pixel = (index % 16) * 4; pixel < pixels.length; pixel += 64) {
      samples.push(pixels[pixel], pixels[pixel + 1], pixels[pixel + 2], pixels[pixel + 3]);
    }
    onProgress(index + 1, frames * 2);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  const palette = quantize(Uint8Array.from(samples), 256);
  const gif = GIFEncoder();
  captured.forEach((pixels, index) => {
    gif.writeFrame(applyPalette(pixels, palette), preset.width, preset.height, { palette: index === 0 ? palette : undefined, delay: 125, repeat: index === 0 ? 0 : undefined });
    onProgress(frames + index + 1, frames * 2);
  });
  gif.finish();
  const bytes = gif.bytes();
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "image/gif" });
}
