export type MeshGradientDesign = {
  colors: string[];
  distortion: number;
  swirl: number;
  grainMixer: number;
  grainOverlay: number;
  speed: number;
  scale: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
};

export type SavedMeshGradient = { id: string; name: string; design: MeshGradientDesign };

export const MESH_GRADIENT_STORAGE_KEY = "neo.mesh-gradient.designs.v1";

const ranges: [keyof Omit<MeshGradientDesign, "colors">, number, number][] = [
  ["distortion", 0, 1], ["swirl", 0, 1], ["grainMixer", 0, 1], ["grainOverlay", 0, 1],
  ["speed", 0, 1], ["scale", 0.01, 4], ["rotation", 0, 360], ["offsetX", -1, 1], ["offsetY", -1, 1],
];

export function isMeshGradientDesign(value: unknown): value is MeshGradientDesign {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return Array.isArray(item.colors) && item.colors.length >= 2 && item.colors.length <= 10
    && item.colors.every((color) => typeof color === "string" && /^#[\da-f]{6}$/i.test(color))
    && ranges.every(([key, min, max]) => typeof item[key] === "number" && Number.isFinite(item[key]) && (item[key] as number) >= min && (item[key] as number) <= max);
}

export function cloneMeshGradientDesign(design: MeshGradientDesign): MeshGradientDesign {
  return { ...design, colors: [...design.colors] };
}

export function readSavedMeshGradients(): SavedMeshGradient[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(MESH_GRADIENT_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is SavedMeshGradient => item && typeof item.id === "string" && typeof item.name === "string" && isMeshGradientDesign(item.design))
      : [];
  } catch {
    return [];
  }
}
