// QR decode worker: zxing-cpp compiled to WASM. (Safari has never shipped
// BarcodeDetector — WebKit bug 281848 — so WASM is the only portable way.)
// One frame in flight per worker; the main thread drops frames when all
// workers are busy. Frames are disposable — the fountain doesn't care.

import wasmUrl from "./wasm-url";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

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

ctx.onmessage = async (e: MessageEvent) => {
  const { id, buf, w, h } = e.data as { id: number; buf: ArrayBuffer; w: number; h: number };
  try {
    const img = new ImageData(new Uint8ClampedArray(buf), w, h);
    let bytes: Uint8Array | null = null;

    // ⚡ Hardware-accelerated Native BarcodeDetector (Chrome / Edge / Android)
    if ("BarcodeDetector" in self) {
      try {
        const detector = new (self as any).BarcodeDetector({ formats: ["qr_code", "qr_code_micro"] });
        const detected = await detector.detect(img);
        if (detected.length > 0 && detected[0].rawValue) {
          const raw = detected[0].rawValue;
          bytes = typeof raw === "string" ? new TextEncoder().encode(raw) : (detected[0].rawValueBytes ?? null);
        }
      } catch {
        // Fall back to WASM if native detector throws on frame
      }
    }

    // 🛡️ Portable WASM fallback (Safari / Firefox / Edge cases)
    if (!bytes) {
      const results = await readBarcodes(img, { formats: ["QRCode"], maxNumberOfSymbols: 1 });
      const r = results.find((x) => x.isValid && x.bytes.length > 0);
      if (r) bytes = r.bytes;
    }

    ctx.postMessage({ id, bytes });
  } catch {
    ctx.postMessage({ id, bytes: null });
  }
};

// warm the WASM so the first real frame doesn't pay instantiation
void readBarcodes(new ImageData(8, 8), { formats: ["QRCode"] })
  .catch(() => undefined)
  .then(() => ctx.postMessage({ id: -1, bytes: null }));
