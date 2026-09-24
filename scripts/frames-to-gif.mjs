/**
 * Launch-asset assembler: staged PNG shots (from record-demo.mjs) → docs/demo.gif.
 *
 * Zero system dependencies — pngjs decodes and gifenc encodes, both
 * devDependencies. Each shot carries its own delay (the hold from the
 * recording script), so pacing is authored, not inferred.
 *
 * Quality notes (v1.3): downscale uses AREA AVERAGING (a box filter over
 * the covered source region), not nearest-neighbor — nearest-neighbor
 * drops whole pixel rows when shrinking, which reads as aliasing and
 * fuzz at README size. Averaging preserves real edge information. Output
 * is 1152px wide; GIF is a 256-color format, so this is the practical
 * ceiling of "crisp" — good enough to read every label at embed size.
 *
 * Usage: node scripts/frames-to-gif.mjs [--width 1152] [--slow 1.6]
 */

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import gifenc from "gifenc";
import { PNG } from "pngjs";

const { GIFEncoder, quantize, applyPalette } = gifenc;

const FRAMES_DIR = ".tmp-demo-frames";
const OUT = "docs/demo.gif";
const args = process.argv.slice(2);
function opt(name, dflt) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
}
const WIDTH = opt("width", 1152);
const SLOW = opt("slow", 1.6); // pacing multiplier — calmer than realtime

const files = (await readdir(FRAMES_DIR)).filter((f) => f.endsWith(".png")).sort();
if (files.length === 0) {
  console.error(`No PNG frames in ${FRAMES_DIR}/ — run record-demo.mjs first.`);
  process.exit(1);
}

// The manifest maps each shot to its hold time; without it, assume 500ms.
let manifest = { shots: files.map((f) => ({ file: f, delayMs: 500 })) };
try {
  manifest = JSON.parse(await readFile(`${FRAMES_DIR}/frames.json`, "utf8"));
} catch {
  // fallback above
}
const shots = manifest.shots.filter((s) => files.includes(s.file));
console.log(
  `${shots.length} shots, ${WIDTH}px wide, pacing ×${SLOW} → ${((shots.reduce((a, s) => a + s.delayMs, 0) * SLOW) / 1000).toFixed(1)}s`,
);

// Decode the first shot to learn the geometry, then scale everything.
const first = PNG.sync.read(await readFile(`${FRAMES_DIR}/${shots[0].file}`));
const scale = WIDTH / first.width;
const HEIGHT = Math.round(first.height * scale);
console.log(`source ${first.width}×${first.height} → ${WIDTH}×${HEIGHT}, ${shots.length} frames`);

const gif = GIFEncoder();

/**
 * Area-average (box-filter) downscale. Each destination pixel is the
 * average of the source pixels it covers — sub-pixel edges get partial
 * weight, which is exactly what kills the aliasing shimmer.
 */
function areaResize(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const xRatio = sw / dw;
  const yRatio = sh / dh;
  for (let dy = 0; dy < dh; dy++) {
    const sy0 = dy * yRatio;
    const sy1 = Math.min(sh, (dy + 1) * yRatio);
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = dx * xRatio;
      const sx1 = Math.min(sw, (dx + 1) * xRatio);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      const yStart = Math.floor(sy0);
      const yEnd = Math.ceil(sy1);
      const xStart = Math.floor(sx0);
      const xEnd = Math.ceil(sx1);
      for (let sy = yStart; sy < yEnd; sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        for (let sx = xStart; sx < xEnd; sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          const w = wx * wy;
          const si = (sy * sw + sx) * 4;
          r += src[si] * w;
          g += src[si + 1] * w;
          b += src[si + 2] * w;
          a += src[si + 3] * w;
          n += w;
        }
      }
      const di = (dy * dw + dx) * 4;
      out[di] = Math.round(r / n);
      out[di + 1] = Math.round(g / n);
      out[di + 2] = Math.round(b / n);
      out[di + 3] = 255;
    }
  }
  return out;
}

let cache = null;
let cacheIdx = -1;
for (let k = 0; k < shots.length; k++) {
  if (k !== cacheIdx) {
    cache = PNG.sync.read(await readFile(`${FRAMES_DIR}/${shots[k].file}`));
    cacheIdx = k;
  }
  const out = areaResize(cache.data, cache.width, cache.height, WIDTH, HEIGHT);
  const palette = quantize(out, 256, { format: "rgb565" });
  const index = applyPalette(out, palette, "rgb565");
  // GIF delays are centiseconds; last frame holds the longest beat so the
  // loop restart feels deliberate, not abrupt.
  const delay = Math.max(20, Math.round((shots[k].delayMs * SLOW) / 10));
  gif.writeFrame(index, WIDTH, HEIGHT, { palette, delay });
  process.stdout.write(`  encoded ${k + 1}/${shots.length}\r`);
}
gif.finish();
const buf = gif.bytes();
await writeFile(OUT, buf);
const kb = (await stat(OUT)).size / 1024;
console.log(`\nwrote ${OUT} — ${WIDTH}×${HEIGHT}, ${shots.length} frames, ${kb.toFixed(0)} KB`);
