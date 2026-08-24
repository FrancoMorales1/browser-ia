import { z } from "zod";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getActivePage } from "../browser-session.js";
import { SCRIPTS_DIR } from "../paths.js";
import { assertSafeSegment } from "../util/safe-path.js";
import { defineTool, type ToolDef } from "./types.js";

function scriptPath(domain: string, name: string): string {
  assertSafeSegment(domain, "domain");
  assertSafeSegment(name, "name");
  return join(SCRIPTS_DIR, domain, `${name}.mjs`);
}

export const scriptTools: ToolDef[] = [
  defineTool({
    name: "run_script",
    title: "Ejecutar script ad-hoc",
    description:
      "Ejecuta código JavaScript (async) con acceso a la variable `page` de Playwright, " +
      "contra la pestaña activa. Pensado para lectura de datos o completar formularios " +
      "generados sobre la marcha. No se guarda.",
    inputSchema: { code: z.string() },
    handler: async ({ code }) => {
      const page = await getActivePage();
      const fn = new Function("page", `return (async () => { ${code} })();`) as (
        page: unknown,
      ) => Promise<unknown>;
      const result = await fn(page);
      return {
        content: [{ type: "text", text: result === undefined ? "OK" : JSON.stringify(result) }],
      };
    },
  }),

  defineTool({
    name: "save_script",
    title: "Guardar script",
    description:
      "Guarda un script reutilizable en la biblioteca (scripts/<domain>/<name>.mjs). " +
      "El código recibe (page, params) y corre en un navegador ya abierto en el sitio.",
    inputSchema: {
      domain: z.string().describe('Dominio del sitio, ej: "sitio-a.com"'),
      name: z.string().describe('Nombre del script, ej: "leer-tabla-precios"'),
      code: z.string().describe("Cuerpo de una función async (page, params) => { ... }"),
      description: z.string().optional(),
    },
    handler: async ({ domain, name, code, description }) => {
      const path = scriptPath(domain, name);
      await mkdir(join(SCRIPTS_DIR, domain), { recursive: true });
      const header = description ? `// ${description}\n` : "";
      const file = `${header}export default async function (page, params) {\n${code}\n}\n`;
      await writeFile(path, file, "utf-8");
      return { content: [{ type: "text", text: `Guardado en ${path}` }] };
    },
  }),

  defineTool({
    name: "list_scripts",
    title: "Listar scripts guardados",
    description: "Lista los scripts guardados en la biblioteca, agrupados por dominio.",
    inputSchema: {},
    handler: async () => {
      await mkdir(SCRIPTS_DIR, { recursive: true });
      const domains = await readdir(SCRIPTS_DIR, { withFileTypes: true });
      const byDomain: Record<string, string[]> = {};
      for (const d of domains) {
        if (!d.isDirectory()) continue;
        const files = await readdir(join(SCRIPTS_DIR, d.name));
        byDomain[d.name] = files.filter((f) => f.endsWith(".mjs"));
      }
      return { content: [{ type: "text", text: JSON.stringify(byDomain, null, 2) }] };
    },
  }),

  defineTool({
    name: "run_saved_script",
    title: "Ejecutar script guardado",
    description: "Corre un script previamente guardado contra la pestaña activa.",
    inputSchema: {
      domain: z.string(),
      name: z.string(),
      params: z.record(z.unknown()).optional(),
    },
    handler: async ({ domain, name, params }) => {
      const path = scriptPath(domain, name);
      await readFile(path, "utf-8"); // valida que exista antes de importar
      const mod = (await import(`${path}?t=${Date.now()}`)) as {
        default: (page: unknown, params?: Record<string, unknown>) => Promise<unknown>;
      };
      const page = await getActivePage();
      const result = await mod.default(page, params);
      return {
        content: [{ type: "text", text: result === undefined ? "OK" : JSON.stringify(result) }],
      };
    },
  }),
];

export function registerScriptTools(server: McpServer): void {
  for (const t of scriptTools) {
    server.registerTool(
      t.name,
      { title: t.title, description: t.description, inputSchema: t.inputSchema },
      t.handler,
    );
  }
}
