export type Mood = "Cyber" | "Y2K" | "Earth" | "Brutalist" | "Mesh";
export type GradientKind = "linear" | "radial" | "mesh";

export type GradientPreset = {
  id: string;
  name: string;
  mood: Mood;
  kind: GradientKind;
  colors: string[];
  angle?: number;
};

const make = (
  mood: Mood,
  names: string[],
  palettes: string[][],
  kind: GradientKind = "linear",
) =>
  names.map((name, index): GradientPreset => ({
    id: `${mood.toLowerCase()}-${index + 1}`,
    name,
    mood,
    kind,
    colors: palettes[index],
    angle: [135, 155, 120, 165, 140, 110, 150][index % 7],
  }));

export const GRADIENTS: GradientPreset[] = [
  ...make("Cyber", ["Laser daze", "Night shift", "Hyperlink", "Glitch garden", "Blue screen", "Afterparty", "Acid cloud"], [
    ["#101c52", "#355cf5", "#b8a2ff"], ["#0d122c", "#303eb4", "#fd43c6"], ["#00c9ff", "#3561ff", "#d13cff"],
    ["#051a2b", "#01c7a9", "#c7ff4d"], ["#061b44", "#0875cf", "#9ae9ff"], ["#30104e", "#f53893", "#ffb84d"], ["#17163d", "#8b38ff", "#edff42"],
  ]),
  ...make("Y2K", ["Bubblegum", "Cherry chrome", "Poolside", "Pixel angel", "Digital kiss", "Daydream", "Silver pop"], [
    ["#ff80c8", "#ffa4e1", "#ffd7ec"], ["#f50078", "#ff5b85", "#ffbdc7"], ["#2ed6ff", "#799bff", "#c6c7ff"],
    ["#6d5dfc", "#ff8fc8", "#ffe27a"], ["#fe57a1", "#a37aff", "#7ee8fa"], ["#fac9ff", "#cbd8ff", "#b5f4e8"], ["#95a9c5", "#e8d6ef", "#84d8ef"],
  ]),
  ...make("Earth", ["Oat milk", "Terracotta", "Moss club", "Matcha beige", "Clay study", "Dune", "Cacao"], [
    ["#d8b88c", "#f0d6a8", "#f6eccf"], ["#aa5139", "#d9875e", "#f0c08b"], ["#304d3e", "#71846a", "#c3ad7e"],
    ["#b5bd83", "#dce1ad", "#f0ddb3"], ["#8e493c", "#cc8068", "#eab69a"], ["#8b7558", "#c8a777", "#ead7b6"], ["#392a24", "#76503f", "#bd8f6d"],
  ]),
  ...make("Brutalist", ["Ink & paper", "Paper cut", "Lemon stand", "Redacted", "Signal red", "No permission", "Blue note"], [
    ["#171717", "#333333", "#626262"], ["#d8d5ca", "#f4f0e5", "#ffffff"], ["#292c20", "#778033", "#e2ef43"],
    ["#171717", "#7d2027", "#f46b55"], ["#631a1c", "#d62d35", "#ff9179"], ["#151720", "#444b5d", "#aab4c5"], ["#06243a", "#276da3", "#86c9e8"],
  ]),
  ...make("Mesh", ["Violet hour", "Blue crush", "Peach static", "Mint condition", "Orbit bloom", "Soft launch", "Fruit punch"], [
    ["#11132a", "#7f47f4", "#e747cf", "#55a4ff"], ["#061a43", "#1685ff", "#b54aff", "#6ee7ef"], ["#2e182c", "#ff7b87", "#ffbd8a", "#9b65c4"],
    ["#112f30", "#19b99b", "#a3e85a", "#80bcff"], ["#271449", "#5d35e8", "#ff5fac", "#ffa947"], ["#38234a", "#a175ff", "#ff9dc8", "#93e6d1"], ["#49223f", "#ff4b9b", "#ffad44", "#b8f04a"],
  ], "mesh"),
  ...[...make("Cyber", ["Violet static"], [["#10132b", "#6d4dff", "#dc47c3", "#4385ff"]], "mesh")].map((gradient) => ({ ...gradient, id: "cyber-mesh-static", name: "Violet static", mood: "Cyber" as Mood })),
];

export const MOODS: Mood[] = ["Cyber", "Y2K", "Earth", "Brutalist", "Mesh"];

export const OUTPUT_PRESETS = [
  { id: "x-post", name: "X / Twitter", width: 1200, height: 675, short: "X POST" },
  { id: "instagram", name: "Instagram square", width: 1080, height: 1080, short: "IG SQUARE" },
  { id: "linkedin", name: "LinkedIn banner", width: 1584, height: 396, short: "LINKEDIN" },
  { id: "product-hunt", name: "Product Hunt", width: 1270, height: 760, short: "PRODUCT HUNT" },
] as const;

export type OutputPreset = (typeof OUTPUT_PRESETS)[number];

export function cssForGradient(gradient: GradientPreset): string {
  if (gradient.kind === "mesh") {
    const [base, ...colors] = gradient.colors;
    const positions = ["16% 18%", "82% 14%", "78% 82%", "18% 82%", "48% 52%"];
    return `${colors.map((color, index) => `radial-gradient(ellipse at ${positions[index % positions.length]}, ${color} 0%, transparent 66%)`).join(", ")}, ${base}`;
  }
  if (gradient.kind === "radial") return `radial-gradient(circle at 30% 28%, ${gradient.colors.join(", ")})`;
  return `linear-gradient(${gradient.angle ?? 135}deg, ${gradient.colors.join(", ")})`;
}

if (GRADIENTS.length < 30) throw new Error("The mood library must keep at least 30 presets.");
