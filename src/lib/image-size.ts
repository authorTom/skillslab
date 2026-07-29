// Pixel dimensions read straight from an image's header. A dependency-free
// reader is enough here: the library only needs the numbers for display, and
// anything unrecognised simply reports null.

export interface ImageSize {
  width: number;
  height: number;
}

export function imageSize(data: Buffer, ext: string): ImageSize | null {
  switch (ext) {
    case ".png":
      return png(data);
    case ".jpg":
    case ".jpeg":
      return jpeg(data);
    case ".gif":
      return gif(data);
    case ".webp":
      return webp(data);
    case ".svg":
      return svg(data);
    default:
      // AVIF lives in a full ISOBMFF box tree — not worth parsing by hand.
      return null;
  }
}

function png(data: Buffer): ImageSize | null {
  // 8-byte signature, then an IHDR chunk whose payload starts at byte 16.
  if (data.length < 24 || data.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function jpeg(data: Buffer): ImageSize | null {
  if (data.length < 4 || data.readUInt16BE(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) return null;
    const marker = data[offset + 1];
    const length = data.readUInt16BE(offset + 2);
    // SOF0-SOF15 carry the frame size; SOF4/SOF8/SOF12 are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function gif(data: Buffer): ImageSize | null {
  if (data.length < 10 || data.toString("ascii", 0, 3) !== "GIF") return null;
  return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
}

function webp(data: Buffer): ImageSize | null {
  if (data.length < 30 || data.toString("ascii", 8, 12) !== "WEBP") return null;
  const format = data.toString("ascii", 12, 16);
  if (format === "VP8 ") {
    return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  }
  if (format === "VP8L") {
    // 14 bits each, packed across four bytes after the 1-byte signature.
    const bits = data.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === "VP8X") {
    const dimension = (at: number) => data.readUIntLE(at, 3) + 1;
    return { width: dimension(24), height: dimension(27) };
  }
  return null;
}

function svg(data: Buffer): ImageSize | null {
  const header = data.toString("utf8", 0, Math.min(data.length, 2048));
  const attribute = (name: string) => {
    const match = header.match(new RegExp(`\\b${name}\\s*=\\s*["']([\\d.]+)`, "i"));
    return match ? Number(match[1]) : NaN;
  };

  const width = attribute("width");
  const height = attribute("height");
  if (Number.isFinite(width) && Number.isFinite(height)) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const viewBox = header.match(/\bviewBox\s*=\s*["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  return viewBox
    ? { width: Math.round(Number(viewBox[1])), height: Math.round(Number(viewBox[2])) }
    : null;
}
