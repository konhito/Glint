import type { GradientPreset } from "@/lib/gradients";

type MediaSource = HTMLImageElement | HTMLVideoElement;

function hueAndSaturation(red: number, green: number, blue: number) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return { hue: 0, saturation: 0 };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = max === red ? ((green - blue) / delta) % 6
    : max === green ? (blue - red) / delta + 2
      : (red - green) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return { hue, saturation };
}

function colorInfo(hex: string) {
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  return { ...hueAndSaturation(red, green, blue), luminance: red * 0.2126 + green * 0.7152 + blue * 0.0722 };
}

function hueDistance(a: number, b: number) {
  const distance = Math.abs(a - b);
  return Math.min(distance, 360 - distance);
}

export function rankGradientsForMedia(source: MediaSource, gradients: GradientPreset[]): GradientPreset[] {
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!width || !height) return [];

  const canvas = document.createElement("canvas");
  canvas.width = 40;
  canvas.height = 40;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  try {
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const hueBins = new Array<number>(24).fill(0);
    let luminance = 0;
    let count = 0;
    let chroma = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 128) continue;
      const red = pixels[index] / 255;
      const green = pixels[index + 1] / 255;
      const blue = pixels[index + 2] / 255;
      const { hue, saturation } = hueAndSaturation(red, green, blue);
      luminance += red * 0.2126 + green * 0.7152 + blue * 0.0722;
      count++;
      if (saturation > 0.18) {
        const weight = saturation * saturation;
        hueBins[Math.floor(hue / 15)] += weight;
        chroma += weight;
      }
    }
    if (!count) return [];
    const sourceLuminance = luminance / count;
    const dominantBin = hueBins.indexOf(Math.max(...hueBins));
    const dominantHue = dominantBin * 15 + 7.5;
    const hasAccent = chroma / count > 0.012;

    return gradients.map((gradient) => {
      const colors = gradient.colors.map(colorInfo);
      const contrast = Math.abs(colors[0].luminance - sourceLuminance);
      const accentColors = colors.slice(1).filter((color) => color.saturation > 0.12);
      if (!hasAccent) {
        const saturation = colors.reduce((sum, color) => sum + color.saturation, 0) / colors.length;
        return { gradient, score: saturation * 35 - contrast * 65 };
      }
      const opposite = (dominantHue + 180) % 360;
      const complementDistance = accentColors.length ? Math.min(...accentColors.map((color) => hueDistance(color.hue, opposite))) : 180;
      const echoDistance = accentColors.length ? Math.min(...accentColors.map((color) => hueDistance(color.hue, dominantHue))) : 180;
      return { gradient, score: complementDistance * 0.7 + echoDistance * 0.2 - contrast * 35 };
    }).sort((a, b) => a.score - b.score).map(({ gradient }) => gradient);
  } catch {
    return [];
  }
}
