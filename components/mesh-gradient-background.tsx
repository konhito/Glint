"use client";

import { MeshGradient } from "@paper-design/shaders-react";
import type { MeshGradientDesign } from "@/lib/mesh-designs";

export function MeshGradientBackground({ design, speed }: { design: MeshGradientDesign; speed: number }) {
  return <MeshGradient
    width="100%"
    height="100%"
    colors={design.colors}
    distortion={design.distortion}
    swirl={design.swirl}
    grainMixer={design.grainMixer}
    grainOverlay={design.grainOverlay}
    speed={speed}
    scale={design.scale}
    rotation={design.rotation}
    offsetX={design.offsetX}
    offsetY={design.offsetY}
    minPixelRatio={1}
  />;
}
