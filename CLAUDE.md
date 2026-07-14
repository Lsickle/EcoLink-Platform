# CLAUDE.md — EcoLink: Desarrollo de Aplicación

Este archivo es el contexto de proyecto para el repo de **código** de EcoLink (Laravel + React + React Native). Es distinto del repo de documentación/migración — ese sigue siendo la fuente canónica de specs, reglas de negocio y decisiones, y se referencia desde aquí por ruta, nunca se duplica.

> **Repo de documentación (fuente canónica)**: `C:\Users\david\OneDrive\Proyecto Web - Gestion de Servicios Ambientales`

---

## Qué es EcoLink

Plataforma SaaS de gestión de residuos y logística ambiental (Colombia, normativa RESPEL). Multi-tenant por organización, con roles diferenciados (Generador, Gestor, EcoLink como plataforma). El diseño funcional completo (reglas de negocio, casos de uso, modelo de datos, RBAC) ya está migrado y versionado en Notion/Linear — este repo es donde ese diseño se convierte en código.

---

## Stack

### Ya decidido (D6, 2026-07-03; backend corregido 2026-07-12 — no reabrir sin razón explícita)
- **Backend**: Laravel 13 / PHP 8.4 — *corrección 2026-07-12*: D6 original fijó Laravel 12, pero esa decisión se tomó de memoria sin verificar la versión vigente. Laravel 13 salió el 2026-03-17 (ya publicado cuando se fijó D6) y Laravel no tiene versiones LTS especiales desde Laravel 6 (2019): toda versión mayor recibe la misma ventana fija de 18 meses de bug fixes + 24 de security fixes, así que no hay motivo de estabilidad para preferir la 12. Laravel 13 exige PHP 8.3 como mínimo, compatible con el PHP 8.4 ya decidido.
- **Frontend web**: React 19
- **Móvil**: React Native + Expo
- **Base de datos**: PostgreSQL 17 en AWS RDS
- **Archivos**: S3 · **Cache/colas**: Redis
- **Autenticación**: Laravel Sanctum — cookie en web, token Bearer en móvil (RN-181)
- **Dev local**: Laravel Sail (Docker por debajo, sin configuración manual aparte)

### Recomendado (pendiente de confirmación del usuario antes de fijarlo en código)
- **Tiempo real**: Pusher o Ably en vez de Reverb self-hosted — Reverb necesita un proceso persistente, incompatible con el cómputo serverless recomendado abajo.
- **Cómputo/despliegue**: Laravel Vapor sobre AWS (serverless, autoscaling, sin servidores que administrar) + RDS Proxy para pooling de conexiones.
- **API**: REST con Laravel API Resources, versionada desde `/api/v1/`.
- **Offline móvil**: SQLite local (`expo-sqlite`) + cola de sincronización con `client_uuid` como llave de idempotencia — sin motor de resolución de conflictos por ahora (WatermelonDB queda como escalón futuro si hace falta).
- **Áreas de almacenamiento configurables**: `react-konva` para el editor de canvas 2D.
- **UI web**: Tailwind CSS + shadcn/ui. **UI móvil**: NativeWind + React Native Paper (Material Design 3, mismo lenguaje visual ya usado en los prompts de Figma de las specs).
- **Testing**: Pest (backend), Vitest + Testing Library (frontend web), Playwright diferido a cuando haya flujos estables que proteger.
- **CI/CD**: GitHub Actions. **Observabilidad**: Sentry + CloudWatch.
- **Kubernetes**: descartado por ahora — Vapor ya resuelve orquestación/escalado sin ese costo operativo.

Detalle completo con justificación de cada punto: informe de arquitectura técnica generado 2026-07-11 (pídele al usuario el enlace del artifact si no está a mano).

---

## Mapa de referencias — qué consultar y dónde

**No asumas estructura de datos, reglas de negocio ni permisos de memoria.** Antes de escribir código que dependa de alguno de estos, consulta la fuente correspondiente.

### Imprescindibles (consultar siempre que aplique, no solo la primera vez)

| Fuente | Contenido | Ruta / acceso |
|---|---|---|
| Skill `esquema-bd` | DDL completo del modelo de datos, con trazabilidad RN-XXX | `.claude/skills/esquema-bd/SKILL.md` — copiar o symlink desde el repo de docs a este repo |
| Mapa C4 | Componentes por dominio, métodos por caso de uso, integraciones entre dominios | `...\4-Planificación del desarrollo\AI Context\Mapa de Modulos.md` |
| Matriz CRUD/RBAC | Permisos por rol, módulo por módulo (§1–19) | `...\4-Planificación del desarrollo\AI Context\Matriz CRUD Formal - IEEE 29148.md` |
| Modelo de roles (3 ejes) | Rol de sistema / rol de negocio / cargo, con reconciliación por módulo | `...\docs\_migracion\_transversal\roles-canonicos.md` |
| Reglas de negocio globales | RN-001 a RN-190 | `...\2-Levantamiento y análisis de requerimientos\REGLAS DE NEGOCIO – ECOLINK.md` |
| Notion — Casos de Uso | Estado de cada CU, componente C4 asignado, frame Figma, issue Linear | MCP Notion, DB `65340a74927a414a937f4a04154b8238` (ds `def3afc8-27e1-4fe5-b1bc-340ae00e5620`) |
| Notion — Reglas de Negocio | RN globales como páginas (namespace local NO está aquí, ver abajo) | MCP Notion, DB `171c916c118a4b28803652a4b3fe891a` (ds `b9037f3a-b6c4-4e9f-866f-150f1f3ec3b3`) |
| Notion — Decisiones de Reconciliación | Todas las D-XXX confirmadas, con su alcance | MCP Notion, DB `41ae204b7478442e87beade8f2b7e752` (ds `72990f4d-4cb0-4007-9557-88a2c6154e95`) |
| Notion — Catálogos y Estados | Estados de workflow por entidad | MCP Notion, DB `49f448cac8db493188b640186f02981a` (ds `2945135d-bf9d-412a-b4bb-e1b87a448fd4`) |
| Linear | Deuda técnica y hallazgos abiertos por módulo (`lote:<modulo>-*`) | Team **EcoLink** (`b47f75df-fc11-4fb4-9c70-2afafb8e80c0`, key ECO) |
| Figma | Frames reales ya construidos, por node-id enlazado en cada página CU | fileKey `pX6vqXxnJ66YSIYpE7v9pV`, página "Modules" |

**Importante — namespace local de reglas de negocio**: cada módulo tiene decenas/cientos de reglas locales (`RN-NOT-XXX`, `RN-CER-XXX`, etc.) que **nunca se cargaron a Notion** por convención del proyecto (para no fragmentar el canon de reglas globales). Esas reglas solo existen en las specs fuente — ver siguiente tabla.

### Consulta puntual (según el módulo/pantalla en el que estés trabajando)

| Fuente | Cuándo consultarla |
|---|---|
| `...\2-Levantamiento y análisis de requerimientos\Especificacion Casos de uso\<MODULO>\CU-XXX_Y-*.md` | Al implementar un subcaso específico — tiene el detalle completo que Notion resume: wireframe, endpoints, criterios de aceptación, casos de prueba, reglas locales `RN-<NS>-XXX`. |
| `...\docs\_migracion\<modulo>\*.md` | Si algo en Notion/código no cuadra y necesitas el razonamiento completo detrás de una decisión D-XXX (alternativas consideradas, no solo el resultado final). |
| `...\docs\_diagramas\*.md` | Al implementar transiciones del motor de Workflow — máquinas de estado formales en Mermaid por entidad. |
| `...\4-Planificación del desarrollo\AI Context\Negocio\Catálogo de Permisos.md` | Antes de nombrar un permiso nuevo — tiene un gap de nomenclatura conocido y no armonizado, revisar para no repetirlo. |

---

## Reglas transversales

1. **Consulta `esquema-bd` antes de crear o modificar cualquier modelo, migración o repositorio.** No inventes ni asumas nombres de columna o tipos.
2. **Los IDs de trazabilidad se preservan exactamente** (RN-XXX, CU-XXX.Y, D-XXX-NN) en comentarios de código, nombres de test, mensajes de commit relevantes — facilita rastrear una línea de código hasta su regla de origen.
3. **Las reglas de negocio no se reinterpretan silenciosamente.** Si el código necesita desviarse de lo especificado (una regla es ambigua, incompleta, o contradice otra), se señala explícitamente al usuario — no se decide unilateralmente.
4. **Antes de fijar en código una de las decisiones marcadas "recomendado" arriba** (Vapor, Pusher/Ably, react-konva, etc.), confirmar con el usuario si sigue vigente — son propuestas de un informe, no decisiones ya ratificadas como el resto del stack.
5. **Decisiones de negocio pendientes conocidas** (heredadas del repo de docs, no resolver aquí sin validación): RTX-003 (retención de manifiestos), RTX-010 (formato de reportes regulatorios), y cualquier item marcado `Requiere decision`/`Todo` en Linear para el módulo en curso.
6. **Seguridad**: antes de cerrar cualquier flujo de autenticación, autorización, manejo de tokens o aislamiento multi-tenant, es buena práctica pedir una revisión explícita — el criterio ya usado en el repo de docs fue un agente dedicado a análisis de riesgos de seguridad; en este repo, al menos hacer una pasada explícita de revisión antes de dar el flujo por cerrado.
7. **Repositorio único (monorepo)** — backend, frontend web y la futura app móvil (Expo) viven en el mismo repo (`Lsickle/EcoLink-Platform`), no en repos separados. Es necesario para que Solito comparta código entre `apps/next` y la futura app Expo vía `frontend/packages/app` (decisión de stack, ver arriba), y permite que un mismo commit/PR cierre un cambio que toca varias capas a la vez (p. ej. un endpoint nuevo + el cliente que lo consume), sin coordinar múltiples repos.
8. **Convención de mensajes de commit — Conventional Commits, con scope por *feature/dominio*, no por capa.** Cuando un commit toca varias capas (backend + frontend) para la misma feature, el scope es el dominio/caso de uso (idealmente el mismo namespace que ya usan las reglas de negocio y CU-XXX), no `backend`/`frontend`:
   ```
   feat(auth): recuperación de contraseña con OTP (CU-009)
   ```
   El prefijo de capa (`backend`/`frontend`/`mobile`) se reserva para cambios genuinamente exclusivos de una capa sin CU-XXX asociado (p. ej. `chore(backend): agregar worker de colas a compose.yaml`, `fix(frontend): centrado del layout de auth`). Cambios verdaderamente transversales a todo el repo (config de linter, CI) omiten el scope: `chore: configurar ESLint compartido`. Para rastrear qué commits tocaron una capa específica, filtrar por ruta (`git log -- backend/`), no por el texto del prefijo.

---

## Orden de arranque

1. Repo + entorno local (`sail up`, confirmar Docker corriendo).
2. Migraciones reales del módulo **Usuarios y Seguridad**: `organizations`, `users`, `roles`, `permissions`, `role_permissions`, `people` — vía `esquema-bd`.
3. Sanctum (login web + móvil) sin roles finos todavía.
4. Policies por recurso, apoyadas en la Matriz CRUD ya migrada.
5. Seguridad base (TLS, secrets manager, rate limiting) antes de exponer el primer endpoint público.
6. Primer deploy (aunque sea un `/health`) para validar la infraestructura temprano.
7. CI mínimo (tests en cada push).
8. Frontend web del módulo, luego app móvil con el mismo flujo de login — el trabajo offline entra después de tener auth funcionando, no antes.
