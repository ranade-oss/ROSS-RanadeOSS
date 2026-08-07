"use strict";

const MAX_INPUT_BYTES = 32 * 1024 * 1024;

function asBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError("image-size expects a Buffer or Uint8Array");
}

function requireBytes(buffer, offset, length) {
  if (offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new TypeError("image-size received a truncated image");
  }
}

function uint24le(buffer, offset) {
  requireBytes(buffer, offset, 3);
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function png(buffer) {
  requireBytes(buffer, 16, 8);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), type: "png" };
}

function gif(buffer) {
  requireBytes(buffer, 6, 4);
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8), type: "gif" };
}

function jpeg(buffer) {
  let offset = 2;
  const frameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);

  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    if (offset >= buffer.length) break;
    const marker = buffer[offset++];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
    if (marker === 0xda) break;
    requireBytes(buffer, offset, 2);
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2) throw new TypeError("image-size received an invalid JPEG segment");
    requireBytes(buffer, offset, segmentLength);
    if (frameMarkers.has(marker)) {
      requireBytes(buffer, offset, 7);
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
        type: "jpg",
      };
    }
    offset += segmentLength;
  }
  throw new TypeError("image-size could not read JPEG dimensions");
}

function webp(buffer) {
  requireBytes(buffer, 12, 8);
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    requireBytes(buffer, 24, 6);
    return {
      width: uint24le(buffer, 24) + 1,
      height: uint24le(buffer, 27) + 1,
      type: "webp",
    };
  }
  if (chunk === "VP8L") {
    requireBytes(buffer, 21, 5);
    if (buffer[20] !== 0x2f) throw new TypeError("image-size received an invalid VP8L image");
    const width = 1 + (buffer[21] | ((buffer[22] & 0x3f) << 8));
    const height = 1 + ((buffer[22] >> 6) | (buffer[23] << 2) | ((buffer[24] & 0x0f) << 10));
    return { width, height, type: "webp" };
  }
  if (chunk === "VP8 ") {
    requireBytes(buffer, 26, 6);
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) {
      throw new TypeError("image-size received an invalid VP8 image");
    }
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff, type: "webp" };
  }
  throw new TypeError("image-size received an unsupported WebP variant");
}

function bmp(buffer) {
  requireBytes(buffer, 14, 12);
  const dibSize = buffer.readUInt32LE(14);
  if (dibSize < 12) throw new TypeError("image-size received an invalid BMP header");
  const width = dibSize === 12 ? buffer.readUInt16LE(18) : Math.abs(buffer.readInt32LE(18));
  const height = dibSize === 12 ? buffer.readUInt16LE(20) : Math.abs(buffer.readInt32LE(22));
  return { width, height, type: "bmp" };
}

function ico(buffer) {
  requireBytes(buffer, 4, 2);
  const kind = buffer.readUInt16LE(2);
  if (kind !== 1 && kind !== 2) throw new TypeError("image-size received an invalid ICO header");
  const count = buffer.readUInt16LE(4);
  if (count < 1) throw new TypeError("image-size received an empty ICO file");
  requireBytes(buffer, 6, 4);
  return { width: buffer[6] || 256, height: buffer[7] || 256, type: kind === 2 ? "cur" : "ico" };
}

function imageSize(input) {
  const buffer = asBuffer(input);
  if (buffer.length > MAX_INPUT_BYTES) throw new RangeError("image-size input exceeds the bounded limit");
  requireBytes(buffer, 0, 2);

  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return png(buffer);
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") return gif(buffer);
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return jpeg(buffer);
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return webp(buffer);
  if (buffer.subarray(0, 2).toString("ascii") === "BM") return bmp(buffer);
  if (buffer[0] === 0 && buffer[1] === 0) return ico(buffer);
  throw new TypeError("image-size format is unsupported by the ROSS-safe reader");
}

module.exports = imageSize;
module.exports.imageSize = imageSize;
module.exports.default = imageSize;
