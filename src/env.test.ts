import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpConfigDir: string;

vi.mock("./paths.js", () => ({
  get CONFIG_DIR() {
    return tmpConfigDir;
  },
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  tmpConfigDir = mkdtempSync(join(tmpdir(), "browser-scripts-env-test-"));
  delete process.env.WEB_PORT;
});

afterEach(() => {
  rmSync(tmpConfigDir, { recursive: true, force: true });
  process.env = { ...ORIGINAL_ENV };
});

async function loadEnvModule() {
  vi.resetModules();
  return import("./env.js");
}

describe("getWebPort", () => {
  it("default es 4127", async () => {
    const { getWebPort } = await loadEnvModule();
    expect(getWebPort()).toBe(4127);
  });

  it("respeta WEB_PORT", async () => {
    process.env.WEB_PORT = "9999";
    const { getWebPort } = await loadEnvModule();
    expect(getWebPort()).toBe(9999);
  });
});

describe("loadEnv", () => {
  it("no tira si config/.env no existe", async () => {
    const { loadEnv } = await loadEnvModule();
    expect(() => loadEnv()).not.toThrow();
  });

  it("carga variables desde config/.env", async () => {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(tmpConfigDir, ".env"), "WEB_PORT=5555\n", "utf-8");
    const { loadEnv, getWebPort } = await loadEnvModule();
    loadEnv();
    expect(getWebPort()).toBe(5555);
  });
});
