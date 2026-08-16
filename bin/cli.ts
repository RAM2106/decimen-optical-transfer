#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { execSync } from "node:child_process";
import QRCode from "qrcode";
import { packFile, packFrame, fnv1a, type FrameHeader } from "../shared/protocol.js";
import { packSnippet } from "../shared/snippet.js";
import { LTEncoder } from "../shared/fountain.js";
import { DEFAULT_FRAME_BYTES, DEFAULT_TX_FPS } from "../shared/send-settings.js";

const args = process.argv.slice(2);
const command = args[0];

function showHelp() {
  console.log(`
📡 Night Coder Transfer CLI

Usage with npx:
  npx ram21-transfer               (Opens file picker & streams)
  npx ram21-transfer [file_path]   (Streams file or text directly)
  npx ram21-transfer -t [file]     (⚡ Turbo Mode · 50+ MB/s)
  npx ram21-transfer -s            (📱 Show receiver app QR)
  npx ram21-transfer menu          (🖱️ Add to Windows right-click menu)
  npx ram21-transfer -h            (Show this help message)

👉 Tip: Install globally with 'npm i -g ram21-transfer' to just type 'ram21' or 'nightcoder'!
`);
}

function extractTargetAndOptions(sendArgs: string[]): { target: string; options: Record<string, string> } {
  const options: Record<string, string> = {};
  const nonFlagWords: string[] = [];

  for (let i = 0; i < sendArgs.length; i++) {
    const arg = sendArgs[i];
    if (arg === "-t" || arg === "--turbo" || arg === "--fast") {
      options.turbo = "true";
    } else if (arg === "-s" || arg === "--share") {
      options.share = "true";
    } else if (arg === "-h" || arg === "--help" || arg === "help") {
      options.help = "true";
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const val = sendArgs[i + 1] && !sendArgs[i + 1].startsWith("-") ? sendArgs[i + 1] : "true";
      options[key] = val;
      if (val !== "true") i++;
    } else if (arg.startsWith("-") && arg.length === 2) {
      const key = arg.slice(1);
      const val = sendArgs[i + 1] && !sendArgs[i + 1].startsWith("-") ? sendArgs[i + 1] : "true";
      options[key] = val;
      if (val !== "true") i++;
    } else {
      nonFlagWords.push(arg);
    }
  }

  if (nonFlagWords.length === 0) {
    return { target: "", options };
  }

  const firstWord = nonFlagWords[0];
  if (fs.existsSync(firstWord) && fs.statSync(firstWord).isFile()) {
    return { target: firstWord, options };
  }

  return { target: nonFlagWords.join(" "), options };
}

function openNativeFileDialog(): string | null {
  if (process.platform === "win32") {
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; $d.Title = 'Night Coder Optical Transfer — Pick a file to stream'; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.FileName }`;
    try {
      const out = execSync(`powershell -NoProfile -Command "${psScript}"`, { encoding: "utf8" }).trim();
      return out || null;
    } catch {
      return null;
    }
  } else if (process.platform === "darwin") {
    try {
      const out = execSync(`osascript -e 'posix path of (choose file with prompt "Night Coder Optical Transfer — Pick a file")'`, { encoding: "utf8" }).trim();
      return out || null;
    } catch {
      return null;
    }
  }
  return null;
}

function registerWindowsContextMenu() {
  if (process.platform !== "win32") {
    console.log("ℹ️ Right-click context menu registration is supported on Windows.");
    return;
  }
  try {
    const regKey1 = `HKCU\\Software\\Classes\\*\\shell\\NightCoderTransfer`;
    const regCmd1 = `cmd.exe /c npx ram21-transfer send "%1"`;
    execSync(`reg add "${regKey1}" /ve /d "Send via Night Coder Optical Stream (Air-Gapped)" /f`);
    execSync(`reg add "${regKey1}\\command" /ve /d "${regCmd1}" /f`);

    const regKey2 = `HKCU\\Software\\Classes\\*\\shell\\NightCoderTurbo`;
    const regCmd2 = `cmd.exe /c npx ram21-transfer turbo "%1"`;
    execSync(`reg add "${regKey2}" /ve /d "Send via Night Coder Turbo (50+ MB/s)" /f`);
    execSync(`reg add "${regKey2}\\command" /ve /d "${regCmd2}" /f`);

    console.log("✅ Successfully added Night Coder options to Windows right-click menu!");
    console.log("  1. 'Send via Night Coder Optical Stream (Air-Gapped)'");
    console.log("  2. 'Send via Night Coder Turbo (50+ MB/s)'");
  } catch (err) {
    console.error("❌ Failed to register context menu:", err instanceof Error ? err.message : String(err));
  }
}

function getLocalIpAddress(): string {
  try {
    const interfaces = os.networkInterfaces();
    let fallbackIp = "localhost";
    for (const name of Object.keys(interfaces)) {
      const lowerName = name.toLowerCase();
      // Skip VirtualBox, VMware, WSL, and Hyper-V virtual adapters
      if (
        lowerName.includes("virtual") ||
        lowerName.includes("vbox") ||
        lowerName.includes("vmware") ||
        lowerName.includes("vethernet") ||
        lowerName.includes("wsl")
      ) {
        continue;
      }
      for (const net of interfaces[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          if (net.address.startsWith("192.168.56.")) {
            fallbackIp = net.address;
            continue;
          }
          return net.address;
        }
      }
    }
    return fallbackIp;
  } catch {
    return "localhost";
  }
}

async function runShare(customUrl?: string) {
  const targetUrl = customUrl || "https://ram2106.github.io/decimen-optical-transfer/receive/";
  console.log(`\n📱 RAM21 Receiver Share Code`);
  console.log(`Point any mobile phone camera at this QR code to open the web receiver app:\n`);
  
  const qrAscii = await QRCode.toString(targetUrl, { type: "terminal", small: true });
  console.log(qrAscii);
  console.log(`🔗 Live App URL: ${targetUrl}`);
  const localIp = getLocalIpAddress();
  if (localIp !== "localhost") {
    console.log(`📡 Local Dev URL: https://${localIp}:5173/receive/\n`);
  }
}

function getOptimalBlockBytes(options: Record<string, string>): number {
  if (options.bytes && Number(options.bytes) > 0) {
    return Number(options.bytes);
  }
  // Default to 120 bytes: generates a clean, compact V6 QR code (45 cols) that fits every terminal perfectly
  return 120;
}

async function runSend(targetArg: string, options: Record<string, string>) {
  let target = targetArg;
  if (!target) {
    console.log("📁 Opening File Explorer dialog window to pick a file...");
    const picked = openNativeFileDialog();
    if (!picked) {
      console.log("❌ No file selected. Exiting.");
      process.exit(0);
    }
    target = picked;
  }

  const fps = Number(options.fps) || 30;
  const blockLen = getOptimalBlockBytes(options);
  const sessionId = (Math.random() * 0xffff) | 0;

  let packed;
  let filename = "";

  const isRealFile = fs.existsSync(target) && fs.statSync(target).isFile();

  if (isRealFile) {
    filename = path.basename(target);
    const fileBytes = fs.readFileSync(target);
    console.log(`📦 Packing file: ${filename} (${(fileBytes.length / 1024).toFixed(1)} KB)...`);
    packed = await packFile(filename, "application/octet-stream", fileBytes);
  } else {
    filename = "snippet.txt";
    const textBytes = new TextEncoder().encode(target);
    console.log(`💬 Packing text snippet (${textBytes.length} bytes): "${target}"`);
    packed = await packSnippet(target);
  }

  const encoder = new LTEncoder(packed.container, blockLen, sessionId);
  console.log(`🚀 Streaming Night Coder Optical Transfer: ${filename}`);
  console.log(`⚙️  Target: ${fps} FPS | Block Size: ${blockLen} bytes | Total Fountain Blocks: ${encoder.k}`);
  console.log(`Press Ctrl+C to stop.\n`);

  // Infinite continuous loop streaming by default
  const maxFrames = Number(options["stop-after"]) || 0;

  let seq = 0;
  const intervalMs = Math.round(1000 / fps);

  const timer = setInterval(async () => {
    try {
      if (maxFrames > 0 && seq >= maxFrames) {
        clearInterval(timer);
        process.stdout.write("\x1B[H\x1B[2J");
        console.log(`\n✅ Night Coder Optical Stream Batch Complete!`);
        console.log(`📦 Transmitted: ${filename} (${(packed.container.length / 1024).toFixed(1)} KB)`);
        console.log(`🎉 Total Frames Sent: ${seq} (${(seq / encoder.k).toFixed(1)}x fountain coverage)\n`);
        console.log(`👉 Didn't catch it on phone? Press [ENTER] to stream another batch, or [Ctrl+C] to exit.`);
        
        process.stdin.resume();
        process.stdin.once("data", () => {
          runSend(targetArg, options);
        });
        return;
      }

      const block = encoder.encode(seq);
      const header: FrameHeader = {
        sessionId,
        seq,
        k: encoder.k,
        blockLen,
        totalLen: packed.container.length,
        payloadFnv: fnv1a(packed.container),
      };
      const framePayload = packFrame(header, block);

      // Render raw binary byte segment to QR code for 100% receiver protocol compatibility
      const qrAscii = await QRCode.toString(
        [{ data: framePayload, mode: "byte" }] as unknown as QRCode.QRCodeSegment[],
        {
          type: "terminal",
          small: true,
          errorCorrectionLevel: "L",
        }
      );

      // Clear screen and move cursor to top-left (flicker-free rendering)
      process.stdout.write("\x1B[H\x1B[2J");
      console.log(`📡 Night Coder Optical Stream | Frame #${seq + 1}/${maxFrames || "∞"} | K=${encoder.k} blocks | ${filename}`);
      console.log(qrAscii);
      seq++;
    } catch (err) {
      // Ignore transient render glitches
    }
  }, intervalMs);
}

async function runTurbo(targetArg?: string) {
  let target = targetArg;
  if (!target) {
    console.log("📁 Opening File Explorer dialog window to pick a file...");
    const picked = openNativeFileDialog();
    if (!picked) {
      console.log("❌ No file selected. Exiting.");
      process.exit(0);
    }
    target = picked;
  }

  let filename = "downloaded-file.bin";
  let fileBytes: Buffer;
  const isRealFile = fs.existsSync(target) && fs.statSync(target).isFile();

  if (isRealFile) {
    filename = path.basename(target);
    fileBytes = fs.readFileSync(target);
  } else {
    filename = "snippet.txt";
    fileBytes = Buffer.from(target, "utf8");
  }

  const localIp = getLocalIpAddress();
  const server = http.createServer((req, res) => {
    // CORS and forced download attachment headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Length", fileBytes.length);
    res.setHeader("Content-Type", "application/octet-stream");

    if (req.url === "/" || req.url?.startsWith("/download") || req.url?.startsWith(`/${encodeURIComponent(filename)}`)) {
      const startTime = performance.now();
      res.writeHead(200);
      res.end(fileBytes, () => {
        const durationSec = Math.max(0.01, (performance.now() - startTime) / 1000);
        const mb = (fileBytes.length / (1024 * 1024)).toFixed(2);
        const mbps = ((fileBytes.length / (1024 * 1024)) / durationSec).toFixed(1);
        console.log(`\n🎉 [Instant Download Complete] Sent ${mb} MB in ${durationSec.toFixed(2)}s (${mbps} MB/s) to ${req.socket.remoteAddress}!`);
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  server.listen(0, "0.0.0.0", async () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 5188;
    const downloadUrl = `http://${localIp}:${port}/${encodeURIComponent(filename)}`;

    console.log(`\n⚡ Night Coder Turbo Download (50+ MB/s · Zero Internet)`);
    console.log(`📦 Serving: ${filename} (${(fileBytes.length / (1024 * 1024)).toFixed(2)} MB)`);
    console.log(`📱 Point ANY phone camera at this QR code to download instantly:\n`);

    const qrAscii = await QRCode.toString(downloadUrl, { type: "terminal", small: true });
    console.log(qrAscii);
    console.log(`🔗 Direct Download Link: ${downloadUrl}`);
    console.log(`💡 Note: Your phone and laptop should be on the same Wi-Fi or mobile hotspot.`);
    console.log(`Press Ctrl+C to stop.\n`);
  });
}

async function main() {
  const { target, options } = extractTargetAndOptions(args);

  if (options.help === "true" || command === "--help" || command === "-h" || command === "help") {
    showHelp();
    return;
  }

  if (options.share === "true" || command === "share" || command === "-s") {
    const customUrl = args[1] && !args[1].startsWith("-") ? args[1] : undefined;
    await runShare(customUrl);
    return;
  }

  if (command === "menu" || command === "register-menu") {
    registerWindowsContextMenu();
    return;
  }

  if (command === "receive") {
    console.log("📷 Night Coder CLI Receiver mode requires a connected camera stream.");
    console.log("👉 Tip: For mobile phone scanning, open https://ram2106.github.io/decimen-optical-transfer/receive/ or use the mobile PWA app.");
    return;
  }

  // Turbo Mode: npx ram21 -t [file] or npx ram21 turbo [file]
  if (options.turbo === "true" || command === "turbo" || command === "-t") {
    const cleanTarget = (target === "turbo" || target === "-t") ? "" : target;
    await runTurbo(cleanTarget);
    return;
  }

  // Optical Fountain Mode: npx ram21 [file] or npx ram21 (file picker) or npx ram21 send [file]
  const cleanTarget = target === "send" ? "" : target;
  await runSend(cleanTarget, options);
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
  process.exit(1);
});
