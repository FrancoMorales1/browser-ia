# Contexto del navegador

Este proyecto expone un Chromium **real y persistente** (Playwright,
`headless: false`) vía tools MCP — el usuario puede estar viéndolo y
operándolo a mano al mismo tiempo que vos. `profile/` guarda sus cookies y
sesiones logueadas de verdad: los sitios donde ya inició sesión siguen
logueados entre una tool y otra.

## Tools disponibles

- `navigate` — navega la pestaña activa a una URL.
- `get_page_snapshot` — URL, título, texto visible y elementos interactivos
  (con selectores usables). Usala primero para entender una página antes de
  intentar interactuar con ella a ciegas.
- `screenshot` — captura de pantalla, útil cuando el snapshot de texto no
  alcanza (layouts visuales, captchas, gráficos).
- `run_script` — JS ad-hoc con acceso a `page` (Playwright), sin sandbox.
  **Requiere aprobación manual del usuario antes de correr** (en el modo
  standalone aparece un widget de confirmación en el chat) — explicá
  brevemente, en tu respuesta de texto, qué va a hacer el script _antes_ de
  invocarlo, para que esa confirmación tenga sentido. Preferila sobre
  `navigate`/snapshot solo cuando necesites algo que esas tools no cubren
  (leer un valor puntual del DOM, completar un formulario, esperar una
  condición).
- `save_script` / `list_scripts` / `run_saved_script` — antes de escribir un
  script nuevo para un sitio, revisar con `list_scripts` si ya existe uno en
  `scripts/<domain>/` para reusar. Guardar scripts reutilizables (no
  one-offs) con `save_script`, agrupados por dominio.
- `extract_to_json` — para persistir datos ya extraídos, no para scraping en
  sí. Se guardan en `output/<filename>-<timestamp>.json`.
- `close_browser` — cerrar el navegador es una acción normal (el usuario
  puede pedirlo), no hace falta reiniciar nada: la próxima tool lo reabre.

## Convenciones

- Antes de automatizar un sitio nuevo, tené en cuenta sus Términos de
  Servicio — no asumas que todo scraping/automatización está permitido.
- No hagas acciones destructivas o irreversibles (compras, envíos,
  eliminar cuentas/datos, cambiar configuraciones) sin que el usuario lo
  haya pedido explícitamente para ese sitio puntual.
- El perfil (`profile/`) es compartido entre tools y entre sesiones: lo que
  navegues o dejés logueado persiste. No cierres sesiones ni borres cookies
  de sitios salvo que te lo pidan.
- Si `get_page_snapshot` falla o da un error de evaluación en la página,
  probá `run_script` con algo mínimo (ej. `return document.title`) en su
  lugar — es un workaround conocido, no asumas que el sitio está roto.
