import { beforeEach, describe, expect, it, vi } from "vitest";

const { launchPersistentContext } = vi.hoisted(() => ({ launchPersistentContext: vi.fn() }));

vi.mock("playwright", () => ({ chromium: { launchPersistentContext } }));
vi.mock("./paths.js", () => ({ PROFILE_DIR: "/tmp/browser-scripts-test-profile" }));

/** Doble de BrowserContext con lo mínimo que usa browser-session. */
function fakeContext() {
  let onClose: (() => void) | undefined;
  const page = { isClosed: () => false };
  return {
    page,
    pages: vi.fn(() => [page]),
    newPage: vi.fn(() => Promise.resolve(page)),
    close: vi.fn(() => Promise.resolve()),
    once: vi.fn((event: string, fn: () => void) => {
      if (event === "close") onClose = fn;
    }),
    /** Simula que el usuario cerró la ventana a mano. */
    emitClose: () => onClose?.(),
  };
}

/** El módulo guarda el contexto en una variable de módulo: recargarlo por test. */
async function loadSession() {
  vi.resetModules();
  return import("./browser-session.js");
}

beforeEach(() => {
  launchPersistentContext.mockReset();
});

describe("getActivePage", () => {
  it("reusa el mismo navegador entre llamadas", async () => {
    launchPersistentContext.mockResolvedValue(fakeContext());
    const { getActivePage } = await loadSession();

    await getActivePage();
    await getActivePage();

    expect(launchPersistentContext).toHaveBeenCalledTimes(1);
  });

  it("relanza el navegador si se cerró la ventana a mano", async () => {
    const first = fakeContext();
    launchPersistentContext.mockResolvedValueOnce(first).mockResolvedValueOnce(fakeContext());
    const { getActivePage } = await loadSession();

    await getActivePage();
    first.emitClose();
    await getActivePage();

    expect(launchPersistentContext).toHaveBeenCalledTimes(2);
  });

  it("descarta el contexto y reintenta si el navegador murió sin avisar", async () => {
    const dead = fakeContext();
    dead.pages.mockImplementation(() => {
      throw new Error("Target page, context or browser has been closed");
    });
    launchPersistentContext.mockResolvedValueOnce(dead).mockResolvedValueOnce(fakeContext());
    const { getActivePage } = await loadSession();

    await expect(getActivePage()).resolves.toBeDefined();
    expect(launchPersistentContext).toHaveBeenCalledTimes(2);
  });

  it("propaga el error si falla el lanzamiento en sí", async () => {
    launchPersistentContext.mockRejectedValue(new Error("Missing X server or $DISPLAY"));
    const { getActivePage } = await loadSession();

    await expect(getActivePage()).rejects.toThrow("Missing X server");
    expect(launchPersistentContext).toHaveBeenCalledTimes(1);
  });
});

describe("closeBrowser", () => {
  it("cierra el navegador y permite volver a abrirlo", async () => {
    const first = fakeContext();
    launchPersistentContext.mockResolvedValueOnce(first).mockResolvedValueOnce(fakeContext());
    const { getActivePage, closeBrowser } = await loadSession();

    await getActivePage();
    await expect(closeBrowser()).resolves.toBe(true);
    expect(first.close).toHaveBeenCalledTimes(1);

    await getActivePage();
    expect(launchPersistentContext).toHaveBeenCalledTimes(2);
  });

  it("devuelve false si no había navegador abierto", async () => {
    const { closeBrowser } = await loadSession();
    await expect(closeBrowser()).resolves.toBe(false);
  });

  it("libera la referencia aunque el cierre falle", async () => {
    const broken = fakeContext();
    broken.close.mockRejectedValue(new Error("boom"));
    launchPersistentContext.mockResolvedValueOnce(broken).mockResolvedValueOnce(fakeContext());
    const { getActivePage, closeBrowser } = await loadSession();

    await getActivePage();
    await expect(closeBrowser()).rejects.toThrow("boom");

    // La referencia rota no debe quedar cacheada: se relanza igual.
    await getActivePage();
    expect(launchPersistentContext).toHaveBeenCalledTimes(2);
  });
});
