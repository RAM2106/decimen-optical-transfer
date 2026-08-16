import type { Plugin } from "vite";
import { renameSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

/** Vite names HTML output after its input path, so send/index.html lands at
 *  send/index.html. Standalone builds want one file with a memorable name. */
export function emitAs(outDir: string, from: string, to: string): Plugin {
  return {
    name: "emit-standalone-as",
    enforce: "post",
    closeBundle() {
      const srcPath = resolve(outDir, from);
      const dstPath = resolve(outDir, to);
      if (existsSync(srcPath)) {
        mkdirSync(dirname(dstPath), { recursive: true });
        renameSync(srcPath, dstPath);
        const topSubdir = from.split("/")[0];
        if (topSubdir && topSubdir !== from) {
          rmSync(resolve(outDir, topSubdir), { recursive: true, force: true });
        }
      }
    },
  };
}
