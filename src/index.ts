import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBrowserTools } from "./tools/browser.js";
import { registerScriptTools } from "./tools/scripts.js";
import { registerExtractTools } from "./tools/extract.js";
import { closeBrowser } from "./browser-session.js";

const server = new McpServer({ name: "browser-scripts-mcp", version: "0.1.0" });

registerBrowserTools(server);
registerScriptTools(server);
registerExtractTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await closeBrowser();
    process.exit(0);
  });
}
