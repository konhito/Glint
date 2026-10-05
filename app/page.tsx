"use client";

import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  ArrowDownToLine, BookmarkPlus, ChevronDown, Copy, Film, ImagePlus,
  LockKeyhole, MousePointer2, Pause, Play, Plus, SlidersHorizontal, Trash2, X,
  Sparkles, Upload, WandSparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cssForGradient, GRADIENTS, MOODS, OUTPUT_PRESETS } from "@/lib/gradients";
import { EXPORT_PIXEL_RATIO, renderCanvas } from "@/lib/canvas-renderer";
import { useEditorStore, type EditorState, type WindowFrame } from "@/lib/editor-store";
import { MESH_GRADIENT_STORAGE_KEY, readSavedMeshGradients, type SavedMeshGradient } from "@/lib/mesh-designs";
import { recordCanvasVideo } from "@/lib/video-export";
import { renderCanvasGif } from "@/lib/gif-export";

type InspectorTab = "Edit" | "Effects" | "Motion" | "Saved";
type BackgroundPickerTab = "Looks" | "Gradient" | "Solid" | "Image" | "Unsplash";
type VideoRender = { name: string; url: string; size: string; extension: string; pixelRatio?: number };
type SavedEditorDesign = { id: string; name: string; sourceName: string; settings: Omit<EditorState, "sourceUrl" | "sourceName" | "sourceKind" | "sourceDuration" | "backgroundImageUrl"> };

const inspectorTabs: InspectorTab[] = ["Edit", "Effects", "Motion", "Saved"];
const EDITOR_DESIGNS_KEY = "neo.screenshot-designs.v1";

function readSavedEditorDesigns(): SavedEditorDesign[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(EDITOR_DESIGNS_KEY) ?? "[]");
    return Array.isArray(items) ? items.filter((item): item is SavedEditorDesign => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.sourceName === "string" && item.settings && typeof item.settings === "object") : [];
  } catch {
    return [];
  }
}

const ShaderBackground = dynamic(() => import("@/components/shader-background").then((module) => module.ShaderBackground), { ssr: false });
const BlobBackground = dynamic(() => import("@/components/blob-background").then((module) => module.BlobBackground), { ssr: false });
const MeshGradientBackground = dynamic(() => import("@/components/mesh-gradient-background").then((module) => module.MeshGradientBackground), { ssr: false });

const frames: { id: WindowFrame; label: string }[] = [
  { id: "none", label: "None" }, { id: "arc", label: "Arc" },
  { id: "stack-light", label: "Stack Light" }, { id: "stack-dark", label: "Stack Dark" },
  { id: "mac-light", label: "macOS Light" }, { id: "mac-dark", label: "macOS Dark" },
  { id: "mac-subtle", label: "macOS Subtle" }, { id: "mac-adaptive", label: "macOS Adaptive" },
  { id: "browser", label: "Browser" }, { id: "eclipse", label: "Eclipse" },
  { id: "silver-back", label: "Silver Back" }, { id: "shadow-back", label: "Shadow Back" },
  { id: "windows-light", label: "Windows Light" }, { id: "windows-dark", label: "Windows Dark" },
  { id: "shortboard", label: "Shortboard" }, { id: "ruler", label: "Ruler" }, { id: "emotion", label: "Emotion" },
];

const patterns = ["none", "circles", "waves", "dots", "harmony", "grid", "sight", "chimes", "diamonds", "confetti", "atmosphere"] as const;
const backgroundEffects = [{ id: "none", title: "Clean", description: "Keep the backdrop crisp" }, { id: "blur-vignette", title: "Blur vignette", description: "Soft blur, feathered edges" }, { id: "soft-glow", title: "Soft glow", description: "Color bloom behind media" }] as const;
const positions = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"] as const;
const gradientDirections = [{ label: "Up", icon: "↑", angle: 0 }, { label: "Up right", icon: "↗", angle: 45 }, { label: "Right", icon: "→", angle: 90 }, { label: "Down right", icon: "↘", angle: 135 }, { label: "Down", icon: "↓", angle: 180 }, { label: "Down left", icon: "↙", angle: 225 }, { label: "Left", icon: "←", angle: 270 }, { label: "Up left", icon: "↖", angle: 315 }] as const;
const solidSwatches = ["#171714", "#f4f0e5", "#ffe457", "#ff82c2", "#8c6bff", "#59c7ea", "#6ecb8b", "#fa725c"];

function SelectControl({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="select-control"><span>{label}</span><select className="dark-select" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>;
}

function FramePreview({ frame, compact = false }: { frame: WindowFrame; compact?: boolean }) {
  return <span className={`frame-preview frame-preview-${frame}${compact ? " compact" : ""}`} aria-hidden="true">
    {frame !== "none" && frame !== "arc" && <span className="frame-preview-header"><i /><i /><i /><span /></span>}
    <span className="frame-preview-screen" />
  </span>;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("This file could not be read."));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("This file could not be read."));
    reader.readAsDataURL(file);
  });
}

function imageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("This image could not be opened."));
    image.src = url;
  });
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "screenshot";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function RangeControl({ label, value, min, max, suffix = "", onChange }: {
  label: string; value: number; min: number; max: number; suffix?: string; onChange: (value: number) => void;
}) {
  return (
    <label className="control-row">
      <span className="control-label">{label}<span className="control-value">{value}{suffix}</span></span>
      <input className="range-input" type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export default function Home() {
  const state = useEditorStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundSceneRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const backgroundRef = useRef<HTMLImageElement | null>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5 });
  const sourceObjectUrl = useRef("");
  const pickerRef = useRef<HTMLInputElement>(null);
  const backgroundPickerRef = useRef<HTMLInputElement>(null);
  const backgroundPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const rendersRef = useRef<VideoRender[]>([]);
  const [tab, setTab] = useState<InspectorTab>("Edit");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [renders, setRenders] = useState<VideoRender[]>([]);
  const [toast, setToast] = useState("");
  const [videoPaused, setVideoPaused] = useState(true);
  const [allLooks, setAllLooks] = useState(true);
  const [framePickerOpen, setFramePickerOpen] = useState(false);
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);
  const [backgroundPickerTab, setBackgroundPickerTab] = useState<BackgroundPickerTab>("Gradient");
  const [tiltDragging, setTiltDragging] = useState(false);
  const [savedDesigns, setSavedDesigns] = useState<SavedEditorDesign[]>([]);
  const [savedMeshGradients, setSavedMeshGradients] = useState<SavedMeshGradient[]>([]);
  const [meshGradientsLoaded, setMeshGradientsLoaded] = useState(false);
  const [designName, setDesignName] = useState("");

  const preset = OUTPUT_PRESETS.find((item) => item.id === state.outputPresetId) ?? OUTPUT_PRESETS[0];
  const looks = useMemo(() => allLooks ? GRADIENTS : GRADIENTS.filter((gradient) => gradient.mood === state.mood), [allLooks, state.mood]);
  const activeGradient = GRADIENTS.find((item) => item.id === state.gradientId) ?? GRADIENTS[0];
  const activeSavedMesh = savedMeshGradients.find((item) => item.id === state.savedMeshDesignId);
  const backgroundGradientCss = state.gradientId === "custom" ? `linear-gradient(${state.gradientAngle}deg, ${state.customGradientColors.join(", ")})` : cssForGradient(activeGradient);
  const gradientColorA = state.gradientId === "custom" ? state.customGradientColors[0] : activeGradient.colors[0];
  const gradientColorB = state.gradientId === "custom" ? state.customGradientColors[1] : activeGradient.colors[activeGradient.colors.length - 1];
  const update = <K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    if (key === "backgroundMode" && value !== "saved-mesh") {
      useEditorStore.setState({ backgroundMode: value as EditorState["backgroundMode"], savedMeshDesignId: "" });
      return;
    }
    useEditorStore.setState({ [key]: value } as Pick<EditorState, K>);
  };
  const setTiltFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const travel = Math.max(1, Math.min(rect.width, rect.height) / 2 - 10);
    const x = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / travel));
    const y = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / travel));
    const magnitude = Math.max(1, Math.hypot(x, y));
    useEditorStore.setState({ tiltX: -y / magnitude * 18, tiltY: x / magnitude * 18 });
  };
  const handleTiltKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 5 : 1;
    let { tiltX, tiltY } = state;
    if (event.key === "ArrowLeft") tiltY -= step;
    else if (event.key === "ArrowRight") tiltY += step;
    else if (event.key === "ArrowUp") tiltX += step;
    else if (event.key === "ArrowDown") tiltX -= step;
    else if (event.key === "Home") { tiltX = 0; tiltY = 0; }
    else return;
    event.preventDefault();
    useEditorStore.setState({ tiltX: Math.max(-18, Math.min(18, tiltX)), tiltY: Math.max(-18, Math.min(18, tiltY)) });
  };
  const handleInspectorTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, current: InspectorTab) => {
    let nextIndex = inspectorTabs.indexOf(current);
    if (event.key === "ArrowRight") nextIndex = (nextIndex + 1) % inspectorTabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (nextIndex - 1 + inspectorTabs.length) % inspectorTabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = inspectorTabs.length - 1;
    else return;
    event.preventDefault();
    const next = inspectorTabs[nextIndex];
    setTab(next);
    document.getElementById(`editor-tab-${next.toLowerCase()}`)?.focus();
  };
  const updateGradientColor = (index: 0 | 1, color: string) => {
    const colors: [string, string] = state.gradientId === "custom" ? [state.customGradientColors[0], state.customGradientColors[1]] : [gradientColorA, gradientColorB];
    colors[index] = color;
    update("customGradientColors", colors);
    update("gradientId", "custom");
    update("backgroundMode", "gradient");
    update("motionPreset", "aurora");
  };
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  };
  const clearRenders = () => {
    renders.forEach((item) => URL.revokeObjectURL(item.url));
    rendersRef.current = [];
    setRenders([]);
  };

  const paint = useCallback(() => {
    if (canvasRef.current) {
      const latest = useEditorStore.getState();
      const currentPreset = OUTPUT_PRESETS.find((item) => item.id === latest.outputPresetId) ?? OUTPUT_PRESETS[0];
      const currentSource = latest.sourceKind === "video" ? videoRef.current : imageRef.current;
      renderCanvas(canvasRef.current, latest, currentSource, backgroundRef.current, currentPreset.width, currentPreset.height, performance.now() / 1000, pointerRef.current, backgroundSceneRef.current?.querySelector("canvas") ?? null);
    }
  }, []);

  useEffect(() => {
    if (state.sourceKind !== "image" || !state.sourceUrl) {
      imageRef.current = null;
      paint();
      return;
    }
    let cancelled = false;
    imageFromUrl(state.sourceUrl).then((image) => {
      if (!cancelled) {
        imageRef.current = image;
        paint();
      }
    }).catch(() => !cancelled && notify("Could not load that image."));
    return () => { cancelled = true; };
  }, [state.sourceKind, state.sourceUrl, paint]);

  useEffect(() => {
    if (state.backgroundMode !== "image" || !state.backgroundImageUrl) {
      backgroundRef.current = null;
      paint();
      return;
    }
    let cancelled = false;
    imageFromUrl(state.backgroundImageUrl).then((image) => {
      if (!cancelled) {
        backgroundRef.current = image;
        paint();
      }
    }).catch(() => !cancelled && notify("Could not load that background."));
    return () => { cancelled = true; };
  }, [state.backgroundMode, state.backgroundImageUrl, paint]);

  useEffect(() => {
    if (busy) return;
    paint();
    if (!canvasRef.current) return;
    const video = videoRef.current;
    const animate = state.motionEnabled || (state.sourceKind === "video" && video && !videoPaused);
    if (!animate) return;
    let frame = 0;
    const draw = () => {
      paint();
      if (!busy) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [paint, state, videoPaused, busy]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.items ?? []).map((item) => item.getAsFile()).find((item) => item && (item.type.startsWith("image/") || item.type.startsWith("video/")));
      if (file) {
        event.preventDefault();
        void loadFile(file);
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  });

  useEffect(() => { rendersRef.current = renders; }, [renders]);
  useEffect(() => { setSavedDesigns(readSavedEditorDesigns()); }, []);
  useEffect(() => {
    const syncMeshGradients = (event?: StorageEvent) => {
      if (event && event.key !== MESH_GRADIENT_STORAGE_KEY && event.key !== null) return;
      setSavedMeshGradients(readSavedMeshGradients());
      setMeshGradientsLoaded(true);
    };
    syncMeshGradients();
    window.addEventListener("storage", syncMeshGradients);
    return () => window.removeEventListener("storage", syncMeshGradients);
  }, []);
  useEffect(() => {
    if (!meshGradientsLoaded || state.backgroundMode !== "saved-mesh" || activeSavedMesh) return;
    useEditorStore.setState({ backgroundMode: "gradient", savedMeshDesignId: "" });
  }, [activeSavedMesh, meshGradientsLoaded, state.backgroundMode]);
  useEffect(() => {
    if (!framePickerOpen && !backgroundPickerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setFramePickerOpen(false); if (backgroundPickerOpen) closeBackgroundPicker(); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [backgroundPickerOpen, framePickerOpen]);
  useEffect(() => () => {
    if (sourceObjectUrl.current) URL.revokeObjectURL(sourceObjectUrl.current);
    rendersRef.current.forEach((item) => URL.revokeObjectURL(item.url));
  }, []);

  async function loadFile(file: File) {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return notify("Choose an image or video file.");
    if (file.type.startsWith("image/") && file.size > 80 * 1024 * 1024) return notify("Images need to be smaller than 80 MB.");
    if (file.type.startsWith("video/") && file.size > 300 * 1024 * 1024) return notify("Videos need to be smaller than 300 MB.");
    clearRenders();
    try {
      if (file.type.startsWith("video/")) {
        if (sourceObjectUrl.current) URL.revokeObjectURL(sourceObjectUrl.current);
        const url = URL.createObjectURL(file);
        sourceObjectUrl.current = url;
        imageRef.current = null;
        useEditorStore.setState({ sourceUrl: url, sourceKind: "video", sourceName: file.name, sourceDuration: 0 });
        setVideoPaused(true);
      } else {
        const dataUrl = await readAsDataUrl(file);
        const image = await imageFromUrl(dataUrl);
        let finalUrl = dataUrl;
        if (Math.max(image.naturalWidth, image.naturalHeight) > 3600) {
          const scale = 3600 / Math.max(image.naturalWidth, image.naturalHeight);
          const target = document.createElement("canvas");
          target.width = Math.round(image.naturalWidth * scale);
          target.height = Math.round(image.naturalHeight * scale);
          const pica = (await import("pica")).default();
          await pica.resize(image, target, { quality: 3 });
          const resized = await pica.toBlob(target, file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.92);
          finalUrl = await readAsDataUrl(resized);
        }
        imageRef.current = finalUrl === dataUrl ? image : await imageFromUrl(finalUrl);
        if (sourceObjectUrl.current) URL.revokeObjectURL(sourceObjectUrl.current);
        sourceObjectUrl.current = "";
        useEditorStore.setState({ sourceUrl: finalUrl, sourceKind: "image", sourceName: file.name, sourceDuration: 0 });
      }
      notify("Added to your canvas — your file stays on this device.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "That file could not be opened.");
    }
  }

  async function loadDemoImage() {
    try {
      const image = await imageFromUrl("/sample-screen.svg");
      clearRenders();
      imageRef.current = image;
      useEditorStore.setState({ sourceUrl: "/sample-screen.svg", sourceKind: "image", sourceName: "sample-screen.svg", sourceDuration: 0 });
      notify("Demo screenshot added.");
    } catch {
      notify("Could not load the demo image.");
    }
  }

  async function loadBackground(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return notify("Backgrounds need to be an image.");
    if (file.size > 80 * 1024 * 1024) return notify("Background images need to be smaller than 80 MB.");
    try {
      const url = await readAsDataUrl(file);
      backgroundRef.current = await imageFromUrl(url);
      update("backgroundImageUrl", url);
      update("backgroundMode", "image");
      update("motionPreset", "aurora");
    } catch (error) {
      notify(error instanceof Error ? error.message : "That background could not be opened.");
    }
  }

  function renderImageForExport() {
    if (!imageRef.current) return null;
    const canvas = document.createElement("canvas");
    renderCanvas(canvas, state, imageRef.current, backgroundRef.current, preset.width, preset.height, performance.now() / 1000, pointerRef.current, backgroundSceneRef.current?.querySelector("canvas") ?? null, EXPORT_PIXEL_RATIO);
    return canvas;
  }

  async function exportPng() {
    const canvas = renderImageForExport();
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) download(blob, `${safeName(state.sourceName)}-${preset.id}@${EXPORT_PIXEL_RATIO}x.png`);
      else notify("PNG export failed. Try a smaller canvas size.");
    }, "image/png");
  }

  async function copyPng() {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return notify("Clipboard image copy is not supported in this browser.");
    const canvas = renderImageForExport();
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return notify("Could not prepare this image for copying.");
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        notify("Copied — ready to paste.");
      } catch {
        notify("Clipboard access needs a secure page and browser permission.");
      }
    }, "image/png");
  }

  async function renderSelectedVideo() {
    const video = videoRef.current;
    if (!video || busy) return;
    const canvas = document.createElement("canvas");
    const size = preset;
    const previewWasPlaying = !video.paused;
    setBusy(true);
    try {
      setProgress(`${size.short} · 0:00`);
      const blob = await recordCanvasVideo(canvas, video, state, backgroundRef.current, size, (seconds) => setProgress(`${size.short} · ${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`), backgroundSceneRef.current?.querySelector("canvas") ?? null, EXPORT_PIXEL_RATIO);
      const extension = blob.type.includes("mp4") ? "mp4" : "webm";
      const result = { name: size.name, url: URL.createObjectURL(blob), size: formatBytes(blob.size), extension, pixelRatio: EXPORT_PIXEL_RATIO };
      const previous = rendersRef.current.find((item) => item.name === size.name);
      if (previous) URL.revokeObjectURL(previous.url);
      const next = [...rendersRef.current.filter((item) => item.name !== size.name), result];
      rendersRef.current = next;
      setRenders(next);
      notify(`${size.name} video is ready to download.`);
      setTab("Motion");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Video export failed.");
    } finally {
      setBusy(false);
      setProgress("");
      if (canvasRef.current) renderCanvas(canvasRef.current, state, videoRef.current, backgroundRef.current, preset.width, preset.height, 0, undefined, backgroundSceneRef.current?.querySelector("canvas") ?? null);
      if (previewWasPlaying) void video.play().then(() => setVideoPaused(false)).catch(() => setVideoPaused(true));
      else setVideoPaused(true);
    }
  }

  async function renderMotionSet() {
  const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || busy || !state.motionEnabled) return;
    setBusy(true);
    clearRenders();
    try {
      for (const size of OUTPUT_PRESETS) {
        setProgress(`${size.short} · GIF 0%`);
        const blob = await renderCanvasGif(canvas, image, state, backgroundRef.current, size, (frame, total) => setProgress(`${size.short} · GIF ${Math.round(frame / total * 100)}%`), backgroundSceneRef.current?.querySelector("canvas") ?? null);
        setRenders((items) => [...items, { name: size.name, url: URL.createObjectURL(blob), size: formatBytes(blob.size), extension: "gif" }]);
      }
      notify("Four looping GIF sizes are ready to download.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "GIF export failed.");
    } finally {
      setBusy(false);
      setProgress("");
      paint();
    }
  }

  function chooseGradient(id: string) {
    const gradient = GRADIENTS.find((item) => item.id === id);
    if (!gradient) return;
    update("gradientId", gradient.id);
    update("mood", gradient.mood);
    update("gradientAngle", gradient.angle ?? 135);
    update("backgroundMode", gradient.kind === "mesh" ? "mesh" : "gradient");
    update("motionPreset", "aurora");
  }

  function applySavedMeshGradient(entry: SavedMeshGradient) {
    useEditorStore.setState({
      savedMeshDesignId: entry.id,
      backgroundMode: "saved-mesh",
      motionEnabled: entry.design.speed > 0,
      motionSpeed: Math.max(5, Math.round(entry.design.speed * 100)),
    });
  }

  function saveEditorDesign() {
    const settings = Object.fromEntries(Object.entries(state).filter(([key]) => !["sourceUrl", "sourceName", "sourceKind", "sourceDuration", "backgroundImageUrl"].includes(key))) as SavedEditorDesign["settings"];
    const entry: SavedEditorDesign = { id: crypto.randomUUID(), name: designName.trim().slice(0, 48) || `Design ${savedDesigns.length + 1}`, sourceName: state.sourceName, settings };
    const next = [entry, ...savedDesigns];
    try {
      localStorage.setItem(EDITOR_DESIGNS_KEY, JSON.stringify(next));
      setSavedDesigns(next);
      setDesignName("");
      notify("Design settings saved in this browser.");
    } catch {
      notify("Local storage is full; this design was not saved.");
    }
  }

  function loadEditorDesign(entry: SavedEditorDesign) {
    const current = useEditorStore.getState();
    const savedMeshDesignId = entry.settings.savedMeshDesignId ?? "";
    const hasSavedMesh = savedMeshGradients.some((item) => item.id === savedMeshDesignId);
    const backgroundMode = entry.settings.backgroundMode === "image" && !current.backgroundImageUrl
      ? "gradient"
      : entry.settings.backgroundMode === "saved-mesh" && !hasSavedMesh
        ? "gradient"
        : entry.settings.backgroundMode;
    useEditorStore.setState({ ...entry.settings, savedMeshDesignId: backgroundMode === "saved-mesh" ? savedMeshDesignId : "", sourceUrl: current.sourceUrl, sourceKind: current.sourceKind, sourceName: current.sourceName, sourceDuration: current.sourceDuration, backgroundImageUrl: current.backgroundImageUrl, backgroundMode });
    notify(entry.sourceName === current.sourceName ? "Design settings applied." : "Style applied. Add the original media again if needed.");
  }

  function removeEditorDesign(id: string) {
    const next = savedDesigns.filter((entry) => entry.id !== id);
    try {
      localStorage.setItem(EDITOR_DESIGNS_KEY, JSON.stringify(next));
      setSavedDesigns(next);
    } catch {
      notify("Could not update saved designs.");
    }
  }

  function openBackgroundPicker() {
    setBackgroundPickerTab(state.backgroundMode === "solid" ? "Solid" : state.backgroundMode === "image" ? "Image" : "Gradient");
    setBackgroundPickerOpen(true);
    if (window.matchMedia("(max-width: 720px)").matches) {
      window.requestAnimationFrame(() => inspectorRef.current?.scrollIntoView({ block: "start" }));
    }
  }

  function closeBackgroundPicker() {
    setBackgroundPickerOpen(false);
    window.requestAnimationFrame(() => backgroundPickerTriggerRef.current?.focus());
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void loadFile(file);
  }

  return (
    <main className="studio-shell">
      <header className="studio-header">
        <a className="brand-lockup" href="/" aria-label="Glint home">
          <img className="brand-mark" src="/screenshot-studio-mark.svg" alt="" width="40" height="40" />
          <span className="brand-name">GLINT <small>SCREENSHOT STUDIO</small></span>
        </a>
        <div className="header-right"><a className="builder-link" href="/mesh-gradient-builder"><Sparkles size={13} /> Mesh lab</a><span className="privacy-chip"><span className="privacy-dot" />LOCAL BY DESIGN <LockKeyhole size={12} /></span></div>
      </header>
      <input ref={backgroundPickerRef} hidden type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadBackground(file).then(closeBackgroundPicker); event.currentTarget.value = ""; }} />

      <section className="workbench">
        <section className="workspace" aria-label="Canvas workspace">
          <div className="workspace-toolbar">
            <div className="toolbar-start">
              <span className="toolbar-kicker">EXPORT SIZE</span>
              <div className="select-wrap">
                <select className="toolbar-select" aria-label="Canvas size" value={preset.id} disabled={busy} onChange={(event) => update("outputPresetId", event.target.value)}>
                  {OUTPUT_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select><ChevronDown className="select-caret" size={14} />
              </div>
            </div>
            {state.sourceUrl && <div className="toolbar-actions">
              <Button variant="secondary" size="sm" onClick={() => pickerRef.current?.click()}><Plus size={14} /> Add media</Button>
              <Button variant="default" size="sm" onClick={() => chooseGradient(GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)].id)}><WandSparkles size={14} /> Shuffle</Button>
            </div>}
          </div>

          <div className={`canvas-stage ${!state.sourceUrl ? "is-empty" : ""} ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>
            {state.sourceUrl ? <div className="canvas-frame">
              <span className="stage-tag"><span className="privacy-dot" />LIVE PREVIEW <span>·</span> {preset.width} × {preset.height}</span>
              <div className="artboard-shell">
                <div ref={backgroundSceneRef} className="background-scene-layer" aria-hidden="true">
                  {state.backgroundMode === "shader" && <ShaderBackground animate={state.motionEnabled ? "on" : "off"} />}
                  {state.backgroundMode === "blob" && <BlobBackground animate={state.motionEnabled} />}
                  {state.backgroundMode === "saved-mesh" && activeSavedMesh && <MeshGradientBackground design={activeSavedMesh.design} speed={state.motionEnabled ? state.motionSpeed / 100 : 0} />}
                </div>
                <canvas ref={canvasRef} className="canvas-artboard" aria-label="Live screenshot composition" onPointerMove={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  pointerRef.current = { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
                }} onPointerLeave={() => { pointerRef.current = { x: 0.5, y: 0.5 }; }} />
              </div>
              {state.sourceKind === "video" && <div className="video-preview-control"><button aria-label={videoPaused ? "Play preview" : "Pause preview"} onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) { void video.play(); setVideoPaused(false); } else { video.pause(); setVideoPaused(true); }
              }}>{videoPaused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}</button><span>{videoRef.current?.duration ? `${Math.floor(videoRef.current.currentTime)}s / ${Math.floor(videoRef.current.duration)}s` : "video preview"}</span></div>}
              {dragging && <div className="drop-overlay">DROP YOUR FILE HERE <Upload size={22} /></div>}
            </div> : <>
              <div ref={backgroundSceneRef} className="background-scene-layer empty-background-layer" aria-hidden="true">
                {state.backgroundMode === "shader" && <ShaderBackground animate={state.motionEnabled ? "on" : "off"} />}
                {state.backgroundMode === "blob" && <BlobBackground animate={state.motionEnabled} />}
                {state.backgroundMode === "saved-mesh" && activeSavedMesh && <MeshGradientBackground design={activeSavedMesh.design} speed={state.motionEnabled ? state.motionSpeed / 100 : 0} />}
              </div>
              <section className="upload-empty-state" aria-labelledby="upload-empty-title">
                <header className="upload-empty-heading">
                  <span className="upload-empty-kicker">A FRESH CANVAS</span>
                  <h2 id="upload-empty-title">Drag-n-drop your image here</h2>
                  <p>Use <kbd>Ctrl</kbd> + <kbd>V</kbd> to paste from clipboard</p>
                </header>
                <div className="upload-empty-actions">
                  <button type="button" className="upload-empty-action" onClick={() => pickerRef.current?.click()}>
                    <span className="upload-action-icon"><Plus size={19} /></span>
                    <strong>Add your image</strong>
                    <small>Image or video · from your device</small>
                  </button>
                  <button type="button" className="upload-empty-action" onClick={() => void loadDemoImage()}>
                    <span className="upload-action-icon"><MousePointer2 size={17} /></span>
                    <strong>Try demo image</strong>
                    <small>Preview the editor first</small>
                  </button>
                </div>
                <footer className="upload-empty-foot">DROP · PASTE · CREATE <span>Nothing leaves this device</span></footer>
              </section>
            </>}
            {state.sourceUrl && state.sourceKind === "video" && <video ref={videoRef} className="source-video" src={state.sourceUrl} muted playsInline loop autoPlay onLoadedMetadata={(event) => {
              update("sourceDuration", event.currentTarget.duration);
              void event.currentTarget.play().then(() => setVideoPaused(false)).catch(() => setVideoPaused(true));
            }} onPlay={() => setVideoPaused(false)} onPause={() => setVideoPaused(true)} />}
            <input ref={pickerRef} hidden type="file" accept="image/*,video/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFile(file); event.currentTarget.value = ""; }} />
          </div>
          <div className="workspace-foot"><span><strong>{state.sourceName || "No media added yet"}</strong>{state.sourceName && <> <span>·</span> {state.sourceKind === "video" ? `${state.sourceDuration ? `${state.sourceDuration.toFixed(1)} sec` : "video"} · local` : "image · local"}</>}</span><span>{state.sourceUrl ? "DROP · PASTE · CREATE" : "IMAGES & VIDEO · LOCAL ONLY"}</span></div>
        </section>

        <aside ref={inspectorRef} className="inspector" aria-label="Editor controls">
          <nav className="inspector-tabs" role="tablist" aria-label="Editor sections" inert={backgroundPickerOpen}>
            {inspectorTabs.map((item) => <button key={item} id={`editor-tab-${item.toLowerCase()}`} type="button" role="tab" aria-selected={tab === item} aria-controls="editor-tabpanel" tabIndex={tab === item ? 0 : -1} className="inspector-tab" onClick={() => setTab(item)} onKeyDown={(event) => handleInspectorTabKeyDown(event, item)}>{item === "Edit" ? <SlidersHorizontal size={13} /> : item === "Motion" ? <Film size={13} /> : item === "Effects" ? <WandSparkles size={13} /> : <BookmarkPlus size={13} />}{item}</button>)}
          </nav>
          <div id="editor-tabpanel" className="inspector-scroll" role="tabpanel" aria-labelledby={`editor-tab-${tab.toLowerCase()}`} tabIndex={0} inert={backgroundPickerOpen}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab} className="inspector-content" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.16 }}>
                {tab === "Edit" && <>
                  <div className="panel-title-row"><span className="panel-title">Screenshot options</span><span className="panel-overline">LOCAL EDITOR</span></div>
                  <div className="panel-divider">Screenshot frame</div>
                  <div className="frame-picker-row"><span>Frame style</span><button type="button" className="frame-picker-trigger" aria-haspopup="dialog" aria-expanded={framePickerOpen} onClick={() => setFramePickerOpen(true)}><FramePreview frame={state.frame} compact /><span>{frames.find((item) => item.id === state.frame)?.label}</span><ChevronDown size={13} /></button></div>
                  <div className="panel-divider">Screenshot shape</div>
                  <RangeControl label="Size" value={state.scale} min={30} max={150} suffix="%" onChange={(value) => update("scale", value)} />
                  <RangeControl label="Corner radius" value={state.radius} min={0} max={48} suffix="px" onChange={(value) => update("radius", value)} />
                  <RangeControl label="Inset border" value={state.inset} min={0} max={8} suffix="%" onChange={(value) => update("inset", value)} />
                  <label className="color-picker-row">Inset color<input className="color-input" type="color" value={state.insetColor} onChange={(event) => update("insetColor", event.target.value)} /></label>
                  <div className="segmented inset-style" role="group" aria-label="Inset finish">
                    {(["solid", "glass"] as const).map((style) => <button key={style} type="button" aria-pressed={state.insetStyle === style} onClick={() => update("insetStyle", style)}>{style === "glass" ? "Glass" : "Solid"}</button>)}
                  </div>
                  <div className="transform-disclosure">
                    <div className="transform-disclosure-content">
                      <RangeControl label="Rotate" value={state.rotation} min={-45} max={45} suffix="°" onChange={(value) => update("rotation", value)} />
                      <div className="transform-controls-row">
                        <div className="transform-control">
                          <div className="transform-control-label"><span>Tilt</span>{(state.tiltX !== 0 || state.tiltY !== 0) && <button type="button" className="transform-reset" onClick={() => useEditorStore.setState({ tiltX: 0, tiltY: 0 })}>Reset</button>}</div>
                          <div className={`tilt-track${tiltDragging ? " is-dragging" : ""}`} role="group" tabIndex={0} aria-label={`Tilt joystick: horizontal ${state.tiltY.toFixed(1)} degrees, vertical ${state.tiltX.toFixed(1)} degrees. Use arrow keys to adjust; Home resets.`} onKeyDown={handleTiltKeyDown} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setTiltDragging(true); setTiltFromPointer(event); }} onPointerMove={(event) => { if (tiltDragging) setTiltFromPointer(event); }} onPointerUp={() => setTiltDragging(false)} onPointerCancel={() => setTiltDragging(false)}>
                            <span className="tilt-knob" style={{ left: `${50 + state.tiltY / 18 * 24}%`, top: `${50 - state.tiltX / 18 * 24}%` }} />
                          </div>
                        </div>
                        <div className="transform-control">
                          <div className="transform-control-label"><span>Position</span><ChevronDown size={12} aria-hidden="true" /></div>
                          <div className="position-pad" role="group" aria-label="Screenshot position">
                            {positions.map((item) => <button type="button" key={item} aria-label={item.replaceAll("-", " ")} aria-pressed={state.position === item} onClick={() => update("position", item)}><span /></button>)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <details className="inspector-disclosure">
                    <summary><span>Shadow</span><small>{state.shadowStyle} · {state.shadowBlur}px blur</small><ChevronDown size={14} /></summary>
                    <div className="disclosure-content">
                      <SelectControl label="Style" value={state.shadowStyle} options={[{ value: "soft", label: "Soft" }, { value: "hard", label: "Hard" }, { value: "glow", label: "Glow" }, { value: "long", label: "Long" }, { value: "none", label: "None" }]} onChange={(value) => update("shadowStyle", value as EditorState["shadowStyle"])} />
                      <RangeControl label="Blur" value={state.shadowBlur} min={0} max={72} suffix="px" onChange={(value) => update("shadowBlur", value)} />
                      <RangeControl label="Offset" value={state.shadowOffset} min={0} max={40} suffix="px" onChange={(value) => update("shadowOffset", value)} />
                      <RangeControl label="Opacity" value={state.shadowOpacity} min={0} max={100} suffix="%" onChange={(value) => update("shadowOpacity", value)} />
                      <label className="color-picker-row">Shadow color<input className="color-input" type="color" value={state.shadowColor} onChange={(event) => update("shadowColor", event.target.value)} /></label>
                    </div>
                  </details>
                  <div className="panel-title-row"><span className="panel-title">Background</span><span className="panel-overline">{state.backgroundMode}</span></div>
                  <button ref={backgroundPickerTriggerRef} type="button" className="background-picker-trigger" aria-haspopup="dialog" aria-expanded={backgroundPickerOpen} aria-controls="background-picker-panel" onClick={openBackgroundPicker}>
                    <span className="background-picker-thumb" style={{ background: state.backgroundMode === "shader" ? "linear-gradient(135deg, #73bfc4, #ff810a, #8da0ce)" : state.backgroundMode === "blob" ? "radial-gradient(circle at 50% 50%, #2cb978 0 36%, #22ff7e 70%)" : state.backgroundMode === "saved-mesh" && activeSavedMesh ? `linear-gradient(135deg, ${activeSavedMesh.design.colors.join(", ")})` : state.backgroundMode === "solid" ? state.solidColor : state.backgroundMode === "image" && state.backgroundImageUrl ? `url(${state.backgroundImageUrl}) center / cover` : backgroundGradientCss }} />
                    <span className="background-picker-copy"><strong>Choose a background</strong><small>{state.backgroundMode === "shader" ? "Shader sphere · live motion" : state.backgroundMode === "blob" ? "Living blob · live motion" : state.backgroundMode === "saved-mesh" && activeSavedMesh ? activeSavedMesh.name : state.backgroundMode === "image" ? "Custom image" : state.backgroundMode === "solid" ? state.solidColor : state.gradientId === "custom" ? "Custom gradient" : activeGradient.name}</small></span><ChevronDown size={14} />
                  </button>
                </>}

                {tab === "Motion" && <>
                  <div className="panel-title-row"><span className="panel-title">Animated backgrounds</span><span className="panel-overline">BUILT IN + SAVED</span></div>
                  <p className="looks-intro">Choose a moving backdrop for your screenshot or clip. Your media stays crisp on top.</p>
                  <div className="motion-grid">
                    <button className="motion-card" type="button" aria-pressed={state.backgroundMode === "shader"} onClick={() => update("backgroundMode", "shader")}><span className="motion-swatch shader-sphere" /><strong>Shader sphere</strong><small>Teal · orange · periwinkle</small></button>
                    <button className="motion-card" type="button" aria-pressed={state.backgroundMode === "blob"} onClick={() => update("backgroundMode", "blob")}><span className="motion-swatch green-blob" /><strong>Green blob</strong><small>Noise-deformed Perlin sphere</small></button>
                    <button className="motion-card" type="button" aria-pressed={state.backgroundMode === "mesh" && state.motionPreset === "silk"} onClick={() => { update("motionPreset", "silk"); update("backgroundMode", "mesh"); }}><span className="motion-swatch silk" /><strong>Mono silk</strong><small>Black, silver &amp; flowing light</small></button>
                  </div>
                  <div className="panel-divider">Mesh Lab designs</div>
                  {savedMeshGradients.length > 0 ? <div className="motion-grid saved-motion-grid">{savedMeshGradients.map((entry) => <button key={entry.id} className="motion-card" type="button" aria-pressed={state.backgroundMode === "saved-mesh" && state.savedMeshDesignId === entry.id} onClick={() => applySavedMeshGradient(entry)}><span className="motion-swatch saved-mesh-swatch" style={{ background: `linear-gradient(135deg, ${entry.design.colors.join(", ")})` }} /><strong>{entry.name}</strong><small>Mesh Lab · {entry.design.colors.length} colors</small></button>)}</div> : <div className="saved-mesh-empty"><p className="small-note">Save a mesh gradient to use it as a motion background.</p><a href="/mesh-gradient-builder"><Sparkles size={13} /> Open Mesh Lab</a></div>}
                  <label className="toggle-row"><span>Animate background</span><input type="checkbox" checked={state.motionEnabled} onChange={(event) => update("motionEnabled", event.target.checked)} /></label>
                  <RangeControl label="Speed" value={state.motionSpeed} min={5} max={100} suffix="%" onChange={(value) => update("motionSpeed", value)} />
                  <div className="motion-export"><div className="panel-divider">Animated exports</div>
                    <p className="looks-intro">{state.sourceKind === "video" ? "Choose one export size below, then render your video." : "Create four seamless looping GIFs, one for each social preset."}</p>
                    {busy && <div className="render-progress"><span className="loading-dot" />{progress}</div>}
                    {renders.length > 0 && <div className="video-downloads">{renders.map((item) => <a className="video-download" key={item.name} href={item.url} download={`${safeName(state.sourceName)}-${OUTPUT_PRESETS.find((entry) => entry.name === item.name)?.id ?? "motion"}${item.pixelRatio ? `@${item.pixelRatio}x` : ""}.${item.extension}`}><span>{item.name}</span><small>{item.size} · download ↓</small></a>)}</div>}
                    {state.sourceKind === "image" && <Button className="wide-button" disabled={busy || !state.motionEnabled} onClick={() => void renderMotionSet()}><Film size={15} />{busy ? "Rendering…" : "Render 4 looping GIFs"}</Button>}
                  </div>
                  <div className="small-note">All uploaded pixels stay clean; motion, texture and grain render on the background layer only.</div>
                </>}

                {tab === "Effects" && <>
                  <div className="panel-title-row"><span className="panel-title">Background effects</span><span className="panel-overline">BEHIND YOUR MEDIA</span></div>
                  <p className="looks-intro">Layer atmosphere onto the backdrop. Your screenshot or video stays sharp and untouched.</p>
                  <div className="panel-divider">Texture</div>
                  <RangeControl label="Grain / noise" value={state.grain} min={0} max={100} suffix="%" onChange={(value) => update("grain", value)} />
                  <SelectControl label="Pattern" value={state.pattern} options={patterns.map((value) => ({ value, label: value.replace(/\b\w/g, (letter) => letter.toUpperCase()) }))} onChange={(value) => update("pattern", value as EditorState["pattern"])} />
                  {state.pattern !== "none" && <details className="inspector-disclosure pattern-disclosure">
                    <summary><span>Pattern tuning</span><small>{state.patternOpacity}% · {state.patternBlend}</small><ChevronDown size={14} /></summary>
                    <div className="disclosure-content">
                      <RangeControl label="Opacity" value={state.patternOpacity} min={0} max={100} suffix="%" onChange={(value) => update("patternOpacity", value)} />
                      <RangeControl label="Size" value={state.patternSize} min={30} max={130} suffix="%" onChange={(value) => update("patternSize", value)} />
                      <RangeControl label="Blur" value={state.patternBlur} min={0} max={40} suffix="px" onChange={(value) => update("patternBlur", value)} />
                      <SelectControl label="Blending" value={state.patternBlend} options={[{ value: "source-over", label: "Normal" }, { value: "overlay", label: "Overlay" }, { value: "screen", label: "Screen" }, { value: "multiply", label: "Multiply" }, { value: "darken", label: "Darken" }]} onChange={(value) => update("patternBlend", value as EditorState["patternBlend"])} />
                      <div className="pattern-colors"><label>Pattern color<input className="color-input" type="color" value={state.patternColors[0]} onChange={(event) => update("patternColors", [event.target.value, state.patternColors[1]])} /></label><label>Accent color<input className="color-input" type="color" value={state.patternColors[1]} onChange={(event) => update("patternColors", [state.patternColors[0], event.target.value])} /></label></div>
                      <div className="pattern-actions"><Button variant="secondary" size="sm" onClick={() => update("patternColors", [GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)].colors[1], GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)].colors[2]])}>Randomize colors</Button><Button variant="secondary" size="sm" onClick={() => update("patternSeed", state.patternSeed + Math.floor(Math.random() * 10) + 1)}>Randomize layout</Button></div>
                    </div>
                  </details>}
                  <div className="panel-divider">Atmosphere</div>
                  <div className="effect-card-grid">{backgroundEffects.map((effect) => <button key={effect.id} type="button" className="effect-card" aria-pressed={state.backgroundEffect === effect.id} onClick={() => update("backgroundEffect", effect.id)}><span className={`effect-preview effect-preview-${effect.id}`} /><strong>{effect.title}</strong><small>{effect.description}</small></button>)}</div>
                  <div className="small-note">Texture and atmosphere render behind uploaded media in preview and exports.</div>
                </>}

                {tab === "Saved" && <>
                  <div className="panel-title-row"><span className="panel-title">Your designs</span><span className="panel-overline">THIS DEVICE</span></div>
                  <p className="looks-intro">Save a look once, then bring it back in one click.</p>
                  <div className="saved-design-form"><input aria-label="Design name" maxLength={48} placeholder="Name this design" value={designName} onChange={(event) => setDesignName(event.target.value)} /><Button size="sm" onClick={saveEditorDesign}><BookmarkPlus size={14} /> Save</Button></div>
                  {savedDesigns.length ? <div className="saved-design-list">{savedDesigns.map((entry) => { const gradient = GRADIENTS.find((item) => item.id === entry.settings.gradientId); return <div className="saved-design-row" key={entry.id}><button type="button" className="saved-design-load" onClick={() => loadEditorDesign(entry)}><span className="saved-design-swatch" style={{ background: gradient ? cssForGradient(gradient) : `linear-gradient(135deg, ${entry.settings.customGradientColors.join(", ")})` }} /><span><strong>{entry.name}</strong><small>{entry.settings.backgroundEffect.replaceAll("-", " ")} · noise {entry.settings.grain}%</small></span></button><button type="button" aria-label={`Remove ${entry.name}`} className="saved-design-remove" onClick={() => removeEditorDesign(entry.id)}><Trash2 size={13} /></button></div>; })}</div> : <p className="small-note saved-design-empty">No saved designs yet.</p>}
                  <p className="small-note saved-design-empty">Settings stay in this browser; add your media again after a reload.</p>
                </>}
              </motion.div>
            </AnimatePresence>
          </div>
          <footer className="inspector-footer" inert={backgroundPickerOpen}>
            {state.sourceKind === "video" ? <>
              <div className="export-caption"><span>{busy ? progress : "VIDEO EXPORT · 2×"}</span><span>WEBM / MP4*</span></div>
              <label className="video-size-picker"><span>Render size</span><select className="dark-select" value={preset.id} disabled={busy} onChange={(event) => update("outputPresetId", event.target.value)}>{OUTPUT_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.width * EXPORT_PIXEL_RATIO} × {item.height * EXPORT_PIXEL_RATIO}</option>)}</select></label>
              <div className="export-actions video-actions"><Button disabled={busy || !state.sourceDuration} onClick={() => void renderSelectedVideo()}><Film size={15} />{busy ? "Rendering…" : "Render selected size"}</Button></div>
            </> : <>
              <div className="export-caption"><span>{preset.width * EXPORT_PIXEL_RATIO} × {preset.height * EXPORT_PIXEL_RATIO}</span><span>PNG · {EXPORT_PIXEL_RATIO}×</span></div>
              <div className="export-actions"><Button variant="secondary" disabled={!state.sourceUrl} onClick={() => void copyPng()}><Copy size={14} /> Copy</Button><Button disabled={!state.sourceUrl} onClick={() => void exportPng()}><ArrowDownToLine size={15} /> Save PNG</Button></div>
            </>}
            <p className="export-hint">*Video format depends on your browser.</p>
            <a className="creator-credit" href="https://github.com/konhito" target="_blank" rel="noopener noreferrer">Made by <strong>konhito</strong><span aria-hidden="true">↗</span></a>
          </footer>
        </aside>
      </section>
      {inspectorRef.current && createPortal(<AnimatePresence>
        {backgroundPickerOpen && <motion.div className="background-picker-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.section id="background-picker-panel" className="background-picker-dialog" role="dialog" aria-modal="false" aria-labelledby="background-picker-title" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} onClick={(event) => event.stopPropagation()}>
            <header className="frame-picker-header"><div><span className="panel-overline">CANVAS BACKGROUND</span><h2 id="background-picker-title">Choose a backdrop</h2></div><button autoFocus type="button" className="frame-picker-close" aria-label="Close background picker" onClick={closeBackgroundPicker}><X size={17} /></button></header>
            <div className="background-picker-tabs" role="tablist" aria-label="Background type">{(["Looks", "Gradient", "Solid", "Image", "Unsplash"] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={backgroundPickerTab === item} disabled={item === "Unsplash"} aria-label={item === "Image" ? "Upload image" : item === "Unsplash" ? "Unsplash, locked" : item} onClick={() => setBackgroundPickerTab(item)}>{item === "Image" ? <ImagePlus size={11} /> : item === "Unsplash" ? <LockKeyhole size={10} /> : null}{item === "Image" ? "Upload" : item}</button>)}</div>
            <div className="background-picker-content">
              {backgroundPickerTab === "Looks" && <><div className="mood-list">{MOODS.map((mood) => <button key={mood} type="button" className="mood-pill" aria-pressed={state.mood === mood && !allLooks} onClick={() => { update("mood", mood); setAllLooks(false); }}>{mood}</button>)}<button type="button" className="mood-pill" aria-pressed={allLooks} onClick={() => setAllLooks(true)}>All 36</button></div><div className="gradient-grid picker-looks-grid">{looks.map((gradient) => <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} key={gradient.id} className="gradient-swatch" type="button" aria-pressed={state.gradientId === gradient.id} onClick={() => chooseGradient(gradient.id)}><span className="gradient-thumb" style={{ background: cssForGradient(gradient) }} /><span className="gradient-name">{gradient.name}</span></motion.button>)}</div></>}
              {backgroundPickerTab === "Gradient" && <>
                <div className="gradient-palette-grid" aria-label="Gradient presets">{GRADIENTS.slice(0, 32).map((gradient) => <button key={gradient.id} type="button" aria-label={`${gradient.name} gradient`} aria-pressed={state.gradientId === gradient.id} title={gradient.name} style={{ background: cssForGradient(gradient) }} onClick={() => chooseGradient(gradient.id)} />)}</div>
                <div className="custom-gradient-colors"><span>Custom gradient colors</span><label aria-label="First gradient color"><input className="color-input" type="color" value={gradientColorA} onChange={(event) => updateGradientColor(0, event.target.value)} /></label><label aria-label="Second gradient color"><input className="color-input" type="color" value={gradientColorB} onChange={(event) => updateGradientColor(1, event.target.value)} /></label></div>
                <div className="gradient-direction-section"><span>Gradient direction</span><div className="gradient-direction-grid">{gradientDirections.map((item) => <button key={item.angle} type="button" aria-label={item.label} aria-pressed={state.gradientAngle === item.angle && state.backgroundMode === "gradient"} onClick={() => { if (activeGradient.kind === "mesh" && state.gradientId !== "custom") { const linear = GRADIENTS.find((gradient) => gradient.kind === "linear"); if (linear) chooseGradient(linear.id); } update("gradientAngle", item.angle); update("backgroundMode", "gradient"); update("motionPreset", "aurora"); }}><span aria-hidden="true">{item.icon}</span></button>)}</div></div>
              </>}
              {backgroundPickerTab === "Solid" && <><label className="solid-background-picker">Custom solid color<input className="color-input" type="color" value={state.solidColor} onChange={(event) => { update("solidColor", event.target.value); update("backgroundMode", "solid"); update("motionPreset", "aurora"); }} /></label><div className="solid-swatch-grid">{solidSwatches.map((color) => <button key={color} type="button" aria-label={`Use ${color} solid background`} aria-pressed={state.backgroundMode === "solid" && state.solidColor === color} style={{ background: color }} onClick={() => { update("solidColor", color); update("backgroundMode", "solid"); update("motionPreset", "aurora"); }} />)}</div></>}
              {backgroundPickerTab === "Image" && <div className="background-upload-panel"><span className="upload-icon"><ImagePlus size={20} /></span><strong>{state.backgroundImageUrl ? "Background image ready" : "Upload a background image"}</strong><p>Your image fills the canvas behind the screenshot or video. It stays on this device.</p><Button variant="secondary" onClick={() => backgroundPickerRef.current?.click()}>{state.backgroundImageUrl ? "Replace image" : "Choose image"}</Button></div>}
            </div>
          </motion.section>
        </motion.div>}
      </AnimatePresence>, inspectorRef.current)}
      <AnimatePresence>
        {framePickerOpen && <motion.div className="frame-picker-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setFramePickerOpen(false)}>
          <motion.section className="frame-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="frame-picker-title" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} onClick={(event) => event.stopPropagation()}>
            <header className="frame-picker-header"><div><span className="panel-overline">SCREENSHOT OPTIONS</span><h2 id="frame-picker-title">Choose a frame</h2></div><button type="button" className="frame-picker-close" aria-label="Close frame picker" onClick={() => setFramePickerOpen(false)}><X size={17} /></button></header>
            <div className="frame-tile-grid">{frames.map((item) => <button type="button" key={item.id} className="frame-tile" aria-pressed={state.frame === item.id} onClick={() => { update("frame", item.id); setFramePickerOpen(false); }}><span className="frame-tile-preview"><FramePreview frame={item.id} /></span><span>{item.label}</span></button>)}</div>
          </motion.section>
        </motion.div>}
      </AnimatePresence>
      <AnimatePresence>{toast && <motion.div className="status-toast" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} role="status">{toast}</motion.div>}</AnimatePresence>
    </main>
  );
}
