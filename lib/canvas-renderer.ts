import { GRADIENTS } from "@/lib/gradients";
import type { EditorState, WindowFrame } from "@/lib/editor-store";
import { fitImage } from "@/lib/canvas-math.mjs";

let grainTile: HTMLCanvasElement | null = null;
let glassBackdrop: HTMLCanvasElement | null = null;
let effectBackdrop: HTMLCanvasElement | null = null;
type ImageSource = HTMLImageElement | HTMLVideoElement;
type Pointer = { x: number; y: number };
export const EXPORT_PIXEL_RATIO = 2;

function rgba(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const normalized = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  const number = Number.parseInt(normalized, 16);
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
}

function drawCover(ctx: CanvasRenderingContext2D, image: ImageSource, width: number, height: number) {
  const sourceWidth = image instanceof HTMLVideoElement ? image.videoWidth : image.naturalWidth;
  const sourceHeight = image instanceof HTMLVideoElement ? image.videoHeight : image.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawMesh(ctx: CanvasRenderingContext2D, colors: string[], width: number, height: number, state: EditorState, time: number, pointer: Pointer, overlay = false) {
  const palette = colors.length > 1 ? colors : ["#11132a", "#7f47f4", "#e747cf", "#55a4ff"];
  if (!overlay) { ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, width, height); }
  const base = [[0.14, 0.18], [0.84, 0.14], [0.82, 0.84], [0.16, 0.82], [0.5, 0.5]];
  const t = time * (0.12 + state.motionSpeed / 140);
  if (state.motionPreset === "silk") {
    if (!overlay) { ctx.fillStyle = "#070809"; ctx.fillRect(0, 0, width, height); }
    const streaks = ["#f5f5f5", "#bfc3c8", "#ffffff", "#8d9299"];
    streaks.forEach((color, index) => {
      const x = width * (0.06 + index * 0.3 + Math.sin(t * 0.65 + index) * 0.05 + (pointer.x - 0.5) * (state.motionInteractive ? 0.08 : 0));
      const y = height * (0.13 + index * 0.22 + Math.cos(t * 0.5 + index * 1.3) * 0.1 + (pointer.y - 0.5) * (state.motionInteractive ? 0.06 : 0));
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.7 + Math.sin(t + index) * 0.08); ctx.scale(1, 0.23);
      ctx.filter = `blur(${Math.min(width, height) * 0.035}px)`;
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 0.43);
      gradient.addColorStop(0, rgba(color, overlay ? 0.3 : 0.74));
      gradient.addColorStop(0.38, rgba(color, overlay ? 0.16 : 0.43));
      gradient.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(0, 0, width * 0.43, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    });
    return;
  }
  palette.slice(1).forEach((color, index) => {
    const [startX, startY] = base[index % base.length];
    let dx = Math.sin(t + index * 1.7) * 0.1;
    let dy = Math.cos(t * 0.8 + index * 2) * 0.11;
    if (state.motionPreset === "orbit") {
      dx = Math.cos(t + index * 1.5) * 0.14;
      dy = Math.sin(t + index * 1.5) * 0.14;
    } else if (state.motionPreset === "ribbons") {
      dx = Math.sin(t * 0.55 + index * 1.9) * 0.17;
      dy = Math.sin(t * 0.7 + index * 0.8) * 0.08;
    }
    const follow = state.motionInteractive ? 0.16 : 0;
    const x = width * (startX + dx + (pointer.x - 0.5) * follow);
    const y = height * (startY + dy + (pointer.y - 0.5) * follow);
    const radius = Math.max(width, height) * (0.45 + state.motionDepth / 300);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, rgba(color, overlay ? 0.64 : 0.96));
    gradient.addColorStop(0.42, rgba(color, overlay ? 0.32 : 0.58));
    gradient.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  });
}

function drawBackground(ctx: CanvasRenderingContext2D, state: EditorState, backgroundImage: HTMLImageElement | null, backgroundSceneCanvas: HTMLCanvasElement | null, width: number, height: number, time: number, pointer: Pointer) {
  const preset = state.gradientId === "custom" ? { kind: "linear" as const, colors: state.customGradientColors } : GRADIENTS.find((item) => item.id === state.gradientId) ?? GRADIENTS[0];
  if (state.backgroundMode === "shader" || state.backgroundMode === "blob" || state.backgroundMode === "saved-mesh") {
    ctx.fillStyle = state.backgroundMode === "blob" ? "#22ff7e" : state.backgroundMode === "saved-mesh" ? "#15131b" : "#10191c";
    ctx.fillRect(0, 0, width, height);
    if (backgroundSceneCanvas?.width && backgroundSceneCanvas.height) ctx.drawImage(backgroundSceneCanvas, 0, 0, width, height);
  } else if (state.backgroundMode === "solid") {
    ctx.fillStyle = state.solidColor;
    ctx.fillRect(0, 0, width, height);
  } else if (state.backgroundMode === "image" && backgroundImage?.complete && backgroundImage.naturalWidth) {
    drawCover(ctx, backgroundImage, width, height);
  } else if (state.backgroundMode === "mesh" || preset.kind === "mesh") {
    drawMesh(ctx, preset.colors, width, height, state, state.motionEnabled ? time : 0, pointer);
  } else {
    if (preset.kind === "radial") {
      const gradient = ctx.createRadialGradient(width * 0.3, height * 0.25, 0, width * 0.52, height * 0.52, Math.max(width, height));
      preset.colors.forEach((color, index) => gradient.addColorStop(index / (preset.colors.length - 1), color));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    } else {
      const angle = ((state.gradientAngle - 90) * Math.PI) / 180;
      const reach = Math.hypot(width, height) / 2;
      const gradient = ctx.createLinearGradient(width / 2 - Math.cos(angle) * reach, height / 2 - Math.sin(angle) * reach, width / 2 + Math.cos(angle) * reach, height / 2 + Math.sin(angle) * reach);
      preset.colors.forEach((color, index) => gradient.addColorStop(index / (preset.colors.length - 1), color));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  }

  // Motion is a background layer, even when the user picked a photo as the base.
  if (state.motionEnabled && (state.backgroundMode === "image" || state.backgroundMode === "solid" || (state.backgroundMode === "gradient" && preset.kind !== "mesh"))) {
    ctx.save();
    ctx.globalAlpha = state.backgroundMode === "image" ? 0.52 : state.backgroundMode === "gradient" ? 0.28 : 0.75;
    drawMesh(ctx, preset.colors, width, height, state, time, pointer, true);
    ctx.restore();
  }
}

function drawBackgroundEffect(ctx: CanvasRenderingContext2D, state: EditorState, width: number, height: number, time: number) {
  if (state.backgroundEffect === "none") return;
  const radius = Math.max(12, Math.round(Math.min(width, height) * 0.035));
  if (state.backgroundEffect === "blur-vignette") {
    effectBackdrop ??= document.createElement("canvas");
    if (effectBackdrop.width !== width) effectBackdrop.width = width;
    if (effectBackdrop.height !== height) effectBackdrop.height = height;
    effectBackdrop.getContext("2d")?.drawImage(ctx.canvas, 0, 0, width, height);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(effectBackdrop, -radius, -radius, width + radius * 2, height + radius * 2);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.18, width / 2, height / 2, Math.max(width, height) * 0.72);
    vignette.addColorStop(0, "rgba(7, 8, 15, 0)");
    vignette.addColorStop(0.64, "rgba(7, 8, 15, 0.08)");
    vignette.addColorStop(1, "rgba(7, 8, 15, 0.62)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    return;
  }

  const preset = state.gradientId === "custom" ? state.customGradientColors : (GRADIENTS.find((item) => item.id === state.gradientId)?.colors ?? GRADIENTS[0].colors);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.filter = `blur(${radius * 1.3}px)`;
  preset.slice(1).forEach((color, index) => {
    const x = width * (0.18 + index * 0.28 + Math.sin(time * 0.35 + index) * 0.035);
    const y = height * (index % 2 ? 0.76 : 0.24);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, Math.max(width, height) * 0.38);
    glow.addColorStop(0, rgba(color, 0.48));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  });
  ctx.restore();
}

function drawPattern(ctx: CanvasRenderingContext2D, state: EditorState, width: number, height: number) {
  if (state.pattern === "none" || state.patternOpacity <= 0) return;
  const size = Math.max(18, state.patternSize * Math.min(width, height) / 500);
  const [primary, secondary] = state.patternColors;
  ctx.save();
  ctx.globalAlpha = state.patternOpacity / 100;
  ctx.globalCompositeOperation = state.patternBlend;
  if (state.patternBlur) ctx.filter = `blur(${state.patternBlur}px)`;
  ctx.strokeStyle = primary;
  ctx.fillStyle = primary;
  ctx.lineWidth = Math.max(1, size * 0.018);

  if (state.pattern === "dots" || state.pattern === "circles" || state.pattern === "diamonds" || state.pattern === "confetti") {
    const rows = Math.ceil(height / size) + 1;
    const cols = Math.ceil(width / size) + 1;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const x = col * size + (row % 2) * size / 2;
      const y = row * size;
      if (state.pattern === "dots") {
        ctx.beginPath(); ctx.arc(x, y, size * 0.045, 0, Math.PI * 2); ctx.fill();
      } else if (state.pattern === "circles") {
        ctx.beginPath(); ctx.arc(x, y, size * 0.31, 0, Math.PI * 2); ctx.stroke();
      } else if (state.pattern === "diamonds") {
        ctx.beginPath(); ctx.moveTo(x, y - size * 0.22); ctx.lineTo(x + size * 0.22, y); ctx.lineTo(x, y + size * 0.22); ctx.lineTo(x - size * 0.22, y); ctx.closePath(); ctx.stroke();
      } else {
        const n = Math.abs(Math.sin((row * 131 + col * 57 + state.patternSeed) * 11.7));
        ctx.save(); ctx.translate(x, y); ctx.rotate(n * Math.PI);
        ctx.fillStyle = n > 0.5 ? primary : secondary;
        ctx.fillRect(-size * 0.08, -size * 0.03, size * (0.08 + n * 0.16), size * 0.06);
        ctx.restore();
      }
    }
  } else if (state.pattern === "grid") {
    for (let x = 0; x <= width; x += size) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y <= height; y += size) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  } else if (state.pattern === "waves") {
    const extent = Math.hypot(width, height);
    const spacing = Math.max(12, size * 0.22);
    const amplitude = spacing * 0.26;
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 4);
    ctx.lineWidth = Math.max(1, size * 0.025);
    for (let row = -extent; row <= extent; row += spacing) {
      ctx.beginPath();
      for (let x = -extent; x <= extent; x += Math.max(4, size / 12)) {
        const y = row + Math.sin((x / size) * 1.4 + row / spacing * 0.35) * amplitude;
        if (x === -extent) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  } else if (state.pattern === "harmony") {
    for (let row = -1; row < height / size + 2; row++) {
      ctx.beginPath();
      for (let x = -size; x <= width + size; x += size / 5) {
        const y = row * size + Math.sin(x / size + row) * size * 0.1;
        if (x === -size) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (state.pattern === "sight" || state.pattern === "chimes") {
    const step = state.pattern === "sight" ? size * 0.7 : size * 1.5;
    for (let x = step; x < width; x += step) for (let y = step; y < height; y += step) {
      ctx.beginPath();
      if (state.pattern === "sight") { for (let r = 0; r < 3; r++) ctx.arc(x, y, size * (0.12 + r * 0.09), 0, Math.PI * 2); }
      else { ctx.arc(x, y, size * 0.27, Math.PI, 0); ctx.moveTo(x - size * 0.27, y); ctx.lineTo(x - size * 0.27, y + size * 0.3); ctx.moveTo(x + size * 0.27, y); ctx.lineTo(x + size * 0.27, y + size * 0.3); }
      ctx.stroke();
    }
  } else if (state.pattern === "atmosphere") {
    for (let index = 0; index < 9; index++) {
      const x = width * (0.08 + Math.abs(Math.sin(index * 27 + state.patternSeed)) * 0.84);
      const y = height * (0.08 + Math.abs(Math.cos(index * 18 + state.patternSeed)) * 0.84);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 1.6);
      glow.addColorStop(0, rgba(index % 2 ? primary : secondary, 0.55));
      glow.addColorStop(1, rgba(primary, 0));
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, size * 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function getGrainTile() {
  if (grainTile) return grainTile;
  grainTile = document.createElement("canvas");
  grainTile.width = 160;
  grainTile.height = 160;
  const context = grainTile.getContext("2d");
  if (!context) return null;
  const pixels = context.createImageData(grainTile.width, grainTile.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const shade = Math.random() > 0.5 ? 255 : 0;
    pixels.data[index] = shade;
    pixels.data[index + 1] = shade;
    pixels.data[index + 2] = shade;
    pixels.data[index + 3] = 34;
  }
  context.putImageData(pixels, 0, 0);
  return grainTile;
}

const darkFrames: WindowFrame[] = ["stack-dark", "mac-dark", "eclipse", "windows-dark"];
const macFrames: WindowFrame[] = ["mac-light", "mac-dark", "mac-subtle", "mac-adaptive"];

function drawHeader(ctx: CanvasRenderingContext2D, frame: WindowFrame, x: number, y: number, width: number, height: number) {
  if (frame === "none" || frame === "arc") return;
  const dark = darkFrames.includes(frame);
  const headerColor = frame === "mac-adaptive" ? "#f4f1ec" : frame === "mac-subtle" ? "#e9e9e9" : dark ? "#272832" : "#f6f5f2";
  ctx.fillStyle = headerColor;
  ctx.fillRect(x, y, width, height);
  if (macFrames.includes(frame) || frame === "stack-light" || frame === "stack-dark") {
    const colors = dark ? ["#ff6961", "#ffc34d", "#39ca6e"] : ["#fa625c", "#f6bd3b", "#35c759"];
    colors.forEach((color, index) => {
      ctx.beginPath(); ctx.fillStyle = color;
      ctx.arc(x + height * (0.38 + index * 0.39), y + height / 2, Math.max(2.4, height * 0.11), 0, Math.PI * 2); ctx.fill();
    });
  } else if (frame === "browser" || frame === "shortboard") {
    ctx.fillStyle = dark ? "#34353a" : "#e4e3e0";
    ctx.beginPath(); ctx.roundRect(x + width * 0.23, y + height * 0.2, width * 0.56, height * 0.62, height * 0.23); ctx.fill();
  } else if (frame === "windows-light" || frame === "windows-dark") {
    ctx.strokeStyle = dark ? "#c9c8cc" : "#58575b"; ctx.lineWidth = Math.max(1, height * 0.035);
    [width - height * 1.05, width - height * 0.69, width - height * 0.34].forEach((offset, index) => {
      if (index === 2) { ctx.beginPath(); ctx.moveTo(x + offset - height * 0.08, y + height * 0.4); ctx.lineTo(x + offset + height * 0.08, y + height * 0.58); ctx.moveTo(x + offset + height * 0.08, y + height * 0.4); ctx.lineTo(x + offset - height * 0.08, y + height * 0.58); ctx.stroke(); }
      else ctx.strokeRect(x + offset - height * 0.1, y + height * 0.36, height * 0.2, height * 0.2);
    });
  } else if (frame === "ruler") {
    ctx.strokeStyle = dark ? "#ddd" : "#42413e"; ctx.lineWidth = 1;
    for (let offset = height * 0.4; offset < width; offset += height * 0.22) { ctx.beginPath(); ctx.moveTo(x + offset, y); ctx.lineTo(x + offset, y + height * (offset % 2 ? 0.45 : 0.7)); ctx.stroke(); }
  } else if (frame === "emotion") {
    ctx.fillStyle = "#fa77a8"; ctx.font = `700 ${Math.max(11, height * 0.6)}px Arial`; ctx.textAlign = "right";
    ctx.fillText("♡  ✦  ☺", x + width - height * 0.2, y + height * 0.69);
  } else if (frame === "eclipse") {
    ctx.fillStyle = "#b8bac4"; ctx.beginPath(); ctx.arc(x + height * 0.4, y + height / 2, height * 0.15, 0, Math.PI * 2); ctx.fill();
  }
}

function drawSource(ctx: CanvasRenderingContext2D, state: EditorState, source: ImageSource, backdrop: HTMLCanvasElement | null, width: number, height: number) {
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;
  const header = state.frame === "none" || state.frame === "arc" ? 0 : Math.max(32, Math.round(Math.min(width, height) * 0.056));
  const image = fitImage(sourceWidth, sourceHeight, width, Math.max(1, height - header), state.scale / 100);
  if (!image.width || !image.height) return;
  const inset = Math.round(Math.min(width, height) * state.inset / 100);
  const framePadding = state.frame === "arc" ? Math.max(10, Math.round(Math.min(width, height) * 0.02)) : 0;
  const cardWidth = image.width + (inset + framePadding) * 2;
  const cardHeight = image.height + (inset + framePadding) * 2 + header;
  const imageRadius = Math.min(state.radius, image.width / 2, image.height / 2);
  const insetRadius = Math.min(imageRadius + inset, (image.width + inset * 2) / 2, (image.height + inset * 2) / 2);
  const marginX = width * 0.04;
  const marginY = height * 0.04;
  const horizontal = state.position.endsWith("left") || state.position === "left" ? marginX + cardWidth / 2 : state.position.endsWith("right") || state.position === "right" ? width - marginX - cardWidth / 2 : width / 2;
  const vertical = state.position.startsWith("top") ? marginY + cardHeight / 2 : state.position.startsWith("bottom") ? height - marginY - cardHeight / 2 : height / 2;
  const left = -cardWidth / 2;
  const top = -cardHeight / 2;
  const radius = state.frame === "arc" ? Math.min(56, Math.round(Math.min(width, height) * 0.075)) : Math.min(24, Math.round(Math.min(width, height) * 0.03));
  const rotation = state.rotation * Math.PI / 180;

  ctx.save();
  ctx.translate(horizontal, vertical);
  ctx.rotate(rotation);
  ctx.transform(1, -state.tiltX / 160, -state.tiltY / 160, 1, 0, 0);
  if (state.frame === "stack-light" || state.frame === "stack-dark") {
    ctx.fillStyle = state.frame === "stack-dark" ? "#fafafa22" : "#11111135";
    ctx.beginPath(); ctx.roundRect(left + 12, top - 12, cardWidth, cardHeight, radius); ctx.fill();
    ctx.fillStyle = state.frame === "stack-dark" ? "#fafafa50" : "#11111170";
    ctx.beginPath(); ctx.roundRect(left + 6, top - 6, cardWidth, cardHeight, radius); ctx.fill();
  }
  const softShadow = state.shadowStyle === "soft";
  const blur = state.shadowStyle === "none" ? 0 : state.shadowStyle === "hard" ? 0 : state.shadowStyle === "glow" ? Math.max(state.shadowBlur, 24) : state.shadowStyle === "long" ? Math.max(state.shadowBlur, 30) : state.shadowBlur;
  const offset = state.shadowStyle === "hard" ? Math.max(state.shadowOffset, 10) : state.shadowStyle === "long" ? Math.max(state.shadowOffset, 36) : state.shadowOffset;
  const shadowColor = state.shadowStyle === "glow" ? state.insetColor : state.shadowColor;
  ctx.shadowColor = state.shadowStyle === "none" ? "transparent" : rgba(shadowColor, state.shadowOpacity / 100);
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = softShadow ? 0 : offset * (rotation < 0 ? -1 : 1);
  ctx.shadowOffsetY = offset;
  const surface = state.frame === "none" ? state.insetColor : state.frame === "arc" ? "#f5f4ef" : state.frame === "silver-back" ? "#bfc1c7" : state.frame === "eclipse" ? "#08090d" : state.frame === "shadow-back" ? "#4e4e52" : darkFrames.includes(state.frame) ? "#17181c" : state.frame === "emotion" ? "#f8d6e4" : "#f2f1ed";
  ctx.fillStyle = surface;
  ctx.beginPath(); ctx.roundRect(left, top, cardWidth, cardHeight, state.frame === "none" ? insetRadius : radius); ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  if (state.frame !== "none") {
    ctx.save(); ctx.beginPath(); ctx.roundRect(left, top, cardWidth, cardHeight, radius); ctx.clip();
    drawHeader(ctx, state.frame, left, top, cardWidth, header);
    ctx.restore();
  }
  if (inset > 0) {
    const bodyX = left + framePadding;
    const bodyY = top + header + framePadding;
    const bodyWidth = cardWidth - framePadding * 2;
    const bodyHeight = image.height + inset * 2;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(bodyX, bodyY, bodyWidth, bodyHeight, insetRadius); ctx.clip();
    if (state.insetStyle === "glass") {
      // Blur only the captured background; the uploaded media is drawn sharply below.
      if (backdrop) {
        ctx.save();
        ctx.setTransform(ctx.canvas.width / width, 0, 0, ctx.canvas.height / height, 0, 0);
        ctx.filter = `blur(${Math.max(7, Math.round(Math.min(width, height) * 0.018))}px)`;
        ctx.drawImage(backdrop, 0, 0, width, height);
        ctx.restore();
      }
      ctx.fillStyle = rgba(state.insetColor, 0.22);
      ctx.fillRect(bodyX, bodyY, bodyWidth, bodyHeight);
      const gloss = ctx.createLinearGradient(bodyX, bodyY, bodyX + bodyWidth, bodyY + bodyHeight);
      gloss.addColorStop(0, "rgba(255,255,255,0.42)");
      gloss.addColorStop(0.4, "rgba(255,255,255,0.06)");
      gloss.addColorStop(1, "rgba(0,0,0,0.2)");
      ctx.fillStyle = gloss;
      ctx.fillRect(bodyX, bodyY, bodyWidth, bodyHeight);
      ctx.strokeStyle = "rgba(255,255,255,0.48)";
      ctx.lineWidth = Math.max(1, Math.round(Math.min(width, height) / 700));
      ctx.beginPath(); ctx.roundRect(bodyX + 0.5, bodyY + 0.5, bodyWidth - 1, bodyHeight - 1, insetRadius); ctx.stroke();
    } else {
      ctx.fillStyle = state.insetColor;
      ctx.fillRect(left, bodyY, cardWidth, bodyHeight);
    }
    ctx.restore();
  }
  if (state.frame === "ruler") {
    ctx.fillStyle = "#777"; ctx.fillRect(left, top + header, cardWidth, 2);
  }
  const x = left + framePadding + inset;
  const y = top + header + framePadding + inset;
  ctx.beginPath();
  ctx.roundRect(x, y, image.width, image.height, imageRadius);
  ctx.clip();
  // Imported pixels are drawn after every background treatment and are never grained or patterned over.
  ctx.drawImage(source, x, y, image.width, image.height);
  ctx.restore();
}

export function renderCanvas(canvas: HTMLCanvasElement, state: EditorState, source: ImageSource | null, backgroundImage: HTMLImageElement | null, width: number, height: number, time = 0, pointer: Pointer = { x: 0.5, y: 0.5 }, backgroundSceneCanvas: HTMLCanvasElement | null = null, pixelRatio = 1) {
  if (canvas.width !== width * pixelRatio) canvas.width = width * pixelRatio;
  if (canvas.height !== height * pixelRatio) canvas.height = height * pixelRatio;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawBackground(ctx, state, backgroundImage, backgroundSceneCanvas, width, height, time, pointer);
  drawBackgroundEffect(ctx, state, width, height, time);
  drawPattern(ctx, state, width, height);
  if (state.grain > 0) {
    const tile = getGrainTile();
    const pattern = tile && ctx.createPattern(tile, "repeat");
    if (pattern) {
      ctx.save(); ctx.globalAlpha = state.grain / 100; ctx.fillStyle = pattern; ctx.fillRect(0, 0, width, height); ctx.restore();
    }
  }
  if (source) {
    let backdrop: HTMLCanvasElement | null = null;
    if (state.insetStyle === "glass" && state.inset > 0) {
      glassBackdrop ??= document.createElement("canvas");
      if (glassBackdrop.width !== width) glassBackdrop.width = width;
      if (glassBackdrop.height !== height) glassBackdrop.height = height;
      glassBackdrop.getContext("2d")?.drawImage(canvas, 0, 0, width, height);
      backdrop = glassBackdrop;
    }
    drawSource(ctx, state, source, backdrop, width, height);
  }
}
