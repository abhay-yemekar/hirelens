/**
 * Renders the raster brand icons from the SVG sources in docs/brand:
 *
 *   app/favicon.ico    16, 32 and 48 px (PNG entries) from favicon-tile.svg
 *   app/apple-icon.png 180 px from apple-icon-tile.svg
 *
 *   pnpm --filter @candidlens/web run brand-icons
 *
 * app/icon.svg is hand-written (it switches colour with dark mode), so it
 * is not generated. sharp comes with Next.js, so it is resolved from there.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require(require.resolve("sharp", { paths: [require.resolve("next/package.json")] }));

const brand = new URL("../../../docs/brand/", import.meta.url);
const app = new URL("../app/", import.meta.url);

/** Rasterise a 32-unit SVG to a square PNG of `px` pixels. */
function png(svgFile, px) {
  const svg = readFileSync(new URL(svgFile, brand));
  return sharp(svg, { density: (72 * px * 4) / 32 })
    .resize(px, px)
    .png()
    .toBuffer();
}

/** An ICO container holding PNG-encoded images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ px, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(px >= 256 ? 0 : px, entry);
    header.writeUInt8(px >= 256 ? 0 : px, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

const sizes = [16, 32, 48];
const entries = [];
for (const px of sizes) entries.push({ px, data: await png("favicon-tile.svg", px) });
writeFileSync(new URL("favicon.ico", app), ico(entries));
writeFileSync(new URL("apple-icon.png", app), await png("apple-icon-tile.svg", 180));
console.log("Wrote app/favicon.ico and app/apple-icon.png");
