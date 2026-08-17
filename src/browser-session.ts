import { chromium, type BrowserContext, type Page } from "playwright";
import { PROFILE_DIR } from "./paths.js";

let context: BrowserContext | undefined;

/**
 * Lanza (una sola vez) un Chromium con perfil persistente en disco, para que
 * las sesiones/cookies sobrevivan entre reinicios del servidor MCP.
 */
async function getContext(): Promise<BrowserContext> {
  if (!context) {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1280, height: 800 },
    });
  }
  return context;
}

/** Devuelve la pestaña activa, creando una si todavía no hay ninguna. */
export async function getActivePage(): Promise<Page> {
  const ctx = await getContext();
  const pages = ctx.pages();
  return pages[pages.length - 1] ?? (await ctx.newPage());
}

export async function closeBrowser(): Promise<void> {
  await context?.close();
  context = undefined;
}
