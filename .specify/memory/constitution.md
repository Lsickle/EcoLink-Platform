# EcoLink-Platform Constitution

Este documento formaliza en formato spec-kit las reglas transversales ya fijadas en `CLAUDE.md` (fuente original, no se duplica lógica ni se reinterpreta — ante cualquier conflicto entre este archivo y `CLAUDE.md`, `CLAUDE.md` manda). Aplica a todo el monorepo (`backend/`, y `web/`/`mobile/` cuando existan).

## Core Principles

### I. Esquema como fuente de verdad (NON-NEGOTIABLE)
Antes de crear o modificar cualquier modelo, migración o repositorio, se consulta el skill `esquema-bd`. No se inventan ni asumen nombres de columna, tipos o relaciones. Si `esquema-bd` no cubre algo (tabla fuera de alcance, campo sin resolver), se declara explícitamente el gap en vez de inventar una estructura.

### II. Trazabilidad de negocio preservada
Los IDs de trazabilidad (RN-XXX, CU-XXX.Y, D-XXX-NN) se preservan exactamente en comentarios de código, nombres de test, mensajes de commit y specs — permite rastrear una línea de código hasta su regla de origen. Ninguna spec/tarea de este flujo omite esta referencia cuando aplica.

### III. No reinterpretación silenciosa de reglas de negocio
Si una regla de negocio es ambigua, incompleta o contradice otra, o si una decisión marcada "recomendado, pendiente de confirmación" en `CLAUDE.md` (Vapor, Pusher/Ably, react-konva, Pest, etc.) no ha sido ratificada explícitamente, se señala al usuario — nunca se decide unilateralmente ni se asume en silencio.

### IV. TDD obligatorio (NON-NEGOTIABLE)
Ciclo red-green-refactor: test que falla → implementación mínima que lo pasa → refactor. Aplica a todo cambio Tier 1 y Tier 2 (ver Development Workflow). Pest es el framework de testing del backend.

### V. Revisión de seguridad antes de cerrar flujos sensibles
Antes de dar por cerrado cualquier flujo de autenticación, autorización, manejo de tokens o aislamiento multi-tenant, se invoca `especialista-seguridad` para una pasada explícita de revisión — no se asume que el código es seguro solo porque los tests pasan.

## Alcance técnico y de cumplimiento

Stack ya decidido (D6 de `CLAUDE.md`, no se reabre sin razón explícita): Laravel 13/PHP 8.4, React 19, React Native + Expo, PostgreSQL 17, S3, Redis, Sanctum. Decisiones marcadas "recomendado" en `CLAUDE.md` (Vapor, Pusher/Ably, react-konva, Tailwind+shadcn/ui, NativeWind+RN Paper, Pest, GitHub Actions, Sentry+CloudWatch) se tratan como propuestas, no como hechos, hasta confirmación explícita del usuario. El sistema maneja datos regulados RESPEL y datos personales bajo la Ley 1581 de 2012 (Colombia) — cualquier diseño que toque estos datos hereda las obligaciones de minimización/retención descritas en `CLAUDE.md`.

## Development Workflow

Flujo graduado por tamaño de cambio (definido en la sesión de diseño SDD/TDD, `C:\Users\david\.claude\plans\vamos-a-indagar-sobre-rosy-frog.md`):
- **Tier 0** (copy, color, dato de seeder): edición directa, sin spec, sin TDD formal obligatorio.
- **Tier 1** (bug fix o feature pequeña de un solo dominio): TDD (test que falla → implementación → pasa), sin pasar por spec-kit completo.
- **Tier 2** (feature con impacto de negocio o que cruza dominios, cambia esquema/API/UI, o toca auth/multi-tenant): flujo completo de spec-kit (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`), con revisión de `especialista-seguridad` si aplica, TDD, `/code-review` y `/verify` antes de cerrar.

Los subagentes de dominio (backend, frontend, móvil — se agregan progresivamente) se invocan siempre desde el hilo principal, nunca de forma autónoma, y solo tienen acceso a los MCP explícitamente declarados en su propio frontmatter.

## Governance

Esta constitución es un espejo de las reglas transversales de `CLAUDE.md` en formato spec-kit — cualquier cambio a un principio aquí requiere el mismo criterio que cambiar `CLAUDE.md`: señalar el cambio explícitamente al usuario, nunca decidirlo en silencio. Las specs generadas con `/speckit-specify` deben ser consistentes con estos principios; `/speckit-analyze` se usa para detectar inconsistencias antes de implementar.

**Version**: 1.0.0 | **Ratified**: 2026-07-13 | **Last Amended**: 2026-07-13
