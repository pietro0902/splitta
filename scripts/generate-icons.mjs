// Draw the app icons and write them as PNGs.
//
// Run with `npm run icons`. Committed output, not a build step: icons change
// about once a year, and generating them at build time would mean shipping an
// image library into a Worker that has no use for one. Everything here is
// pure Node -- zlib is the only thing imported, and the PNG container is
// assembled by hand -- so there is no dependency to install, keep current, or
// have break on a machine without native build tools.
//
// The mark is a coin split into two offset halves. It is deliberately
// provisional: it uses the app's current terracotta and commits to nothing the
// final logo has to honour. When that is decided, change `mark()` below and
// re-run -- every size regenerates from the one definition.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const TERRACOTTA = [0xc4, 0x57, 0x2a];
const CREAM = [0xfa, 0xf7, 0xf2];

// --- PNG container -------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  // 10, 11, 12 stay zero: deflate, adaptive filtering, no interlace.

  // One filter byte per scanline. Filter 0 (none) keeps this readable; these
  // images are flat colour, so deflate compresses them to nothing regardless.
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const src = y * width * 4;
    const dst = y * (1 + width * 4);
    raw[dst] = 0;
    rgba.copy(raw, dst + 1, src, src + width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- the mark ------------------------------------------------------------

// Signed distance to a rounded square centred in a unit box, negative inside.
function roundedSquare(x, y, half, radius) {
  const dx = Math.abs(x) - (half - radius);
  const dy = Math.abs(y) - (half - radius);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(dx, dy), 0) - radius;
}

// Which colour this point is, in a coordinate system where the icon spans
// -1..1 on both axes. `scale` shrinks the mark for maskable icons, whose outer
// ~20% can be cropped away by the launcher.
function mark(x, y, scale, tile) {
  // The tile itself. Maskable icons must bleed to the edge or the launcher
  // mats them onto white; the standard ones get a rounded silhouette.
  const inTile = tile ? true : roundedSquare(x, y, 1, 0.42) < 0;
  if (!inTile) return null;

  const s = 1 / scale;
  const px = x * s;
  const py = y * s;

  // A coin cut at -30 degrees into two pieces that have been pulled apart.
  //
  // The gap has to be carved out of the disc, not implied by moving the two
  // halves: translating a whole circle along the cut normal leaves its middle
  // covering the line, so the seam never opens. Each half is therefore a disc
  // intersected with "far enough past the cut", and only then displaced.
  const nx = Math.sin(Math.PI / 6);
  const ny = Math.cos(Math.PI / 6);
  const R = 0.62;
  const GAP = 0.05; // half-width of the cut
  const SHIFT = 0.04; // how far each piece slides away from it

  for (const dir of [1, -1]) {
    const qx = px - nx * SHIFT * dir;
    const qy = py - ny * SHIFT * dir;
    const beyondCut = (qx * nx + qy * ny) * dir > GAP;
    if (beyondCut && Math.sqrt(qx * qx + qy * qy) < R) return CREAM;
  }

  return TERRACOTTA;
}

function render(size, { scale = 1, tile = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3; // supersampling factor, for edges that are not staircases

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
          const c = mark(x, y, scale, tile);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 255;
          }
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      // Premultiplied averaging would darken the edge against the transparent
      // background, so average the colour over covered samples only.
      const covered = a / 255;
      rgba[i] = covered ? Math.round(r / covered) : 0;
      rgba[i + 1] = covered ? Math.round(g / covered) : 0;
      rgba[i + 2] = covered ? Math.round(b / covered) : 0;
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, rgba);
}

const outputs = [
  ["public/icon-192.png", 192, {}],
  ["public/icon-512.png", 512, {}],
  // Maskable: full bleed, mark pulled in to survive the launcher's crop.
  ["public/icon-maskable-512.png", 512, { scale: 0.62, tile: true }],
  // Picked up automatically by Next's metadata file conventions.
  ["src/app/icon.png", 192, {}],
  ["src/app/apple-icon.png", 180, { tile: true }],
];

mkdirSync(join(ROOT, "public"), { recursive: true });
for (const [path, size, opts] of outputs) {
  const png = render(size, opts);
  writeFileSync(join(ROOT, path), png);
  console.log(`${path.padEnd(32)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KiB`);
}
