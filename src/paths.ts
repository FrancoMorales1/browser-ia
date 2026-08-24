import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

// Works both compiled (dist/paths.js) and via tsx (src/paths.ts): in both
// cases this file lives exactly one level below the project root.
const HERE = dirname(fileURLToPath(import.meta.url));

export const ROOT = resolve(HERE, "..");
export const SCRIPTS_DIR = resolve(ROOT, "scripts");
export const OUTPUT_DIR = resolve(ROOT, "output");
export const PROFILE_DIR = resolve(ROOT, "profile");
export const CONFIG_DIR = resolve(ROOT, "config");
export const WEB_DIR = resolve(ROOT, "web");

for (const dir of [SCRIPTS_DIR, OUTPUT_DIR, PROFILE_DIR]) {
  mkdirSync(dir, { recursive: true });
}
