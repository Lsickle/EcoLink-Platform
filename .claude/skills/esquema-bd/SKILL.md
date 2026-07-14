---
name: esquema-bd
description: Esquema completo de la base de datos de EcoLink en formato DDL compacto, con mapeo de claves foráneas. Úsalo antes de crear o modificar modelos, migraciones, repositorios o cualquier código que dependa de la estructura de tablas, para evitar inconsistencias de nombres, tipos o relaciones. No asumas la estructura de una tabla de memoria — consulta este skill primero.
---

# Esquema de Base de Datos — EcoLink

## ⚠️ Estado: BORRADOR (pendiente de validación por `arquitecto-datos`)

Este esquema se generó **directamente** a partir de `diccionario.csv` y `relaciones.csv`, sin pasar todavía por la auditoría de coherencia del subagente `arquitecto-datos` (que valida cruces contra reglas de negocio RN-XXX y casos de uso CU-XXX). Trátalo como la mejor referencia estructural disponible hoy, **no como fuente definitiva**. Cuando `arquitecto-datos` corra su auditoría completa, este archivo debe regenerarse/corregirse con sus hallazgos confirmados, y este aviso debe eliminarse.

## 🚩 Gaps ya detectados solo con el cruce estructural (antes de tocar reglas de negocio)

Estos son hallazgos automáticos, de pura consistencia entre `diccionario.csv` y `relaciones.csv` — todavía no se validaron contra RN-XXX/CU-XXX, pero ya son evidencia de que el modelo necesita la auditoría completa antes de generar migraciones reales:

1. **Tabla referenciada inexistente**: 7 campos declaran `Tabla Referencia = persons`, pero esa tabla no existe en el diccionario — la tabla real se llama `people`. Afecta a: `audit_logs.person_id`, `document_logs.person_id`, `manifest_loads.generator_signer_person_id`, `manifest_loads.driver_signer_person_id`, `manifest_unloads.receiver_person_id`, `manifest_unloads.driver_signer_person_id`, `security_logs.person_id`. **Esto es un bug real de datos, no una ambigüedad de negocio — se puede corregir sin esperar validación humana**, pero igual queda documentado aquí para que `arquitecto-datos` lo confirme y lo cierre formalmente.

2. **106 de 208 relaciones FK sin regla ON DELETE / ON UPDATE definida**: el diccionario marca 208 campos como llave foránea (con tabla y campo de referencia), pero `relaciones.csv` solo documenta la regla de borrado/actualización para 102 de ellas. Los 106 casos restantes están marcados en este DDL como `ON DELETE ??SIN DEFINIR?? ON UPDATE ??SIN DEFINIR??`. **No se debe generar una migración real con estas reglas sin definir** — muchas involucran tablas de auditoría y logs (`audit_logs`, `security_logs`, `workflow_logs`, `document_logs`, `integration_logs`) donde probablemente aplique RESTRICT o SET NULL por la regla RN-158 (los registros de auditoría no pueden eliminarse físicamente), pero eso es una decisión de negocio, no una que deba tomar este esquema por su cuenta.

3. ~~**RN-041** (ambigüedad de cardinalidad residuo↔corriente)~~ — **RESUELTO 2026-07-05** (decisión D-R01 + arquitecto-datos, módulo Residuos y Corrientes, `docs\_migracion\residuos-corrientes\`). Ver punto **14** más abajo para el modelado técnico completo.

4. ~~**RN-063** (compatibilidad residuo↔tratamiento, "¿se valida por corriente?")~~ — **RESUELTO 2026-07-05** (decisión D-R02 + arquitecto-datos, mismo módulo). Ver punto **14** más abajo.

## 🔧 Cambios de esquema pendientes derivados de reglas nuevas (RN-181 a RN-190) — por validar `arquitecto-datos`

Estas reglas se agregaron el 2026-07-03 (ver `REGLAS DE NEGOCIO – ECOLINK.md`) **después** de generar el DDL de abajo, por lo que el esquema del cuerpo de este documento **todavía no las refleja** — el DDL sigue siendo una derivación fiel de `diccionario.csv`/`relaciones.csv` tal como están hoy. Lo siguiente son los cambios de esquema que estas reglas implican, propuestos como punto de partida, **pendientes de que `arquitecto-datos` los valide y de que se apliquen primero en `diccionario.csv` (fuente de verdad) antes de regenerar el DDL**. No están incluidos abajo para no romper la fidelidad DDL↔CSV verificada.

1. **Operación offline (RN-184, RN-185, RN-186, RN-187)** — columnas nuevas en las tablas que capturan registros en campo (candidatas: `manifest_loads`, `manifest_unloads`, `manifest_load_items`, `manifest_unload_items`, y `files` para evidencia fotográfica; el conjunto exacto lo confirma `arquitecto-datos`):
   - `sync_status VARCHAR(30) NOT NULL DEFAULT 'SYNCED'` — RN-184 (valores tipo `PENDING_SYNC` / `SYNCED`; registros creados en servidor nacen `SYNCED`, los capturados offline nacen `PENDING_SYNC`).
   - `device_captured_at TIMESTAMPTZ NULL` — RN-186 (marca de tiempo del dispositivo, informativa; el `created_at`/hora de recepción del servidor sigue siendo la autoritativa).
   - `offline_integrity_hash VARCHAR(128) NULL` — RN-185 (hash/firma del payload al momento de captura offline, para detectar manipulación antes de sincronizar).
   - `synced_at TIMESTAMPTZ NULL` (opcional) — momento de confirmación del servidor; una vez sincronizado, el registro es inmutable (RN-187, refuerza RN-158).
   - **Alternativa a evaluar por `arquitecto-datos`**: en vez de columnas por tabla, una tabla genérica de cola/seguimiento de sincronización (`offline_sync_queue` o similar). Decisión de modelado, no la toma este skill.
   - "Quién capturó" ya está cubierto por las FKs de firmante/uploader existentes (`generator_signer_person_id`, `driver_signer_person_id`, `receiver_person_id`, `uploaded_by_user_id`).

2. **RN-188 (visibilidad matriz→hija)** — **no requiere columna nueva**: `organizations.parent_organization_id` ya existe en el diccionario. Lo que falta es la **lógica de control de acceso** (scope de solo lectura, un solo nivel), no el esquema.

3. **RN-181 (autenticación)** — Sanctum agrega la tabla `personal_access_tokens`, y Laravel las tablas `sessions` / `password_reset_tokens`, vía migraciones del framework. **No están en `diccionario.csv`** (no son tablas de negocio) — `arquitecto-datos` debe tenerlas presentes para no marcarlas como "faltantes" cuando aparezcan en el código.

4. **RN-183 (cifrado/minimización en dispositivo)** — es almacenamiento **del lado del dispositivo móvil** (SQLite cifrado en el teléfono), no afecta el esquema del PostgreSQL del servidor. Se anota aquí solo para dejar claro que NO implica cambios en este DDL.

5. **RN-189 (cargo obligatorio para todos los contactos)** — `people.position_id` hoy es `BIGINT NULL`; debe pasar a **NOT NULL** para los registros que representan contactos (el cargo se toma de `positions`). `arquitecto-datos` debe confirmar si aplica a toda la tabla `people` o solo a los registros en rol de contacto (la tabla `people` mezcla personas del sistema y contactos — ver hallazgo H9 del inventario). También revisar los formularios de CU-003, que marcan Cargo como opcional.

5-bis. **Contacto↔Organización = N:N — falta la tabla pivote `organization_contacts`** (decisión **D3 (2026-07-03)** reafirmada como **D-P02 revisada (2026-07-04)**; confirmada por la pantalla Figma `Detalle Contacto` `506:3762` y por RN-018 / RN-CON-029 / RN-CON-030 / CU-003.5, que ya la citan). **Bug de modelo:** hoy la relación se implementa como FK única `people.organization_id → organizations` (N:1 en `relaciones.csv` línea 32 y en el DDL de `people`), lo cual **contradice el N:N normado y diseñado**. `arquitecto-datos` debe:
   - (a) **Crear la pivote `organization_contacts`** (N:N, patrón idéntico a `organization_business_roles`). Columnas conocidas por la UI y RN-018: `id`, `uuid`, `tenant_organization_id`, `contact_id/people_id → people.id`, `organization_id → organizations.id`, `branch_id → branches.id NULL` (RN-018: "y a múltiples sucursales de cada organización" — el vínculo puede bajar a sucursal), `position_id → positions.id` (cargo por vínculo, RN-189), `relationship_type` (catálogo: Empleado/Consultor/Externo — visto en UI), `is_primary BOOLEAN` (organización/vínculo principal), `start_date`, `is_active`, auditoría estándar. **UNIQUE** sugerido `(contact_id, organization_id, branch_id)`.
   - (b) Decidir el destino de **`people.organization_id`**: eliminarlo, o conservarlo como *organización principal derivada* (= el vínculo con `is_primary = true`). No debe seguir siendo la relación de pertenencia.
   - (c) Actualizar `diccionario.csv` (añadir tabla `organization_contacts`) y `relaciones.csv` (línea 32 deja de ser la pertenencia; añadir las FK de la pivote como `Muchos a Muchos (Pivot) / N:M`) **en la re-exportación limpia** de `tablasMER.xlsx` (ver P-T06: esos CSV tienen corrupción de columnas y no deben editarse a mano). Mientras tanto, esta entrada es la especificación de record del N:N.
   - Nota: `CU-003.5` y `RN-CON-030` **ya especifican N:N** — el trabajo pendiente es solo de modelo de datos, no de reglas/CU.

6. **RN-190 (catálogos: default de sistema + activación por organización)** — patrón transversal con implicaciones de modelo en `positions` y, potencialmente, en todos los catálogos parametrizables:
   - `positions` **no tiene** `is_system` (a diferencia de `treatments`, `waste_streams`, `roles`, `permissions`, `business_roles`, `*_statuses`, que sí lo tienen). Agregar `is_system BOOLEAN NOT NULL DEFAULT false` para distinguir valores por defecto del sistema (`is_system=true`, `tenant_organization_id`/`organization_id` NULL) de valores propios de una organización (`is_system=false`, org seteada).
   - **Un `is_system` + `is_active` global NO basta**: la regla exige que cada organización pueda activar/desactivar cada valor del sistema **de forma independiente**. Eso requiere estado de activación **por organización**, no un booleano global en la fila del catálogo. Diseño candidato: una tabla puente `organization_position_settings` (`organization_id`, `position_id`, `is_active`) — por eficiencia, almacenar solo las excepciones (desactivaciones), asumiendo "activo por defecto para todas". El catálogo efectivo de una organización = (valores del sistema no desactivados para ella) ∪ (sus valores propios).
   - **Nota**: para `business_roles` este patrón ya existe parcialmente vía la tabla puente `organization_business_roles`. `arquitecto-datos` debe decidir si se generaliza un mecanismo único (una tabla de settings polimórfica por catálogo) o se replica por catálogo, y **auditar qué catálogos parametrizables deben cumplir RN-190 y cuáles ya lo hacen** (hoy es inconsistente).
   - **RBAC**: el permiso de activar/desactivar valores de catálogo por organización pertenece al **administrador del sistema**, no al administrador de la organización (RN-190) — impacta el diseño de `roles`/`permissions`.

7. **Conductor como extensión 1:1 de `people`** (decisión de modelado 2026-07-03, al catalogar CU-052; no proviene de un RN — el RN-091 "todo conductor deberá estar registrado" ya existe, esto es su implementación):
   - La tabla `transport_personnel` está **referenciada** (`manifest_loads.transport_personnel_id`, `manifest_unloads.transport_personnel_id`, `transport_schedules.transport_personnel_id`) pero **no está definida** en el diccionario — otro hueco (como `locations`).
   - Decisión: modelar al conductor como **extensión 1:1 de `people`** (mismo patrón que `users.person_id → people`), no como entidad separada con identidad duplicada. La tabla de conductor (que define/unifica `transport_personnel`) debe tener **FK `person_id → people.id` con constraint UNIQUE (1:1)** y contener solo los atributos propios del rol: número/categoría/vencimiento de licencia, permisos de mercancías peligrosas, organización transportadora asociada (RN-090).
   - `arquitecto-datos` debe: (a) definir esta tabla, (b) decidir su nombre final (`drivers` o mantener `transport_personnel`), (c) reapuntar los FK `transport_personnel_id` a ella, y (d) corregir de paso el typo `driver_signer_person_id -> persons.id` → `people.id` (ver gap #1 de la sección de arriba).
   - Beneficio: cero duplicación de datos personales; una persona que es contacto y conductor = un único registro en `people`.

8. **Hallazgos adicionales al redactar las specs CU-051/CU-052** (Vehículos y Conductores, 2026-07-03) — por validar `arquitecto-datos`:
   - **Campos de licencia de conductor** (`license_number`, `license_category`, `license_expiration_date`, permisos) **no existen en ninguna tabla** — van en la tabla `drivers`/`transport_personnel` (extensión 1:1 de `people`, ver punto 7).
   - **Documentos de vehículo**: `vehicles` solo tiene `soat_expiration_date` y `technical_inspection_expiration`. Para documentos arbitrarios (licencia de tránsito, pólizas) con tipo+número+emisor+vigencia se necesita una tabla `vehicle_documents` nueva, o usar el repositorio genérico `files` con metadatos.
   - **Permisos especiales de conductor** (mercancías peligrosas, CU-052.7): no hay tabla; candidata `driver_permits`.
   - **Tabla de notificaciones ausente**: no hay tabla `notifications` en el DDL, pese a que el Módulo 14 y RN-149/177/178 exigen persistir alertas de vencimiento documental (CU-051.6, CU-052.6). Debe definirse.
   - **Cardinalidad conductor↔organización transportadora abierta** (CU-052.8): las specs asumieron N:N (tabla puente `driver_organizations`) por coherencia con RN-094/095 y el patrón multiempresa, pero podría ser 1:N (`carrier_organization_id` en la tabla de conductor). **Decisión pendiente de `arquitecto-datos`.**

9. **Hallazgos al redactar las specs CU-053/CU-054** (Integraciones, 2026-07-03) — el DDL solo tiene las tablas de **bitácora** (`integration_logs`, `integration_requests`, `integration_responses`, `integration_payloads`), que dan pleno respaldo a CU-054 (consulta). Faltan las tablas de **configuración** de integración (todo CU-053):
   - `integrations` (definición: sistema, endpoint, tipo, método, formato) — no existe.
   - `integration_credentials` (credenciales cifradas, CU-053.2) — no existe; coordinar con `especialista-seguridad` (cifrado en reposo, RTX-007).
   - `integration_field_mappings` (mapeo origen→destino, CU-053.6) — no existe.
   - `integration_dedup_rules` (config anti-duplicados, CU-053.7) — no existe. La *detección* sí tiene respaldo (`integration_payloads.payload_hash` UNIQUE), pero no la *configuración de la regla*.
   - Enlace padre-hijo entre reintentos (CU-054.7): existe `integration_responses.retry_number` / `integration_logs.attempt_number`, pero no un `parent_integration_log_id` para vincular el reintento con la transacción original. Pendiente si se requiere el vínculo explícito.

10. ~~**Hallazgo al redactar las specs CU-055 a CU-058**~~ **RESUELTO — Módulo Notificaciones, paso 2 (arquitecto-datos)** (2026-07-11, `docs\_migracion\notificaciones\02-arquitecto-datos.md`, CU-055 a CU-058, namespace `RN-NOT-001..172`). Diseño completo de 7 tablas nuevas (estructura validada contra las 28 specs reales, pendiente de aplicarse en `diccionario.csv`/`relaciones.csv` antes de regenerar el DDL de abajo):
    - **`notification_templates`**: `id, uuid, tenant_organization_id NULL FK organizations ON DELETE RESTRICT, is_system, code UNIQUE(tenant_organization_id, code), name, description, subject, body, is_active DEFAULT false, notification_event_id NULL FK notification_events ON DELETE RESTRICT, additional_recipients JSONB, variable_defaults JSONB, metadata JSONB, deleted_at, auditoría`.
    - **`notification_template_channels`**: `id, notification_template_id FK ON DELETE CASCADE, channel VARCHAR (EMAIL habilitado en MVP; SMS/WHATSAPP/PUSH/IN_APP post-MVP), subject_override, body_override, priority, is_enabled`. `UNIQUE(notification_template_id, channel)`.
    - **`notification_template_recipients`**: `id, notification_template_id FK ON DELETE CASCADE, role_id FK roles.id ON DELETE RESTRICT`. `UNIQUE(notification_template_id, role_id)`.
    - **`notification_events`**: `id, uuid, tenant_organization_id NULL FK organizations ON DELETE RESTRICT, is_system, code UNIQUE, name, description, category, criticality DEFAULT NORMAL, exposed_variables JSONB, conditions JSONB, is_active`. Correlaciona por convención (no FK) con `workflow_logs.event_code` para eventos de cambio de estado.
    - **`notifications`**: `id, uuid, tenant_organization_id FK organizations ON DELETE RESTRICT, notification_template_id FK ON DELETE RESTRICT, notification_event_id NULL FK ON DELETE SET NULL, channel, recipient_user_id NULL FK users ON DELETE SET NULL, recipient_email, rendered_subject, rendered_body, status DEFAULT QUEUED, is_test DEFAULT false, sent_at, failed_reason, parent_notification_id NULL FK notifications.id (self-ref) ON DELETE RESTRICT (reenvíos, CU-058.7), triggered_by_user_id NULL FK users ON DELETE SET NULL`. Sin `deleted_at` (RN-NOT-130 inmutabilidad vs. RN-NOT-156 retención — mismo hueco abierto que RTX-003, no resuelto).
    - **`notification_deliveries`**: `id, notification_id FK ON DELETE CASCADE, event_type (QUEUED/ACCEPTED/SENT/OPENED/BOUNCED/FAILED), occurred_at, external_message_id, error_message, raw_provider_payload JSONB`. Fuente de verdad de la línea de tiempo; `notifications.status` es cache del último evento.
    - **`notification_preferences`**: `id, user_id FK users ON DELETE CASCADE, scope_type CHECK(CHANNEL/EVENT), channel NULL, notification_event_id NULL FK ON DELETE CASCADE, is_enabled`. `UNIQUE(user_id, scope_type, channel, notification_event_id)`.
    - **`notification_event_automations` DESCARTADA (D-NOT-01)**: en vez de tabla separada, `workflow_automatic_actions` se generalizó (ver item 17 arriba) para anclarse también a `notification_event_id` — es el único mecanismo "cuando ocurre X, haz Y" del sistema.
    - **Preguntas abiertas, no resueltas**: ¿plantillas/eventos globales o por organización? (aplicado patrón D-R05 por precedente, sin evidencia directa en las specs); mapeo "tipo de notificación" (CU-057.3) ↔ `notification_events` (inferencia sin confirmación literal); redundancia CU-055.5/.6 (canal/destinatarios en plantilla) vs. CU-021.9 (otra vez en la transición) — para el Paso 3; retención de `notifications`/`notification_deliveries` (RN-NOT-156).
    - **Colisión de namespace resuelta (D-NOT-02)**: `CU-014.10` (Solicitudes, ya migrado) reutilizaba `RN-NOT-001..007` con contenido distinto (idempotencia, opt-out, reintentos, escalamiento) — namespace local de `CU-014.10` retirado a favor del canon `RN-NOT-001..172`; esas 4 capacidades quedan como backlog post-MVP real, no descartadas.

11. **Hallazgos al redactar specs de Programación (CU-059/060) y Manifiestos (CU-031/032)** (2026-07-03):
   - **`manifest_loads` (y `manifest_unloads`) sin campo de estado propio** (solo `is_active`/`deleted_at`), pese a que RN-111/RN-118 exigen estado operativo e historial. **Resuelto 2026-07-10 (D-MAN-01)**: el usuario eligió el catálogo del Workflow de Manifiestos (8 estados: Draft/Generated/PartiallySigned/Signed/InTransit/Received/Closed/Cancelled) sobre el Catálogo de Estados general (9 estados) que competía con él. Tabla `manifest_statuses` creada + columna `manifest_status_id` añadida a `manifest_loads`/`manifest_unloads` (punto 18/19 abajo); seed de los 8 valores aún pendiente de cargar.
   - **Nomenclatura FK inconsistente**: `manifest_load_items.approved_treatment_id` apunta a `approved_waste_treatments`, pero la tabla real es `waste_treatment_approvals`. **Corregido 2026-07-10** en el DDL (punto 18/19 abajo), junto con `persons`→`people` en `manifest_loads.generator_signer_person_id`/`driver_signer_person_id` y `manifest_unloads.receiver_person_id`/`driver_signer_person_id` (mismo tipo de desincronización DDL↔diccionario).
   - **Sin soporte de rutas/mapas** (CU-060, post-MVP): solo `branches.latitude/longitude`. No hay tablas de rutas, paradas/waypoints, tramos ni polilíneas; `transport_schedules` tiene `planned_distance_km`/`planned_duration_minutes` pero no secuencia de paradas. Depende de integración de mapas diferida.
   - **Catálogo de zonas/rutas inexistente** (CU-059.3): los grupos por zona son constructo de sesión hasta confirmarse como `transport_schedules`.
   - **Horario operativo de sucursal**: `branches` no tiene campo de ventana horaria permitida (CU-059.5).

12. **Hallazgos al redactar specs de Transporte (CU-035/036)** (2026-07-03) — el módulo de transporte casi no tiene respaldo de *ejecución* en el DDL:
   - **No existe entidad de ejecución de transporte** (headline): `transport_schedules` es **solo planificación** (`planned_departure_at`, `planned_arrival_at`, `planned_distance_km`), sin campos de salida/llegada reales ni tracking. Candidata: tabla `transport_executions`. Afecta todo CU-035 y el detalle de CU-036/CU-037.
   - Sin campos de **ubicación/GPS de ejecución** (depende de `locations` inexistente y de mapas diferidos), sin **kilometraje/odómetro** (`start_odometer_km` / `vehicles.current_odometer_km`).
   - **No existe tabla de novedades de transporte** (`transport_incidents`/`transport_events`) ni catálogo `transport_incident_types`; CU-036 se apoya provisionalmente en `workflow_logs`.
   - Estados de excepción por novedad (detenido/desvío/cancelado) no catalogados en `transport_statuses`.

13. **Hallazgo al redactar specs de Workflow (CU-020/021)** (2026-07-03) — el esquema respalda la *ejecución* de transiciones (vía `workflow_logs` + catálogos `*_statuses`), pero **falta toda la capa de *definición* de workflow** (CU-021 Configurar Workflow): no existen `workflows`, `workflow_transitions`, `workflow_transition_roles`, `workflow_transition_rules`, `workflow_automatic_actions`, `workflow_versions`, `workflow_entity_bindings`, `workflow_service_bindings`. Hoy los estados/transiciones están "hardcodeados" vía los catálogos `*_statuses` y sus flags (`is_initial`/`is_final`/`sort_order`), sin un motor de workflow parametrizable como exige RN-170 ("reglas de workflow parametrizables por administradores"). `arquitecto-datos` debe decidir si se construye el motor de workflow configurable o se mantiene el enfoque de catálogos de estado fijos. También falta la tabla puente `organization_status_settings` para la activación de estados del sistema por organización (RN-190).

14. **Módulo Residuos y Corrientes — resuelve RN-041/RN-063** (2026-07-05, decisiones D-R01..D-R02 + auditoría `arquitecto-datos` + validación del usuario — `docs\_migracion\residuos-corrientes\`). Cambios validados, pendientes solo de aplicarse primero en `diccionario.csv`/`relaciones.csv` (fuente de verdad) antes de regenerar el DDL de abajo:
    - **`waste_streams`** (existente): agregar `tipo ENUM('Y','A') NOT NULL` (discriminador confirmado empíricamente contra el catálogo fuente — mutuamente excluyente por código). Evaluar consolidar `code`/`basel_code`/`respel_code` en un único `code` (D-R01 confirma una sola fuente `CODIGO_CORRIENTE`). **Mover** `un_code`/`un_name`/`hazard_class`/`packing_group` a la nueva tabla `un_codes` (hoy asumen 1:1 corriente↔UN, lo cual D-R01 refuta empíricamente — son catálogos independientes).
    - **`un_codes`** (**nueva**): `id, uuid, code, description, hazard_class, packing_group, is_system, is_active, metadata, auditoría estándar`.
    - **`waste_categories`** (**nueva**, 4º eje de clasificación, independiente de Y/A/UN, RN-190): `id, uuid, code, name, description, is_system, is_active, auditoría` — sin `tenant_organization_id` (catálogo global, solo `ADMINISTRADOR` agrega valores). Seed real verificado (8 valores): `INDUSTRIAL`, `HOSPITALARIO_Y_SIMILARES`, `APROVECHABLE`, `ORGANICO`, `POSCONSUMO`, `RCD`, `ESPECIAL`, `ORDINARIO`.
    - **`organization_waste_categories`** (**nueva**, pivote de activación — patrón confirmado por el usuario, **distinto** al de `positions`): `id, organization_id FK, waste_category_id FK, is_active, activated_by, activated_at, auditoría`. Permite que varias organizaciones activen/compartan el mismo valor global simultáneamente (a diferencia de `positions.organization_id` nullable simple).
    - **`wastes.waste_category_id`** (**nueva columna**, FK a `waste_categories`, cardinalidad N:1 — pendiente de que `arquitecto-datos` confirme formalmente en el paso 3, evidencia hoy apunta a mutuamente excluyente).
    - **`waste_stream_assignments`** (existente): se **reinterpreta** (no se renombra) como el pivote residuo↔corriente-Y/A ya correcto estructuralmente — corregir solo su descripción ("solo RESPEL" → "corrientes Y/A, todas RESPEL por definición del catálogo").
    - **`waste_un_codes`** (**nueva**, pivote residuo↔UN): espejo estructural de `waste_stream_assignments` — `id, waste_id FK, un_code_id FK, is_primary, classified_source/by/at, valid_from/until, auditoría`.
    - **`wastes.waste_stream_id`** (FK singular existente): **descartada** como mecanismo principal de pertenencia; pendiente decidir si se elimina o se conserva como cache/atajo denormalizado de la "corriente principal Y/A" (paralelo a `people.organization_id`/D-P02 del piloto) — `arquitecto-datos` debe cerrarlo en el paso 3.
    - Regla **"todo residuo debe tener al menos una corriente Y/A o un código UN"**: no expresable como constraint de columna — documentar como regla de aplicación (`EXISTS` en `waste_stream_assignments` OR `EXISTS` en `waste_un_codes`), no de esquema.
    - **`branch_treatment_allowed_waste_streams`** (**nueva**, resuelve RN-063/D-R02): `id, branch_treatment_id FK, waste_stream_id FK, auditoría` — corrientes Y/A permitidas para ese tratamiento en esa sede/gestor, según su licencia ambiental.
    - **`branch_treatment_allowed_un_codes`** (**nueva**, mismo patrón): `id, branch_treatment_id FK, un_code_id FK, auditoría`.
    - **Confirmado por el usuario**: las corrientes permitidas de un tratamiento cubren **solo los 3 ejes de corriente (Y/A/UN)**, NO el eje "Categoría de Residuo" — no hace falta `branch_treatment_allowed_waste_categories`.
    - **`waste_treatment_approvals.waste_id`**: la FK tiene hoy `ON DELETE CASCADE`, en conflicto con RN-048/RN-049 (confirmado por `arquitecto-datos`) — **corregir a `ON DELETE RESTRICT`** (confirmado por el usuario; consistente con la otra FK de la misma tabla, `branch_treatment_id`, que ya es `RESTRICT`).
    - **Características de Peligrosidad — RESUELTO 2026-07-05, revisión de D-R04 (issue L-34)**: la lectura inicial (subsistema completo `hazard_features`/`hazard_features_requests`/`hazard_versions` con workflow de aprobación, `risk_score`, evidencias SDS) fue **corregida por el usuario** — las specs `CU-010.7`/`CU-011.7` sobre-diseñaron un caso de uso simple. Modelo real, ya aplicado:
      - **Corriente (Y/A): sin select manual** — su peligrosidad es implícita por pertenecer a la lista regulatoria. Las columnas booleanas de `waste_streams` (`is_flammable`/`is_corrosive`/`is_reactive`/`is_toxic`/`is_biological`) quedan como indicadores de referencia poblados en la carga del catálogo, no editables vía CU. `CU-010.7` fue **retirado**.
      - **Residuo: multi-select real** sobre un catálogo nuevo — `hazard_characteristics` (`id, uuid, code, name, risk_level INTEGER, description, is_system, is_active`, solo `ADMINISTRADOR` gestiona el catálogo) + pivote N:M `waste_hazard_characteristics` (`id, waste_id FK, hazard_characteristic_id FK, auditoría estándar`). Al mostrar las características de un residuo, se ordenan por `risk_level` descendente. **Seed real confirmado 2026-07-05** (`Catalogos\Tipo de Residuos.xlsx`, nombre de archivo mal escrito — es el catálogo real de Características de Peligrosidad), con `risk_level` confirmado por el usuario (mayor = más peligroso):

| code | risk_level |
|---|---|
| RADIOACTIVO | 9 |
| EXPLOSIVO | 9 |
| TOXICO | 7 |
| INFECCIOSO | 7 |
| CORROSIVO | 5 |
| REACTIVO | 5 |
| INFLAMABLE | 3 |
| ECOTOXICO | 3 |
| IRRITANTE | 1 |

      **Etiqueta cualitativa derivada (issue L-32, confirmado 2026-07-05)**: la UI (frame Figma "Características de Peligrosidad") muestra el riesgo como texto (Crítico/Alto/Medio/Bajo), no como número — se mantiene `risk_level` como INTEGER en BD (para ordenar con precisión) y la UI **deriva** la etiqueta por rango, sin guardar texto: `9=Crítico`, `7=Alto`, `5=Medio`, `3=Bajo`, `1=Mínimo`.
      **Dos campos nuevos confirmados en `wastes`** (issue L-32, revisando el mismo frame): `requires_special_ppe BOOLEAN NOT NULL DEFAULT false` (EPP especial — nuevo, sigue el mismo patrón manual-por-residuo que `requires_special_transport`/`requires_sds`/`requires_characterization`, ya existentes). La columna "Categoría" vista en ese mismo frame **no es un atributo nuevo de `hazard_characteristics`** — es una referencia a "Categoría de Residuo" (D-R05, catálogo global + activación por organización, ya modelado); su lista de valores semilla sigue evolucionando (el usuario mencionó `RAEE` como ejemplo adicional no incluido en los 8 valores del Excel).
      - **`wastes.waste_danger`** (varchar de un solo valor) — **DECISIÓN 2026-07-05 (L-38, confirmada por el usuario): se conserva como campo derivado/cache**, no se elimina. Pasa a ser un valor calculado automáticamente (trigger o lógica de aplicación al guardar `waste_hazard_characteristics`) que refleja la característica de **mayor `risk_level`** entre las seleccionadas para ese residuo — útil para listados rápidos sin hacer join contra la pivote. Ya no es editable directamente por el usuario. Esto resuelve el punto (c) de abajo (ya no aplica la pregunta NULL/`NO_APLICA` como decisión de negocio — sigue el mismo patrón: sin filas en la pivote ⇒ `waste_danger` queda NULL).
      - **RN-053 (método de disposición permitido) — RESUELTO 2026-07-05 (L-40, confirmado por el usuario)**: no hace falta un catálogo nuevo — el "método de disposición" ya existe como `treatments.treatment_type` (varchar, default `DISPOSAL`). El método permitido de un residuo se deriva de los `treatment_type` de los tratamientos con los que sea compatible (vía `branch_treatment_allowed_waste_streams`/`_un_codes`, D-R02/D-R06) — no se modela como campo propio en `wastes`.
      - **CU-012.10 (Relacionar Descripción Detallada) — RESUELTO 2026-07-05 (L-36)**: mismo patrón de sobre-diseño que CU-011.7 (CMS completo con versionado/multi-idioma/aprobación/búsqueda). El requerimiento real es un campo de texto libre simple — se agrega `detailed_notes TEXT NULL` a `waste_treatment_approvals`, no se construyen `descriptions`/`description_versions`/`description_templates`.
      - Las tablas `hazard_features`, `hazard_features_requests`, `hazard_versions`, `approval_requests` (del subsistema descartado) **NO se construyen**.
    - (a) ~~colisión de namespace `RN-WST-XXX`~~ **RESUELTO 2026-07-05** (issue L-17): el workflow se renombró a `RN-WFL-WST-XXX`, `RN-WST-XXX` queda exclusivo del catálogo de corrientes.
    - (b) ~~normalizar como catálogo FK los campos hoy `varchar`~~ **RESUELTO 2026-07-05 (L-41, confirmado por el usuario: SÍ normalizar)**. 6 catálogos nuevos, patrón idéntico a `business_roles`/`positions` (`id, uuid, code, name, is_system, is_active` + auditoría estándar), seed tomado literalmente del dominio ya documentado en el diccionario (no inventado):
      - `physical_states` (SOLID/LIQUID/GAS/SLUDGE) — **compartido** entre `waste_streams.physical_state` y `wastes.physical_state` (mismo dominio en ambas tablas hoy); ambas columnas pasan a `physical_state_id FK`.
      - `packing_groups` (I/II/III) — `waste_streams.packing_group` → `packing_group_id FK`.
      - `waste_types` (OPERATIONAL/COMMON/TEMPLATE/PREAPPROVED/TEMPORARY) — `wastes.waste_type` → `waste_type_id FK`.
      - `measurement_units` (KG/TON/LT/M3) — `wastes.measurement_unit` → `measurement_unit_id FK`.
      - `generation_frequencies` (DAILY/WEEKLY/MONTHLY/OCCASIONAL) — `wastes.generation_frequency` → `generation_frequency_id FK`.
      - `waste_operational_statuses` (ACTIVE/PENDING/SUSPENDED/ARCHIVED) — `wastes.operational_status` → `operational_status_id FK`. Nombre con prefijo `waste_` para no confundirse con el `status` de 13 estados del workflow (`# Workflow de Residuos.md`) — **ver hallazgo nuevo abajo, son conceptos distintos y ninguno de los dos es el otro**.
    - (c) ~~default incorrecto `wastes.waste_danger = 'OPERATIONAL'`~~ **RESUELTO** (corregido a `-` en L-07; el campo se conserva como derivado/cache, ver arriba L-38).
    - (d) gaps de RN — **todos resueltos 2026-07-05**: RN-043/RN-047 (`description`/`code` nullable) **confirmado intencional** (L-39, workflow "Draft" — la obligatoriedad se valida a nivel de aplicación en la transición Draft→PendingValidation, no como constraint de columna); RN-048 (historial de `wastes`) **cubierto por `audit_logs` existente** (L-42, no hace falta tabla nueva); RN-055 (última verificación ambiental) **se agrega** `wastes.last_classification_review_at TIMESTAMPTZ NULL` (L-42); RN-053 (métodos de disposición) **resuelto vía `treatments.treatment_type`** (L-40, ver arriba). Campos sin RN asociada (`mixing_compatibility`, temperaturas de tratamiento, capacidades de sede, precios de aprobación) **confirmados intencionales, sin RN dedicada** (L-43).
    - ~~**Hallazgo: `wastes` no tiene columna `status` para el ciclo de 13 estados**~~ **CORREGIDO 2026-07-05 (issue L-22/L-23, D-R07, 2 aclaraciones del usuario)**: el ciclo real de `wastes` no es de 13 estados ni de 8 — `# Workflow de Residuos.md` estaba sobre-diseñado (mismo patrón que CU-011.7/CU-012.10), conflacionando **declaración** (del residuo) + **evaluación de tratamiento** (por Gestor) + etapas de otras entidades en un solo ciclo. Modelo real:
      - **`wastes.status`**: solo la **declaración**, 4 valores — `Borrador(BR)/Declarado(DEC)/En Revisión(REV)/Clasificado(CLS)` (+ `Rechazado(RCH)`, reversible a `Borrador`). **Agregar `wastes.status VARCHAR(20) NOT NULL DEFAULT 'BR'`** — columna real pendiente de añadir al DDL.
      - **Evaluación de tratamiento por Gestor**: NO es un estado de `wastes` — un mismo residuo `Clasificado` puede ser evaluado por **varios Gestores en paralelo**, cada uno de forma independiente (`TECNICO_AMBIENTAL` no es un rol aparte de EcoLink, es un cargo dentro de la organización Gestor — eje 3, `positions`). Ya modelado: `waste_treatment_approvals` (`organization_id`=Gestor, `waste_id`, `branch_treatment_id`, `technical_status`/`commercial_status` — columnas **ya existentes**, sin cambios necesarios). Esto también resuelve L-23 (tab "Aprobación" en Vista Gestor): no hay hueco de permisos, `TECNICO_AMBIENTAL`/`COMERCIAL` ya tienen Approve en Matriz CRUD §4.5 sobre esta tabla.
      - Las etapas posteriores a una evaluación aprobada (recolección/transporte/tratamiento/certificación) **tampoco son estados de `wastes`** — pertenecen a otras entidades (Manifiesto, ejecución de Tratamiento, Certificado).
      - Detalle completo en `# Workflow de Residuos.md` (reescrito dos veces el mismo día) y `04-decisiones-arquitecto-datos.md` (D-R07).

15. **Módulo Solicitudes de Servicio — resuelve D-S00 a D-S32** (2026-07-06, auditoría `arquitecto-datos`/`arquitecto-soluciones` + validación del usuario — `docs\_migracion\solicitudes\`). Cambios validados, pendientes de aplicarse primero en `diccionario.csv`/`relaciones.csv` antes de regenerar el DDL de abajo:
    - **`service_statuses`** (existente): `ALTER TABLE ADD COLUMN organization_id BIGINT NULL` (NULL=catálogo global, valor=estado propio de un Gestor, D-S02) — `is_system_status` ya cumplía el rol de "semilla global" (D-S05), no requirió columna nueva. Seed confirmado (9 valores): `DRAFT/SUBMITTED/UNDER_REVIEW/APPROVED/REJECTED/SCHEDULED/IN_EXECUTION/COMPLETED/CANCELLED` (`QUOTED` del enum viejo queda descartado del catálogo base).
    - **`organization_service_statuses`** (**nueva**, pivote de activación, patrón D-R05): `id, uuid, organization_id FK, service_status_id FK, is_active, activated_by, activated_at, auditoría`. `UNIQUE(organization_id, service_status_id)`.
    - **`waste_service_requests.workflow_status`** (existente, VARCHAR) → **se reemplaza** por `service_status_id BIGINT NOT NULL FK service_statuses.id ON DELETE RESTRICT` (nombre corregido: no `waste_service_status_id` como anticipaba `relaciones.csv`, evita prefijo redundante).
    - **`service_task_types`** (**nueva**, patrón D-R05): `id, uuid, organization_id NULL, code, name, description, sort_order, is_system, is_active, metadata, auditoría`. `UNIQUE` parcial `(organization_id, code)`. Seed exacto pendiente (issue S-38, no confirmado — no inventar).
    - **`organization_service_task_types`** (**nueva**, pivote de activación): `id, uuid, organization_id FK, service_task_type_id FK, is_active, activated_by, activated_at, auditoría`. `UNIQUE(organization_id, service_task_type_id)`.
    - **`waste_service_request_tasks`** (**nueva**, checklist real por solicitud, D-S03.3): `id, uuid, tenant_organization_id, service_request_id FK ON DELETE CASCADE, service_task_type_id FK ON DELETE RESTRICT, is_completed BOOLEAN DEFAULT false, completed_by, completed_at, observations, auditoría`. `UNIQUE(service_request_id, service_task_type_id)`. Reemplaza `tasks`/`work_orders` de las specs (D-S03.3).
    - **`service_item_statuses`** (**nueva**, catálogo separado, D-S10): representa la **viabilidad de recolección** de un ítem, distinto de `waste_treatment_approvals` (aprobación de tratamiento) y de `service_statuses` (cabecera). **Confirmado por el usuario (issue S-37, 2026-07-06): sigue el mismo patrón D-R05/D-S02** — catálogo global (`organization_id NULL`, `is_system`) + pivote `organization_service_item_statuses` para personalización por Gestor: `id, uuid, organization_id NULL, code, name, is_system, is_active, auditoría`.
    - **`organization_service_item_statuses`** (**nueva**, pivote de activación, mismo patrón): `id, uuid, organization_id FK, service_item_status_id FK, is_active, activated_by, activated_at, auditoría`.
    - **`waste_service_request_items.item_status`** (existente, VARCHAR) → pasa a `service_item_status_id FK service_item_statuses.id`.
    - **Seed de `service_task_types` (S-38) y de `service_item_statuses` queda pendiente de definición por el equipo de negocio** — no se inventa, confirmado explícitamente por el usuario.
    - **`cancellation_reasons`** (**nueva**, patrón D-R05, D-S09): `id, uuid, organization_id NULL, code, name, is_other BOOLEAN, is_system, is_active, auditoría`.
    - **`organization_cancellation_reasons`** (**nueva**, pivote de activación): `id, uuid, organization_id FK, cancellation_reason_id FK, is_active, activated_by, activated_at, auditoría`.
    - **`waste_service_requests`**: agregar `cancellation_reason_id FK cancellation_reasons.id NULL`, `cancellation_details TEXT NULL` (obligatorio en UI cuando `is_other=true`), `cancelled_by BIGINT NULL`, `cancelled_at TIMESTAMPTZ NULL` (RN-SOL-009 con columnas dedicadas, no `metadata` JSONB).
    - **`cartera_statuses`** (**nueva**, catálogo, D-S04): `id, uuid, code, name, description, blocks_new_requests BOOLEAN, is_system, is_active, auditoría`. **Seed real confirmado en vivo (Figma "Estados de Cartera")**: `AL_DIA` (Bajo riesgo, no bloquea), `POR_VENCER` (Medio, no bloquea), `VENCIDA` (Alto, `blocks_new_requests=false`, sí bloquea certificados), `EN_COBRO` (Crítico, `blocks_new_requests=true`), `JURIDICO` (Crítico, `blocks_new_requests=true`), `CASTIGADA` (Crítico, `blocks_new_requests=true`, estado final).
    - **`organization_cartera_statuses`** (**nueva**, D-S04/D-S12): `id, uuid, generator_organization_id FK organizations ON DELETE RESTRICT, gestor_organization_id FK organizations ON DELETE RESTRICT, cartera_status_id FK, reason, blocked_at, blocked_by, unblocked_at, unblocked_by, observations, is_active, auditoría`. `UNIQUE(generator_organization_id, gestor_organization_id) WHERE is_active` — un solo registro vigente por par, historial vía `audit_logs` (D-S12).
    - **`waste_service_requests`**: agregar `requested_by BIGINT NULL` (distinto de `created_by` — D-S08), `created_by BIGINT NULL`, `updated_by BIGINT NULL` (patrón de auditoría estándar, faltaban).
    - **`waste_service_request_items.stackable`** → renombrar a `is_stackable` (D-S11/hallazgo de nomenclatura, sigue el patrón `is_`/`requires_` del resto de la tabla).
    - **`waste_service_request_items.physical_state`** (VARCHAR) → `physical_state_id FK physical_states.id` (reutiliza el catálogo de Residuos, D-S11, L-41).
    - **`waste_service_requests.volume_unit`** / **`waste_service_request_items.weight_unit`** (VARCHAR) → `measurement_unit_id FK measurement_units.id` (reutiliza el catálogo de Residuos); **se amplía el seed de `measurement_units` agregando `LB`** (no estaba en KG/TON/LT/M3).
    - **`waste_service_requests.last_verified_at`**: no aplica aquí — ver en su lugar `wastes.last_classification_review_at` (Residuos, L-42), sin relación.
    - **Corrección de nomenclatura de FK**: `waste_service_request_items.service_request_id` y `transport_schedules.waste_service_request_id` referencian la misma tabla con nombres distintos — **se unifica a `waste_service_request_id`** en ambas (bajo riesgo, impacto amplio en código ya escrito — aplicar con cuidado).
    - **`relaciones.csv` fantasma `requesting_organization_id`**: corregir a `organization_id` (la columna real de `waste_service_requests`) — era un typo, no un campo real.
    - **Campos Personalizados** (`custom_field_definitions`, `custom_field_placements`, `custom_field_values`) — **decisión TRANSVERSAL** (D-S19, no exclusiva de Solicitudes), ver `docs\_migracion\_transversal\campos-personalizados.md` para el diseño completo. Reemplaza el `custom_field_definitions`/`custom_field_definition_versions`/`custom_field_values` de las specs originales (que tenían versionado dedicado, descartado — usar `audit_logs`).
    - Las tablas `requests`, `request_items`, `request_versions`, `validation_rules`, `request_validation_versions`, `route_replan_jobs`, `priority_rules`, `drafts`, `draft_versions`, `draft_shares`, `request_templates`, `request_change_justifications` (de las specs originales) **NO se construyen** — quedan descartadas o resueltas por tablas ya existentes (D-S03/D-S17/D-S18/D-S20/D-S21/D-S22).
    - **Hallazgo transversal, no exclusivo de Solicitudes (D-S15)**: 3 formas distintas de "catálogo de estado" coexisten en el esquema — (a) simple `code/name/is_system` (`treatments`/`waste_streams`); (b) "workflow" `system_code/display_name/sequence_order/is_initial_status/is_terminal_status/is_system_status/blocks_editing` (`service_statuses`/`certificate_statuses`); (c) variante `code/name/sort_order/is_initial/is_final` sin `is_system` (`transport_statuses`). Se canoniza **hacia adelante** la variante (b) para catálogos nuevos; las 2 variantes existentes no se tocan ahora — reconciliación transversal futura.

16. **Módulo Usuarios y Seguridad — resuelve D-U01 a D-U08** (2026-07-07, auditoría `arquitecto-datos` + validación del usuario — `docs\_migracion\usuarios-seguridad\`). Cambios validados, pendientes de aplicarse primero en `diccionario.csv`/`relaciones.csv` antes de regenerar el DDL de abajo:
    - **`user_roles`** (**nueva**, CRÍTICO, D-U01): no existía ninguna estructura para asignar roles a usuarios pese a que RN-027 y CU-006.7 la dan por sentada. Pivote N:M, mismo patrón que `role_permissions`: `id, uuid, tenant_organization_id, user_id FK users.id, role_id FK roles.id, assigned_by FK users.id, assigned_at, expires_at, is_active, auditoría`. `UNIQUE(user_id, role_id)`. Un usuario puede tener múltiples roles.
    - **`user_statuses`** (**nueva**, catálogo, D-U02): `users.status_usuario_id` referenciaba una tabla inexistente. Patrón catálogo simple: `id, uuid, code, name, is_system, is_active, auditoría`. Seed en `UPPER_SNAKE_CASE`: `PENDING_ACTIVATION/ACTIVE/LOCKED/SUSPENDED/INACTIVE`. `users.status_usuario_id` → renombrado a `users.user_status_id FK user_statuses.id`.
    - **`audit_logs`/`security_logs`** (D-U03): reglas ON DELETE ausentes por completo en `relaciones.csv` — se fijan `user_id → SET NULL`, `person_id → SET NULL` (preserva evidencia forense aunque se borre el actor), `tenant_organization_id → RESTRICT`. FK `person_id` corregido de `persons` (inexistente) a `people` (H2, aplicado ya en `diccionario.csv`).
    - **`ADMIN_GENERAL`/`USER_ADMIN`** (D-U04): códigos ad-hoc usados en 26 de los 44 specs del módulo, no existen en el catálogo canónico de 11 roles — ambos mapean a `ADMINISTRADOR`. Pendiente de reescribir las 26 specs (ejecución por lotes).
    - **`positions.created_by`/`updated_by`** (D-U05): `updated_by` tenía `ON DELETE CASCADE` (riesgo real: borrar el usuario editor borraba el cargo). Corregido a `created_by=RESTRICT`/`updated_by=SET NULL`, alineado al patrón dominante del resto de catálogos del proyecto. Ya aplicado en `relaciones.csv` (incluye corrección de descripciones desalineadas, H6).
    - **`password_histories`** (**nueva**, D-U06): RN-039 ("no reutilizar contraseñas recientes") sin tabla de respaldo. `id, user_id FK users.id, password_hash, created_at`. Se asume N=5 (últimas 5 contraseñas), estándar de industria, a validar formalmente con negocio si difiere.
    - **RN ad-hoc de CU-007/008/009** (D-U07): 8 prefijos propios (`RN-RBAC-XXX`, `RN-AUTH-XXX`, `RN-SEC-XXX`, `RN-PRIV-XXX`, `RN-OPS-XXX`, `RN-AUD-XXX`, `RN-PW-XXX`, `RN-HIS-REC-XXX`) nunca reconciliados con el catálogo maestro. A diferencia de `RN-WFL-WST-XXX` en Residuos (preservado, L-17), aquí el usuario eligió **renumerar** al catálogo maestro, continuando desde **RN-192** (el maestro llega hasta RN-191). Pendiente: inventariar conteo exacto por prefijo, asignar rango, reescribir 26 specs — tarea de ejecución por lotes, no resuelta todavía.
    - **`role_permissions`**: agregado `UNIQUE(role_id, permission_id)` (H8, no existía — permitía duplicar la asignación).
    - **`users.mfa_enabled`** → renombrado a **`users.is_mfa_enabled`** (H10, convención `is_`/`has_` del resto del esquema). Ya aplicado en `diccionario.csv`.
    - **Login/logout/MFA/recuperar contraseña sin permisos RBAC** (D-U08): documentado explícitamente en `Catálogo de Permisos.md` como diseño intencional (acciones de pre-autenticación), no como hueco — `users.reset-password` sigue siendo la acción administrativa distinta (CU-006.9).
    - Tablas de framework (`personal_access_tokens`, `sessions`, `password_reset_tokens`, Sanctum/Laravel) siguen sin fila propia en `diccionario.csv` por ser tablas de infraestructura, no de negocio — confirmado como diseño esperado (punto 3, más arriba).

17. **Módulo Workflow — resuelve D-WF-01 a D-WF-06** (2026-07-07, auditoría `arquitecto-datos` + validación del usuario — `docs\_migracion\workflow\`). Decisión central: **motor de workflow configurable** (no se formalizó el enfoque de catálogos fijos — RN-170 exige transiciones/roles parametrizables, imposible sin tablas de definición propias). Cambios validados, pendientes de aplicarse primero en `diccionario.csv`/`relaciones.csv` antes de regenerar el DDL de abajo:
    - **`workflows`** (**nueva**, D-WF-01, `entity_type` ampliado por D-WF-08): `id, uuid, tenant_organization_id NULL, code, name, description, entity_type (WASTE/SERVICE/TRANSPORT/MANIFEST/CERTIFICATE/CONCILIATION/TREATMENT/ORGANIZATION/BRANCH/CONTACT/SCHEDULING/DOCUMENT — 12 valores, ampliado desde los 7 iniciales de `workflow_logs.process_type` para cubrir los 8 workflows de entidad reales + Organización/Sucursal/Contacto), is_system, is_active, current_version_id FK workflow_versions.id NULL, auditoría`.
    - **`workflow_versions`** (**nueva**, D-WF-01): `id, uuid, workflow_id FK ON DELETE CASCADE, version_number, status (DRAFT/PUBLISHED/ARCHIVED), published_at, published_by, created_by, created_at`. Nunca se borra una versión — preserva el historial de qué reglas regían cada transición pasada.
    - **`workflow_transitions`** (**nueva**, D-WF-01): `id, uuid, workflow_version_id FK ON DELETE CASCADE, from_status_code, to_status_code (códigos, no IDs — evita FK polimórfica hacia la fila correcta según organización), is_automatic, requires_approval, created_at`.
    - **`workflow_transition_roles`** (**nueva**, D-WF-01): `id, workflow_transition_id FK ON DELETE CASCADE, role_id FK roles.id NULL, business_role_id FK business_roles.id NULL` — exactamente uno de los dos no-nulo. **Extendida (D-CER-04, módulo Certificados)**: `requires_platform_tenant BOOLEAN NOT NULL DEFAULT false` — cuando `true`, el `role_id` solo autoriza si el **usuario** (no el registro que transiciona) pertenece al tenant marcado `organizations.is_platform_tenant=true` (EcoLink), habilitando un override de plataforma independiente del tenant dueño del registro. Usado en la transición `RevokeCertificate` (`entity_type=CERTIFICATE`): 2 filas con `role_id=ADMINISTRADOR`, una con `requires_platform_tenant=false` (autoriza al `ADMINISTRADOR` del propio tenant emisor del certificado) y otra con `requires_platform_tenant=true` (autoriza al `ADMINISTRADOR` de EcoLink sobre cualquier certificado). Sin este flag, el motor solo podía expresar autorización scoped al tenant del registro, nunca un override cruzado de tenant.
    - **`workflow_transition_rules`** (**nueva**, D-WF-01): `id, workflow_transition_id FK ON DELETE CASCADE, rule_type (FIELD_REQUIRED/ALL_ITEMS_APPROVED/CUSTOM_VALIDATOR/...), rule_definition JSONB, error_message`.
    - **`workflow_automatic_actions`** (**nueva**, D-WF-01): `id, workflow_transition_id FK ON DELETE CASCADE, action_type (NOTIFY/CREATE_ENTITY/CALL_WEBHOOK/...), action_config JSONB, execution_order, is_active`. **Generalizada (D-NOT-01, módulo Notificaciones)**: `workflow_transition_id` pasa a `NULL`-able; se agrega `notification_event_id BIGINT NULL FK notification_events.id ON DELETE CASCADE`; `CHECK` exactamente uno de los dos no-nulo. Único mecanismo "cuando ocurre X, haz Y" del sistema — cubre tanto transiciones de workflow como eventos de notificación no ligados a una transición (ej. `DOCUMENT_EXPIRING`, origen temporal/cron). `notification_event_automations` como tabla separada queda descartada por esta generalización. **Ampliada de nuevo (D-NOT-03)**: `notification_channel_override VARCHAR(20) NULL`, `notification_recipients_override JSONB NULL` — cuando `action_type='NOTIFY'` y no son NULL, sustituyen el canal/destinatarios de la plantilla (`notification_template_channels`/`notification_template_recipients`) para esa transición específica (resuelve la redundancia CU-055.5/.6 vs. CU-021.9: la plantilla es el default, la transición puede sobre-escribir).
    - **`workflow_entity_bindings`** (**nueva**, D-WF-01): `id, workflow_id FK ON DELETE CASCADE, entity_table, status_catalog_table, status_column`. `UNIQUE(entity_table)` — una entidad, un workflow activo. Hace explícita la relación "esta entidad usa este catálogo", hoy implícita en código.
    - **`workflow_service_bindings`** (**nueva**, D-WF-01): `id, workflow_id FK ON DELETE CASCADE, scope_type, scope_id` — para cuando un mismo `entity_type` necesita workflows distintos según sub-contexto.
    - **`organization_status_settings`** (**nueva**, D-WF-01, resuelve también RN-190 de forma unificada): `id, organization_id FK ON DELETE CASCADE, status_catalog_table, status_id, is_active`. `UNIQUE(organization_id, status_catalog_table, status_id)` — reemplaza las 4 implementaciones distintas e inconsistentes de activación por organización ya encontradas en `service_statuses`/`certificate_statuses`/`transport_statuses`/`organization_statuses`.
    - **RN-WF-005/007 (retroceso desde estado final / reapertura formal)** (D-WF-05): no requieren tabla nueva — se modelan como `workflow_transition` adicional desde un estado final hacia uno no-final, con `requires_approval=true` y `workflow_transition_roles` restringido (ej. solo `ADMINISTRADOR`).
    - **`respel_statuses`** (D-WF-02, **revierte parcialmente D-R07**): se recupera el catálogo huérfano. `waste_treatment_approvals.technical_status`/`commercial_status` (hoy `VARCHAR` hardcodeado) pasan a `technical_status_id`/`commercial_status_id FK respel_statuses.id` (mismo catálogo genérico, dos usos). Códigos prefijados por dominio para evitar colisión de `code` único: técnico `TECH_PENDING/TECH_UNDER_REVIEW/TECH_APPROVED/TECH_REJECTED/TECH_RESTRICTED`; comercial `COM_DRAFT/COM_QUOTED/COM_NEGOTIATING/COM_APPROVED/COM_REJECTED/COM_CANCELLED`.
    - **`conciliation_statuses`** (**nueva**, D-WF-06): `conciliations.status` (`VARCHAR`) se reemplaza por `conciliation_status_id FK conciliation_statuses.id` — consistente con la pantalla Figma "Estados de Conciliación" ya diseñada.
    - **`transport_schedules.transport_status_id`**: FK corregida de `transport_service_statuses` (inexistente) a `transport_statuses` — ya aplicado en `diccionario.csv`.
    - **`security_logs.event_type`**: agregado valor `WORKFLOW_TRANSITION_DENIED` al catálogo de valores permitidos — ya aplicado en `diccionario.csv`.
    - **`workflow_logs`**: sin cambios de estructura. Confirmado que sus dos pares polimórficos (`process_type`/`process_id` y `related_entity`/`related_entity_id`) tienen roles distintos, no son redundantes (D-WF-04) — el primero identifica la entidad principal que transiciona, el segundo una entidad secundaria opcional mencionada en el evento. Confirmado también que no necesita columnas offline propias (D-WF-03) — hereda el estado sincronizado de la entidad subyacente.
    - **Diferido intencionalmente**: granularidad/convención de los 15 permisos ad-hoc `workflow.*` vs. los 6 de `Catálogo de Permisos.md` — misma razón que en Usuarios y Seguridad (matriz de roles/permisos del negocio aún incompleta, ver `project_roles_permisos_incompletos`).
    - **C4/Matriz CRUD (D-WF-07/D-WF-09/D-WF-10/D-WF-11)**: se creó el dominio propio "Workflow Domain" en `Mapa de Modulos.md` (4 componentes: Definition/Transition Config/Execution/History Service, dominios renumerados 4→8), se reescribió el pseudocódigo del motor a las 5 fases completas, se corrigió el bug de `reopenClosedOperation()`, y se agregó la sección 13 a la Matriz CRUD — todo ya aplicado directamente. Las copias desactualizadas de `2-Levantamiento y análisis de requerimientos\` (`Mapa de Modulos.md`, `Matriz CRUD Formal...md`) se **abandonaron formalmente** (D-0) y quedaron renombradas `(DEPRECATED) ...`.
    - **`entity_type` — alcance final (D-WF-12)**: confirmado en vivo contra Figma que existen 4 pantallas adicionales ("Estados de Vehículo", "Estados de Cartera", "Estados de Usuario", "Estados del Embalaje") con el mismo patrón visual de motor de workflow — **no se amplía** `entity_type` para incluirlas. Quedan documentadas como catálogos de estado simples (patrón D-S15 opción b), no gobernadas por `workflows`/`workflow_transitions`/etc. Ampliación futura posible si el negocio lo decide explícitamente, no se infiere del parecido visual.

18. **Módulo Programación Logística — resuelve D-PRG-01 a D-PRG-08** (2026-07-07, decisión de proceso del usuario + auditoría `arquitecto-datos` — `docs\_migracion\programacion-logistica\`). Decisión central: **dos modalidades de transporte** (recolección por Gestor/Subgestor vs. autotransporte del Generador) unificadas por un mecanismo de **coordinación bilateral de cita de recepción en planta** (propuesta + confirmación/contrapropuesta), en vez de agendas aisladas como hoy.
    - **`unload_requests`** (**nueva**, D-PRG-02): `id, uuid, tenant_organization_id, request_number, receiving_branch_id FK branches, manifest_load_id FK manifest_loads NULL (NULL = anticipada o autotransporte sin cargue), transport_schedule_id FK transport_schedules NULL (bridge nuevo hacia Programación Logística), origin_branch_id NULL, carrier_organization_id NULL, vehicle_id NULL, transport_personnel_id NULL, estimated_arrival_at, priority, status, submitted_at, decided_by, decided_at, rejection_reason, transport_discrepancy_notes, auditoría`. Gobernada por el motor de Workflow (`workflows`/`workflow_transitions`, `entity_type` ampliado) para su grafo grueso Borrador→Enviada→Aprobada/Rechazada.
    - **`unload_request_items`** (**nueva**, D-PRG-02): `id, uuid, tenant_organization_id, unload_request_id FK ON DELETE CASCADE, manifest_load_item_id FK manifest_load_items NULL, waste_id FK wastes, requested_quantity, unit_of_measure, packaging_type, line_number, auditoría`.
    - **`plant_reception_schedules`** (**nueva**, D-PRG-02): `id, uuid, tenant_organization_id, unload_request_id FK (solo sobre solicitudes Aprobadas, RN-RCP-015), receiving_branch_id, dock_location_id FK branch_locations ("muelle"), scheduled_date, scheduled_start_at, scheduled_end_at, proposed_by_role (LOGISTICS_COORDINATOR/GENERATOR/RECEPTION_COORDINATOR), proposed_by_user_id, proposed_at, counter_proposed_date, counter_proposed_start_at, counter_proposed_end_at, counter_proposed_by, counter_proposed_at, confirmed_by, confirmed_at, status, reschedule_reason, rejection_reason, version_number, parent_schedule_id (historial de reprogramaciones), auditoría`. A diferencia de `unload_requests`, la franja propuesta/contrapropuesta vive en campos dedicados, no en el motor de Workflow (el motor no transporta payload de negocio) — patrón híbrido, mismo criterio que `waste_service_requests` (D-S09).
    - **`transport_schedules.vehicle_id`/`transport_personnel_id` en autotransporte** (D-PRG-03): **no quedan NULL** — el Generador registra sus propios vehículo/conductor y quedan asignados igual que en recolección. La modalidad se infiere por la organización propietaria del recurso asignado, no por un campo discriminador aparte.
    - **RN-090 sin cambio de texto** (D-PRG-04): para registrar vehículos propios, el Generador debe tener también `business_roles.can_transport_waste = true` (doble rol de negocio GENERADOR + TRANSPORTADOR). Como consecuencia, RN-097/RN-098 (vehículo/conductor asignado en toda ruta) se cumplen sin excepción textual en ninguna modalidad.
    - **`manifest_unloads.manifest_load_id` / `manifest_unload_items.manifest_load_item_id` pasan a NULL-able** (D-PRG-05, corrige integridad referencial que antes bloqueaba físicamente el caso sin cargue): ruta alterna de trazabilidad vía `unload_request_id`/`unload_request_item_id`. **Manifiesto de carga**: siempre se genera y firma en Modalidad 1 (recolección); en Modalidad 2 (autotransporte) es **opcional** — el Generador puede generarlo voluntariamente para sus propios vehículos. **Manifiesto de descarga**: siempre se genera, en ambas modalidades.
    - **Nuevo paso "Definir Destino" en CU-026** (D-PRG-06): llena y valida `transport_schedules.destination_branch_id` (existente en el DDL pero huérfano dentro de este módulo — sí se usa activamente fuera, en Manifiestos/Transporte/Documental) en el momento de disparar la solicitud de cita hacia el Coordinador de Recepción.
    - **Autoridad de namespace** (D-PRG-07): `RN-PRG-001` a `RN-PRG-308` (verificado continuo, sin huecos) es la fuente autoritativa, mismo criterio que `RN-WFL-WST-XXX` en Residuos. `RN-SCH-001..014` del workflow doc queda como referencia secundaria de alto nivel — salvo `RN-SCH-014` ("disponibilidad de plantas receptoras"), que ahora se aterriza formalmente en `plant_reception_schedules`.
    - **`transport_statuses` sin `is_system`/activación por organización**: diferido a la reconciliación transversal de catálogos ya prevista (D-S15), no se resuelve en este módulo (D-PRG-08).
    - **Correcciones técnicas aplicadas** (sin ambigüedad de negocio): FK `manifest_load_items.approved_treatment_id` corregida de `approved_waste_treatments` (inexistente) a `waste_treatment_approvals`; FK `persons`→`people` en `manifest_loads.generator_signer_person_id`/`driver_signer_person_id` y `manifest_unloads.receiver_person_id`/`driver_signer_person_id`.

19. **Módulo Recepción en Planta — paso 2 (arquitecto-datos)** (2026-07-08, `docs\_migracion\recepcion-planta\01-arquitecto-datos.md`, CU-066 a CU-072, namespace `RN-RCP-001..109`). Auditó las 6 verificaciones cruzadas heredadas de Programación Logística + 1 hallazgo nuevo.
    - **Completado el DDL de D-PRG-05** (decisión ya confirmada en Programación Logística, nunca aplicada al DDL real): `manifest_unloads.manifest_load_id` y `manifest_unload_items.manifest_load_item_id` pasan a `NULL`; se agregan `manifest_unloads.unload_request_id` y `manifest_unload_items.unload_request_item_id` (la "ruta alterna de trazabilidad" que D-PRG-05 exigía y que no existía). Ya aplicado arriba en las tablas correspondientes.
    - **Corrección técnica aplicada** (mismo patrón que `persons`→`people`): FK `manifest_unload_items.storage_location_id` corregida de `locations` (geográfica, no aplica) a `branch_locations` (ubicación interna operativa — es la que ya usa `plant_reception_schedules.dock_location_id`).
    - **Pendiente de aplicar a `Diccionario_de_datos.csv`** (AI Context, copia canónica D-P10): las 2 columnas nuevas y las 2 relajaciones a NULL de este punto todavía no están propagadas al CSV — solo están en este DDL compacto. Se difiere la edición directa del CSV por el riesgo de corrupción ya visto en P-T06/L-28; debe hacerse en la próxima re-exportación desde Excel, no a mano.
    - **Bloqueante real, no resuelto**: `CU-069.3` (Verificar Compatibilidad de Residuos) sigue citando el motor genérico `waste_compatibility_rules`, descartado por D-R02 (Residuos/Corrientes) en favor de `branch_treatments` + corrientes/UN permitidos por gestor. El reemplazo natural depende de que `waste_un_codes` y `branch_treatment_allowed_waste_streams`/`_un_codes` (diseñadas en D-R01/D-R02) se materialicen en el DDL real — hoy tampoco están aplicadas. Sin resolver — pendiente de confirmación del usuario.
    - **Decisiones confirmadas por el usuario (2026-07-08)**:
      - **D-RCP-01**: se adopta ya el patrón D-R02 para `CU-069.3` (Verificar Compatibilidad de Residuos) — deja de referenciar el motor genérico `waste_compatibility_rules` (descartado) y pasa a consultar `branch_treatments` + corrientes/UN permitidos del gestor receptor. Dependencia explícita, no bloqueante para el resto del módulo: `waste_un_codes`/`branch_treatment_allowed_waste_streams`/`_un_codes` (diseñadas en D-R01/D-R02) deben materializarse en el DDL real antes de poder construir código para este subcaso.
      - **D-RCP-02**: `unload_requests` **sí** lleva columna explícita de modalidad — `service_modality VARCHAR(20) NOT NULL DEFAULT 'COLLECTION'` (valores `COLLECTION`/`SELF_TRANSPORT`). El usuario prefirió el discriminador explícito sobre la inferencia indirecta usada en `transport_schedules` (D-PRG-03) — **precedente distinto a propósito, no error de consistencia**: evita depender de un JOIN implícito en cada validación de modalidad (CU-066.5 FA-02, CU-068, CU-072).
      - **D-RCP-03**: no se crea catálogo `difference_reasons` — `manifest_unload_items.rejection_reason`/`conciliation_items.discrepancy_reason` quedan como texto libre, mismo criterio que otros catálogos "pendientes de definición" mientras el negocio no lo pida explícitamente.
      - **D-RCP-04**: `RN-RCP-016`/`RN-RCP-017` quedan documentadas como hueco de numeración sin explicación (nunca existieron o se perdieron) — no bloqueante, no se inventa contenido.
      - **Tablas nuevas candidatas del módulo** (necesarias, no redundantes con `manifest_unload_items`; heredan patrón offline RN-181-190 — `sync_status`/`device_captured_at`/`offline_integrity_hash`/`synced_at`): `vehicle_checkins`, `vehicle_checkin_incidents`, `reception_inspections`, `reception_inspection_items`, `weight_tickets`, `difference_tickets` (con `discrepancy_reason` texto libre, sin catálogo por D-RCP-03). Diseño completo de columnas queda para el paso 3/ejecución de lotes — mismo tratamiento en prosa que `unload_requests`/`plant_reception_schedules` (D-PRG-02), sin bloque `CREATE TABLE` propio todavía.
    - **Recepción en Planta sigue sin componente C4 propio** (confirma D-PRG-10) — corresponde al paso 3 (`arquitecto-soluciones`), no se resuelve aquí.
    - **Paso 3 (arquitecto-soluciones) y ejecución de lotes (2026-07-08/09)**: dominio C4 nuevo "Plant Reception Service Domain" (#10) aplicado en `Mapa de Modulos.md`; nueva §15 en `Matriz CRUD Formal...md`; roles reconciliados en `roles-canonicos.md` (N-2 resuelta, D-RCP-08). **DDL completo aplicado** (RCP-17) para las 6 tablas candidatas: `vehicle_checkins`, `vehicle_checkin_incidents`, `reception_inspections`, `reception_inspection_items`, `weight_tickets` (con `stream_breakdown` JSONB simplificado, normalización relacional diferida), `difference_tickets` (con `discrepancy_reason` texto libre, D-RCP-03) — todas con patrón offline RN-181-190. **D-RCP-14 aplicado** (RCP-18): `manifest_unloads.manifest_number` pasa a NULL-able (numeración diferida al servidor bajo captura offline). **Numeración duplicada "8" corregida** (RCP-20): "API Gateway" ya no numerado, por ser componente transversal.
    - **Gap transversal documentado, no resuelto (RCP-19)**: `manifest_unloads`/`manifest_loads` siguen sin campo de estado propio (RN-111/118/120, candidato `manifest_status_id` → catálogo de estados de manifiesto) — no exclusivo de Recepción en Planta, afecta también al futuro módulo "Manifiestos" (aún no auditado en el pipeline). Condiciona si CU-071/CU-072 deben integrarse al motor de Workflow genérico (`entity_type=MANIFEST`) — decisión diferida a cuando se audite ese módulo.

## Convención de este documento

- `PK` = llave primaria. `FK` = llave foránea (detallada en comentario debajo de cada tabla, con la regla ON DELETE/ON UPDATE cuando está definida).
- Los tipos incluyen longitud/precisión donde aplica (`VARCHAR(255)`, `DECIMAL(12,2)`).
- No se incluyen aquí las columnas de metadatos de cumplimiento del diccionario original (Sensibilidad del Dato, Clasificación, Origen del Dato, Frecuencia de Actualización, Responsable, Observaciones) — esas viven en `diccionario.csv` original, para uso del `curador-documentacion` o auditoría regulatoria, no para trabajo de código día a día.
- Las reglas de negocio (RN-XXX) **no están anotadas campo por campo todavía** — eso es trabajo pendiente de `arquitecto-datos`. Cuando ese subagente corra, debe insertar comentarios `-- RN-XXX: ...` junto a los campos que cada regla regula, igual que se hizo a modo de ejemplo en la conversación de diseño de este skill.

---

## Esquema (48 tablas)

-- audit_logs: Auditoría de cambios de datos
CREATE TABLE audit_logs (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  traceability_uuid UUID NULL,
  tenant_organization_id BIGINT NULL,
  user_id BIGINT NULL,
  person_id BIGINT NULL,
  entity_name VARCHAR(100) NOT NULL,
  entity_id BIGINT NULL,
  entity_uuid UUID NULL,
  action VARCHAR(30) NOT NULL,
  action_summary VARCHAR(500) NULL,
  old_values JSONB NULL,
  new_values JSONB NULL,
  changed_fields JSONB NULL,
  reason TEXT NULL,
  ip_address INET NULL,
  user_agent TEXT NULL,
  source VARCHAR(50) NOT NULL DEFAULT APPLICATION,
  correlation_id UUID NULL,
  metadata JSONB NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK user_id -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK person_id -> persons.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- branch_locations: Ubicaciones internas operativas
CREATE TABLE branch_locations (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  branch_id BIGINT NOT NULL,
  parent_location_id BIGINT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  location_type VARCHAR(50) NOT NULL DEFAULT STORAGE,
  description TEXT NULL,
  max_capacity DECIMAL(12,2) NULL DEFAULT 0,
  capacity_unit VARCHAR(20) NOT NULL DEFAULT KG,
  risk_level VARCHAR(20) NULL DEFAULT LOW,
  requires_ppe BOOLEAN NOT NULL DEFAULT false,
  coordinate_x DECIMAL(10,2) NULL,
  coordinate_y DECIMAL(10,2) NULL,
  canvas_width DECIMAL(10,2) NULL,   -- D-TRT (2026-07-10): footprint del área en el canvas visual de almacenamiento (junto con coordinate_x/y)
  canvas_height DECIMAL(10,2) NULL,  -- D-TRT: idem
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK branch_id -> branches.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- Confirmado (D-TRT, Módulo 9 Almacenamiento y Tratamiento, 2026-07-10): el "canvas configurable de áreas" pedido por el usuario se
  -- modela por SUCURSAL (branch_id), no por organización — el almacenamiento físico ocurre en una planta concreta. Reutiliza esta tabla
  -- ya existente y consumida por CU-071.8 (Recepción en Planta), no se crea tabla nueva a nivel organización.
  -- FK parent_location_id -> branch_locations.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE CASCADE  ON UPDATE CASCADE

-- branch_treatments: Tratamientos habilitados por sede
CREATE TABLE branch_treatments (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  branch_id BIGINT NOT NULL,
  treatment_id BIGINT NOT NULL,
  internal_code VARCHAR(50) NULL UNIQUE,
  operational_name VARCHAR(255) NULL,
  max_capacity DECIMAL(14,2) NULL DEFAULT 0,
  capacity_unit VARCHAR(20) NOT NULL DEFAULT KG,
  daily_capacity DECIMAL(14,2) NULL,
  monthly_capacity DECIMAL(14,2) NULL,
  environmental_license_number VARCHAR(100) NULL,
  valid_from DATE NULL,
  valid_until DATE NULL,
  requires_manual_approval BOOLEAN NOT NULL DEFAULT false,
  allows_mixed_waste BOOLEAN NOT NULL DEFAULT false,
  requires_weight_validation BOOLEAN NOT NULL DEFAULT true,
  operational_status VARCHAR(30) NOT NULL DEFAULT ACTIVE,
  observations TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK branch_id -> branches.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK treatment_id -> treatments.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE

-- branches: Sedes operativas de organizaciones
CREATE TABLE branches (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  code VARCHAR(50) NULL,                   -- unicidad COMPUESTA con organization_id (RN-BRA-004 / T-04), no global
  name VARCHAR(255) NOT NULL,
  branch_type VARCHAR(50) NOT NULL DEFAULT OPERATIVE,
  address VARCHAR(255) NULL,
  location_id BIGINT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  phone VARCHAR(50) NULL,
  email VARCHAR(255) NULL,
  environmental_license VARCHAR(255) NULL,
  license_expiration_date DATE NULL,
  operational_capacity DECIMAL(12,2) NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK location_id -> locations.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE

-- business_roles: Catálogo roles operacionales
CREATE TABLE business_roles (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT NULL,
  parent_business_role_id BIGINT NULL,
  can_generate_waste BOOLEAN NOT NULL DEFAULT false,
  can_transport_waste BOOLEAN NOT NULL DEFAULT false,
  can_treat_waste BOOLEAN NOT NULL DEFAULT false,
  can_approve_treatments BOOLEAN NOT NULL DEFAULT false,
  can_issue_manifests BOOLEAN NOT NULL DEFAULT false,
  requires_environmental_license BOOLEAN NOT NULL DEFAULT false,
  requires_transport_authorization BOOLEAN NOT NULL DEFAULT false,
  ui_color VARCHAR(20) NULL,
  ui_icon VARCHAR(100) NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  system_status VARCHAR(20) NOT NULL DEFAULT ACTIVE,
  is_system_role BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK parent_business_role_id -> business_roles.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE

-- certificate_statuses: Catálogo workflow certificados
CREATE TABLE certificate_statuses (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  system_code VARCHAR(60) NOT NULL,  -- UNIQUE(tenant_organization_id, system_code) — CER-20, requerido para resolución determinística de transiciones por el motor de Workflow genérico (entity_type=CERTIFICATE)
  display_name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  is_initial_status BOOLEAN NOT NULL DEFAULT false,
  is_terminal_status BOOLEAN NOT NULL DEFAULT false,
  is_approved_status BOOLEAN NOT NULL DEFAULT false,
  is_rejected_status BOOLEAN NOT NULL DEFAULT false,
  is_revoked_status BOOLEAN NOT NULL DEFAULT false,
  requires_signature BOOLEAN NOT NULL DEFAULT false,
  blocks_editing BOOLEAN NOT NULL DEFAULT false,
  allows_versioning BOOLEAN NOT NULL DEFAULT true,
  auto_send_to_client BOOLEAN NOT NULL DEFAULT false,
  triggers_notification BOOLEAN NOT NULL DEFAULT false,
  is_regulatory_status BOOLEAN NOT NULL DEFAULT false,
  is_system_status BOOLEAN NOT NULL DEFAULT false,
  sla_hours INTEGER NULL,
  color_hex VARCHAR(10) NULL,
  icon_name VARCHAR(100) NULL,
  observations TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- certificates: Certificados regulatorios y ambientales
CREATE TABLE certificates (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  waste_treatment_execution_id BIGINT NOT NULL,
  certificate_status_id BIGINT NOT NULL,
  file_id BIGINT NULL,
  certificate_code VARCHAR(100) NOT NULL UNIQUE,
  certificate_type VARCHAR(50) NOT NULL DEFAULT DISPOSAL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- CER-26: se fija al ejecutar la transición PublishCertificate (REGISTERED→PUBLISHED), no al generar el documento (CU-042.9) — es cuando el certificado adquiere validez frente a terceros (coherente con CU-045, que solo verifica certificados PUBLISHED)
  expires_at TIMESTAMPTZ NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  parent_certificate_id BIGINT NULL,
  replaces_certificate_id BIGINT NULL,
  is_current_version BOOLEAN NOT NULL DEFAULT true,
  is_signed BOOLEAN NOT NULL DEFAULT false,
  signed_at TIMESTAMPTZ NULL,
  signed_by_user_id BIGINT NULL,
  digital_signature_hash VARCHAR(255) NULL UNIQUE,
  delivered_at TIMESTAMPTZ NULL,
  delivered_by_user_id BIGINT NULL,
  acknowledged_at TIMESTAMPTZ NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT false,  -- CER-30: "revoke" es el término consistente del esquema; Catálogo de Permisos.md usa certificates.cancel para la misma acción — unificar a "revoke" al reconciliar permisos (CER-28)
  revocation_reason TEXT NULL,
  observations TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK waste_treatment_execution_id -> waste_treatment_executions.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK certificate_status_id -> certificate_statuses.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK file_id -> files.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK parent_certificate_id -> certificates.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK replaces_certificate_id -> certificates.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK signed_by_user_id -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK delivered_by_user_id -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- conciliation_items: Detalle de residuos conciliados
CREATE TABLE conciliation_items (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  conciliation_id BIGINT NOT NULL,
  waste_service_request_item_id BIGINT NOT NULL,
  waste_id BIGINT NOT NULL,
  waste_description VARCHAR(500) NOT NULL,
  unit_of_measure VARCHAR(20) NOT NULL DEFAULT KG,
  declared_quantity NUMERIC(18,3) NULL,
  scheduled_quantity NUMERIC(18,3) NULL,
  loaded_quantity NUMERIC(18,3) NULL,
  received_quantity NUMERIC(18,3) NULL,
  weighed_quantity NUMERIC(18,3) NULL,
  discrepancy_quantity NUMERIC(18,3) NULL,
  disputed_quantity NUMERIC(18,3) NULL,
  agreed_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,
  discrepancy_percentage NUMERIC(8,2) NULL,
  discrepancy_reason VARCHAR(200) NULL
);
  -- FK conciliation_id -> conciliations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK waste_service_request_item_id -> waste_service_request_items.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK waste_id -> wastes.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- conciliations: Procesos de conciliación de residuos
CREATE TABLE conciliations (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  reference_number VARCHAR(50) NOT NULL UNIQUE,
  transport_schedule_id BIGINT NULL,
  manifest_load_id BIGINT NULL,
  manifest_unload_id BIGINT NULL,
  requesting_organization_id BIGINT NOT NULL,
  counterpart_organization_id BIGINT NOT NULL,
  reason VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  disputed_quantity NUMERIC(18,3) NULL,
  unit_of_measure VARCHAR(20) NOT NULL DEFAULT KG,
  status VARCHAR(30) NOT NULL DEFAULT OPEN,
  agreed_quantity NUMERIC(18,3) NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  agreed_at TIMESTAMPTZ NULL,
  requester_user_id BIGINT NOT NULL,
  counterpart_user_id BIGINT NULL,
  final_observations TEXT NULL,
  allows_certificate_generation BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK transport_schedule_id -> transport_schedules.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK manifest_load_id -> manifest_loads.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK manifest_unload_id -> manifest_unloads.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK requesting_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK counterpart_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK requester_user_id -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK counterpart_user_id -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- custom_field_values: Valores de campos personalizados
CREATE TABLE custom_field_values (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  organization_id BIGINT NOT NULL,
  custom_field_id BIGINT NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT NOT NULL,
  value_json JSONB NOT NULL DEFAULT '{}',
  value_search VARCHAR(1000) NULL,
  value_hash VARCHAR(128) NULL,
  field_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT NULL,
  updated_at TIMESTAMPTZ NULL,
  updated_by BIGINT NULL,
  traceability_uuid UUID NULL,
  effective_from TIMESTAMPTZ NULL DEFAULT now(),
  effective_to TIMESTAMPTZ NULL,
  source_type VARCHAR(50) NOT NULL DEFAULT USER,
  source_reference VARCHAR(255) NULL
);
  -- FK organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK custom_field_id -> custom_fields.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK created_by -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK updated_by -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- custom_fields: Definición de campos dinámicos
CREATE TABLE custom_fields (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  organization_id BIGINT NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  description TEXT NULL,
  field_type VARCHAR(50) NOT NULL,
  max_length INTEGER NULL,
  decimal_precision SMALLINT NULL,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  is_readonly BOOLEAN NOT NULL DEFAULT FALSE,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_searchable BOOLEAN NOT NULL DEFAULT FALSE,
  options_json JSONB NULL DEFAULT '{}',
  default_value TEXT NULL,
  validation_rules JSONB NULL DEFAULT '{}',
  display_order INTEGER NOT NULL DEFAULT 0,
  field_group VARCHAR(100) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT NULL,
  updated_at TIMESTAMPTZ NULL,
  updated_by BIGINT NULL
);
  -- FK organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK created_by -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK updated_by -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- detailed_descriptions: Catálogo homologado de descripciones de residuos
CREATE TABLE detailed_descriptions (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  keywords TEXT NULL,
  category VARCHAR(100) NULL,
  is_hazardous BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- document_logs: Auditoría documental
CREATE TABLE document_logs (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  traceability_uuid UUID NULL,
  tenant_organization_id BIGINT NULL,
  user_id BIGINT NULL,
  person_id BIGINT NULL,
  document_type VARCHAR(50) NOT NULL,
  document_id BIGINT NOT NULL,
  document_uuid UUID NULL,
  document_name VARCHAR(500) NULL,
  action VARCHAR(50) NOT NULL,
  document_version INTEGER NOT NULL DEFAULT 1,
  previous_version INTEGER NULL,
  document_status VARCHAR(50) NULL,
  file_hash VARCHAR(128) NULL,
  file_size_bytes BIGINT NULL,
  digitally_signed BOOLEAN NOT NULL DEFAULT FALSE,
  signed_by_user_id BIGINT NULL,
  signed_at TIMESTAMPTZ NULL,
  recipient VARCHAR(500) NULL,
  observations TEXT NULL,
  correlation_id UUID NULL,
  metadata JSONB NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK user_id -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK person_id -> people.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR?? (CER-29: corregido persons→people, mismo bug H2 ya corregido en audit_logs/manifest_loads/manifest_unloads/reception_inspections)
  -- FK signed_by_user_id -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- files: Repositorio documental transversal
CREATE TABLE files (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT NOT NULL,
  file_category VARCHAR(50) NOT NULL DEFAULT GENERAL,
  original_filename VARCHAR(500) NOT NULL,
  stored_filename VARCHAR(500) NOT NULL UNIQUE,
  file_extension VARCHAR(20) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  file_hash_sha256 VARCHAR(128) NULL UNIQUE,
  storage_provider VARCHAR(50) NOT NULL DEFAULT LOCAL,
  bucket_name VARCHAR(255) NULL,
  storage_path TEXT NOT NULL UNIQUE,
  public_url TEXT NULL,
  visibility_level VARCHAR(30) NOT NULL DEFAULT INTERNAL,
  version_number INTEGER NOT NULL DEFAULT 1,
  parent_file_id BIGINT NULL,
  expires_at TIMESTAMPTZ NULL,
  ocr_processed BOOLEAN NOT NULL DEFAULT false,
  ocr_text TEXT NULL,
  ai_tags JSONB NULL DEFAULT {},
  description TEXT NULL,
  uploaded_by_user_id BIGINT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK parent_file_id -> files.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK uploaded_by_user_id -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- integration_logs: Auditoría de integraciones
CREATE TABLE integration_logs (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  traceability_uuid UUID NULL,
  tenant_organization_id BIGINT NULL,
  user_id BIGINT NULL,
  external_system VARCHAR(255) NOT NULL,
  integration_type VARCHAR(50) NOT NULL,
  direction VARCHAR(20) NOT NULL DEFAULT OUTBOUND,
  entity_type VARCHAR(100) NULL,
  entity_id BIGINT NULL,
  operation VARCHAR(50) NOT NULL,
  endpoint VARCHAR(1000) NULL,
  request_method VARCHAR(10) NULL,
  response_code INTEGER NULL,
  result VARCHAR(20) NOT NULL DEFAULT SUCCESS,
  response_time_ms INTEGER NULL,
  attempt_number SMALLINT NOT NULL DEFAULT 1,
  correlation_id UUID NULL,
  request_hash VARCHAR(128) NULL,
  response_hash VARCHAR(128) NULL,
  error_message TEXT NULL,
  metadata JSONB NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK user_id -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- integration_payloads: Evidencias de intercambio de datos
CREATE TABLE integration_payloads (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  traceability_uuid UUID NULL,
  integration_log_id BIGINT NOT NULL,
  tenant_organization_id BIGINT NULL,
  correlation_id UUID NULL,
  payload_type VARCHAR(30) NOT NULL,
  payload_format VARCHAR(30) NOT NULL,
  entity_type VARCHAR(100) NULL,
  entity_id BIGINT NULL,
  file_name VARCHAR(500) NULL,
  file_extension VARCHAR(20) NULL,
  mime_type VARCHAR(150) NULL,
  payload_size_bytes BIGINT NULL,
  payload_hash VARCHAR(128) NOT NULL UNIQUE,
  payload_content BYTEA / TEXT NULL,
  storage_path VARCHAR(2000) NULL,
  storage_provider VARCHAR(50) NULL,
  is_compressed BOOLEAN NOT NULL DEFAULT FALSE,
  is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
  encryption_algorithm VARCHAR(50) NULL,
  expires_at TIMESTAMPTZ NULL,
  metadata JSONB NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
  -- FK integration_log_id -> integration_logs.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- integration_requests: Detalle de solicitudes de integración
CREATE TABLE integration_requests (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  traceability_uuid UUID NULL,
  integration_log_id BIGINT NOT NULL,
  correlation_id UUID NULL,
  tenant_organization_id BIGINT NULL,
  direction VARCHAR(20) NOT NULL DEFAULT OUTBOUND,
  external_system VARCHAR(255) NOT NULL,
  endpoint VARCHAR(1000) NULL,
  request_method VARCHAR(10) NULL,
  request_headers JSONB NULL DEFAULT '{}',
  request_payload JSONB NULL,
  payload_size_bytes BIGINT NULL,
  payload_hash VARCHAR(128) NULL,
  content_type VARCHAR(100) NULL,
  entity_type VARCHAR(100) NULL,
  entity_id BIGINT NULL,
  source_ip INET NULL,
  technical_user VARCHAR(255) NULL,
  processing_status VARCHAR(30) NOT NULL DEFAULT RECEIVED,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NULL DEFAULT '{}'
);
  -- FK integration_log_id -> integration_logs.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- integration_responses: Detalle de respuestas de integración
CREATE TABLE integration_responses (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  traceability_uuid UUID NULL,
  integration_log_id BIGINT NOT NULL,
  correlation_id UUID NULL,
  tenant_organization_id BIGINT NULL,
  external_system VARCHAR(255) NOT NULL,
  integration_type VARCHAR(50) NOT NULL,
  endpoint VARCHAR(1000) NULL,
  response_code INTEGER NULL,
  status_message VARCHAR(1000) NULL,
  result VARCHAR(20) NOT NULL DEFAULT SUCCESS,
  response_headers JSONB NULL DEFAULT '{}',
  response_payload JSONB NULL,
  payload_size_bytes BIGINT NULL,
  payload_hash VARCHAR(128) NULL,
  content_type VARCHAR(100) NULL,
  entity_type VARCHAR(100) NULL,
  entity_id BIGINT NULL,
  response_time_ms INTEGER NULL,
  retry_number SMALLINT NOT NULL DEFAULT 0,
  technical_error TEXT NULL,
  business_error TEXT NULL,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NULL DEFAULT '{}',
  external_transaction_id VARCHAR(255) NULL,
  external_reference VARCHAR(255) NULL
);
  -- FK integration_log_id -> integration_logs.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- manifest_load_items: Detalle de residuos cargados
CREATE TABLE manifest_load_items (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  manifest_load_id BIGINT NOT NULL,
  transport_schedule_item_id BIGINT NULL,
  waste_id BIGINT NOT NULL,
  approved_treatment_id BIGINT NULL,
  declared_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,
  unit_of_measure VARCHAR(20) NOT NULL DEFAULT KG,
  actual_weight_kg NUMERIC(18,3) NULL,
  actual_volume_m3 NUMERIC(18,3) NULL,
  container_quantity INTEGER NULL,
  packaging_type VARCHAR(100) NULL,
  internal_container_code VARCHAR(100) NULL,
  packaging_condition VARCHAR(50) NULL,
  transport_approved BOOLEAN NOT NULL DEFAULT TRUE,
  special_handling_required BOOLEAN NOT NULL DEFAULT FALSE,
  observations TEXT NULL,
  line_number INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK manifest_load_id -> manifest_loads.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK transport_schedule_item_id -> transport_schedule_items.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK waste_id -> wastes.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK approved_treatment_id -> waste_treatment_approvals.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??  -- corregido (era approved_waste_treatments, inexistente; diccionario ya lo tenía correcto)

-- manifest_loads: Manifiestos de carga de residuos
CREATE TABLE manifest_loads (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  manifest_number VARCHAR(50) NOT NULL,           -- D-MAN-03 (2026-07-10): único por organización, no global — ver UNIQUE compuesto abajo
  manifest_status_id BIGINT NOT NULL,             -- D-MAN-01 (2026-07-10): catálogo = # Workflow de Manifiestos.md (8 estados: Draft/Generated/PartiallySigned/Signed/InTransit/Received/Closed/Cancelled)
  transport_schedule_id BIGINT NOT NULL,
  generator_branch_id BIGINT NOT NULL,
  carrier_organization_id BIGINT NOT NULL,
  vehicle_id BIGINT NOT NULL,
  transport_personnel_id BIGINT NOT NULL,
  load_date DATE NOT NULL DEFAULT CURRENT_DATE,
  load_started_at TIMESTAMPTZ NULL,
  load_completed_at TIMESTAMPTZ NULL,
  declared_total_weight_kg NUMERIC(18,3) NULL,
  declared_total_volume_m3 NUMERIC(18,3) NULL,
  generator_signer_person_id BIGINT NOT NULL,
  generator_signed_at TIMESTAMPTZ NULL,
  driver_signer_person_id BIGINT NOT NULL,
  driver_signed_at TIMESTAMPTZ NULL,
  pdf_file_id BIGINT NULL,
  observations TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- UNIQUE(tenant_organization_id, manifest_number)  -- D-MAN-03: reemplaza el UNIQUE global anterior
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK manifest_status_id -> manifest_statuses.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK transport_schedule_id -> transport_schedules.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK generator_branch_id -> branches.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK carrier_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK vehicle_id -> vehicles.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK transport_personnel_id -> transport_personnel.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK generator_signer_person_id -> people.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??  -- corregido (era persons, inexistente; diccionario ya lo tenía correcto)
  -- FK driver_signer_person_id -> people.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??  -- corregido (era persons, inexistente; diccionario ya lo tenía correcto)
  -- FK pdf_file_id -> files.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- manifest_unload_items: Detalle de residuos descargados
CREATE TABLE manifest_unload_items (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  manifest_unload_id BIGINT NOT NULL,
  manifest_load_item_id BIGINT NULL,             -- D-PRG-05: NULL-able (Modalidad 2 sin manifiesto de carga)
  unload_request_item_id BIGINT NULL,             -- D-PRG-05: ruta alterna de trazabilidad cuando manifest_load_item_id es NULL
  waste_id BIGINT NOT NULL,
  received_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,
  rejected_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,
  unit_of_measure VARCHAR(20) NOT NULL DEFAULT KG,
  received_weight_kg NUMERIC(18,3) NULL,
  rejected_weight_kg NUMERIC(18,3) NULL DEFAULT 0,
  received_volume_m3 NUMERIC(18,3) NULL,
  received_container_quantity INTEGER NULL,
  reception_condition VARCHAR(50) NOT NULL DEFAULT Conforme,
  rejection_reason TEXT NULL,
  inspection_approved BOOLEAN NOT NULL DEFAULT TRUE,
  storage_location_id BIGINT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  observations TEXT NULL,
  line_number INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK manifest_unload_id -> manifest_unloads.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK manifest_load_item_id -> manifest_load_items.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK unload_request_item_id -> unload_request_items.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK waste_id -> wastes.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK storage_location_id -> branch_locations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??  -- corregido (era locations, inexistente; mismo patrón que persons->people)

-- manifest_unloads: Manifiestos de descarga de residuos
CREATE TABLE manifest_unloads (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  manifest_number VARCHAR(50) NULL,               -- D-RCP-14: NULL-able hasta sincronizar (numeración diferida bajo captura offline, RN-RCP-099); D-MAN-03: único por organización, no global — ver UNIQUE compuesto abajo
  manifest_status_id BIGINT NOT NULL,             -- D-MAN-01 (2026-07-10): mismo catálogo `manifest_statuses` que manifest_loads — cierra el gap RCP-19
  manifest_load_id BIGINT NULL,                  -- D-PRG-05: NULL-able (Modalidad 2 sin manifiesto de carga)
  unload_request_id BIGINT NULL,                  -- D-PRG-05: ruta alterna de trazabilidad cuando manifest_load_id es NULL
  receiving_branch_id BIGINT NOT NULL,
  receiving_organization_id BIGINT NOT NULL,
  vehicle_id BIGINT NOT NULL,
  transport_personnel_id BIGINT NOT NULL,
  unload_date DATE NOT NULL DEFAULT CURRENT_DATE,
  unload_started_at TIMESTAMPTZ NULL,
  unload_completed_at TIMESTAMPTZ NULL,
  received_total_weight_kg NUMERIC(18,3) NULL,
  rejected_total_weight_kg NUMERIC(18,3) NULL DEFAULT 0,
  received_total_volume_m3 NUMERIC(18,3) NULL,
  received_as_expected BOOLEAN NOT NULL DEFAULT TRUE,
  receiver_person_id BIGINT NOT NULL,
  receiver_signed_at TIMESTAMPTZ NULL,
  driver_signer_person_id BIGINT NOT NULL,
  driver_signed_at TIMESTAMPTZ NULL,
  pdf_file_id BIGINT NULL,
  incidents TEXT NULL,
  observations TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- UNIQUE(tenant_organization_id, manifest_number)  -- D-MAN-03: reemplaza el UNIQUE global anterior; NULL-able por D-RCP-14 no participa en el índice hasta poblarse
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK manifest_status_id -> manifest_statuses.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK manifest_load_id -> manifest_loads.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK unload_request_id -> unload_requests.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK receiving_branch_id -> branches.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK receiving_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK vehicle_id -> vehicles.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK transport_personnel_id -> transport_personnel.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK receiver_person_id -> people.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??  -- corregido (era persons, inexistente; diccionario ya lo tenía correcto)
  -- FK driver_signer_person_id -> people.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??  -- corregido (era persons, inexistente; diccionario ya lo tenía correcto)
  -- FK pdf_file_id -> files.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- manifest_statuses: Estados de manifiesto (D-MAN-01, 2026-07-10) — cierra el gap RN-111/RCP-19 (manifest_loads/manifest_unloads sin estado propio)
CREATE TABLE manifest_statuses (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  code VARCHAR(50) NOT NULL,                      -- Draft/Generated/PartiallySigned/Signed/InTransit/Received/Closed/Cancelled (catálogo del Workflow, D-MAN-01)
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  is_initial BOOLEAN NOT NULL DEFAULT FALSE,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  color_hex VARCHAR(7) NULL,
  icon VARCHAR(100) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- Mismo patrón que transport_statuses. manifest_loads.manifest_status_id y manifest_unloads.manifest_status_id -> manifest_statuses.id
  -- Seed confirmado (8 valores, D-MAN-01, issue MAN-17, 2026-07-10) — code/sort_order/is_initial/is_final:
  --   Draft(1,initial) · Generated(2) · PartiallySigned(3) · Signed(4) · InTransit(5) · Received(6) · Closed(7,final) · Cancelled(8,final, alcanzable desde Generated/PartiallySigned vía WF-MAN-009/010)

-- organization_business_roles: Relación organización y roles negocio
CREATE TABLE organization_business_roles (
  -- L-14 (RN-003): invariante — toda organización debe tener AL MENOS UN business_role activo (relationship_status=ACTIVE / is_active=true).
  --   No expresable como constraint de tabla; enforcar por trigger o en la capa de aplicación. Base del gating por capacidades (RN-191/D-P12).
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  business_role_id BIGINT NOT NULL,
  internal_code VARCHAR(50) NULL UNIQUE,
  relationship_status VARCHAR(30) NOT NULL DEFAULT ACTIVE,
  is_primary_role BOOLEAN NOT NULL DEFAULT false,
  valid_from DATE NULL,
  valid_until DATE NULL,
  license_number VARCHAR(150) NULL,
  issuing_authority VARCHAR(255) NULL,
  issued_on DATE NULL, -- L-44: renombrado de issued_at (DATE no debe llevar sufijo _at, reservado para TIMESTAMPTZ)
  expires_on DATE NULL, -- L-44: renombrado de expires_at, mismo motivo
  requires_renewal BOOLEAN NOT NULL DEFAULT false,
  validated_by BIGINT NULL,
  validated_at TIMESTAMPTZ NULL,
  observations TEXT NULL,
  priority_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK business_role_id -> business_roles.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK validated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE

-- organization_detailed_description_currents: Relación organización-corriente-descripción
CREATE TABLE organization_detailed_description_currents (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  organization_id BIGINT NOT NULL,
  detailed_description_id BIGINT NOT NULL,
  current_id BIGINT NOT NULL,
  preferred_treatment_id BIGINT NULL,
  is_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  requires_technical_review BOOLEAN NOT NULL DEFAULT FALSE,
  valid_from DATE NULL,
  valid_until DATE NULL,
  max_quantity_per_service NUMERIC(18,3) NULL,
  unit_of_measure VARCHAR(20) NULL DEFAULT KG,
  technical_notes TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK detailed_description_id -> detailed_descriptions.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK current_id -> currents.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK preferred_treatment_id -> treatments.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- organization_statuses: Estados de organizaciones
CREATE TABLE organization_statuses (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  is_initial BOOLEAN NOT NULL DEFAULT FALSE,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  allows_operation BOOLEAN NOT NULL DEFAULT FALSE,
  requires_document_validation BOOLEAN NOT NULL DEFAULT FALSE,
  requires_commercial_approval BOOLEAN NOT NULL DEFAULT FALSE,
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  color_hex VARCHAR(7) NULL,
  icon VARCHAR(100) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

-- organizations: Información corporativa de organizaciones
CREATE TABLE organizations (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  legal_name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255) NULL,
  tax_id VARCHAR(30) NOT NULL,             -- unicidad COMPUESTA con tax_id_type (RN-002 / T-04), no global
  tax_id_type VARCHAR(30) NOT NULL DEFAULT NIT,
  email VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  website VARCHAR(255) NULL,
  logo_file_id BIGINT NULL,
  organization_status_id BIGINT NOT NULL,
  registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_platform_tenant BOOLEAN NOT NULL DEFAULT FALSE,  -- D-CER-04: exactamente una fila TRUE (EcoLink) en todo el sistema; habilita el override global de ADMINISTRADOR sobre certificados de cualquier tenant (workflow_transition_roles.requires_platform_tenant)
  observations TEXT NULL,
  traceability_uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT NULL,
  updated_at TIMESTAMPTZ NULL,
  updated_by BIGINT NULL,
  economic_activity_code VARCHAR(20) NULL,
  economic_activity_name VARCHAR(255) NULL,
  environmental_authority VARCHAR(255) NULL,
  environmental_registration VARCHAR(100) NULL,
  billing_email VARCHAR(255) NULL,
  support_email VARCHAR(255) NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT America/Bogota,
  country_code VARCHAR(5) NOT NULL DEFAULT CO,
  currency_code VARCHAR(5) NOT NULL DEFAULT COP,
  company_size VARCHAR(30) NULL,
  employee_count INTEGER NULL,
  customer_since DATE NULL,
  risk_level VARCHAR(20) NULL DEFAULT BAJO,
  metadata_json JSONB NULL DEFAULT '{}',
  custom_fields_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  storage_quota_gb DECIMAL(10,2) NULL DEFAULT 10.00,
  storage_used_gb DECIMAL(10,2) NULL DEFAULT 0.00,
  last_activity_at TIMESTAMPTZ NULL,
  contract_expiration_date DATE NULL,
  parent_organization_id BIGINT NULL,
  deleted_at TIMESTAMPTZ NULL   -- soft-delete (decisión D-P05 / L-04); sin borrado físico desde la app (RN-ORG-019)
);
  -- FK logo_file_id -> files.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK organization_status_id -> organization_statuses.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK parent_organization_id -> organizations.id  ON DELETE RESTRICT  ON UPDATE CASCADE

-- ===== Remediación 2026-07-05: geografía en cascada (D-P01 / L-06) y pivote N:N de contactos (D-P02 / L-08) =====

-- countries: Catálogo de países (seed desde Catalogos/Paises.xlsx)
CREATE TABLE countries (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  iso_code VARCHAR(3) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- departments: Departamentos/estados (seed desde Catalogos/Departamentos.xlsx)
CREATE TABLE departments (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  country_id BIGINT NOT NULL,
  dane_code VARCHAR(5) NULL,
  name VARCHAR(150) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
  -- FK country_id -> countries.id  ON DELETE RESTRICT  ON UPDATE CASCADE

-- municipalities: Municipios (seed desde Catalogos/Municipios.Json: CODIGO_MUNICIPIO + Departamento_id)
CREATE TABLE municipalities (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  department_id BIGINT NOT NULL,
  codigo_dane VARCHAR(10) NULL,
  name VARCHAR(150) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
  -- FK department_id -> departments.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- UNIQUE (department_id, codigo_dane)

-- localities: Localidades (solo aplica a Bogotá; seed desde Catalogos/(Bogota) Localidades.xlsx)
CREATE TABLE localities (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  municipality_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
  -- FK municipality_id -> municipalities.id  ON DELETE RESTRICT  ON UPDATE CASCADE

-- addresses: Direcciones polimórficas (organización y sucursal) — reemplaza la FK huérfana `locations` (D-P01)
CREATE TABLE addresses (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  addressable_type VARCHAR(30) NOT NULL,   -- ORGANIZATION | BRANCH
  addressable_id BIGINT NOT NULL,
  municipality_id BIGINT NOT NULL,
  locality_id BIGINT NULL,                 -- solo si el municipio es Bogotá
  street TEXT NOT NULL,                    -- texto libre de vía (RN-BRA-020: ciudad/depto/país vienen de la jerarquía)
  address_type VARCHAR(30) NULL,           -- principal, facturación, etc. (RN-BRA-023)
  is_primary BOOLEAN NOT NULL DEFAULT false,   -- RN-004 / RN-BRA-018/019: una principal activa por entidad
  latitude DECIMAL(10,7) NULL,             -- GPS opcional (RN-BRA-022)
  longitude DECIMAL(10,7) NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK municipality_id -> municipalities.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK locality_id -> localities.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- índice (addressable_type, addressable_id); UNIQUE parcial: una is_primary=true activa por (addressable_type, addressable_id)

-- organization_contacts: pivote N:N Contacto↔Organización con atributos (D-P02 / L-08)
CREATE TABLE organization_contacts (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  contact_id BIGINT NOT NULL,              -- -> people.id (registro en rol de contacto)
  organization_id BIGINT NOT NULL,
  branch_id BIGINT NULL,                   -- vínculo opcional a sucursal (RN-018)
  position_id BIGINT NULL,                 -- cargo por vínculo (RN-189)
  relationship_type VARCHAR(30) NULL,      -- Empleado | Consultor | Externo (visto en UI)
  is_primary BOOLEAN NOT NULL DEFAULT false,   -- organización/vínculo principal
  start_date DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK contact_id -> people.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK branch_id -> branches.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK position_id -> positions.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- UNIQUE (contact_id, organization_id, branch_id)
  -- Reemplaza people.organization_id como relación de pertenencia; ese campo queda como "organización principal" derivada (is_primary=true) o se retira.

-- people: Personas relacionadas al sistema
CREATE TABLE people (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  organization_id BIGINT NULL,
  branch_id BIGINT NULL,
  position_id BIGINT NULL,
  document_type VARCHAR(20) NOT NULL DEFAULT CC,
  document_number VARCHAR(50) NOT NULL UNIQUE,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NOT NULL,
  second_last_name VARCHAR(100) NULL,
  full_name VARCHAR(255) NULL DEFAULT generated,
  birth_date DATE NULL,
  gender VARCHAR(20) NULL,
  email VARCHAR(255) NULL UNIQUE,
  phone VARCHAR(50) NULL,
  address VARCHAR(255) NULL,
  location_id BIGINT NULL,
  photo_file_id BIGINT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK organization_id -> organizations.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK branch_id -> branches.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK position_id -> positions.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK location_id -> locations.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK photo_file_id -> files.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK created_by -> users.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE

-- permissions: Permisos funcionales del sistema
CREATE TABLE permissions (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  code VARCHAR(150) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  module VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  scope VARCHAR(50) NOT NULL DEFAULT tenant,
  description TEXT NULL,
  is_system BOOLEAN NOT NULL DEFAULT true,
  is_critical BOOLEAN NOT NULL DEFAULT false,
  priority_level INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE

-- positions: Cargos organizacionales
CREATE TABLE positions (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  organization_id BIGINT NULL,
  branch_id BIGINT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  hierarchy_level INTEGER NOT NULL DEFAULT 1,
  parent_position_id BIGINT NULL,
  requires_signature BOOLEAN NOT NULL DEFAULT false,
  is_environmental_responsible BOOLEAN NOT NULL DEFAULT false,
  is_critical_position BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK branch_id -> branches.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK parent_position_id -> positions.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE CASCADE  ON UPDATE CASCADE

-- respel_statuses: Estados del flujo de aprobación de residuos
CREATE TABLE respel_statuses (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  is_initial BOOLEAN NOT NULL DEFAULT FALSE,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  is_approved_status BOOLEAN NOT NULL DEFAULT FALSE,
  is_rejected_status BOOLEAN NOT NULL DEFAULT FALSE,
  requires_commercial_review BOOLEAN NOT NULL DEFAULT FALSE,
  requires_environmental_review BOOLEAN NOT NULL DEFAULT FALSE,
  allows_service_request BOOLEAN NOT NULL DEFAULT FALSE,
  requires_additional_information BOOLEAN NOT NULL DEFAULT FALSE,
  color_hex VARCHAR(7) NULL,
  icon VARCHAR(100) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- role_permissions: Relación entre roles y permisos
CREATE TABLE role_permissions (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  role_id BIGINT NOT NULL,
  permission_id BIGINT NOT NULL,
  assigned_by BIGINT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK role_id -> roles.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK permission_id -> permissions.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK assigned_by -> users.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE

-- roles: Roles funcionales del sistema
CREATE TABLE roles (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_editable BOOLEAN NOT NULL DEFAULT true,
  priority_level INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE

-- security_logs: Registro de eventos de seguridad
CREATE TABLE security_logs (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  traceability_uuid UUID NULL,
  tenant_organization_id BIGINT NULL,
  user_id BIGINT NULL,
  person_id BIGINT NULL,
  event_type VARCHAR(50) NOT NULL,
  result VARCHAR(20) NOT NULL DEFAULT SUCCESS,
  description TEXT NULL,
  ip_address INET NULL,
  user_agent TEXT NULL,
  device_fingerprint VARCHAR(255) NULL,
  country VARCHAR(100) NULL,
  city VARCHAR(100) NULL,
  session_id UUID NULL,
  resource_url VARCHAR(1000) NULL,
  request_method VARCHAR(10) NULL,
  correlation_id UUID NULL,
  metadata JSONB NULL DEFAULT '{}',
  risk_level VARCHAR(20) NOT NULL DEFAULT LOW,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK user_id -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK person_id -> persons.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- service_statuses: Catálogo configurable estados servicios
CREATE TABLE service_statuses (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  system_code VARCHAR(50) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  is_initial_status BOOLEAN NOT NULL DEFAULT false,
  is_terminal_status BOOLEAN NOT NULL DEFAULT false,
  is_success_status BOOLEAN NOT NULL DEFAULT false,
  is_cancellation_status BOOLEAN NOT NULL DEFAULT false,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  blocks_editing BOOLEAN NOT NULL DEFAULT false,
  triggers_notification BOOLEAN NOT NULL DEFAULT false,
  is_system_status BOOLEAN NOT NULL DEFAULT false,
  color_hex VARCHAR(10) NULL,
  icon_name VARCHAR(100) NULL,
  sla_hours INTEGER NULL,
  observations TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- transport_schedule_items: Detalle de residuos programados para transporte
CREATE TABLE transport_schedule_items (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  transport_schedule_id BIGINT NOT NULL,
  waste_service_request_item_id BIGINT NOT NULL,
  waste_id BIGINT NOT NULL,
  scheduled_quantity NUMERIC(18,3) NOT NULL DEFAULT 0,
  unit_of_measure VARCHAR(20) NOT NULL DEFAULT KG,
  estimated_weight_kg NUMERIC(18,3) NULL,
  estimated_volume_m3 NUMERIC(18,3) NULL,
  container_quantity INTEGER NULL,
  packaging_type VARCHAR(100) NULL,
  length_cm NUMERIC(10,2) NULL,
  width_cm NUMERIC(10,2) NULL,
  height_cm NUMERIC(10,2) NULL,
  requires_special_handling BOOLEAN NOT NULL DEFAULT FALSE,
  observations TEXT NULL,
  route_sequence INTEGER NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK transport_schedule_id -> transport_schedules.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK waste_service_request_item_id -> waste_service_request_items.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK waste_id -> wastes.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- transport_schedules: Programación logística de transporte de residuos
CREATE TABLE transport_schedules (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  waste_service_request_id BIGINT NOT NULL,
  transport_status_id BIGINT NOT NULL,
  schedule_number VARCHAR(50) NOT NULL UNIQUE,
  source_branch_id BIGINT NOT NULL,
  destination_branch_id BIGINT NOT NULL,
  vehicle_id BIGINT NULL,
  transport_personnel_id BIGINT NULL,
  planned_pickup_date DATE NOT NULL,
  pickup_window_start TIMESTAMPTZ NULL,
  pickup_window_end TIMESTAMPTZ NULL,
  planned_departure_at TIMESTAMPTZ NULL,
  planned_arrival_at TIMESTAMPTZ NULL,
  priority VARCHAR(20) NOT NULL DEFAULT NORMAL,
  estimated_weight_kg NUMERIC(18,3) NOT NULL DEFAULT 0,
  estimated_volume_m3 NUMERIC(18,3) NULL,
  reserved_vehicle_capacity_percent NUMERIC(5,2) NULL,
  requires_platform_vehicle BOOLEAN NOT NULL DEFAULT FALSE,
  requires_special_handling BOOLEAN NOT NULL DEFAULT FALSE,
  planned_distance_km NUMERIC(10,2) NULL,
  planned_duration_minutes INTEGER NULL,
  route_notes TEXT NULL,
  logistics_observations TEXT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  parent_schedule_id BIGINT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK waste_service_request_id -> waste_service_requests.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK transport_status_id -> transport_service_statuses.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK source_branch_id -> branches.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK destination_branch_id -> branches.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK vehicle_id -> vehicles.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK transport_personnel_id -> transport_personnel.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK parent_schedule_id -> transport_schedules.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- transport_statuses: Estados del proceso de transporte
CREATE TABLE transport_statuses (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1,
  is_initial BOOLEAN NOT NULL DEFAULT FALSE,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  requires_schedule BOOLEAN NOT NULL DEFAULT FALSE,
  requires_vehicle BOOLEAN NOT NULL DEFAULT FALSE,
  requires_load_manifest BOOLEAN NOT NULL DEFAULT FALSE,
  requires_unload_manifest BOOLEAN NOT NULL DEFAULT FALSE,
  color_hex VARCHAR(7) NULL,
  icon VARCHAR(100) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- treatments: Catálogo de tratamientos ambientales
CREATE TABLE treatments (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  treatment_type VARCHAR(50) NOT NULL DEFAULT DISPOSAL,
  parent_treatment_id BIGINT NULL,
  requires_environmental_license BOOLEAN NOT NULL DEFAULT true,
  requires_special_transport BOOLEAN NOT NULL DEFAULT false,
  allows_recovery BOOLEAN NOT NULL DEFAULT false,
  requires_certificate BOOLEAN NOT NULL DEFAULT true,
  requires_weight_control BOOLEAN NOT NULL DEFAULT true,
  min_temperature DECIMAL(8,2) NULL,
  max_temperature DECIMAL(8,2) NULL,
  temperature_unit VARCHAR(10) NULL DEFAULT C,
  risk_level VARCHAR(20) NULL DEFAULT MEDIUM,
  estimated_processing_time_hours DECIMAL(8,2) NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK parent_treatment_id -> treatments.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE CASCADE  ON UPDATE CASCADE

-- users: Usuarios del sistema
CREATE TABLE users (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  organization_id BIGINT NULL,
  branch_id BIGINT NULL,
  person_id BIGINT NULL UNIQUE,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  status_usuario_id BIGINT NOT NULL,
  last_login_at TIMESTAMPTZ NULL,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ NULL,
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  mfa_secret VARCHAR(255) NULL,
  email_verified_at TIMESTAMPTZ NULL,
  avatar_file_id BIGINT NULL,
  metadata JSONB NULL DEFAULT {},
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK organization_id -> organizations.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK branch_id -> branches.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK person_id -> people.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK status_usuario_id -> user_statuses.id  ON DELETE RESTRICT  ON UPDATE CASCADE   -- (T-05: catálogo renombrado status_usuario -> user_statuses; homologar la columna a user_status_id al implementar)
  -- FK avatar_file_id -> files.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK created_by -> users.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE

-- vehicles: Vehículos utilizados en operaciones de transporte
CREATE TABLE vehicles (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  branch_id BIGINT NULL,
  code VARCHAR(50) NULL UNIQUE,
  plate_number VARCHAR(20) NOT NULL UNIQUE,
  vin VARCHAR(100) NULL UNIQUE,
  vehicle_type VARCHAR(50) NOT NULL DEFAULT TRUCK,
  brand VARCHAR(100) NULL,
  model VARCHAR(100) NULL,
  manufacturing_year INTEGER NULL,
  max_load_capacity DECIMAL(12,2) NULL DEFAULT 0,
  capacity_unit VARCHAR(20) NOT NULL DEFAULT KG,
  supports_hazmat BOOLEAN NOT NULL DEFAULT false,
  has_gps BOOLEAN NOT NULL DEFAULT false,
  operational_status VARCHAR(30) NOT NULL DEFAULT ACTIVE,
  soat_expiration_date DATE NULL,
  technical_inspection_expiration DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK organization_id -> organizations.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK branch_id -> branches.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE CASCADE  ON UPDATE CASCADE

-- waste_service_request_items: Detalle residuos solicitud servicio
CREATE TABLE waste_service_request_items (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  service_request_id BIGINT NOT NULL,
  item_sequence INTEGER NOT NULL DEFAULT 1,
  waste_id BIGINT NOT NULL,
  waste_treatment_approval_id BIGINT NULL,
  waste_name_snapshot VARCHAR(255) NOT NULL,
  waste_code_snapshot VARCHAR(100) NULL,
  treatment_snapshot VARCHAR(255) NULL,
  estimated_quantity DECIMAL(14,2) NULL,
  actual_quantity DECIMAL(14,2) NULL,
  estimated_weight DECIMAL(14,2) NULL,
  actual_weight DECIMAL(14,2) NULL,
  weight_unit VARCHAR(10) NOT NULL DEFAULT KG,
  packaging_type VARCHAR(100) NULL,
  physical_state VARCHAR(30) NULL,
  stackable BOOLEAN NOT NULL DEFAULT false,
  requires_forklift BOOLEAN NOT NULL DEFAULT false,
  requires_isolation BOOLEAN NOT NULL DEFAULT false,
  height DECIMAL(10,2) NULL,
  width DECIMAL(10,2) NULL,
  length DECIMAL(10,2) NULL,
  calculated_volume DECIMAL(14,3) NULL,
  item_status VARCHAR(30) NOT NULL DEFAULT PENDING,
  observations TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK service_request_id -> waste_service_requests.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK waste_id -> wastes.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK waste_treatment_approval_id -> waste_treatment_approvals.id  ON DELETE RESTRICT  ON UPDATE CASCADE

-- waste_service_requests: Solicitudes operativas de recolección/disposición
CREATE TABLE waste_service_requests (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  branch_id BIGINT NOT NULL,
  request_code VARCHAR(50) NOT NULL UNIQUE,
  workflow_status VARCHAR(30) NOT NULL DEFAULT DRAFT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_collection_date DATE NULL,
  estimated_ready_date DATE NULL,
  scheduled_collection_date TIMESTAMPTZ NULL,
  estimated_total_weight DECIMAL(14,2) NULL,
  estimated_total_volume DECIMAL(14,2) NULL,
  volume_unit VARCHAR(10) NOT NULL DEFAULT M3,
  packaging_type VARCHAR(100) NULL,
  requires_lift_platform BOOLEAN NOT NULL DEFAULT false,
  requires_audit BOOLEAN NOT NULL DEFAULT false,
  requires_photo_record BOOLEAN NOT NULL DEFAULT false,
  requires_container_return BOOLEAN NOT NULL DEFAULT false,
  estimated_height DECIMAL(10,2) NULL,
  estimated_width DECIMAL(10,2) NULL,
  estimated_length DECIMAL(10,2) NULL,
  observations TEXT NULL,
  request_source VARCHAR(30) NOT NULL DEFAULT PORTAL,
  priority VARCHAR(20) NOT NULL DEFAULT NORMAL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK branch_id -> branches.id  ON DELETE RESTRICT  ON UPDATE CASCADE

-- waste_stream_assignments: Relación residuos y corrientes RESPEL
CREATE TABLE waste_stream_assignments (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  waste_id BIGINT NOT NULL,
  waste_stream_id BIGINT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  classification_source VARCHAR(30) NOT NULL DEFAULT MANUAL,
  ai_confidence DECIMAL(5,2) NULL,
  classified_at TIMESTAMPTZ NULL DEFAULT now(),
  classified_by BIGINT NULL,
  observations TEXT NULL,
  valid_from DATE NULL,
  valid_until DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK waste_id -> wastes.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK waste_stream_id -> waste_streams.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK classified_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE

-- waste_streams: Catálogo de corrientes de residuos
CREATE TABLE waste_streams (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  un_code VARCHAR(20) NULL,
  un_name VARCHAR(255) NULL,
  hazard_class VARCHAR(20) NULL,
  packing_group VARCHAR(10) NULL,
  basel_code VARCHAR(50) NULL,
  respel_code VARCHAR(50) NULL,
  physical_state VARCHAR(20) NULL,
  is_flammable BOOLEAN NOT NULL DEFAULT false,
  is_corrosive BOOLEAN NOT NULL DEFAULT false,
  is_reactive BOOLEAN NOT NULL DEFAULT false,
  is_toxic BOOLEAN NOT NULL DEFAULT false,
  is_biological BOOLEAN NOT NULL DEFAULT false,
  mixing_compatibility TEXT NULL,
  requires_manifest BOOLEAN NOT NULL DEFAULT true,
  requires_special_transport BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE CASCADE  ON UPDATE CASCADE

-- waste_treatment_approvals: Tratamientos cotizados y aprobados
CREATE TABLE waste_treatment_approvals (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  waste_id BIGINT NOT NULL,
  branch_treatment_id BIGINT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  commercial_status VARCHAR(30) NOT NULL DEFAULT DRAFT,
  technical_status VARCHAR(30) NOT NULL DEFAULT PENDING,
  unit_price DECIMAL(14,2) NULL,
  currency VARCHAR(10) NOT NULL DEFAULT COP,
  billing_unit VARCHAR(20) NOT NULL DEFAULT KG,
  minimum_quantity DECIMAL(14,2) NULL,
  maximum_quantity DECIMAL(14,2) NULL,
  requires_lab_analysis BOOLEAN NOT NULL DEFAULT false,
  requires_sds BOOLEAN NOT NULL DEFAULT false,
  restrictions TEXT NULL,
  commercial_notes TEXT NULL,
  technical_notes TEXT NULL,
  technical_approved_at TIMESTAMPTZ NULL,
  technical_approved_by BIGINT NULL,
  commercial_approved_at TIMESTAMPTZ NULL,
  commercial_approved_by BIGINT NULL,
  valid_from DATE NULL,
  valid_until DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK waste_id -> wastes.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK branch_treatment_id -> branch_treatments.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK technical_approved_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK commercial_approved_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE

-- waste_treatment_executions: Ejecución real tratamientos ambientales
CREATE TABLE waste_treatment_executions (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  waste_service_request_item_id BIGINT NULL,  -- D-TRT (2026-07-10): pasa a NULL-able, referencia comercial opcional — ya NO es fuente de cantidades (ver waste_treatment_execution_inputs)
  branch_treatment_id BIGINT NOT NULL,        -- D-TRT: nueva — ancla la ejecución a la habilitación concreta (licencia/vigencia/corrientes permitidas), mismo patrón que waste_treatment_approvals.branch_treatment_id
  treatment_id BIGINT NOT NULL,               -- snapshot denormalizado, derivado de branch_treatment_id
  branch_id BIGINT NULL,                      -- snapshot denormalizado, derivado de branch_treatment_id
  location_id BIGINT NULL,
  execution_code VARCHAR(50) NOT NULL UNIQUE,
  treated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  treated_quantity DECIMAL(14,2) NULL,
  treated_weight DECIMAL(14,2) NULL,
  weight_unit VARCHAR(10) NOT NULL DEFAULT KG,
  execution_status_id BIGINT NOT NULL,  -- D-TRT-04 (2026-07-10): FK a treatment_execution_statuses, reemplaza el VARCHAR libre — catálogo de 7 estados confirmado en vivo (Figma, "Estados de Ejecución de Tratamiento")
  treatment_snapshot VARCHAR(255) NULL,
  method_snapshot TEXT NULL,
  operator_user_id BIGINT NULL,
  treatment_temperature DECIMAL(10,2) NULL,
  treatment_duration_minutes INTEGER NULL,
  batch_number VARCHAR(100) NULL,
  storage_release_completed_at TIMESTAMPTZ NULL,  -- D-TRT: cache — se setea cuando TODAS las filas de waste_storage_placements de esta ejecución tienen final_treatment_completed=true. 4ª condición de elegibilidad de CU-040.11, junto a RN-123/124/RTX-002
  observations TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK waste_service_request_item_id -> waste_service_request_items.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK branch_treatment_id -> branch_treatments.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK treatment_id -> treatments.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK branch_id -> branches.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK location_id -> branch_locations.id  ON DELETE SET NULL  ON UPDATE CASCADE  -- corregido (era locations, inexistente; mismo patrón que persons->people)
  -- FK operator_user_id -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK execution_status_id -> treatment_execution_statuses.id  ON DELETE RESTRICT  ON UPDATE CASCADE

-- treatment_execution_statuses: Estados del ciclo de ejecución de tratamiento (D-TRT-04, 2026-07-10)
-- Confirmado en vivo vía MCP Figma ("Estados de Ejecución de Tratamiento", accent TREATMENT_GREEN) — pipeline LINEAL de 7 estados
-- (sin ramas), con reproceso explícito VAL/FIN→PROC. Adoptado como catálogo oficial de execution_status (antes texto libre).
CREATE TABLE treatment_execution_statuses (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  code VARCHAR(20) NOT NULL,           -- PEND / PROG / PROC / FIN / VAL / CERT_A / CERT
  name VARCHAR(100) NOT NULL,          -- Pendiente / Programado / En Proceso / Finalizado / Validación / Certificable / Certificado
  status_type VARCHAR(20) NOT NULL,    -- Inicial / Operativo / Validación / Certificación / Final
  sort_order INTEGER NOT NULL DEFAULT 1,
  is_initial BOOLEAN NOT NULL DEFAULT false,
  is_final BOOLEAN NOT NULL DEFAULT false,
  allows_programming BOOLEAN NOT NULL DEFAULT false,    -- P.Prog. (Figma)
  allows_execution BOOLEAN NOT NULL DEFAULT false,      -- P.Ejec. (Figma)
  requires_validation BOOLEAN NOT NULL DEFAULT false,   -- R.Val. (Figma)
  allows_certification BOOLEAN NOT NULL DEFAULT false,  -- P.Cert. (Figma) — solo CERT_A permite emitir certificado
  color_hex VARCHAR(7) NULL,
  icon VARCHAR(100) NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- Seed confirmado (7 valores, D-TRT-04) — code/status_type/sort_order/flags (P.Prog,P.Ejec,R.Val,P.Cert):
  --   PEND(Inicial,1,N/N/N/N) · PROG(Operativo,2,S/S/N/N) · PROC(Operativo,3,N/S/S/N) · FIN(Final,4,N/N/S/N)
  --   VAL(Validación,5,N/N/N/S) · CERT_A(Certificación,6,N/N/N/S) · CERT(Final,7,N/N/N/N)
  -- Pipeline lineal sin ramas; reproceso explícito VAL/FIN→PROC (mismo patrón "↩ Restauración" ya visto en Estados de Manifiesto de Carga/Organización).
  -- waste_treatment_executions.execution_status_id -> treatment_execution_statuses.id

-- waste_treatment_execution_inputs: Residuos recibidos consumidos por una ejecución de tratamiento (N:M, D-TRT 2026-07-10)
-- Resuelve el enlace roto recepción↔ejecución (RN-067/RTX-004): antes solo existía waste_service_request_item_id (solicitud
-- comercial, no la recepción física real vía manifest_unload_items/CU-066-072), y era 1:1 pese a que CU-039.2 confirma flujo
-- multi-residuo por ejecución.
CREATE TABLE waste_treatment_execution_inputs (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  waste_treatment_execution_id BIGINT NOT NULL,
  manifest_unload_item_id BIGINT NOT NULL,
  allocated_quantity NUMERIC(18,3) NOT NULL,
  allocated_weight_kg NUMERIC(18,3) NULL,
  unit_of_measure VARCHAR(20) NOT NULL DEFAULT KG,
  observations TEXT NULL,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- UNIQUE(waste_treatment_execution_id, manifest_unload_item_id)
  -- FK tenant_organization_id -> organizations.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK waste_treatment_execution_id -> waste_treatment_executions.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK manifest_unload_item_id -> manifest_unload_items.id  ON DELETE RESTRICT  ON UPDATE CASCADE

-- waste_storage_placements: Estancia de un residuo en un área de almacenamiento — ledger de movimientos (D-TRT 2026-07-10)
-- Cierra el gap ya señalado por CU-071.8 ("no hay tabla de stock"). Diseño event-log: cada estancia física es una fila; entrada
-- parcial a varias áreas = varias filas; traslado entre áreas = retirar fila actual (withdrawn_at, withdrawal_reason='TRANSFER')
-- + crear fila nueva en área destino. manifest_unload_items.storage_location_id sigue siendo el snapshot de "ubicación actual"
-- (lectura rápida); esta tabla es la fuente de verdad histórica.
CREATE TABLE waste_storage_placements (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  waste_id BIGINT NOT NULL,
  manifest_unload_item_id BIGINT NULL,       -- provenance: línea de recepción origen (NULL si es residuo resultante/subproducto)
  branch_location_id BIGINT NOT NULL,        -- área asignada (canvas de la sucursal, ver branch_locations)
  placed_quantity NUMERIC(18,3) NOT NULL,
  placed_weight_kg NUMERIC(18,3) NULL,
  unit_of_measure VARCHAR(20) NOT NULL DEFAULT KG,
  placement_status VARCHAR(30) NOT NULL DEFAULT STORED,   -- STORED / WITHDRAWN
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  placed_by BIGINT NULL,
  withdrawn_at TIMESTAMPTZ NULL,
  withdrawn_by BIGINT NULL,
  withdrawal_reason VARCHAR(50) NULL,        -- TREATMENT / TRANSFER / EXTERNAL_DELIVERY / DISPOSAL
  waste_treatment_execution_id BIGINT NULL,  -- ejecución de tratamiento asociada al retiro (cuando aplica)
  final_treatment_completed BOOLEAN NOT NULL DEFAULT false,   -- flag pedido por el usuario: habilita CU-040.11 vía storage_release_completed_at
  final_treatment_completed_at TIMESTAMPTZ NULL,
  observations TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK waste_id -> wastes.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK manifest_unload_item_id -> manifest_unload_items.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK branch_location_id -> branch_locations.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK placed_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK withdrawn_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK waste_treatment_execution_id -> waste_treatment_executions.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- Validación de capacidad (aplicación, no constraint de columna, mismo criterio que RN-041):
  --   SUM(placed_quantity) WHERE branch_location_id=X AND placement_status='STORED' <= branch_locations.max_capacity

-- wastes: Residuos operativos y comerciales
CREATE TABLE wastes (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NULL,
  organization_id BIGINT NOT NULL,
  branch_id BIGINT NULL,
  waste_stream_id BIGINT NOT NULL,
  code VARCHAR(50) NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  waste_danger VARCHAR(30) NOT NULL DEFAULT OPERATIONAL,
  waste_type VARCHAR(30) NOT NULL DEFAULT OPERATIONAL,
  is_template BOOLEAN NOT NULL DEFAULT false,
  is_preapproved BOOLEAN NOT NULL DEFAULT false,
  preapproved_by_organization_id BIGINT NULL,
  requires_characterization BOOLEAN NOT NULL DEFAULT false,
  requires_sds BOOLEAN NOT NULL DEFAULT false,
  physical_state VARCHAR(20) NULL,
  measurement_unit VARCHAR(20) NOT NULL DEFAULT KG,
  average_weight DECIMAL(14,2) NULL,
  generation_frequency VARCHAR(30) NULL,
  requires_special_transport BOOLEAN NOT NULL DEFAULT false,
  requires_special_ppe BOOLEAN NOT NULL DEFAULT false, -- NUEVO, issue L-32
  operational_status VARCHAR(30) NOT NULL DEFAULT ACTIVE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK organization_id -> organizations.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK branch_id -> branches.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK waste_stream_id -> waste_streams.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK preapproved_by_organization_id -> organizations.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK created_by -> users.id  ON DELETE RESTRICT  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE

-- workflow_logs: Registro cronológico de eventos operativos
CREATE TABLE workflow_logs (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  traceability_uuid UUID NOT NULL,
  tenant_organization_id BIGINT NULL,
  user_id BIGINT NULL,
  branch_id BIGINT NULL,
  process_type VARCHAR(50) NOT NULL,
  process_id BIGINT NULL,
  event_code VARCHAR(100) NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  previous_status VARCHAR(50) NULL,
  new_status VARCHAR(50) NULL,
  related_entity VARCHAR(100) NULL,
  related_entity_id BIGINT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT INFO,
  source VARCHAR(50) NOT NULL DEFAULT APPLICATION,
  metadata JSONB NULL DEFAULT '{}',
  correlation_id UUID NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK user_id -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK branch_id -> branches.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- vehicle_checkins: Ingreso de vehículo a planta (CU-068, dominio 10 D-RCP-05)
CREATE TABLE vehicle_checkins (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  unload_request_id BIGINT NOT NULL,
  plant_reception_schedule_id BIGINT NULL,
  receiving_branch_id BIGINT NOT NULL,
  vehicle_id BIGINT NOT NULL,
  transport_personnel_id BIGINT NOT NULL,
  dock_location_id BIGINT NULL,
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  documentation_status VARCHAR(30) NOT NULL DEFAULT PENDING,
  documentation_exception_reason TEXT NULL,
  documentation_exception_by BIGINT NULL,
  checkin_status VARCHAR(30) NOT NULL DEFAULT PENDING,
  confirmed_at TIMESTAMPTZ NULL,
  confirmed_by BIGINT NULL,
  observations TEXT NULL,
  sync_status VARCHAR(30) NOT NULL DEFAULT SYNCED,
  device_captured_at TIMESTAMPTZ NULL,
  offline_integrity_hash VARCHAR(128) NULL,
  synced_at TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL,
  created_by BIGINT NULL,
  updated_by BIGINT NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK unload_request_id -> unload_requests.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK plant_reception_schedule_id -> plant_reception_schedules.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK receiving_branch_id -> branches.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK vehicle_id -> vehicles.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK transport_personnel_id -> transport_personnel.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR?? (gap heredado, no exclusivo de este módulo)
  -- FK dock_location_id -> branch_locations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK documentation_exception_by -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK confirmed_by -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK created_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE
  -- FK updated_by -> users.id  ON DELETE SET NULL  ON UPDATE CASCADE

-- vehicle_checkin_incidents: Novedades registradas durante el ingreso (CU-068.4, append-only)
CREATE TABLE vehicle_checkin_incidents (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  vehicle_checkin_id BIGINT NOT NULL,
  incident_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT LOW,
  is_critical BOOLEAN NOT NULL DEFAULT false,
  escalated_to BIGINT NULL,
  escalated_at TIMESTAMPTZ NULL,
  photo_file_id BIGINT NULL,
  reported_by BIGINT NULL,
  sync_status VARCHAR(30) NOT NULL DEFAULT SYNCED,
  device_captured_at TIMESTAMPTZ NULL,
  offline_integrity_hash VARCHAR(128) NULL,
  synced_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK vehicle_checkin_id -> vehicle_checkins.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK escalated_to -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK photo_file_id -> files.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK reported_by -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- reception_inspections: Dictamen de inspección de recepción (CU-069, integrado al motor de Workflow genérico D-RCP-10)
CREATE TABLE reception_inspections (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  unload_request_id BIGINT NOT NULL,
  vehicle_checkin_id BIGINT NULL,
  inspector_person_id BIGINT NOT NULL,
  result VARCHAR(30) NOT NULL DEFAULT PENDING,
  packaging_conforming BOOLEAN NULL,
  labeling_conforming BOOLEAN NULL,
  compatibility_conforming BOOLEAN NULL,
  load_conditions_conforming BOOLEAN NULL,
  rejection_reason TEXT NULL,
  signer_person_id BIGINT NULL,
  signed_at TIMESTAMPTZ NULL,
  signature_hash VARCHAR(256) NULL,
  is_immutable BOOLEAN NOT NULL DEFAULT false,
  sync_status VARCHAR(30) NOT NULL DEFAULT SYNCED,
  device_captured_at TIMESTAMPTZ NULL,
  offline_integrity_hash VARCHAR(128) NULL,
  synced_at TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK unload_request_id -> unload_requests.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK vehicle_checkin_id -> vehicle_checkins.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK inspector_person_id -> people.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK signer_person_id -> people.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- Nota: `result`/estados gobernados por el motor de Workflow genérico (entity_type=RECEPTION_INSPECTION, D-RCP-10) vía workflow_transitions, no por CHECK estático.

-- reception_inspection_items: Detalle por residuo de la inspección (CU-069.1-.4)
CREATE TABLE reception_inspection_items (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  reception_inspection_id BIGINT NOT NULL,
  waste_id BIGINT NOT NULL,
  manifest_unload_item_id BIGINT NULL,
  compliant BOOLEAN NOT NULL DEFAULT true,
  observations TEXT NULL,
  photo_file_id BIGINT NULL,
  line_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK reception_inspection_id -> reception_inspections.id  ON DELETE CASCADE  ON UPDATE CASCADE
  -- FK waste_id -> wastes.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK manifest_unload_item_id -> manifest_unload_items.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK photo_file_id -> files.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??

-- weight_tickets: Ticket de pesaje de entrada/salida (CU-070)
CREATE TABLE weight_tickets (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  unload_request_id BIGINT NOT NULL,
  manifest_unload_id BIGINT NULL,
  entry_weight_kg NUMERIC(18,3) NOT NULL,
  entry_weighed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exit_weight_kg NUMERIC(18,3) NULL,
  exit_weighed_at TIMESTAMPTZ NULL,
  net_weight_kg NUMERIC(18,3) NULL,
  stream_breakdown JSONB NULL DEFAULT {},
  scale_code VARCHAR(50) NULL,
  weighed_by BIGINT NULL,
  sync_status VARCHAR(30) NOT NULL DEFAULT SYNCED,
  device_captured_at TIMESTAMPTZ NULL,
  offline_integrity_hash VARCHAR(128) NULL,
  synced_at TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NULL DEFAULT {},
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK unload_request_id -> unload_requests.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK manifest_unload_id -> manifest_unloads.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK weighed_by -> users.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- Nota: `stream_breakdown` es JSONB simplificado (desglose por corriente/residuo, RN-RCP-067) — si se necesita reportería relacional, normalizar a tabla `weight_ticket_breakdowns` en una iteración futura.

-- difference_tickets: Ticket de diferencias/rechazos de recepción (CU-071.4-.5)
CREATE TABLE difference_tickets (
  id BIGINT PK AUTOINCREMENT,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  tenant_organization_id BIGINT NOT NULL,
  ticket_number VARCHAR(50) NOT NULL UNIQUE,
  manifest_unload_item_id BIGINT NOT NULL,
  weight_ticket_id BIGINT NULL,
  requested_quantity NUMERIC(18,3) NULL,
  received_quantity NUMERIC(18,3) NULL,
  rejected_quantity NUMERIC(18,3) NULL DEFAULT 0,
  difference_quantity NUMERIC(18,3) NULL,
  discrepancy_reason TEXT NOT NULL,
  conciliation_id BIGINT NULL,
  sync_status VARCHAR(30) NOT NULL DEFAULT SYNCED,
  device_captured_at TIMESTAMPTZ NULL,
  offline_integrity_hash VARCHAR(128) NULL,
  synced_at TIMESTAMPTZ NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
  -- FK tenant_organization_id -> organizations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK manifest_unload_item_id -> manifest_unload_items.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK weight_ticket_id -> weight_tickets.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- FK conciliation_id -> conciliations.id  ON DELETE ??SIN DEFINIR??  ON UPDATE ??SIN DEFINIR??
  -- Nota: `discrepancy_reason` es texto libre (D-RCP-03, sin catálogo `difference_reasons`).
