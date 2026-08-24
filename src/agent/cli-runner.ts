import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { ROOT } from "../paths.js";
import type { ChatEventInput } from "./session.js";

const MCP_SERVER_KEY = "browser-scripts";
const TOOL_PREFIX = `mcp__${MCP_SERVER_KEY}__`;
const CONFIRM_TIMEOUT_SECONDS = 600;

const CLI_COMMAND = process.env.CLAUDE_CLI_PATH || "claude";

const APPEND_SYSTEM_PROMPT = `
Controlás un navegador Chromium real y persistente (Playwright) vía tools de
${MCP_SERVER_KEY}. run_script y run_saved_script ejecutan código sin sandbox
y requieren aprobación manual del usuario antes de correr: explicá
brevemente, en tu respuesta de texto, qué va a hacer el script antes de
invocarlo. Tus respuestas se muestran en un chat junto a un log de las
tools que llamás: sé conciso y concreto.
`.trim();

interface RunTurnOptions {
  text: string;
  sessionId: string;
  isFirstTurn: boolean;
  mcpUrl: string;
  hookUrl: string;
  onEvent: (event: ChatEventInput) => void;
}

function displayName(toolName: string): string {
  return toolName.startsWith(TOOL_PREFIX) ? toolName.slice(TOOL_PREFIX.length) : toolName;
}

function summarizeToolResultContent(content: unknown): string {
  if (typeof content === "string") return content.slice(0, 300);
  if (Array.isArray(content)) {
    const text = content
      .filter((b): b is { type: "text"; text: string } => (b as { type?: string })?.type === "text")
      .map((b) => b.text)
      .join(" ");
    if (text) return text.slice(0, 300);
  }
  return "OK";
}

interface StreamContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

interface StreamLine {
  type: string;
  message?: { content?: StreamContentBlock[] };
  is_error?: boolean;
  result?: string;
  subtype?: string;
}

function handleLine(
  line: StreamLine,
  onEvent: (event: ChatEventInput) => void,
  toolNameById: Map<string, string>,
): void {
  if (line.type === "assistant" || line.type === "user") {
    for (const block of line.message?.content ?? []) {
      if (line.type === "assistant" && block.type === "text" && block.text) {
        onEvent({ type: "assistant_text", text: block.text });
      } else if (line.type === "assistant" && block.type === "tool_use" && block.name) {
        const name = displayName(block.name);
        if (block.id) toolNameById.set(block.id, name);
        onEvent({ type: "tool_call", callId: block.id ?? "", name, input: block.input });
      } else if (line.type === "user" && block.type === "tool_result") {
        const callId = block.tool_use_id ?? "";
        onEvent({
          type: "tool_result",
          callId,
          name: toolNameById.get(callId) ?? "",
          summary: summarizeToolResultContent(block.content),
          isError: block.is_error === true,
        });
      }
    }
    return;
  }
  if (line.type === "result") {
    if (line.is_error) {
      onEvent({
        type: "error",
        message: line.result ?? `claude terminó con error (${line.subtype ?? "?"})`,
      });
    }
  }
}

/** Corre un turno de chat invocando `claude -p` como subproceso headless. */
export async function runTurn(options: RunTurnOptions): Promise<void> {
  const { text, sessionId, isFirstTurn, mcpUrl, hookUrl, onEvent } = options;

  const mcpConfig = JSON.stringify({
    mcpServers: { [MCP_SERVER_KEY]: { type: "http", url: mcpUrl } },
  });

  const settings = JSON.stringify({
    // Sin esto, el server MCP pasado por --mcp-config queda pendiente de
    // aprobación (el mismo gate que en modo interactivo pregunta "¿confiás
    // en este servidor MCP?") y en headless nunca hay quién responda esa
    // pregunta: se cae en silencio con status "failed", sin error visible.
    enableAllProjectMcpServers: true,
    hooks: {
      PreToolUse: [
        {
          matcher: `${TOOL_PREFIX}run_script`,
          hooks: [{ type: "http", url: hookUrl, timeout: CONFIRM_TIMEOUT_SECONDS }],
        },
        {
          matcher: `${TOOL_PREFIX}run_saved_script`,
          hooks: [{ type: "http", url: hookUrl, timeout: CONFIRM_TIMEOUT_SECONDS }],
        },
      ],
    },
  });

  const args = [
    "-p",
    text,
    "--output-format",
    "stream-json",
    "--verbose",
    "--mcp-config",
    mcpConfig,
    "--strict-mcp-config",
    "--allowedTools",
    `${TOOL_PREFIX}*`,
    "--permission-mode",
    "bypassPermissions",
    "--settings",
    settings,
    "--append-system-prompt",
    APPEND_SYSTEM_PROMPT,
    ...(isFirstTurn ? ["--session-id", sessionId] : ["--resume", sessionId]),
  ];

  // `ANTHROPIC_API_KEY` no debe llegar al subproceso: si está seteada en el
  // entorno por otro motivo, pisaría en silencio el login de Pro y este modo
  // volvería a facturar por token sin que el usuario lo haya pedido.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;

  await new Promise<void>((resolve) => {
    const child = spawn(CLI_COMMAND, args, { cwd: ROOT, env });

    let sawResult = false;
    let stderr = "";
    let settled = false;
    const toolNameById = new Map<string, string>();

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      if (error.code === "ENOENT") {
        onEvent({
          type: "error",
          message: `No se encontró el CLI "${CLI_COMMAND}" en el PATH. Instalá Claude Code CLI y asegurate de que "claude" sea ejecutable desde una terminal.`,
        });
      } else {
        onEvent({ type: "error", message: error.message });
      }
      resolve();
    });

    const rl = createInterface({ input: child.stdout });
    rl.on("line", (raw) => {
      const line = raw.trim();
      if (!line) return;
      try {
        const parsed = JSON.parse(line) as StreamLine;
        if (parsed.type === "result") sawResult = true;
        handleLine(parsed, onEvent, toolNameById);
      } catch {
        // Línea no-JSON (ruido de stdout): ignorar.
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (!sawResult) {
        onEvent({
          type: "error",
          message:
            code === 0
              ? "El CLI terminó sin devolver una respuesta."
              : `El CLI terminó con código ${code}.${stderr ? ` ${stderr.slice(0, 500)}` : ""}`,
        });
      } else {
        onEvent({ type: "turn_complete" });
      }
      resolve();
    });
  });
}
