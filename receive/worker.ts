// QR decode worker: zxing-cpp compiled to WASM. (Safari has never shipped
// BarcodeDetector — WebKit bug 281848 — so WASM is the only portable way.)
// One frame in flight per worker; the main thread drops frames when all
// workers are busy. Frames are disposable — the fountain doesn't care.

import wasmUrl from "./wasm-url";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import { extractColorPlanes } from "../shared/color-raster";
import { sliceQuadrants } from "../shared/quadrant-slicer";

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? wasmUrl : prefix + path,
  },
});

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(msg: unknown, transfer?: Transferable[]): void;
};

async function decodeImage(img: ImageData): Promise<Uint8Array | null> {
  // ⚡ Hardware-accelerated Native BarcodeDetector (Chrome / Edge / Android)
  if ("BarcodeDetector" in self) {
    try {
      const detector = new (self as any).BarcodeDetector({ formats: ["qr_code", "qr_code_micro"] });
      const detected = await detector.detect(img);
      if (detected.length > 0 && detected[0].rawValue) {
        const raw = detected[0].rawValue;
        return typeof raw === "string" ? new TextEncoder().encode(raw) : (detected[0].rawValueBytes ?? null);
      }
    } catch {
      // Fall back to WASM
    }
  }

  // 🛡️ Portable WASM fallback (Safari / Firefox / Edge cases)
  try {
    const results = await readBarcodes(img, { formats: ["QRCode"], maxNumberOfSymbols: 1 });
    const r = results.find((x) => x.isValid && x.bytes.length > 0);
    if (r) return r.bytes;
  } catch {
    // Ignore decode error
  }

  return null;
}

ctx.onmessage = async (e: MessageEvent) => {
  const { id, buf, w, h } = e.data as { id: number; buf: ArrayBuffer; w: number; h: number };
  try {
    const rawData = new Uint8ClampedArray(buf);
    const img = new ImageData(rawData, w, h);

    const results: Uint8Array[] = [];

    // 1. Standard single frame decode attempt
    const single = await decodeImage(img);
    if (single) results.push(single);

    // 2. High-speed RGB Color Modulated stream decode attempt (3 simultaneous channels)
    if (results.length === 0) {
      const planes = extractColorPlanes(rawData, w, h);
      const imgR = new ImageData(planes.red, w, h);
      const imgG = new ImageData(planes.green, w, h);
      const imgB = new ImageData(planes.blue, w, h);

      const [bytesR, bytesG, bytesB] = await Promise.all([
        decodeImage(imgR),
        decodeImage(imgG),
        decodeImage(imgB),
      ]);

      if (bytesR) results.push(bytesR);
      if (bytesG) results.push(bytesG);
      if (bytesB) results.push(bytesB);
    }

    // 3. 2x2 Spatial Tiled Grid & Turbo Matrix decode attempt (4 to 12 frames per tick)
    if (results.length === 0 && w >= 100 && h >= 100) {
      const quads = sliceQuadrants(rawData, w, h);
      const quadPromises = quads.map(async (q) => {
        const qImg = new ImageData(q.buf, q.width, q.height);
        const qSingle = await decodeImage(qImg);
        if (qSingle) return [qSingle];

        const qPlanes = extractColorPlanes(q.buf, q.width, q.height);
        const [qr, qg, qb] = await Promise.all([
          decodeImage(new ImageData(qPlanes.red, q.width, q.height)),
          decodeImage(new ImageData(qPlanes.green, q.width, q.height)),
          decodeImage(new ImageData(qPlanes.blue, q.width, q.height)),
        ]);
        return [qr, qg, qb].filter((x): x is Uint8Array => x !== null);
      });

      const quadResults = (await Promise.all(quadPromises)).flat();
      results.push(...quadResults);
    }

    ctx.postMessage({ id, results, bytes: results[0] ?? null });
  } catch {
    ctx.postMessage({ id, results: [], bytes: null });
  }
};

// warm the WASM so the first real frame doesn't pay instantiation
void readBarcodes(new ImageData(8, 8), { formats: ["QRCode"] })
  .catch(() => undefined)
  .then(() => ctx.postMessage({ id: -1, bytes: null }));
