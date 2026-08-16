import assert from "node:assert/strict";
import test from "node:test";
import { sliceQuadrants } from "../shared/quadrant-slicer.ts";

test("sliceQuadrants correctly extracts 4 quadrants from 2x2 pixel buffer", () => {
  // 2x2 image = 4 pixels:
  // (0,0)=Red,   (1,0)=Green
  // (0,1)=Blue,  (1,1)=White
  const rgba = new Uint8ClampedArray([
    255, 0, 0, 255,     0, 255, 0, 255,
    0, 0, 255, 255,     255, 255, 255, 255
  ]);

  const slices = sliceQuadrants(rgba, 2, 2);
  assert.equal(slices.length, 4);

  // Quadrant 0 (Top-Left): 1x1, Pixel = Red (255, 0, 0, 255)
  assert.equal(slices[0]?.width, 1);
  assert.equal(slices[0]?.height, 1);
  assert.equal(slices[0]?.buf[0], 255);
  assert.equal(slices[0]?.buf[1], 0);
  assert.equal(slices[0]?.buf[2], 0);

  // Quadrant 1 (Top-Right): 1x1, Pixel = Green (0, 255, 0, 255)
  assert.equal(slices[1]?.buf[0], 0);
  assert.equal(slices[1]?.buf[1], 255);
  assert.equal(slices[1]?.buf[2], 0);

  // Quadrant 2 (Bottom-Left): 1x1, Pixel = Blue (0, 0, 255, 255)
  assert.equal(slices[2]?.buf[0], 0);
  assert.equal(slices[2]?.buf[1], 0);
  assert.equal(slices[2]?.buf[2], 255);

  // Quadrant 3 (Bottom-Right): 1x1, Pixel = White (255, 255, 255, 255)
  assert.equal(slices[3]?.buf[0], 255);
  assert.equal(slices[3]?.buf[1], 255);
  assert.equal(slices[3]?.buf[2], 255);
});
