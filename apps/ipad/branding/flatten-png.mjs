// Convert an RGBA PNG to an opaque RGB PNG (App Store icons must have no alpha).
import fs from "node:fs";
import zlib from "node:zlib";

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readChunks(buf) {
  const chunks = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    chunks.push({ type, data });
    off += 12 + len;
  }
  return chunks;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const ft = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) v += paeth(a, b, c);
      else if (ft !== 0) throw new Error(`Unsupported filter ${ft}`);
      cur[x] = v & 0xff;
    }
  }
  return out;
}

const [, , inPath, outPath, bgHex = "#ffffff"] = process.argv;
const buf = fs.readFileSync(inPath);
if (!buf.subarray(0, 8).equals(SIG)) throw new Error("Not a PNG");

const chunks = readChunks(buf);
const ihdr = chunks.find((c) => c.type === "IHDR").data;
const width = ihdr.readUInt32BE(0);
const height = ihdr.readUInt32BE(4);
const depth = ihdr[8];
const colorType = ihdr[9];
if (depth !== 8) throw new Error(`Only 8-bit supported, got ${depth}`);
if (colorType !== 6 && colorType !== 2) throw new Error(`Unsupported colour type ${colorType}`);

if (colorType === 2) {
  fs.copyFileSync(inPath, outPath);
  console.log(`${outPath}: already RGB, copied`);
  process.exit(0);
}

const idat = zlib.inflateSync(
  Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data))
);
const px = unfilter(idat, width, height, 4);

const bg = [1, 3, 5].map((i) => parseInt(bgHex.slice(i, i + 2), 16));
const stride = width * 3;
const out = Buffer.alloc((stride + 1) * height);
let anyTransparent = false;
for (let y = 0; y < height; y++) {
  out[y * (stride + 1)] = 0; // filter: None
  for (let x = 0; x < width; x++) {
    const s = (y * width + x) * 4;
    const d = y * (stride + 1) + 1 + x * 3;
    const alpha = px[s + 3];
    if (alpha !== 255) anyTransparent = true;
    for (let ch = 0; ch < 3; ch++) {
      // Composite over the background colour; a fully opaque source is unchanged.
      out[d + ch] = Math.round((px[s + ch] * alpha + bg[ch] * (255 - alpha)) / 255);
    }
  }
}

const newIhdr = Buffer.from(ihdr);
newIhdr[9] = 2; // truecolour, no alpha
fs.writeFileSync(
  outPath,
  Buffer.concat([
    SIG,
    chunk("IHDR", newIhdr),
    chunk("IDAT", zlib.deflateSync(out, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
);
console.log(`${outPath}: ${width}x${height} RGB${anyTransparent ? " (composited over " + bgHex + ")" : " (source fully opaque)"}`);
