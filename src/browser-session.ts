import { chromium, type BrowserContext, type Page } from "playwright";
import { PROFILE_DIR } from "./paths.js";

let context: BrowserContext | undefined;
let launching: Promise<BrowserContext> | undefined;

async function launch(): Promise<BrowserContext> {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    // viewport: null deja que Chromium controle el tamaño de la ventana como
    // una app normal (movible, redimensionable a mano). Con un viewport fijo,
    // Playwright reimpone ese tamaño vía CDP y la ventana "pelea" contra
    // cualquier intento de moverla o resizearla manualmente.
    viewport: null,
    // --disable-gpu evita el pipeline de GPU (ANGLE/SwiftShader) que Chromium
    // usa por default y que bajo WSLg puede dejar la ventana congelada sin
    // que el proceso en sí esté colgado — cae a rasterizado 100% por CPU.
    args: ["--start-maximized", "--disable-gpu"],
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
 *
 * `launching` evita una carrera cuando dos llamadas concurrentes (ej: abrir
 * las pestañas de chat y settings en paralelo) ven `context` vacío al mismo
 * tiempo: sin esto, cada una intenta lanzar Chromium por su cuenta contra el
 * mismo perfil, y la segunda choca con el SingletonLock de la primera.
 */
async function getContext(): Promise<BrowserContext> {
  if (context) return context;
  launching ??= launch().finally(() => {
    launching = undefined;
  });
  context = await launching;
  return context;
}

const utilityPages = new Set<Page>();

async function activePage(): Promise<Page> {
  const ctx = await getContext();
  const open = ctx.pages().filter((page) => !page.isClosed() && !utilityPages.has(page));
  return open[open.length - 1] ?? (await ctx.newPage());
}

/**
 * Abre una pestaña de utilidad (UI propia: chat, settings) en el mismo
 * contexto/perfil que la automatización, pero excluida de la selección de
 * "pestaña activa": las tools de navegación/scripts nunca la tocan ni la
 * devuelven desde getActivePage().
 */
export async function openUtilityTab(url: string): Promise<Page> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  utilityPages.add(page);
  page.once("close", () => utilityPages.delete(page));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
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
