# browser-scripts-mcp

Servidor MCP que controla un navegador Chromium persistente (Playwright) y expone
herramientas para navegar, inspeccionar la página actual, y generar/ejecutar scripts
a demanda — para leer información o completar formularios/encuestas automáticamente.

## Estructura

```
src/
  index.ts              # arranque del servidor MCP
  browser-session.ts     # navegador Chromium con perfil persistente
  paths.ts                # rutas del proyecto (scripts/, output/, profile/)
  tools/
    browser.ts            # navigate, get_page_snapshot, screenshot
    scripts.ts             # run_script, save_script, list_scripts, run_saved_script
    extract.ts              # extract_to_json
  util/
    safe-path.ts            # validación anti path-traversal para nombres de archivo

scripts/    # biblioteca de scripts guardados, por dominio (scripts/<domain>/<name>.mjs)
output/     # datos extraídos (JSON), con timestamp
profile/    # perfil persistente del navegador (sesiones/cookies) — no se versiona
config/     # .env con credenciales — no se versiona (ver .env.example)
```

## Herramientas MCP expuestas

| Tool                | Qué hace                                                               |
| ------------------- | ---------------------------------------------------------------------- |
| `navigate`          | Navega la pestaña activa a una URL                                     |
| `get_page_snapshot` | URL, título, texto visible y elementos interactivos con selectores     |
| `screenshot`        | Captura de pantalla de la página actual                                |
| `run_script`        | Ejecuta código JS ad-hoc con acceso a `page` (Playwright), sin guardar |
| `save_script`       | Guarda un script reutilizable en `scripts/<domain>/<name>.mjs`         |
| `list_scripts`      | Lista los scripts guardados                                            |
| `run_saved_script`  | Corre un script guardado contra la pestaña activa                      |
| `extract_to_json`   | Guarda datos extraídos como JSON en `output/`                          |

## Uso

```bash
npm install
npm run build
```

Registrar el servidor en Claude Code: ya está declarado en `.mcp.json` en la raíz
del proyecto (`node dist/index.js`), así que Claude Code lo detecta automáticamente
al abrir este directorio.

> El navegador corre en modo `headless: false` (a propósito: hay que poder verlo y
> operarlo a mano). Por eso `.mcp.json` pasa `DISPLAY`/`WAYLAND_DISPLAY` explícitos:
> el cliente MCP lanza el servidor con un entorno mínimo por seguridad
> (`HOME`, `PATH`, `SHELL`, `TERM`, `USER`) que no incluye variables gráficas, así
> que sin esto Chromium falla con "Missing X server or $DISPLAY" aunque la sesión
> sí tenga entorno gráfico.

Durante desarrollo, `npm run dev` corre el servidor directo desde `src/` con `tsx`
(sin compilar).

## Scripts de npm

- `npm run dev` — servidor MCP en modo desarrollo (tsx)
- `npm run build` — compila a `dist/`
- `npm start` — corre el build compilado
- `npm run lint` / `lint:fix` — ESLint
- `npm run format` / `format:check` — Prettier
- `npm test` — Vitest

## Convenciones

Commits, nombres de branch, versionado (SemVer automático) y formato de PR están
documentados en [`CONTRIBUTING.md`](CONTRIBUTING.md). Husky corre lint-staged en
cada commit, commitlint en cada mensaje de commit, y valida el nombre del branch
en cada `git push`.

## Seguridad

- `run_script` y `run_saved_script` ejecutan código arbitrario con acceso al navegador.
  Es una herramienta local, pensada para uso propio — no exponer este servidor MCP a
  terceros no confiables.
- `profile/` guarda cookies y sesiones reales: nunca se versiona ni se comparte.
- Antes de automatizar un sitio, revisar sus Términos de Servicio.
