import type { z } from "zod";

export interface ToolContentText {
  type: "text";
  text: string;
}

export interface ToolContentImage {
  type: "image";
  data: string;
  mimeType: string;
}

export type ToolContent = ToolContentText | ToolContentImage;

export interface ToolResult {
  content: ToolContent[];
  // Índice extra: el SDK de MCP espera que el resultado de una tool acepte
  // propiedades adicionales (ej. `_meta`) además de `content`.
  [key: string]: unknown;
}

export interface ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  inputSchema: Shape;
  handler: (input: { [K in keyof Shape]: z.infer<Shape[K]> }) => Promise<ToolResult>;
}

/**
 * Type-checa `handler` contra el `inputSchema` específico de cada tool y
 * después borra el shape exacto, para que tools con distinto inputSchema
 * puedan convivir en un mismo array `ToolDef[]`.
 */
export function defineTool<Shape extends z.ZodRawShape>(def: ToolDef<Shape>): ToolDef {
  return def as ToolDef;
}
