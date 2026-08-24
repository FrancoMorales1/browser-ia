import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerBrowserTools } from "../tools/browser.js";
import { registerScriptTools } from "../tools/scripts.js";
import { registerExtractTools } from "../tools/extract.js";

/**
 * Arma un McpServer + StreamableHTTPServerTransport nuevos para UNA sola
 * request. En modo stateless (sessionIdGenerator: undefined) cada instancia
 * de transporte solo soporta un `handleRequest` — reusar una compartida
 * para todo el proceso hace que la segunda llamada (incluso
 * notifications/initialized) devuelva 500 (confirmado a mano). Como
 * `registerXTools` solo registra handlers que llaman a `getActivePage()`
 * (el singleton real del navegador, en browser-session.ts), crear un par
 * server/transport nuevo por request no relanza nada ni pierde contexto:
 * el navegador sigue siendo el mismo de siempre.
 */
export async function createMcpConnection(): Promise<StreamableHTTPServerTransport> {
  const server = new McpServer({ name: "browser-scripts-mcp", version: "0.1.0" });
  registerBrowserTools(server);
  registerScriptTools(server);
  registerExtractTools(server);

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport;
}
