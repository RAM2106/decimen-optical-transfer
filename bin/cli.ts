#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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
📡 Night Coder Optical Transfer CLI Tool

Usage:
  npx ram21-transfer send [file_path|text] [--fps <number>] [--bytes <number>]
  npx ram21-transfer register-menu
  npx ram21-transfer share [url]
  npx ram21-transfer receive [--out <output_dir>]
  npx ram21-transfer --help

Examples:
  npx ram21-transfer send                   (Opens Native File Explorer Window!)
  npx ram21-transfer send ./document.pdf
  npx ram21-transfer register-menu          (Adds 'Send via Night Coder' to Windows right-click)
  npx ram21-transfer share
`);
}

function extractTargetAndOptions(sendArgs: string[]): { target: string; options: Record<string, string> } {
  const options: Record<string, string> = {};
  const nonFlagWords: string[] = [];

  for (let i = 0; i < sendArgs.length; i++) {
    if (sendArgs[i].startsWith("--")) {
      const key = sendArgs[i].slice(2);
      const val = sendArgs[i + 1] && !sendArgs[i + 1].startsWith("--") ? sendArgs[i + 1] : "true";
      options[key] = val;
      if (val !== "true") i++;
    } else {
      nonFlagWords.push(sendArgs[i]);
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
    const regKey = `HKCU\\Software\\Classes\\*\\shell\\NightCoderTransfer`;
    const regCmd = `cmd.exe /c npx ram21-transfer send "%1"`;
    execSync(`reg add "${regKey}" /ve /d "Send via Night Coder Optical Stream" /f`);
    execSync(`reg add "${regKey}\\command" /ve /d "${regCmd}" /f`);
    console.log("✅ Successfully added 'Send via Night Coder Optical Stream' to Windows right-click menu!");
    console.log("👉 Now you can right-click ANY file in File Explorer to stream it instantly.");
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

const DEFAULT_CLI_BLOCK_BYTES = 256;

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
  const blockLen = Number(options.bytes) || DEFAULT_CLI_BLOCK_BYTES;
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

  const loop = options.loop === "true" || options.loop === "1";
  const maxFrames = Number(options["stop-after"]) || (loop ? 0 : Math.max(encoder.k * 3, 40));

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

async function main() {
  if (!command || command === "--help" || command === "-h") {
    showHelp();
    return;
  }

  if (command === "send") {
    const { target, options } = extractTargetAndOptions(args.slice(1));
    await runSend(target, options);
  } else if (command === "register-menu") {
    registerWindowsContextMenu();
  } else if (command === "share") {
    const customUrl = args[1];
    await runShare(customUrl);
  } else if (command === "receive") {
    console.log("📷 Night Coder CLI Receiver mode requires a connected camera stream.");
    console.log("👉 Tip: For mobile phone scanning, open https://ram2106.github.io/decimen-optical-transfer/receive/ or use the mobile PWA app.");
  } else {
    showHelp();
  }
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
  process.exit(1);
});
