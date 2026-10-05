"use client";

import { MeshGradient } from "@paper-design/shaders-react";
import { ArrowLeft, BookmarkPlus, Check, Copy, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cloneMeshGradientDesign, isMeshGradientDesign, MESH_GRADIENT_STORAGE_KEY, readSavedMeshGradients, type MeshGradientDesign as Design, type SavedMeshGradient as SavedDesign } from "@/lib/mesh-designs";
import "./mesh-gradient-builder.css";

const INITIAL: Design = {
  colors: ["#bcecf6", "#8da0ce", "#aaa7d7"], distortion: 0.45, swirl: 0.22, grainMixer: 0,
  grainOverlay: 0, speed: 0.25, scale: 1, rotation: 0, offsetX: 0, offsetY: 0,
};
const PALETTE = ["#aaa7d7", "#3b2a8d", "#f0a6ca", "#ff810a", "#73bfc4", "#8da0ce", "#ffe457", "#17202a", "#ff82c2", "#bcecf6"];
const PRESETS: { name: string; design: Design }[] = [
  { name: "Default", design: INITIAL },
  { name: "Ink", design: { ...INITIAL, colors: ["#ffffff", "#000000"], swirl: 0.2, grainMixer: 0, grainOverlay: 0, speed: 1, rotation: 90, offsetX: 0, offsetY: 0 } },
  { name: "Purple", design: { ...INITIAL, colors: ["#aaa7d7", "#3b2a8d"], distortion: 0.72, swirl: 0.55, grainMixer: 0, grainOverlay: 0, speed: 0.32, rotation: 232, offsetX: -0.15, offsetY: -0.02 } },
  { name: "Beach", design: { ...INITIAL, colors: ["#bcecf6", "#00aaff", "#00f7ff", "#ffd447"], distortion: 0.8, swirl: 0.35, grainMixer: 0, grainOverlay: 0, speed: 0.1, rotation: 0, offsetX: 0, offsetY: 0 } },
];

const limits: [keyof Omit<Design, "colors">, number, number, number][] = [
  ["distortion", 0, 1, 2], ["swirl", 0, 1, 2], ["grainMixer", 0, 1, 2],
  ["grainOverlay", 0, 1, 2], ["speed", 0, 1, 2], ["scale", 0.01, 4, 2],
  ["rotation", 0, 360, 0], ["offsetX", -1, 1, 2], ["offsetY", -1, 1, 2],
];

function Slider({ name, value, min, max, step = 0.01, digits = 2, onChange }: {
  name: keyof Omit<Design, "colors">; value: number; min: number; max: number;
  step?: number; digits?: number; onChange: (value: number) => void;
}) {
  const id = `mesh-${name}`;
  return <div className="mesh-control-row">
    <label htmlFor={id}>{name}</label>
    <input id={id} aria-label={name} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    <output htmlFor={id}>{value.toFixed(digits)}</output>
  </div>;
}

export default function MeshGradientBuilder() {
  const [design, setDesign] = useState<Design>(() => cloneMeshGradientDesign(INITIAL));
  const [saved, setSaved] = useState<SavedDesign[]>([]);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const activePreset = PRESETS.find((preset) => JSON.stringify(preset.design) === JSON.stringify(design))?.name;

  useEffect(() => {
    setSaved(readSavedMeshGradients());
    const encoded = new URLSearchParams(window.location.search).get("design");
    if (encoded) {
      try {
        const shared: unknown = JSON.parse(atob(encoded));
        if (isMeshGradientDesign(shared)) setDesign(cloneMeshGradientDesign(shared));
      } catch { /* Ignore malformed shared settings. */ }
    }
  }, []);

  function setValue<K extends keyof Design>(key: K, value: Design[K]) {
    setDesign((current) => ({ ...current, [key]: value }));
  }

  function resetDesign() {
    const url = new URL(window.location.href);
    if (url.searchParams.has("design")) {
      url.searchParams.delete("design");
      window.history.replaceState(window.history.state, "", url);
    }
    setDesign(cloneMeshGradientDesign(INITIAL));
  }

  function saveDesign() {
    const entry = { id: crypto.randomUUID(), name: name.trim().slice(0, 48) || `Gradient ${saved.length + 1}`, design: { ...design, colors: [...design.colors] } };
    const next = [entry, ...saved];
    try {
      localStorage.setItem(MESH_GRADIENT_STORAGE_KEY, JSON.stringify(next));
      setSaved(next);
      setName("");
      setStatus("Saved on this device");
    } catch {
      setStatus("Local storage is full; this design was not saved");
    }
    window.setTimeout(() => setStatus(""), 2400);
  }

  function removeDesign(id: string) {
    const next = saved.filter((entry) => entry.id !== id);
    try {
      localStorage.setItem(MESH_GRADIENT_STORAGE_KEY, JSON.stringify(next));
      setSaved(next);
    } catch {
      setStatus("Could not update local designs");
      window.setTimeout(() => setStatus(""), 2400);
    }
  }

  async function copyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("design", btoa(JSON.stringify(design)));
    try {
      await navigator.clipboard.writeText(url.toString());
      setStatus("Design link copied");
    } catch {
      setStatus("Clipboard permission is unavailable");
    }
    window.setTimeout(() => setStatus(""), 2400);
  }

  function setColorCount(count: number) {
    setDesign((current) => ({ ...current, colors: current.colors.length >= count ? current.colors.slice(0, count) : [...current.colors, ...Array.from({ length: count - current.colors.length }, (_, index) => PALETTE[(current.colors.length + index) % PALETTE.length])] }));
  }

  return <main className="mesh-builder-page">
    <header className="mesh-builder-header">
      <Link className="mesh-brand" href="/" aria-label="Back to Glint"><img className="mesh-brand-mark" src="/screenshot-studio-mark.svg" alt="" width="24" height="24" /><span>Glint<span>Mesh lab</span></span></Link>
      <Link className="mesh-back-link" href="/"><ArrowLeft size={14} /> Screenshot editor</Link>
    </header>

    <div className="mesh-builder-content">
      <div className="mesh-page-title"><h1>Mesh Gradient</h1><div className="mesh-page-actions"><button className="mesh-reset-button" type="button" aria-label="Reset to default settings" title="Reset to default settings" onClick={resetDesign}><RotateCcw size={14} /><span>Reset</span></button><button type="button" onClick={() => void copyLink()}><Copy size={14} /> copy link</button><Link href="/">open editor <ArrowLeft size={13} /></Link></div></div>

      <div className="mesh-builder-layout">
        <section className="mesh-preview" aria-label="Live mesh gradient preview">
          <MeshGradient width="100%" height="100%" colors={design.colors} distortion={design.distortion} swirl={design.swirl} grainMixer={design.grainMixer} grainOverlay={design.grainOverlay} speed={design.speed} scale={design.scale} rotation={design.rotation} offsetX={design.offsetX} offsetY={design.offsetY} minPixelRatio={1} />
        </section>

        <aside className="mesh-controls" aria-label="Mesh gradient settings">
          <div className="mesh-section-label">Presets</div>
          <div className="mesh-preset-grid">{PRESETS.map((preset) => <button type="button" key={preset.name} aria-pressed={activePreset === preset.name} onClick={() => setDesign(cloneMeshGradientDesign(preset.design))}>{preset.name}</button>)}</div>
          <div className="mesh-color-count mesh-control-row"><label htmlFor="mesh-color-count">colorCount</label><input id="mesh-color-count" type="range" min="2" max="10" step="1" value={design.colors.length} onChange={(event) => setColorCount(Number(event.target.value))} /><output htmlFor="mesh-color-count">{design.colors.length}</output></div>
          {design.colors.map((color, index) => <label className="mesh-color-row" key={index}><span>color{index + 1}</span><input aria-label={`color${index + 1}`} type="color" value={color} onChange={(event) => setDesign((current) => ({ ...current, colors: current.colors.map((item, colorIndex) => colorIndex === index ? event.target.value : item) }))} /><output>{color}</output></label>)}
          {limits.map(([key, min, max, digits]) => <Slider key={key} name={key} value={design[key]} min={min} max={max} digits={digits} onChange={(value) => setValue(key, value)} />)}

          <div className="mesh-saved-section">
            <div className="mesh-section-label">Your designs <span>{saved.length}</span></div>
            <div className="mesh-save-row"><input aria-label="Design name" maxLength={48} placeholder="Name this gradient" value={name} onChange={(event) => setName(event.target.value)} /><button type="button" onClick={saveDesign}><BookmarkPlus size={14} /> Save</button></div>
            {saved.length === 0 ? <p className="mesh-empty-saved">Saved designs stay in this browser.</p> : <ul className="mesh-saved-list">{saved.map((entry) => <li key={entry.id}><button className="mesh-load-design" type="button" onClick={() => setDesign({ ...entry.design, colors: [...entry.design.colors] })}><span className="mesh-saved-swatch" style={{ background: `linear-gradient(135deg, ${entry.design.colors.join(", ")})` }} /><span>{entry.name}</span></button><button className="mesh-remove-design" type="button" aria-label={`Remove ${entry.name}`} onClick={() => removeDesign(entry.id)}><Trash2 size={13} /></button></li>)}</ul>}
          </div>
        </aside>
      </div>
      <footer className="mesh-credit-footer"><a className="creator-credit" href="https://github.com/konhito" target="_blank" rel="noopener noreferrer">Made by <strong>konhito</strong><span aria-hidden="true">↗</span></a></footer>
    </div>
    {status && <div className="mesh-status" role="status"><Check size={14} />{status}</div>}
  </main>;
}
