// Multi-Channel RGB Optical Modulation & Demodulation
//
// Packs 3 independent QR fountain frames into the Red, Green, and Blue color channels
// of a single animated screen image on the sender, and separates them back into 3 clean
// grayscale QR image planes on the receiver.
//
// 100% pure functions compatible with both Node test runners and browser workers.

export interface RgbQrRaster {
  size: number;
  pixels: Uint32Array<ArrayBuffer>;
}

/**
 * Mix 3 QR module matrices into a single composite 32-bit RGBA pixel buffer.
 * Each module is 1 pixel (scaled up by canvas renderer).
 */
export function rasterizeRgbQr(
  moduleCount: number,
  modulesR: ArrayLike<number>,
  modulesG: ArrayLike<number>,
  modulesB: ArrayLike<number>,
  margin: number,
): RgbQrRaster {
  const size = moduleCount + 2 * margin;
  const pixels = new Uint32Array(size * size);
  // Default background is White (all channels 255, alpha 255)
  pixels.fill(0xffffffff);

  for (let y = 0; y < moduleCount; y++) {
    const row = (y + margin) * size + margin;
    const src = y * moduleCount;
    for (let x = 0; x < moduleCount; x++) {
      const isDarkR = modulesR[src + x] ? 0 : 255;
      const isDarkG = modulesG[src + x] ? 0 : 255;
      const isDarkB = modulesB[src + x] ? 0 : 255;
      // 0xAABBGGRR in little-endian Uint32
      pixels[row + x] =
        (0xff << 24) |
        ((isDarkB & 0xff) << 16) |
        ((isDarkG & 0xff) << 8) |
        (isDarkR & 0xff);
    }
  }

  return { size, pixels };
}

export interface ExtractedColorPlanes {
  red: Uint8ClampedArray<ArrayBuffer>;
  green: Uint8ClampedArray<ArrayBuffer>;
  blue: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
}

/**
 * Decomposes an RGBA video frame into 3 distinct grayscale image buffers (Red, Green, Blue planes).
 * Each extracted buffer has 4 bytes per pixel (R=G=B=channel, A=255) for seamless BarcodeDetector / ZXing decoding.
 */
export function extractColorPlanes(
  rgbaBuffer: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): ExtractedColorPlanes {
  const totalPixels = width * height;
  const red = new Uint8ClampedArray(new ArrayBuffer(totalPixels * 4));
  const green = new Uint8ClampedArray(new ArrayBuffer(totalPixels * 4));
  const blue = new Uint8ClampedArray(new ArrayBuffer(totalPixels * 4));

  const red32 = new Uint32Array(red.buffer);
  const green32 = new Uint32Array(green.buffer);
  const blue32 = new Uint32Array(blue.buffer);

  for (let i = 0; i < totalPixels; i++) {
    const srcOffset = i * 4;
    const r = rgbaBuffer[srcOffset + 0]!;
    const g = rgbaBuffer[srcOffset + 1]!;
    const b = rgbaBuffer[srcOffset + 2]!;

    // Duplicate channel across R, G, B with Alpha=255
    red32[i] = (0xff << 24) | (r << 16) | (r << 8) | r;
    green32[i] = (0xff << 24) | (g << 16) | (g << 8) | g;
    blue32[i] = (0xff << 24) | (b << 16) | (b << 8) | b;
  }

  return { red, green, blue, width, height };
}
