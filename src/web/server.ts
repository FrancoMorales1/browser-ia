import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WEB_DIR } from "../paths.js";
import { createMcpConnection } from "./mcp-endpoint.js";
import {
  sendUserMessage,
  resolveConfirmation,
  requestConfirmationForHook,
  getEventsSince,
  isTurnInProgress,
} from "../agent/session.js";

const execFileAsync = promisify(execFile);
const CLI_COMMAND = process.env.CLAUDE_CLI_PATH || "claude";

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

async function sendHtml(res: http.ServerResponse, filename: string): Promise<void> {
  const html = await readFile(join(WEB_DIR, filename), "utf-8");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

/** Detecta si el CLI de Claude Code está instalado y accesible. */
async function checkCli(): Promise<{ cliFound: boolean; version?: string }> {
  try {
    const { stdout } = await execFileAsync(CLI_COMMAND, ["--version"]);
    return { cliFound: true, version: stdout.trim() };
  } catch {
    return { cliFound: false };
  }
}

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/chat") {
        await sendHtml(res, "chat.html");
        return;
      }
      if (req.method === "GET" && url.pathname === "/settings") {
        await sendHtml(res, "settings.html");
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/status") {
        sendJson(res, 200, await checkCli());
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/chat") {
        if (isTurnInProgress()) {
          sendJson(res, 409, { error: "turno en curso" });
          return;
        }
        const body = (await readJsonBody(req)) as { text?: string };
        if (!body.text?.trim()) {
          sendJson(res, 400, { error: "text requerido" });
          return;
        }
        void sendUserMessage(body.text);
        sendJson(res, 202, { ok: true });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/events") {
        const since = Number(url.searchParams.get("since") ?? "0");
        sendJson(res, 200, { events: getEventsSince(since) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/chat/confirm") {
        const body = (await readJsonBody(req)) as { callId?: string; approve?: boolean };
        if (!body.callId) {
          sendJson(res, 400, { error: "callId requerido" });
          return;
        }
        const found = resolveConfirmation(body.callId, Boolean(body.approve));
        sendJson(
          res,
          found ? 200 : 404,
          found ? { ok: true } : { error: "no hay confirmación pendiente con ese id" },
        );
        return;
      }
      if (req.method === "POST" && url.pathname === "/hooks/pretooluse") {
        const body = (await readJsonBody(req)) as { tool_name?: string; tool_input?: unknown };
        const approved = await requestConfirmationForHook(body.tool_name ?? "", body.tool_input);
        sendJson(res, 200, {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: approved ? "allow" : "deny",
            ...(approved
              ? {}
              : { permissionDecisionReason: "Rechazado por el usuario desde el chat." }),
          },
        });
        return;
      }
      if (url.pathname === "/mcp") {
        // El transporte exige Accept: application/json + text/event-stream
        // (spec de MCP Streamable HTTP) o devuelve 406 — el cliente MCP de
        // `claude` no manda ese Accept completo, así que lo forzamos acá.
        req.headers.accept = "application/json, text/event-stream";
        const body = req.method === "POST" ? await readJsonBody(req) : undefined;
        // Un McpServer/transporte nuevo por request: en modo stateless cada
        // instancia solo aguanta un handleRequest (confirmado a mano — la
        // segunda llamada sobre el mismo transporte devuelve 500 aunque sea
        // la notification de rigor post-initialize). Es liviano: solo
        // registra handlers, no relanza el navegador.
        const transport = await createMcpConnection();
        await transport.handleRequest(req, res, body);
        return;
      }

      sendJson(res, 404, { error: "not found" });
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
      } else {
        res.end();
      }
    }
  });
}
