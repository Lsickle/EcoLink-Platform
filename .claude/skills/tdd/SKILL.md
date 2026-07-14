---
name: tdd
description: Ciclo TDD (red-green-refactor) para cambios de EcoLink, en backend (Pest) y frontend web (Vitest + Testing Library). Úsalo en cualquier cambio Tier 1 o Tier 2 (ver constitución en .specify/memory/constitution.md) antes de escribir código de implementación — nunca escribas la implementación primero y el test después.
---

# TDD — red-green-refactor

No hay mecanismo oficial de Claude Code que fuerce este ciclo — es disciplina de proceso. Sigue los pasos en orden, sin saltarte ninguno. Los comandos exactos dependen de en qué parte del monorepo estés trabajando:

| | Backend (`backend/`) | Frontend web (`frontend/apps/next`) |
|---|---|---|
| Framework | Pest | Vitest + Testing Library |
| Correr un test filtrado | `vendor/bin/sail artisan test --compact --filter=nombreDelTest` | `yarn vitest run -t "nombre del test"` |
| Correr toda la suite | `vendor/bin/sail artisan test --compact` | `yarn test` |
| Formato/estilo antes de cerrar | `vendor/bin/sail bin pint --dirty --format agent` | (sin linter automático configurado todavía) |

## 1. Red — escribe el test que falla

- Escribe (o actualiza) un test que exprese el comportamiento esperado del cambio, usando el nombre de la regla de negocio si aplica (`RN-XXX`, `CU-XXX.Y`) en el nombre del test o un comentario.
  - Backend: en `tests/Feature/` o `tests/Unit/` (Pest).
  - Frontend: colocado junto al código bajo prueba en `apps/next` (Vitest + Testing Library); la lógica compartida de `packages/app` se testea igual desde `apps/next`, importando vía el alias `app/*` (ver nota de convención de alias en el agente `frontend-web`).
- Corre **solo ese test** y confirma que falla, y que falla **por la razón esperada** (comportamiento no implementado), no por un error de sintaxis o de setup.
- Si el test pasa sin haber implementado nada, el test está mal escrito — corrígelo antes de continuar.

## 2. Green — implementa lo mínimo

- Escribe la implementación más simple que haga pasar el test — no adelantes funcionalidad que ningún test todavía pide.
- Vuelve a correr el mismo test filtrado hasta que pase.

## 3. Refactor

- Con el test en verde, limpia la implementación (nombres, duplicación, estructura) sin cambiar comportamiento.
- Vuelve a correr el test tras cada cambio de refactor para confirmar que sigue en verde.

## 4. Suite completa

- Corre toda la suite relevante, no solo el test nuevo.
- Si algo más se rompió, arréglalo antes de continuar — no se "arregla después".

## 5. Cierre

- Si el cambio tiene superficie de runtime real (endpoint, pantalla completa, no solo una unidad aislada), cierra con el skill `/verify` para validar end-to-end (backend: correr el flujo real; frontend: confirmar que la ruta carga y renderiza lo esperado, `yarn dev` + verificación).
- Backend: antes de considerar el cambio terminado, corre `vendor/bin/sail bin pint --dirty --format agent` — ver skill `laravel-best-practices` para más convenciones.
- Frontend: no hay hook de formato automático configurado todavía (decisión pendiente de la sección de enforcement de Clean Code — ver plan de diseño SDD/TDD).

## Notas

- `nizos/tdd-guard` (plugin) se probó para el backend y se descartó — incompatibilidad real entre el reporter (corre dentro del contenedor Sail) y el hook (corre en el host relativo a la raíz del monorepo). No se ha evaluado para el frontend; no asumas que hay un gate automático activo en ningún lado del proyecto.
- Para cambios Tier 0 (ver constitución) este ciclo no es obligatorio.
