import { randomUUID } from "node:crypto";
import { runTurn } from "./cli-runner.js";
import { getWebPort } from "../env.js";

export type ChatEvent =
  | { seq: number; type: "user_message"; text: string }
  | { seq: number; type: "assistant_text"; text: string }
  | { seq: number; type: "tool_call"; callId: string; name: string; input: unknown }
  | {
      seq: number;
      type: "tool_result";
      callId: string;
      name: string;
      summary: string;
      isError: boolean;
    }
  | { seq: number; type: "confirm_required"; callId: string; name: string; input: unknown }
  | { seq: number; type: "confirm_resolved"; callId: string; approved: boolean }
  | { seq: number; type: "error"; message: string }
  | { seq: number; type: "turn_complete" };

// Omit no distribuye sobre uniones discriminadas por sí solo — sin esto,
// `push({type:"tool_call", callId, ...})` pierde el campo `callId` porque
// Omit<ChatEvent,"seq"> colapsa la unión a las claves comunes a todos los
// variantes.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type ChatEventInput = DistributiveOmit<ChatEvent, "seq">;

let seq = 0;
const events: ChatEvent[] = [];
let turnInProgress = false;
let pending: { callId: string; resolve: (approved: boolean) => void } | undefined;

// Sesión de `claude -p`: un UUID elegido por nosotros, reusado en cada
// mensaje vía --session-id (primer turno) / --resume (siguientes).
const cliSessionId = randomUUID();
let cliSessionStarted = false;

function push(e: ChatEventInput): void {
  events.push({ ...e, seq: seq++ } as ChatEvent);
}

export function getEventsSince(since: number): ChatEvent[] {
  return events.filter((e) => e.seq > since);
}

export function isTurnInProgress(): boolean {
  return turnInProgress;
}

/**
 * Pausa hasta que el usuario apruebe/rechace desde el chat. La llama el
 * endpoint POST /hooks/pretooluse (hook PreToolUse de Claude Code) para
 * run_script/run_saved_script — mismo mecanismo que antes disparaba
 * tool-adapter.ts, ahora disparado por el hook en vez de por nuestro propio
 * tool runner.
 */
export async function requestConfirmationForHook(name: string, input: unknown): Promise<boolean> {
  const callId = randomUUID();
  push({ type: "confirm_required", callId, name, input });
  return new Promise<boolean>((resolve) => {
    pending = { callId, resolve };
  });
}

/** Resuelve una confirmación pendiente. Devuelve false si no hay ninguna con ese callId. */
export function resolveConfirmation(callId: string, approved: boolean): boolean {
  if (!pending || pending.callId !== callId) return false;
  const { resolve } = pending;
  pending = undefined;
  push({ type: "confirm_resolved", callId, approved });
  resolve(approved);
  return true;
}

export async function sendUserMessage(text: string): Promise<void> {
  if (turnInProgress) throw new Error("Ya hay un turno en curso.");
  turnInProgress = true;
  push({ type: "user_message", text });

  try {
    const mcpUrl = `http://127.0.0.1:${getWebPort()}/mcp`;
    const hookUrl = `http://127.0.0.1:${getWebPort()}/hooks/pretooluse`;

    await runTurn({
      text,
      sessionId: cliSessionId,
      isFirstTurn: !cliSessionStarted,
      mcpUrl,
      hookUrl,
      onEvent: push,
    });
    cliSessionStarted = true;
  } catch (error) {
    push({ type: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    turnInProgress = false;
  }
}
