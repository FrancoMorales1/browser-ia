import { config as dotenvConfig } from "dotenv";
import { join } from "node:path";
import { CONFIG_DIR } from "./paths.js";

const ENV_PATH = join(CONFIG_DIR, ".env");

/** Carga config/.env en process.env. Llamar una vez al arrancar el modo web. */
export function loadEnv(): void {
  dotenvConfig({ path: ENV_PATH });
}

export function getWebPort(): number {
  return Number(process.env.WEB_PORT) || 4127;
}
