# Convenciones del proyecto

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), validado por commitlint
en cada commit (`.husky/commit-msg`) y en cada PR (job `commitlint` de CI):

```
<tipo>(<scope opcional>): <descripción>

[BREAKING CHANGE: <detalle>]
```

Tipos usados: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `style`, `build`, `revert`.

## Versionado (SemVer automático)

El número de versión en `package.json` **no se edita a mano**: se deriva de los
commits acumulados desde el último release, vía `commit-and-tag-version`.

| Commits desde el último release                   | Bump en `1.x.y` en adelante | Bump mientras estemos en `0.x.y` |
| ------------------------------------------------- | --------------------------- | -------------------------------- |
| Al menos un `fix:`                                | patch (1.2.0 → 1.2.1)       | patch (0.1.0 → 0.1.1)            |
| Al menos un `feat:`                               | minor (1.2.0 → 1.3.0)       | **patch** (0.1.0 → 0.1.1)        |
| `BREAKING CHANGE:` en el body, o `feat!:`/`fix!:` | major (1.2.0 → 2.0.0)       | **minor** (0.1.0 → 0.2.0)        |

Mientras el major sea `0`, `commit-and-tag-version` degrada un nivel el bump (es el
comportamiento estándar para versiones "0.x": todavía no hay API estable que romper).
Verificado con `npm run release:dry` antes de cada release. Para salir de `0.x` y pasar
a `1.0.0`, forzar con `npx commit-and-tag-version --release-as major`.

Para aplicar el bump:

```bash
npm run release:dry   # preview: qué versión daría y qué entraría al CHANGELOG
npm run release        # bump automático según los commits (detecta el tipo solo)
npm run release:minor  # forzar minor
npm run release:major  # forzar major
npm run release:patch  # forzar patch
```

Esto actualiza `package.json`, genera/actualiza `CHANGELOG.md`, y crea un commit
`chore(release): x.y.z` + tag `vx.y.z`. Después hay que `git push --follow-tags`.

## Nombres de branch

Patrón: `<tipo>/<descripcion-corta>`, mismo vocabulario de tipos que los commits.

```
feat/leer-tabla-precios
fix/selector-roto-sitio-a
docs/actualizar-readme
```

`main` es el único nombre exento del patrón. Se valida en `git push` (`.husky/pre-push`,
via `validate-branch-name`) y de nuevo en CI en cada PR (job `branch-name`).

## Pull Requests

Se abren contra `main` usando la plantilla en
[`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) (se completa
sola al crear el PR): qué cambia y por qué, tipo de cambio (para saber el bump
esperado), cómo se probó, y checklist de `lint`/`format`/`test`/`build`.
