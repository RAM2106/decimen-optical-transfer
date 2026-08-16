import assert from "node:assert/strict";
import test from "node:test";
import { rasterizeRgbQr, extractColorPlanes } from "../shared/color-raster.ts";

test("RGB QR rasterization correctly mixes 3 distinct module channels", () => {
  // 1x1 module with 1px margin = 3x3 pixel output
  const modCount = 1;
  const margin = 1;
  const modR = [1]; // R is dark
  const modG = [0]; // G is light
  const modB = [1]; // B is dark

  const raster = rasterizeRgbQr(modCount, modR, modG, modB, margin);
  assert.equal(raster.size, 3);
  assert.equal(raster.pixels.length, 9);

  // Background margin pixels should all be White (0xFFFFFFFF)
  assert.equal(raster.pixels[0], 0xffffffff);

  // Center pixel (1, 1) index is row (1)*3 + 1 = 4
  // R dark (0), G light (255), B dark (0) -> Green (0xFF00FF00)
  const centerPixel = raster.pixels[4]!;
  const rByte = centerPixel & 0xff;
  const gByte = (centerPixel >> 8) & 0xff;
  const bByte = (centerPixel >> 16) & 0xff;
  const aByte = (centerPixel >> 24) & 0xff;

  assert.equal(rByte, 0);
  assert.equal(gByte, 255);
  assert.equal(bByte, 0);
  assert.equal(aByte, 255);
});

test("Color plane extraction cleanly separates R, G, B channels into grayscale buffers", () => {
  const width = 2;
  const height = 1;
  // 2 pixels: Pixel 0 = Red (255, 0, 0, 255), Pixel 1 = Cyan (0, 255, 255, 255)
  const rgba = new Uint8ClampedArray([
    255, 0, 0, 255,   // Pixel 0
    0, 255, 255, 255, // Pixel 1
  ]);

  const planes = extractColorPlanes(rgba, width, height);
  assert.equal(planes.width, 2);
  assert.equal(planes.height, 1);

  // Red plane:
  // Pixel 0 should have R=G=B=255
  assert.equal(planes.red[0], 255);
  assert.equal(planes.red[1], 255);
  assert.equal(planes.red[2], 255);
  // Pixel 1 in Red plane should have R=G=B=0
  assert.equal(planes.red[4], 0);
  assert.equal(planes.red[5], 0);
  assert.equal(planes.red[6], 0);

  // Green plane:
  // Pixel 0 should have R=G=B=0
  assert.equal(planes.green[0], 0);
  // Pixel 1 should have R=G=B=255
  assert.equal(planes.green[4], 255);

  // Blue plane:
  // Pixel 0 should have R=G=B=0
  assert.equal(planes.blue[0], 0);
  // Pixel 1 should have R=G=B=255
  assert.equal(planes.blue[4], 255);
});
