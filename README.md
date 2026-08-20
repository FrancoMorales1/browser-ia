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
| `close_browser`     | Cierra el navegador y libera el perfil (se reabre solo al usarlo)      |

## Uso

```bash
npm install
npm run build
```

Playwright necesita además el Chromium y sus librerías de sistema:

```bash
npx playwright install chromium
sudo npx playwright install-deps chromium
```

Registrar el servidor en Claude Code: ya está declarado en `.mcp.json` en la raíz
del proyecto, así que Claude Code lo detecta automáticamente al abrir este directorio.

### Por qué `.mcp.json` arranca con `wsl.exe`

El navegador corre en modo `headless: false` a propósito — hay que poder verlo y
operarlo a mano — así que el servidor tiene que correr donde haya entorno gráfico y
donde estén instalados los browsers de Playwright: adentro de WSL.

Cuando Claude Code corre del lado de Windows (VSCode abierto sobre `\\wsl.localhost\…`),
un `command: "node"` a secas usaría el Node de Windows, que no tiene los browsers ni
display, y Chromium falla con `Executable doesn't exist at …\chrome-win64\chrome.exe`.
Por eso el comando es `wsl.exe -e bash -lc …`, que cruza a Linux:

- `-e` usa la distro y el usuario por defecto, sin hardcodear ninguno.
- El `cwd` se traduce solo: `wsl.exe` lanzado desde la ruta UNC del proyecto cae
  parado en el path Linux equivalente, así que `node dist/index.js` alcanza.
- `source ~/.nvm/nvm.sh` hace falta porque el cliente MCP lanza el servidor con un
  entorno mínimo (`HOME`, `PATH`, `SHELL`, `TERM`, `USER`) y `.bashrc` corta temprano
  en shells no interactivos, así que sin esto `node` no está en el `PATH`.

Si en cambio corrés Claude Code **adentro** de WSL, el puente sobra: alcanza con

```json
{ "command": "node", "args": ["dist/index.js"] }
```

### Ciclo de vida del navegador

El navegador se lanza solo la primera vez que una herramienta lo necesita, y se reusa.
Cerrar la ventana a mano, usar `close_browser`, o un crash de Chromium no dejan al
servidor inservible: la siguiente herramienta detecta que el contexto murió y lo
vuelve a levantar. No hace falta reiniciar el servidor MCP ni recargar VSCode.

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
