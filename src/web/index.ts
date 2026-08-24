import { loadEnv, getWebPort } from "../env.js";
loadEnv();

import { createServer } from "./server.js";
import { openUtilityTab, closeBrowser } from "../browser-session.js";

const PORT = getWebPort();
const server = createServer();

server.listen(PORT, "127.0.0.1", () => {
  console.log(`UI web en http://localhost:${PORT}`);
  // Si el navegador no levanta (perfil bloqueado por otro proceso, etc.), el
  // server HTTP tiene que seguir de pie igual: solo se pierde la apertura
  // automática de las pestañas, no logueamos como excepción no manejada.
  for (const path of ["/settings", "/chat"]) {
    openUtilityTab(`http://localhost:${PORT}${path}`).catch((error: unknown) => {
      console.error(`No se pudo abrir la pestaña ${path}:`, error);
    });
  }
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    server.close();
    await closeBrowser();
    process.exit(0);
  });
}
