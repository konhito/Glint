import { create } from "zustand";

export type BackgroundMode = "gradient" | "mesh" | "solid" | "image" | "shader" | "blob" | "saved-mesh";
export type BackgroundEffect = "none" | "blur-vignette" | "soft-glow";
export type WindowFrame =
  | "none" | "arc" | "stack-light" | "stack-dark" | "mac-light" | "mac-dark"
  | "mac-subtle" | "mac-adaptive" | "browser" | "eclipse" | "silver-back"
  | "shadow-back" | "windows-light" | "windows-dark" | "shortboard" | "ruler" | "emotion";
export type SourceKind = "image" | "video";
export type BackgroundPattern = "none" | "circles" | "waves" | "dots" | "harmony" | "grid" | "sight" | "chimes" | "diamonds" | "confetti" | "atmosphere";
export type PatternBlend = "source-over" | "overlay" | "screen" | "multiply" | "darken";
export type CanvasPosition = "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";
export type ShadowStyle = "soft" | "hard" | "glow" | "long" | "none";

export type EditorState = {
  sourceUrl: string;
  sourceName: string;
  sourceKind: SourceKind;
  sourceDuration: number;
  backgroundMode: BackgroundMode;
  backgroundEffect: BackgroundEffect;
  backgroundImageUrl: string;
  savedMeshDesignId: string;
  solidColor: string;
  gradientId: string;
  gradientAngle: number;
  customGradientColors: [string, string];
  mood: string;
  outputPresetId: string;
  frame: WindowFrame;
  position: CanvasPosition;
  rotation: number;
  tiltX: number;
  tiltY: number;
  radius: number;
  scale: number;
  inset: number;
  insetColor: string;
  insetStyle: "solid" | "glass";
  shadowStyle: ShadowStyle;
  shadowBlur: number;
  shadowOffset: number;
  shadowColor: string;
  shadowOpacity: number;
  grain: number;
  pattern: BackgroundPattern;
  patternOpacity: number;
  patternSize: number;
  patternBlur: number;
  patternBlend: PatternBlend;
  patternColors: [string, string];
  patternSeed: number;
  motionEnabled: boolean;
  motionPreset: "aurora" | "orbit" | "ribbons" | "silk";
  motionSpeed: number;
  motionDepth: number;
  motionInteractive: boolean;
};

export const DEFAULT_EDITOR: EditorState = {
  sourceUrl: "",
  sourceName: "",
  sourceKind: "image",
  sourceDuration: 0,
  backgroundMode: "blob",
  backgroundEffect: "none",
  backgroundImageUrl: "",
  savedMeshDesignId: "",
  solidColor: "#7861ee",
  gradientId: "mesh-1",
  gradientAngle: 135,
  customGradientColors: ["#ff82c2", "#ffe457"],
  mood: "Mesh",
  outputPresetId: "x-post",
  frame: "none",
  position: "center",
  rotation: 0,
  tiltX: 0,
  tiltY: 0,
  radius: 18,
  scale: 100,
  inset: 0,
  insetColor: "#ffe457",
  insetStyle: "solid",
  shadowStyle: "soft",
  shadowBlur: 28,
  shadowOffset: 13,
  shadowColor: "#03030b",
  shadowOpacity: 55,
  grain: 0,
  pattern: "none",
  patternOpacity: 38,
  patternSize: 72,
  patternBlur: 0,
  patternBlend: "source-over",
  patternColors: ["#fff4d4", "#1b1138"],
  patternSeed: 1,
  motionEnabled: true,
  motionPreset: "aurora",
  motionSpeed: 35,
  motionDepth: 48,
  motionInteractive: true,
};

export const useEditorStore = create<EditorState>(() => DEFAULT_EDITOR);
