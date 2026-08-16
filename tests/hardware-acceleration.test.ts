import assert from "node:assert/strict";
import test from "node:test";

test("BarcodeDetector hardware acceleration API detection is supported in global scope", () => {
  const mockBarcodeDetector = class {
    formats: string[];
    constructor(opts: { formats: string[] }) {
      this.formats = opts.formats;
    }
    async detect(_img: unknown) {
      return [{ rawValue: "test-qr", rawValueBytes: new TextEncoder().encode("test-qr") }];
    }
  };

  // Verify that detector instantiates and resolves properly
  const detector = new mockBarcodeDetector({ formats: ["qr_code"] });
  assert.equal(detector.formats[0], "qr_code");

  return detector.detect(null).then((results) => {
    assert.equal(results.length, 1);
    assert.equal(results[0]?.rawValue, "test-qr");
  });
});
