import { z } from "zod";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OUTPUT_DIR } from "../paths.js";
import { assertSafeSegment } from "../util/safe-path.js";
import { defineTool, type ToolDef } from "./types.js";

export const extractTools: ToolDef[] = [
  defineTool({
    name: "extract_to_json",
    title: "Guardar datos extraídos",
    description: "Guarda datos (ya extraídos de la página) como JSON en output/.",
    inputSchema: {
      filename: z.string().describe('Sin extensión, ej: "sitio-a-precios"'),
      data: z.unknown(),
    },
    handler: async ({ filename, data }) => {
      assertSafeSegment(filename, "filename");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const path = join(OUTPUT_DIR, `${filename}-${stamp}.json`);
      await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
      return { content: [{ type: "text", text: `Guardado en ${path}` }] };
    },
  }),
];

export function registerExtractTools(server: McpServer): void {
  for (const t of extractTools) {
    server.registerTool(
      t.name,
      { title: t.title, description: t.description, inputSchema: t.inputSchema },
      t.handler,
    );
  }
}
