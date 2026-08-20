import { chromium, type BrowserContext, type Page } from "playwright";
import { PROFILE_DIR } from "./paths.js";

let context: BrowserContext | undefined;

async function launch(): Promise<BrowserContext> {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });
  // El navegador corre headed y está pensado para operarlo a mano, así que
  // cerrar la ventana es una acción normal — no un error. Sin esto la
  // referencia muerta queda cacheada y toda herramienta posterior falla con
  // "Target page, context or browser has been closed" hasta reiniciar el
  // servidor MCP.
  ctx.once("close", () => {
    if (context === ctx) context = undefined;
  });
  return ctx;
}

/**
 * Chromium con perfil persistente en disco, para que las sesiones/cookies
 * sobrevivan entre reinicios del servidor MCP. Se lanza una vez y se reusa;
 * si murió, la próxima llamada lo vuelve a levantar.
 */
async function getContext(): Promise<BrowserContext> {
  context ??= await launch();
  return context;
}

async function activePage(): Promise<Page> {
  const ctx = await getContext();
  const open = ctx.pages().filter((page) => !page.isClosed());
  return open[open.length - 1] ?? (await ctx.newPage());
}

/** Devuelve la pestaña activa, creando una si todavía no hay ninguna. */
export async function getActivePage(): Promise<Page> {
  try {
    return await activePage();
  } catch (error) {
    // Si el contexto cacheado murió sin que llegara el evento `close` (crash,
    // o carrera con el cierre), descartarlo y reintentar una vez. Cuando el
    // fallo viene de un contexto recién lanzado no hay nada que descartar y el
    // error es real: propagarlo.
    if (!context) throw error;
    context = undefined;
    return await activePage();
  }
}

/** Cierra el navegador. Devuelve `false` si no había ninguno abierto. */
export async function closeBrowser(): Promise<boolean> {
  const ctx = context;
  if (!ctx) return false;
  // Soltar la referencia antes de esperar el cierre: si `close()` falla, igual
  // queremos que la próxima llamada pueda relanzar en vez de quedar trabada.
  context = undefined;
  await ctx.close();
  return true;
}
