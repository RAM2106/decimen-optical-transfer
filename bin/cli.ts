#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import { packFile, fnv1a } from "../shared/protocol.js";
import { LTEncoder } from "../shared/fountain.js";
import { DEFAULT_FRAME_BYTES, DEFAULT_TX_FPS } from "../shared/send-settings.js";

const args = process.argv.slice(2);
const command = args[0];

function showHelp() {
  console.log(`
📡 RAM21 Optical Transfer CLI Tool

Usage:
  npx ram21-transfer send <file_path|text> [--fps <number>] [--bytes <number>]
  npx ram21-transfer receive [--out <output_dir>]
  npx ram21-transfer --help

Examples:
  npx ram21-transfer send ./document.pdf --fps 24 --bytes 1465
  npx ram21-transfer send "Hello world!"
  npx ram21-transfer receive --out ./downloads
`);
}

function parseOptions(argsList: string[]) {
  const options: Record<string, string> = {};
  for (let i = 0; i < argsList.length; i++) {
    if (argsList[i].startsWith("--")) {
      const key = argsList[i].slice(2);
      const val = argsList[i + 1] && !argsList[i + 1].startsWith("--") ? argsList[i + 1] : "true";
      options[key] = val;
    }
  }
  return options;
}

async function runSend(target: string, options: Record<string, string>) {
  if (!target) {
    console.error("❌ Error: Please specify a file path or text snippet to send.");
    process.exit(1);
  }

  const fps = Number(options.fps) || DEFAULT_TX_FPS;
  const blockLen = Number(options.bytes) || DEFAULT_FRAME_BYTES;
  const sessionId = (Math.random() * 0xffff) | 0;

  let packed;
  let filename = "";

  if (fs.existsSync(target)) {
    const stats = fs.statSync(target);
    if (!stats.isFile()) {
      console.error(`❌ Error: ${target} is not a file.`);
      process.exit(1);
    }
    filename = path.basename(target);
    const fileBytes = fs.readFileSync(target);
    console.log(`📦 Packing file: ${filename} (${(fileBytes.length / 1024).toFixed(1)} KB)...`);
    packed = await packFile(filename, "application/octet-stream", fileBytes);
  } else {
    filename = "snippet.txt";
    const textBytes = new TextEncoder().encode(target);
    console.log(`📝 Packing text snippet (${textBytes.length} bytes)...`);
    packed = await packFile("snippet.txt", "text/plain;charset=utf-8", textBytes);
  }

  const encoder = new LTEncoder(packed.container, blockLen, sessionId);
  console.log(`🚀 Streaming RAM21 Optical Transfer: ${filename}`);
  console.log(`⚙️  Target: ${fps} FPS | Block Size: ${blockLen} bytes | Total Fountain Blocks: ${encoder.k}`);
  console.log(`Press Ctrl+C to stop.\n`);

  let seq = 0;
  const intervalMs = Math.round(1000 / fps);

  setInterval(async () => {
    try {
      const block = encoder.encode(seq);
      // Build 20-byte binary header
      const header = new Uint8Array(20);
      const view = new DataView(header.buffer);
      view.setUint8(0, 0xd1);
      view.setUint8(1, 0x0c);
      view.setUint16(2, sessionId, true);
      view.setUint32(4, seq, true);
      view.setUint16(8, encoder.k, true);
      view.setUint16(10, blockLen, true);
      view.setUint32(12, packed.container.length, true);
      view.setUint32(16, fnv1a(packed.container), true);

      const framePayload = new Uint8Array(20 + block.length);
      framePayload.set(header, 0);
      framePayload.set(block, 20);

      // Encode framePayload to Base64 string for QR module rendering
      const base64Str = Buffer.from(framePayload).toString("base64");
      const qrAscii = await QRCode.toString(base64Str, { type: "terminal", small: true });

      // Clear screen line & move up
      process.stdout.write("\x1Bc");
      console.log(`📡 RAM21 Optical Stream | Frame #${seq} | K=${encoder.k} blocks`);
      console.log(qrAscii);
      seq++;
    } catch (err) {
      // Ignore transient render glitches
    }
  }, intervalMs);
}

async function main() {
  if (!command || command === "--help" || command === "-h") {
    showHelp();
    return;
  }

  if (command === "send") {
    const target = args[1];
    const opts = parseOptions(args.slice(2));
    await runSend(target, opts);
  } else if (command === "receive") {
    console.log("📷 RAM21 CLI Receiver mode requires a connected camera stream.");
    console.log("👉 Tip: For mobile phone scanning, open https://localhost:5180/receive/ or use the mobile PWA app.");
  } else {
    showHelp();
  }
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
  process.exit(1);
});
