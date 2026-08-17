import { describe, expect, it } from "vitest";
import { assertSafeSegment } from "./safe-path.js";

describe("assertSafeSegment", () => {
  it("acepta nombres simples", () => {
    expect(() => assertSafeSegment("sitio-a.com", "domain")).not.toThrow();
    expect(() => assertSafeSegment("leer_tabla-precios.v2", "name")).not.toThrow();
  });

  it("rechaza intentos de path traversal", () => {
    expect(() => assertSafeSegment("../../etc/passwd", "domain")).toThrow();
    expect(() => assertSafeSegment("a/b", "name")).toThrow();
  });

  it("rechaza segmentos vacíos", () => {
    expect(() => assertSafeSegment("", "name")).toThrow();
  });
});
