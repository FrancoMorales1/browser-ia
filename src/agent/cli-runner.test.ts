import { describe, expect, it, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

/** Doble mínimo de un ChildProcess con lo que usa cli-runner. */
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

async function loadRunner() {
  vi.resetModules();
  return import("./cli-runner.js");
}

/** Deja que readline procese lo escrito en el stdout falso antes de seguir. */
function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  spawnMock.mockReset();
});

function baseOptions(onEvent: (e: unknown) => void) {
  return {
    text: "hola",
    sessionId: "11111111-1111-1111-1111-111111111111",
    isFirstTurn: true,
    mcpUrl: "http://127.0.0.1:4127/mcp",
    hookUrl: "http://127.0.0.1:4127/hooks/pretooluse",
    onEvent,
  };
}

describe("runTurn", () => {
  it("mapea texto, tool_use y tool_result del stream a eventos, y cierra con turn_complete", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const { runTurn } = await loadRunner();
    const events: unknown[] = [];

    const promise = runTurn(baseOptions((e) => events.push(e)));

    child.stdout.write(
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Voy a navegar" }] },
      }) + "\n",
    );
    child.stdout.write(
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              id: "call_1",
              name: "mcp__browser-scripts__navigate",
              input: { url: "https://x" },
            },
          ],
        },
      }) + "\n",
    );
    child.stdout.write(
      JSON.stringify({
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "call_1", content: "Navegado a https://x" },
          ],
        },
      }) + "\n",
    );
    child.stdout.write(JSON.stringify({ type: "result", is_error: false }) + "\n");
    await flush();
    child.emit("close", 0);

    await promise;

    expect(events).toEqual([
      { type: "assistant_text", text: "Voy a navegar" },
      { type: "tool_call", callId: "call_1", name: "navigate", input: { url: "https://x" } },
      {
        type: "tool_result",
        callId: "call_1",
        name: "navigate",
        summary: "Navegado a https://x",
        isError: false,
      },
      { type: "turn_complete" },
    ]);
  });

  it("arma los args con --session-id en el primer turno y --resume después", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const { runTurn } = await loadRunner();

    const promise = runTurn(baseOptions(() => {}));
    child.stdout.write(JSON.stringify({ type: "result", is_error: false }) + "\n");
    await flush();
    child.emit("close", 0);
    await promise;

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("--session-id");
    expect(args).not.toContain("--resume");
    expect(args[args.indexOf("--session-id") + 1]).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("usa --resume cuando no es el primer turno", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const { runTurn } = await loadRunner();

    const promise = runTurn({ ...baseOptions(() => {}), isFirstTurn: false });
    child.stdout.write(JSON.stringify({ type: "result", is_error: false }) + "\n");
    await flush();
    child.emit("close", 0);
    await promise;

    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).toContain("--resume");
    expect(args).not.toContain("--session-id");
  });

  it("nunca pasa ANTHROPIC_API_KEY al subproceso aunque esté seteada", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-leaked";
    try {
      const { runTurn } = await loadRunner();
      const promise = runTurn(baseOptions(() => {}));
      child.stdout.write(JSON.stringify({ type: "result", is_error: false }) + "\n");
      child.emit("close", 0);
      await promise;

      const spawnEnv = spawnMock.mock.calls[0][2].env as Record<string, string>;
      expect(spawnEnv.ANTHROPIC_API_KEY).toBeUndefined();
    } finally {
      if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("reporta un error claro si el CLI no está instalado (ENOENT)", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const { runTurn } = await loadRunner();
    const events: { type: string; message?: string }[] = [];

    const promise = runTurn(
      baseOptions((e) => events.push(e as { type: string; message?: string })),
    );
    const err = new Error("spawn claude ENOENT") as NodeJS.ErrnoException;
    err.code = "ENOENT";
    child.emit("error", err);
    await promise;

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    expect(events[0].message).toMatch(/No se encontró el CLI/);
  });

  it("reporta error si el proceso cierra sin emitir nunca un result", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const { runTurn } = await loadRunner();
    const events: { type: string }[] = [];

    const promise = runTurn(baseOptions((e) => events.push(e as { type: string })));
    child.emit("close", 1);
    await promise;

    expect(events).toEqual([{ type: "error", message: expect.stringContaining("código 1") }]);
  });

  it("propaga un error de is_error:true en la línea result, y sigue cerrando con turn_complete", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);
    const { runTurn } = await loadRunner();
    const events: { type: string; message?: string }[] = [];

    const promise = runTurn(
      baseOptions((e) => events.push(e as { type: string; message?: string })),
    );
    child.stdout.write(
      JSON.stringify({ type: "result", is_error: true, result: "algo salió mal" }) + "\n",
    );
    await flush();
    child.emit("close", 0);
    await promise;

    expect(events).toEqual([
      { type: "error", message: "algo salió mal" },
      { type: "turn_complete" },
    ]);
  });
});
