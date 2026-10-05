import type { MeshGradientDesign } from "@/lib/mesh-designs";

type MediaSource = HTMLImageElement | HTMLVideoElement;
type MediaMatch<T> = { ranked: T[]; grain: number; dominantHue: number; luminance: number; hasAccent: boolean };

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

export function rankGradientsForMedia<T extends { colors: string[] }>(source: MediaSource, gradients: T[]): MediaMatch<T> | null {
  const width = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const height = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!width || !height) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 40;
  canvas.height = 40;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const hueBins = new Array<number>(24).fill(0);
    let luminance = 0;
    let count = 0;
    let chroma = 0;
    let detail = 0;
    let detailCount = 0;
    let previousLuminance = 0;
    let previousOpaque = false;
    for (let index = 0; index < pixels.length; index += 4) {
      if (index % (canvas.width * 4) === 0) previousOpaque = false;
      if (pixels[index + 3] < 128) { previousOpaque = false; continue; }
      const red = pixels[index] / 255;
      const green = pixels[index + 1] / 255;
      const blue = pixels[index + 2] / 255;
      const { hue, saturation } = hueAndSaturation(red, green, blue);
      const pixelLuminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      luminance += pixelLuminance;
      if (previousOpaque) { detail += Math.abs(pixelLuminance - previousLuminance); detailCount++; }
      previousLuminance = pixelLuminance;
      previousOpaque = true;
      count++;
      if (saturation > 0.18) {
        const weight = saturation * saturation;
        hueBins[Math.floor(hue / 15)] += weight;
        chroma += weight;
      }
    }
    if (!count) return null;
    const sourceLuminance = luminance / count;
    const grain = Math.max(4, Math.min(12, Math.round(12 - (detailCount ? detail / detailCount : 0) * 40)));
    const dominantBin = hueBins.indexOf(Math.max(...hueBins));
    const dominantHue = dominantBin * 15 + 7.5;
    const hasAccent = chroma / count > 0.012;

    const ranked = gradients.map((gradient) => {
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
    return { ranked, grain, dominantHue, luminance: sourceLuminance, hasAccent };
  } catch {
    return null;
  }
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const angle = ((hue % 360) + 360) % 360;
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  const channel = (shift: number) => {
    const segment = (shift + angle / 30) % 12;
    const value = lightness - amplitude * Math.max(-1, Math.min(segment - 3, 9 - segment, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function generateMeshDesignForMedia(match: Pick<MediaMatch<unknown>, "dominantHue" | "luminance" | "hasAccent">, variation: number): MeshGradientDesign {
  const hue = (match.hasAccent ? match.dominantHue : match.luminance > 0.5 ? 220 : 35) + ((variation % 3) - 1) * 18;
  const lightMedia = match.luminance > 0.48;
  const saturation = match.hasAccent ? 0.68 : 0.4;
  return {
    colors: [
      hslToHex(hue, 0.3, lightMedia ? 0.14 : 0.73),
      hslToHex(hue + 180, saturation, lightMedia ? 0.49 : 0.43),
      hslToHex(hue + 22, saturation * 0.8, lightMedia ? 0.38 : 0.37),
      hslToHex(hue + 145, saturation * 0.65, lightMedia ? 0.69 : 0.64),
    ],
    distortion: 0.48,
    swirl: 0.28,
    grainMixer: 0,
    grainOverlay: 0,
    speed: 0.25,
    scale: 1,
    rotation: (variation * 32) % 360,
    offsetX: 0,
    offsetY: 0,
  };
}
