import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitImage } from "../lib/canvas-math.mjs";

assert.deepEqual(fitImage(1920, 1080, 1000, 500), { width: 889, height: 500 });
assert.deepEqual(fitImage(800, 1600, 600, 600), { width: 300, height: 600 });
assert.deepEqual(fitImage(1000, 500, 800, 400, 0.5), { width: 400, height: 200 });
assert.deepEqual(fitImage(1000, 500, 800, 400, 1.5), { width: 1200, height: 600 });
assert.deepEqual(fitImage(0, 500, 800, 400), { width: 0, height: 0 });

const renderer = readFileSync(new URL("../lib/canvas-renderer.ts", import.meta.url), "utf8");
const renderBody = renderer.slice(renderer.indexOf("export function renderCanvas"));
const layerOrder = ["drawBackground(ctx", "drawPattern(ctx", "if (state.grain > 0)", "drawSource(ctx, state, source"];
const layerIndexes = layerOrder.map((layer) => renderBody.indexOf(layer));
assert.ok(layerIndexes.every((value, index) => value >= 0 && (!index || value > layerIndexes[index - 1])), "Background effects must render before the uploaded media.");
assert.ok(renderer.includes('ctx.rotate(-Math.PI / 4);') && renderer.includes('const spacing = Math.max(12, size * 0.22);'), "Wave pattern should use fine, diagonal spacing.");

const sourceBody = renderer.slice(renderer.indexOf("function drawSource("), renderer.indexOf("export function renderCanvas"));
assert.ok(sourceBody.indexOf("ctx.drawImage(backdrop, 0, 0)") < sourceBody.indexOf("ctx.drawImage(source, x, y"), "Glass must blur the background before painting clean media on top.");
assert.ok(sourceBody.includes("ctx.filter = `blur("), "Glass needs a frosted background blur.");
assert.ok(sourceBody.includes('state.frame === "arc" ? Math.max(10'), "Arc needs its own thick outer border.");
assert.ok(sourceBody.includes("ctx.transform(1, -state.tiltX / 160, -state.tiltY / 160, 1, 0, 0)"), "Tilt should follow the Pika reference direction.");
