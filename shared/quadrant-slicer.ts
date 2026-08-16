// Spatial 2x2 Quadrant Multiplexing & Slicing
//
// Slices a high-resolution camera video frame into 4 sub-quadrants so that
// multiple spatial QR matrix tiles can be processed in parallel.

export interface QuadrantSlice {
  index: number; // 0: Top-Left, 1: Top-Right, 2: Bottom-Left, 3: Bottom-Right
  buf: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Slice an RGBA buffer into 4 quadrants (2x2 grid).
 */
export function sliceQuadrants(
  srcRgba: Uint8ClampedArray | Uint8Array,
  srcWidth: number,
  srcHeight: number,
): QuadrantSlice[] {
  const halfW = Math.floor(srcWidth / 2);
  const halfH = Math.floor(srcHeight / 2);
  const quadPixels = halfW * halfH;

  const q0 = new Uint8ClampedArray(quadPixels * 4); // Top-Left
  const q1 = new Uint8ClampedArray(quadPixels * 4); // Top-Right
  const q2 = new Uint8ClampedArray(quadPixels * 4); // Bottom-Left
  const q3 = new Uint8ClampedArray(quadPixels * 4); // Bottom-Right

  const q0_32 = new Uint32Array(q0.buffer);
  const q1_32 = new Uint32Array(q1.buffer);
  const q2_32 = new Uint32Array(q2.buffer);
  const q3_32 = new Uint32Array(q3.buffer);
  const src32 = new Uint32Array(srcRgba.buffer, srcRgba.byteOffset, srcWidth * srcHeight);

  // Top half: Rows 0 .. halfH - 1
  for (let y = 0; y < halfH; y++) {
    const srcRow = y * srcWidth;
    const dstRow = y * halfW;
    for (let x = 0; x < halfW; x++) {
      q0_32[dstRow + x] = src32[srcRow + x]!;
      q1_32[dstRow + x] = src32[srcRow + halfW + x]!;
    }
  }

  // Bottom half: Rows halfH .. 2*halfH - 1
  for (let y = 0; y < halfH; y++) {
    const srcRow = (halfH + y) * srcWidth;
    const dstRow = y * halfW;
    for (let x = 0; x < halfW; x++) {
      q2_32[dstRow + x] = src32[srcRow + x]!;
      q3_32[dstRow + x] = src32[srcRow + halfW + x]!;
    }
  }

  return [
    { index: 0, buf: q0, width: halfW, height: halfH },
    { index: 1, buf: q1, width: halfW, height: halfH },
    { index: 2, buf: q2, width: halfW, height: halfH },
    { index: 3, buf: q3, width: halfW, height: halfH },
  ];
}
