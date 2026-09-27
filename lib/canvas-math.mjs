export function fitImage(sourceWidth, sourceHeight, maxWidth, maxHeight, scale = 1) {
  if ([sourceWidth, sourceHeight, maxWidth, maxHeight].some((value) => !Number.isFinite(value) || value <= 0)) {
    return { width: 0, height: 0 };
  }
  const ratio = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight) * Math.min(1.5, Math.max(0.3, scale));
  return { width: Math.round(sourceWidth * ratio), height: Math.round(sourceHeight * ratio) };
}
