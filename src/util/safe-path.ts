// Solo letras, números, punto, guion y guion bajo: evita path traversal al
// construir rutas de archivo a partir de input del modelo.
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

export function assertSafeSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(`${label} inválido: "${value}". Solo letras, números, "." "_" "-".`);
  }
}
