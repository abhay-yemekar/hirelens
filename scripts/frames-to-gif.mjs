/**
 * Launch-asset assembler: staged PNG shots (from record-demo.mjs) → docs/demo.gif.
 *
 * Zero system dependencies — pngjs decodes and gifenc encodes, both
 * devDependencies. Each shot carries its own delay (the hold from the
 * recording script), so pacing is authored, not inferred: static holds
 * compress to one frame with a long delay, keeping the file small and
 * the rhythm intentional.
 *
 * Usage: node scripts/frames-to-gif.mjs [--width 960]
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
const WIDTH = opt("width", 960);

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
  `${shots.length} shots, total ${(shots.reduce((a, s) => a + s.delayMs, 0) / 1000).toFixed(1)}s`,
);

// Decode the first shot to learn the geometry, then scale everything.
const first = PNG.sync.read(await readFile(`${FRAMES_DIR}/${shots[0].file}`));
const scale = WIDTH / first.width;
const HEIGHT = Math.round(first.height * scale);
console.log(`source ${first.width}×${first.height} → ${WIDTH}×${HEIGHT}, ${shots.length} frames`);

const gif = GIFEncoder();
let cache = null;
let cacheIdx = -1;
for (let k = 0; k < shots.length; k++) {
  if (k !== cacheIdx) {
    cache = PNG.sync.read(await readFile(`${FRAMES_DIR}/${shots[k].file}`));
    cacheIdx = k;
  }
  // Nearest-neighbor downscale — crisp UI text, 8× fewer bytes for the quantizer.
  const out = Buffer.alloc(WIDTH * HEIGHT * 4);
  const { data, width: sw, height: sh } = cache;
  for (let y = 0; y < HEIGHT; y++) {
    const sy = Math.min((y / scale) | 0, sh - 1);
    for (let x = 0; x < WIDTH; x++) {
      const sx = Math.min((x / scale) | 0, sw - 1);
      const si = (sy * sw + sx) * 4;
      const di = (y * WIDTH + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = 255;
    }
  }
  const palette = quantize(out, 256, { format: "rgb565" });
  const index = applyPalette(out, palette, "rgb565");
  // GIF delays are in centiseconds. Last frame holds the longest beat so
  // the loop restart feels deliberate, not abrupt.
  const delay = Math.max(20, Math.round(shots[k].delayMs / 10));
  gif.writeFrame(index, WIDTH, HEIGHT, { palette, delay });
  process.stdout.write(`  encoded ${k + 1}/${shots.length}\r`);
}
gif.finish();
const buf = gif.bytes();
await writeFile(OUT, buf);
const kb = (await stat(OUT)).size / 1024;
console.log(`\nwrote ${OUT} — ${WIDTH}×${HEIGHT}, ${shots.length} frames, ${kb.toFixed(0)} KB`);
