#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliTs = path.join(__dirname, "cli.ts");

const res = spawnSync("npx", ["tsx", `"${cliTs}"`, ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
});

process.exit(res.status ?? 0);
