import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getActivePage } from "../browser-session.js";

export function registerBrowserTools(server: McpServer): void {
  server.registerTool(
    "navigate",
    {
      title: "Navegar",
      description: "Navega la pestaña activa del navegador a una URL.",
      inputSchema: { url: z.string().url() },
    },
    async ({ url }) => {
      const page = await getActivePage();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      return { content: [{ type: "text", text: `Navegado a ${page.url()}` }] };
    },
  );

  server.registerTool(
    "get_page_snapshot",
    {
      title: "Snapshot de la página",
      description:
        "Devuelve la URL, el título, el texto visible y los elementos interactivos " +
        "(inputs, botones, selects, links) con selectores usables, de la página actual.",
      inputSchema: {},
    },
    async () => {
      const page = await getActivePage();

      const interactive = await page.evaluate(() => {
        const describe = (el: Element) => {
          const tag = el.tagName.toLowerCase();
          const id = el.id ? `#${el.id}` : "";
          const name = el.getAttribute("name");
          const type = el.getAttribute("type");
          const text = (el as HTMLElement).innerText?.trim().slice(0, 80) ?? "";
          const placeholder = el.getAttribute("placeholder");
          const selector = id || (name ? `[name="${name}"]` : tag);
          return { tag, selector, type, name, placeholder, text };
        };
        const elements = Array.from(
          document.querySelectorAll("input, textarea, select, button, a[href]"),
        );
        return elements.slice(0, 200).map(describe);
      });

      const bodyText = await page.evaluate(() => document.body?.innerText ?? "");

      const snapshot = {
        url: page.url(),
        title: await page.title(),
        text: bodyText.slice(0, 8000),
        interactiveElements: interactive,
      };

      return { content: [{ type: "text", text: JSON.stringify(snapshot, null, 2) }] };
    },
  );

  server.registerTool(
    "screenshot",
    {
      title: "Screenshot",
      description: "Toma una captura de pantalla de la página actual.",
      inputSchema: { fullPage: z.boolean().optional() },
    },
    async ({ fullPage }) => {
      const page = await getActivePage();
      const buffer = await page.screenshot({ fullPage: fullPage ?? false });
      return {
        content: [{ type: "image", data: buffer.toString("base64"), mimeType: "image/png" }],
      };
    },
  );
}
