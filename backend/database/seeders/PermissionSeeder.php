<?php

namespace Database\Seeders;

use App\Models\Permission;
use Illuminate\Database\Seeder;

/**
 * Catálogo de Permisos.md, módulo Seguridad -- catálogo fijo sembrado por
 * código (CU-008 "Gestionar Permisos" es de solo lectura desde la UI/API:
 * no hay POST/PUT/DELETE de permisos, ver PermissionController). Códigos
 * preservados EXACTAMENTE tal como están documentados -- no reinterpretar.
 *
 * `governance.view`/`security.view` se excluyen a propósito (D-U12: son
 * cargos del eje 3 -- positions --, no permisos RBAC reales).
 *
 * `is_critical` (confirmado con el usuario, lote 2): marca los 5 permisos
 * de mayor impacto (borrado y acciones de asignación/reinicio de
 * credenciales) -- el resto (create/read/update/activate/deactivate) queda
 * en `false`. Alimenta el `risk_level` calculado de RoleController::show().
 *
 * `users.activate`/`users.deactivate` (hallazgo Medio, especialista-
 * seguridad, 2026-07-13, lote 3): antes un solo permiso `users.activate`
 * cubría ambas direcciones, violando mínimo privilegio -- se separan en dos
 * códigos nuevos (16 permisos en total). `users.deactivate` NO se marca
 * `is_critical` -- mismo criterio que el `users.activate` original (no
 * estaba en la lista de 5 confirmada por el usuario); es una decisión de
 * este lote, ajustable si el negocio lo pide.
 *
 * `priority_level` (confirmado con el usuario, cierre de brecha CRUD de
 * Permisos vs. Figma): 1=Bajo, 2=Medio, 3=Alto, 4=Crítico -- mapeo EXACTO,
 * independiente de `is_critical` (p. ej. `users.reset-password` es
 * `is_critical=true` pero `priority_level=3`, no 4).
 *
 * `geography.*`/`branch_types.*`/`organizational_areas.*` (Batch 1/3 de
 * Catálogos Maestros, 2026-07-15): GAP señalado explícitamente al hilo
 * principal -- no existía ningún permiso para estos 3 catálogos antes de
 * este lote (`Catálogo de Permisos.md` no fue consultado, sin acceso al
 * repo de documentación en esta sesión). Se siguió el MISMO patrón exacto
 * ya usado por `waste_streams`/`un_codes` (un `.read` + un `.manage` por
 * catálogo, `.manage` cubre create/update/activate/deactivate) por
 * consistencia de código, NO por confirmación de negocio -- pendiente de
 * validar contra el catálogo canónico cuando esté disponible.
 *
 * `hazard_characteristics.*`/`waste_categories.*`/`physical_states.*`
 * (Batch 2/3 de Catálogos Maestros, RESPEL, 2026-07-15): mismo GAP y mismo
 * patrón que el aviso anterior -- 3 catálogos nuevos sin permiso previo,
 * sembrados con el mismo esquema `.read`/`.manage` por consistencia de
 * código, no por confirmación de negocio.
 *
 * `packaging_types.*`/`packaging_conditions.*`/`vehicle_types.*` (Batch 3/3
 * -- último -- de Catálogos Maestros, 2026-07-15): mismo GAP y mismo patrón
 * que los avisos anteriores -- 3 catálogos nuevos sin permiso previo,
 * sembrados con el mismo esquema `.read`/`.manage` por consistencia de
 * código, no por confirmación de negocio. `packaging_conditions`/
 * `vehicle_types` además tienen datos PROVISIONALES (ver AVISO en sus
 * seeders/migraciones) -- el nombre del permiso no depende de eso, solo se
 * señala aquí por completitud.
 *
 * `contacts.*`/`branches.*` (CRUD de Sedes + Contactos, 2026-07-15): mismo
 * GAP declarado explícitamente -- el catálogo de permisos hoy NO cubre
 * `branches`/`contacts` (confirmado, plan de este lote). `contacts` sigue el
 * criterio "solo revocar" (SIN `.delete`, igual que el resto del catálogo:
 * `.read`/`.create`/`.update`). `branches` además separa `.activate`/
 * `.deactivate` de `.update` (mismo criterio granular ya usado en
 * `users.activate`/`users.deactivate`) -- ninguno de los dos grupos es
 * `is_critical`.
 *
 * `vehicles.*` (CRUD de Vehículos, CU-051, 2026-07-16): el catálogo de
 * permisos usa el plural "vehicles" (consistente con el resto de módulos ya
 * sembrados) aunque las specs CU citan el singular `vehicle.*` -- gap de
 * nomenclatura YA CONOCIDO del proyecto (ver `Catálogo de Permisos.md`), no
 * se repite aquí. Mismo criterio granular que `branches.*`: `.activate`/
 * `.deactivate` separados de `.update`. Ninguno es `is_critical`.
 *
 * `treatments.*`/`branch_treatments.*` (Módulo Tratamiento, RN-063/D-R02,
 * 2026-07-17): mismo GAP de "sin fuente confirmada en Catálogo de
 * Permisos.md" ya señalado arriba para otros módulos -- se sigue el mismo
 * patrón granular que `branches.*`/`vehicles.*` (`.activate`/`.deactivate`
 * separados de `.update`). Ninguno es `is_critical`. `treatments.read` se
 * asigna hoy SOLO a ADMINISTRADOR (mismo criterio que el resto del
 * catálogo) -- pendiente señalado: los Gestores (sin rol RBAC propio
 * sembrado todavía, ver RoleSeeder) necesitarán este permiso de lectura
 * cuando exista un rol de negocio para ellos.
 *
 * `waste_types.*`/`measurement_units.*`/`generation_frequencies.*`/
 * `waste_operational_statuses.*` (Núcleo del Módulo Residuos, 2026-07-18):
 * mismo GAP y mismo patrón `.read`/`.manage` que el resto de catálogos
 * maestros del proyecto -- sin fuente confirmada en `Catálogo de
 * Permisos.md`. `wastes.*` (CRUD + workflow de declaración) sigue el mismo
 * criterio granular que `branches.*`/`vehicles.*`/`branch_treatments.*`
 * (`.activate`/`.deactivate` separados de `.update`), más 4 permisos
 * dedicados a las transiciones de workflow (`.submit`/`.review`/`.classify`/
 * `.reject`) -- ninguno es `is_critical`. Acceso dual SIN restricción de
 * business_role (confirmado por el usuario: "cualquier rol de negocio puede
 * registrar residuos").
 *
 * `treatment_approvals.*` (Evaluación del Gestor, `waste_treatment_approvals`,
 * 2026-07-19): mismo GAP ya documentado -- sin fuente confirmada en
 * `Catálogo de Permisos.md`. `.create` lo necesita el GENERADOR (dueño del
 * residuo, sin ser necesariamente Gestor) para solicitar la evaluación desde
 * su propio residuo; `.read`/`.update` los necesita el GESTOR para
 * gestionar las suyas. Se separa `.evaluate` (las 4 transiciones de
 * technical_status/commercial_status) de `.update` (edición de términos
 * comerciales/técnicos) -- ver docblock de `WasteTreatmentApprovalPolicy`
 * para el razonamiento completo de esta decisión. Ninguno es `is_critical`.
 *
 * `preapproved_wastes.*` (Residuos Preaprobados, 2026-07-19): mismo GAP ya
 * documentado -- sin fuente confirmada en `Catálogo de Permisos.md`. Mismo
 * patrón `.read`/`.manage` que `organizational_areas.*` (un solo `.manage`
 * cubre create/update/activate/deactivate) -- ver docblock de
 * `PreapprovedWasteController`/`PreapprovedWastePolicy` para el
 * razonamiento completo. Ninguno es `is_critical`.
 *
 * `transport_schedules.*` (Módulo Programación Logística, Fase 2a,
 * 2026-07-19): mismo GAP ya documentado -- sin fuente confirmada en
 * `Catálogo de Permisos.md`. Mismo criterio granular que
 * `service_requests.*`: `.update` cubre tanto la edición de cabecera
 * (mientras esté en Borrador/Pend. Asignación) como las transiciones
 * humanas del workflow (`submit()`/`confirm()`), `.cancel` se separa aparte
 * (mismo criterio que `service_requests.cancel`). Ninguno es `is_critical`.
 *
 * `workflows.manage` (CU-021 "Configurar Workflow", 2026-07-20): permiso
 * ÚNICO (no se separa `.read`/`.manage`, decisión explícita del hallazgo de
 * `especialista-seguridad` que pidió "un permiso dedicado nuevo
 * `workflows.manage`") -- cubre TODO el ciclo de administración de un
 * workflow (ver/clonar/editar transiciones/versionar/publicar) vía
 * `WorkflowPolicy`. No es `is_critical` (criterio consistente con el resto
 * de catálogos de este lote, ninguno de los `.manage` genéricos lo es).
 *
 * `service_requests.*` (Módulo Solicitudes de Servicio, Fase 1b, 2026-07-19):
 * mismo GAP ya documentado en el resto del catálogo -- sin fuente confirmada
 * en `Catálogo de Permisos.md`. Se separa `.evaluate` (las transiciones de
 * `item_status_id` por ítem, `ServiceRequestApprovalService::approveItem()`/
 * `rejectItem()`) de `.update` (edición de campos de cabecera en Borrador) --
 * mismo criterio granular ya usado para `treatment_approvals.update` vs.
 * `.evaluate`: "aprobar/rechazar" es una acción de mayor impacto que "editar
 * un campo", y podría asignarse a un cargo distinto del Gestor sin dar
 * acceso de edición de la cabecera (que ni siquiera le pertenece). `.cancel`
 * también se separa de `.update` (mismo criterio que `wastes.activate`/
 * `.deactivate` vs. `.update`). Ninguno es `is_critical`.
 *
 * `transport_personnel.*`/`transport_routes.*` (gap real de contrato
 * detectado por el agente de frontend, Módulo Programación Logística,
 * 2026-07-19): mismo GAP ya documentado en el resto del catálogo -- sin
 * fuente confirmada en `Catálogo de Permisos.md`. `transport_personnel`
 * sigue el criterio granular de `vehicles.*` pero reducido a SOLO 3 códigos
 * (`.read`/`.create`/`.update`, sin `.activate`/`.deactivate`): a diferencia
 * de `Vehicle` (que separa `operational_status` de `is_active`),
 * `transport_personnel` solo tiene `is_active`, así que se gestiona
 * directamente vía `.update` -- ver docblock de
 * `TransportPersonnelController`. `transport_routes` es CRUD mínimo (sin
 * `.update` -- decisión de este lote, `transport_routes` hoy es un
 * contenedor simple sin workflow propio, ver docblock de
 * `TransportRouteController`), solo `.read`/`.create`. Ninguno es
 * `is_critical`.
 *
 * `manifest_loads.*` (Módulo Manifiesto de Cargue, Fase 3, 2026-07-20):
 * mismo GAP ya documentado -- sin fuente confirmada en `Catálogo de
 * Permisos.md` (el nombre de tabla real es `manifest_loads`, se sigue esa
 * convención de nombrar el permiso como la tabla, igual que
 * `transport_schedules`/`service_requests`). 5 códigos, mismo criterio
 * granular que `service_requests.*`: `.create` cubre `store()` (creación +
 * derivación automática de branch/carrier/vehicle/personnel/items desde el
 * `transport_schedule_id`); `.update` cubre las transiciones humanas del
 * workflow que opera el mismo actor Gestor/Logística (`generate()`/
 * `startTransit()`, mismo criterio que `transport_schedules.update` cubre
 * `submit()`/`confirm()`); `.sign` se separa aparte -- acción de mayor
 * sensibilidad legal (firma de un documento regulatorio), potencialmente
 * ejercida por un cargo/actor distinto al que crea/gestiona la programación
 * (incluye al lado Generador, que NO tiene ningún otro permiso de este
 * módulo salvo `.read`/`.sign`); `.cancel` aparte, mismo criterio que
 * `transport_schedules.cancel`. Ninguno es `is_critical`.
 *
 * `branch_locations.*` (Fase 4 "Cita de Recepción en Planta", CRUD mínimo de
 * Muelles): mismo GAP ya documentado -- sin fuente confirmada en `Catálogo
 * de Permisos.md`. Mismo criterio granular que `TransportPersonnelController`
 * (solo 3 códigos `.read`/`.create`/`.update`, `is_active` se gestiona vía
 * `.update`, sin `.activate`/`.deactivate` dedicados). Ninguno es `is_critical`.
 *
 * `unload_requests.*` (Fase 4, D-PRG-02/D-PRG-13): mismo GAP ya documentado.
 * 4 códigos: `.read`; `.create` (creación manual "anticipada", D-RCP);
 * `.update` (cubre `submit()`, lado transportador -- mismo criterio que
 * `transport_schedules.update` cubriendo `submit()`/`confirm()`); `.decide`
 * (cubre `approve()`/`reject()`, lado receptor -- se separa de `.update`
 * porque son 2 organizaciones DISTINTAS las que ejercen cada acción, mismo
 * criterio de separación que `treatment_approvals.evaluate`/
 * `service_requests.evaluate` frente a `.update`). Ninguno es `is_critical`.
 *
 * `plant_reception_schedules.*` (Fase 4, D-PRG-02): mismo GAP ya
 * documentado. 2 códigos: `.read`; `.manage` (permiso ÚNICO cubre
 * `propose()`/`counterPropose()`/`confirm()`/`reschedule()` -- mismo
 * criterio que `workflows.manage`, la mecánica de negociación bilateral no
 * se separa por acción porque AMBOS lados accesibles ejercen las 4 por
 * igual, ver `PlantReceptionSchedulePolicy`). Ninguno es `is_critical`.
 *
 * `gestor_carrier_authorizations.*` (Fase 4, revisión especialista-
 * seguridad -- "Modalidad 3", Transportador independiente contratado por un
 * Gestor): mismo GAP ya documentado. 3 códigos: `.read` (ambos lados
 * accesibles); `.create` (solo el Gestor dueño autoriza, mismo criterio que
 * `transport_schedules.create`); `.revoke` (se separa de `.create`, mismo
 * criterio granular que `wastes.activate`/`.deactivate` -- revocar es una
 * acción de mayor impacto operativo, potencialmente ejercida por un cargo
 * distinto). Ninguno es `is_critical`.
 *
 * `manifest_unloads.*` (Módulo Manifiesto de Descargue, Fase 5, última fase
 * del plan): mismo GAP ya documentado -- sin fuente confirmada en `Catálogo
 * de Permisos.md`. 5 códigos, MISMO criterio granular que `manifest_loads.*`
 * (Fase 3), con los lados invertidos (aquí "gestiona" el RECEPTOR, no el
 * transportador): `.create` cubre `store()` (creación + derivación
 * automática de branch/organization/vehicle/personnel/items desde la
 * `unload_request_id`); `.update` cubre `inspectItems()`/`generate()`/
 * `complete()` (inspección física + transiciones humanas del workflow, todas
 * ejercidas por el mismo actor receptor); `.sign` se separa aparte -- firma
 * de un documento regulatorio, ejercida también por el lado transportador
 * (que NO tiene ningún otro permiso de este módulo salvo `.read`/`.sign`);
 * `.cancel` aparte, mismo criterio que `manifest_loads.cancel`. Ninguno es
 * `is_critical`.
 */
class PermissionSeeder extends Seeder
{
    private const CRITICAL_CODES = [
        'users.delete',
        'roles.delete',
        'users.reset-password',
        'roles.assign',
        'permissions.assign',
    ];

    /** @var array<int, list<string>> */
    private const PRIORITY_LEVELS = [
        1 => ['users.read', 'roles.read', 'permissions.read', 'audit.read', 'waste_streams.read', 'un_codes.read', 'geography.read', 'branch_types.read', 'organizational_areas.read', 'hazard_characteristics.read', 'waste_categories.read', 'physical_states.read', 'packaging_types.read', 'packaging_conditions.read', 'vehicle_types.read', 'contacts.read', 'branches.read', 'vehicles.read', 'treatments.read', 'branch_treatments.read', 'waste_types.read', 'measurement_units.read', 'generation_frequencies.read', 'waste_operational_statuses.read', 'wastes.read', 'treatment_approvals.read', 'preapproved_wastes.read', 'service_requests.read', 'transport_schedules.read', 'transport_personnel.read', 'transport_routes.read', 'manifest_loads.read', 'branch_locations.read', 'unload_requests.read', 'plant_reception_schedules.read', 'gestor_carrier_authorizations.read', 'manifest_unloads.read'],
        2 => ['users.create', 'users.update', 'users.activate', 'users.deactivate', 'roles.create', 'roles.update', 'audit.export', 'waste_streams.manage', 'un_codes.manage', 'geography.manage', 'branch_types.manage', 'organizational_areas.manage', 'hazard_characteristics.manage', 'waste_categories.manage', 'physical_states.manage', 'packaging_types.manage', 'packaging_conditions.manage', 'vehicle_types.manage', 'contacts.create', 'contacts.update', 'branches.create', 'branches.update', 'branches.activate', 'branches.deactivate', 'vehicles.create', 'vehicles.update', 'vehicles.activate', 'vehicles.deactivate', 'treatments.create', 'treatments.update', 'treatments.activate', 'treatments.deactivate', 'branch_treatments.create', 'branch_treatments.update', 'branch_treatments.activate', 'branch_treatments.deactivate', 'waste_types.manage', 'measurement_units.manage', 'generation_frequencies.manage', 'waste_operational_statuses.manage', 'wastes.create', 'wastes.update', 'wastes.activate', 'wastes.deactivate', 'wastes.submit', 'wastes.review', 'wastes.classify', 'wastes.reject', 'treatment_approvals.create', 'treatment_approvals.update', 'treatment_approvals.evaluate', 'preapproved_wastes.manage', 'workflows.manage', 'service_requests.create', 'service_requests.update', 'service_requests.cancel', 'service_requests.evaluate', 'transport_schedules.create', 'transport_schedules.update', 'transport_schedules.cancel', 'transport_personnel.create', 'transport_personnel.update', 'transport_routes.create', 'manifest_loads.create', 'manifest_loads.update', 'manifest_loads.sign', 'manifest_loads.cancel', 'branch_locations.create', 'branch_locations.update', 'unload_requests.create', 'unload_requests.update', 'unload_requests.decide', 'plant_reception_schedules.manage', 'gestor_carrier_authorizations.create', 'gestor_carrier_authorizations.revoke', 'manifest_unloads.create', 'manifest_unloads.update', 'manifest_unloads.sign', 'manifest_unloads.cancel'],
        3 => ['users.reset-password', 'roles.assign', 'permissions.assign'],
        4 => ['users.delete', 'roles.delete'],
    ];

    public function run(): void
    {
        $permissions = [
            ['code' => 'users.create', 'name' => 'Crear usuarios', 'module' => 'users', 'action' => 'create'],
            ['code' => 'users.read', 'name' => 'Consultar usuarios', 'module' => 'users', 'action' => 'read'],
            ['code' => 'users.update', 'name' => 'Modificar usuarios', 'module' => 'users', 'action' => 'update'],
            ['code' => 'users.delete', 'name' => 'Eliminar usuarios', 'module' => 'users', 'action' => 'delete'],
            ['code' => 'users.activate', 'name' => 'Activar usuarios', 'module' => 'users', 'action' => 'activate'],
            ['code' => 'users.deactivate', 'name' => 'Inactivar usuarios', 'module' => 'users', 'action' => 'deactivate'],
            ['code' => 'users.reset-password', 'name' => 'Reiniciar credenciales de usuario', 'module' => 'users', 'action' => 'reset-password'],

            ['code' => 'roles.create', 'name' => 'Crear roles', 'module' => 'roles', 'action' => 'create'],
            ['code' => 'roles.read', 'name' => 'Consultar roles', 'module' => 'roles', 'action' => 'read'],
            ['code' => 'roles.update', 'name' => 'Modificar roles', 'module' => 'roles', 'action' => 'update'],
            ['code' => 'roles.delete', 'name' => 'Eliminar roles', 'module' => 'roles', 'action' => 'delete'],
            ['code' => 'roles.assign', 'name' => 'Asignar roles a usuario', 'module' => 'roles', 'action' => 'assign'],

            ['code' => 'permissions.read', 'name' => 'Consultar catálogo de permisos', 'module' => 'permissions', 'action' => 'read'],
            ['code' => 'permissions.assign', 'name' => 'Asignar permisos a rol', 'module' => 'permissions', 'action' => 'assign'],

            ['code' => 'audit.read', 'name' => 'Consultar auditoría', 'module' => 'audit', 'action' => 'read'],
            ['code' => 'audit.export', 'name' => 'Exportar auditoría', 'module' => 'audit', 'action' => 'export'],

            // Primer módulo real del dominio Residuos (catálogos "Corrientes
            // de Residuos" Y/A y "Códigos UN") -- `manage` cubre crear/
            // editar/activar/inactivar/importar, mismo criterio de
            // simplicidad que `permissions.assign`.
            ['code' => 'waste_streams.read', 'name' => 'Consultar corrientes de residuos', 'module' => 'waste_streams', 'action' => 'read'],
            ['code' => 'waste_streams.manage', 'name' => 'Gestionar corrientes de residuos', 'module' => 'waste_streams', 'action' => 'manage'],
            ['code' => 'un_codes.read', 'name' => 'Consultar códigos UN', 'module' => 'un_codes', 'action' => 'read'],
            ['code' => 'un_codes.manage', 'name' => 'Gestionar códigos UN', 'module' => 'un_codes', 'action' => 'manage'],

            // Batch 1/3 de Catálogos Maestros -- ver aviso de GAP en el
            // docblock de esta clase.
            ['code' => 'geography.read', 'name' => 'Consultar geografía (países/departamentos/municipios/localidades)', 'module' => 'geography', 'action' => 'read'],
            ['code' => 'geography.manage', 'name' => 'Activar/inactivar valores del catálogo geográfico', 'module' => 'geography', 'action' => 'manage'],
            ['code' => 'branch_types.read', 'name' => 'Consultar tipos de sucursal', 'module' => 'branch_types', 'action' => 'read'],
            ['code' => 'branch_types.manage', 'name' => 'Gestionar tipos de sucursal', 'module' => 'branch_types', 'action' => 'manage'],
            ['code' => 'organizational_areas.read', 'name' => 'Consultar áreas organizacionales', 'module' => 'organizational_areas', 'action' => 'read'],
            ['code' => 'organizational_areas.manage', 'name' => 'Gestionar áreas organizacionales', 'module' => 'organizational_areas', 'action' => 'manage'],

            // Batch 2/3 de Catálogos Maestros (RESPEL) -- ver aviso de GAP
            // en el docblock de esta clase.
            ['code' => 'hazard_characteristics.read', 'name' => 'Consultar características de peligrosidad', 'module' => 'hazard_characteristics', 'action' => 'read'],
            ['code' => 'hazard_characteristics.manage', 'name' => 'Gestionar características de peligrosidad', 'module' => 'hazard_characteristics', 'action' => 'manage'],
            ['code' => 'waste_categories.read', 'name' => 'Consultar categorías de residuo', 'module' => 'waste_categories', 'action' => 'read'],
            ['code' => 'waste_categories.manage', 'name' => 'Gestionar categorías de residuo', 'module' => 'waste_categories', 'action' => 'manage'],
            ['code' => 'physical_states.read', 'name' => 'Consultar estados físicos', 'module' => 'physical_states', 'action' => 'read'],
            ['code' => 'physical_states.manage', 'name' => 'Gestionar estados físicos', 'module' => 'physical_states', 'action' => 'manage'],

            // Batch 3/3 (último) de Catálogos Maestros -- ver aviso de GAP
            // en el docblock de esta clase. `packaging_conditions`/
            // `vehicle_types` tienen datos PROVISIONALES (ver AVISO en sus
            // seeders/migraciones).
            ['code' => 'packaging_types.read', 'name' => 'Consultar tipos de embalaje', 'module' => 'packaging_types', 'action' => 'read'],
            ['code' => 'packaging_types.manage', 'name' => 'Gestionar tipos de embalaje', 'module' => 'packaging_types', 'action' => 'manage'],
            ['code' => 'packaging_conditions.read', 'name' => 'Consultar estados del embalaje', 'module' => 'packaging_conditions', 'action' => 'read'],
            ['code' => 'packaging_conditions.manage', 'name' => 'Gestionar estados del embalaje', 'module' => 'packaging_conditions', 'action' => 'manage'],
            ['code' => 'vehicle_types.read', 'name' => 'Consultar tipos de vehículo', 'module' => 'vehicle_types', 'action' => 'read'],
            ['code' => 'vehicle_types.manage', 'name' => 'Gestionar tipos de vehículo', 'module' => 'vehicle_types', 'action' => 'manage'],

            // CRUD de Sedes + Contactos vs. Figma -- ver aviso de GAP en el
            // docblock de esta clase.
            ['code' => 'contacts.read', 'name' => 'Consultar contactos de organización', 'module' => 'contacts', 'action' => 'read'],
            ['code' => 'contacts.create', 'name' => 'Vincular contactos a organización', 'module' => 'contacts', 'action' => 'create'],
            ['code' => 'contacts.update', 'name' => 'Modificar vínculos de contacto', 'module' => 'contacts', 'action' => 'update'],

            ['code' => 'branches.read', 'name' => 'Consultar sucursales', 'module' => 'branches', 'action' => 'read'],
            ['code' => 'branches.create', 'name' => 'Crear sucursales', 'module' => 'branches', 'action' => 'create'],
            ['code' => 'branches.update', 'name' => 'Modificar sucursales', 'module' => 'branches', 'action' => 'update'],
            ['code' => 'branches.activate', 'name' => 'Activar sucursales', 'module' => 'branches', 'action' => 'activate'],
            ['code' => 'branches.deactivate', 'name' => 'Inactivar sucursales', 'module' => 'branches', 'action' => 'deactivate'],

            // CRUD de Vehículos vs. CU-051 -- ver aviso de nomenclatura en
            // el docblock de esta clase.
            ['code' => 'vehicles.read', 'name' => 'Consultar vehículos', 'module' => 'vehicles', 'action' => 'read'],
            ['code' => 'vehicles.create', 'name' => 'Crear vehículos', 'module' => 'vehicles', 'action' => 'create'],
            ['code' => 'vehicles.update', 'name' => 'Modificar vehículos', 'module' => 'vehicles', 'action' => 'update'],
            ['code' => 'vehicles.activate', 'name' => 'Activar vehículos', 'module' => 'vehicles', 'action' => 'activate'],
            ['code' => 'vehicles.deactivate', 'name' => 'Inactivar vehículos', 'module' => 'vehicles', 'action' => 'deactivate'],

            // Módulo Tratamiento (RN-063/D-R02) -- ver aviso de GAP en el
            // docblock de esta clase. `treatments` es el catálogo GLOBAL
            // (solo platform staff escribe, ver TreatmentPolicy);
            // `branch_treatments` es la habilitación por sede (acceso dual).
            ['code' => 'treatments.read', 'name' => 'Consultar tratamientos', 'module' => 'treatments', 'action' => 'read'],
            ['code' => 'treatments.create', 'name' => 'Crear tratamientos', 'module' => 'treatments', 'action' => 'create'],
            ['code' => 'treatments.update', 'name' => 'Modificar tratamientos', 'module' => 'treatments', 'action' => 'update'],
            ['code' => 'treatments.activate', 'name' => 'Activar tratamientos', 'module' => 'treatments', 'action' => 'activate'],
            ['code' => 'treatments.deactivate', 'name' => 'Inactivar tratamientos', 'module' => 'treatments', 'action' => 'deactivate'],

            ['code' => 'branch_treatments.read', 'name' => 'Consultar tratamientos por sede', 'module' => 'branch_treatments', 'action' => 'read'],
            ['code' => 'branch_treatments.create', 'name' => 'Habilitar tratamientos por sede', 'module' => 'branch_treatments', 'action' => 'create'],
            ['code' => 'branch_treatments.update', 'name' => 'Modificar tratamientos por sede', 'module' => 'branch_treatments', 'action' => 'update'],
            ['code' => 'branch_treatments.activate', 'name' => 'Activar tratamientos por sede', 'module' => 'branch_treatments', 'action' => 'activate'],
            ['code' => 'branch_treatments.deactivate', 'name' => 'Inactivar tratamientos por sede', 'module' => 'branch_treatments', 'action' => 'deactivate'],

            // Núcleo del Módulo Residuos (declaración + clasificación) --
            // ver aviso de GAP en el docblock de esta clase. 4 catálogos
            // globales nuevos + CRUD/workflow de `wastes`.
            ['code' => 'waste_types.read', 'name' => 'Consultar tipos de residuo', 'module' => 'waste_types', 'action' => 'read'],
            ['code' => 'waste_types.manage', 'name' => 'Gestionar tipos de residuo', 'module' => 'waste_types', 'action' => 'manage'],
            ['code' => 'measurement_units.read', 'name' => 'Consultar unidades de medida', 'module' => 'measurement_units', 'action' => 'read'],
            ['code' => 'measurement_units.manage', 'name' => 'Gestionar unidades de medida', 'module' => 'measurement_units', 'action' => 'manage'],
            ['code' => 'generation_frequencies.read', 'name' => 'Consultar frecuencias de generación', 'module' => 'generation_frequencies', 'action' => 'read'],
            ['code' => 'generation_frequencies.manage', 'name' => 'Gestionar frecuencias de generación', 'module' => 'generation_frequencies', 'action' => 'manage'],
            ['code' => 'waste_operational_statuses.read', 'name' => 'Consultar estados operativos de residuo', 'module' => 'waste_operational_statuses', 'action' => 'read'],
            ['code' => 'waste_operational_statuses.manage', 'name' => 'Gestionar estados operativos de residuo', 'module' => 'waste_operational_statuses', 'action' => 'manage'],

            ['code' => 'wastes.read', 'name' => 'Consultar residuos', 'module' => 'wastes', 'action' => 'read'],
            ['code' => 'wastes.create', 'name' => 'Crear residuos', 'module' => 'wastes', 'action' => 'create'],
            ['code' => 'wastes.update', 'name' => 'Modificar residuos', 'module' => 'wastes', 'action' => 'update'],
            ['code' => 'wastes.activate', 'name' => 'Activar residuos', 'module' => 'wastes', 'action' => 'activate'],
            ['code' => 'wastes.deactivate', 'name' => 'Inactivar residuos', 'module' => 'wastes', 'action' => 'deactivate'],
            ['code' => 'wastes.submit', 'name' => 'Declarar residuos (Borrador -> Declarado)', 'module' => 'wastes', 'action' => 'submit'],
            ['code' => 'wastes.review', 'name' => 'Iniciar revisión de residuos (Declarado -> En Revisión)', 'module' => 'wastes', 'action' => 'review'],
            ['code' => 'wastes.classify', 'name' => 'Clasificar residuos (En Revisión -> Clasificado)', 'module' => 'wastes', 'action' => 'classify'],
            ['code' => 'wastes.reject', 'name' => 'Rechazar residuos (a Borrador)', 'module' => 'wastes', 'action' => 'reject'],

            // Evaluación del Gestor (waste_treatment_approvals) -- ver
            // aviso de GAP en el docblock de esta clase.
            ['code' => 'treatment_approvals.read', 'name' => 'Consultar evaluaciones de tratamiento', 'module' => 'treatment_approvals', 'action' => 'read'],
            ['code' => 'treatment_approvals.create', 'name' => 'Solicitar evaluación de tratamiento', 'module' => 'treatment_approvals', 'action' => 'create'],
            ['code' => 'treatment_approvals.update', 'name' => 'Modificar términos de evaluación de tratamiento', 'module' => 'treatment_approvals', 'action' => 'update'],
            ['code' => 'treatment_approvals.evaluate', 'name' => 'Aprobar/rechazar evaluación de tratamiento (técnico/comercial)', 'module' => 'treatment_approvals', 'action' => 'evaluate'],

            // Residuos Preaprobados -- ver aviso de GAP en el docblock de
            // esta clase.
            ['code' => 'preapproved_wastes.read', 'name' => 'Consultar residuos preaprobados', 'module' => 'preapproved_wastes', 'action' => 'read'],
            ['code' => 'preapproved_wastes.manage', 'name' => 'Gestionar residuos preaprobados', 'module' => 'preapproved_wastes', 'action' => 'manage'],

            // CU-021 "Configurar Workflow" -- ver aviso de GAP en el docblock
            // de esta clase. Permiso ÚNICO (no `.read`/`.manage` separados),
            // decisión explícita del hallazgo de especialista-seguridad.
            ['code' => 'workflows.manage', 'name' => 'Configurar workflows (transiciones, versiones, publicación)', 'module' => 'workflows', 'action' => 'manage'],

            // Módulo Solicitudes de Servicio, Fase 1b -- ver aviso de GAP en
            // el docblock de esta clase.
            ['code' => 'service_requests.read', 'name' => 'Consultar solicitudes de servicio', 'module' => 'service_requests', 'action' => 'read'],
            ['code' => 'service_requests.create', 'name' => 'Crear solicitudes de servicio', 'module' => 'service_requests', 'action' => 'create'],
            ['code' => 'service_requests.update', 'name' => 'Modificar/enviar solicitudes de servicio', 'module' => 'service_requests', 'action' => 'update'],
            ['code' => 'service_requests.cancel', 'name' => 'Cancelar solicitudes de servicio', 'module' => 'service_requests', 'action' => 'cancel'],
            ['code' => 'service_requests.evaluate', 'name' => 'Aprobar/rechazar ítems de solicitud de servicio', 'module' => 'service_requests', 'action' => 'evaluate'],

            // Módulo Programación Logística, Fase 2a -- ver aviso de GAP en
            // el docblock de esta clase.
            ['code' => 'transport_schedules.read', 'name' => 'Consultar programaciones de transporte', 'module' => 'transport_schedules', 'action' => 'read'],
            ['code' => 'transport_schedules.create', 'name' => 'Crear programaciones de transporte', 'module' => 'transport_schedules', 'action' => 'create'],
            ['code' => 'transport_schedules.update', 'name' => 'Modificar/confirmar programaciones de transporte', 'module' => 'transport_schedules', 'action' => 'update'],
            ['code' => 'transport_schedules.cancel', 'name' => 'Cancelar programaciones de transporte', 'module' => 'transport_schedules', 'action' => 'cancel'],

            // CRUD de Conductores + CRUD mínimo de Rutas -- gap real de
            // contrato detectado por el agente de frontend (ver aviso de
            // GAP en el docblock de esta clase).
            ['code' => 'transport_personnel.read', 'name' => 'Consultar conductores', 'module' => 'transport_personnel', 'action' => 'read'],
            ['code' => 'transport_personnel.create', 'name' => 'Crear conductores', 'module' => 'transport_personnel', 'action' => 'create'],
            ['code' => 'transport_personnel.update', 'name' => 'Modificar conductores', 'module' => 'transport_personnel', 'action' => 'update'],

            ['code' => 'transport_routes.read', 'name' => 'Consultar rutas de transporte', 'module' => 'transport_routes', 'action' => 'read'],
            ['code' => 'transport_routes.create', 'name' => 'Crear rutas de transporte', 'module' => 'transport_routes', 'action' => 'create'],

            // Módulo Manifiesto de Cargue, Fase 3 -- ver aviso de GAP en el
            // docblock de esta clase.
            ['code' => 'manifest_loads.read', 'name' => 'Consultar manifiestos de cargue', 'module' => 'manifest_loads', 'action' => 'read'],
            ['code' => 'manifest_loads.create', 'name' => 'Crear manifiestos de cargue', 'module' => 'manifest_loads', 'action' => 'create'],
            ['code' => 'manifest_loads.update', 'name' => 'Generar/iniciar tránsito de manifiestos de cargue', 'module' => 'manifest_loads', 'action' => 'update'],
            ['code' => 'manifest_loads.sign', 'name' => 'Firmar manifiestos de cargue (generador/conductor)', 'module' => 'manifest_loads', 'action' => 'sign'],
            ['code' => 'manifest_loads.cancel', 'name' => 'Cancelar manifiestos de cargue', 'module' => 'manifest_loads', 'action' => 'cancel'],

            // Fase 4 "Cita de Recepción en Planta (bilateral)" -- ver aviso
            // de GAP en el docblock de esta clase.
            ['code' => 'branch_locations.read', 'name' => 'Consultar muelles', 'module' => 'branch_locations', 'action' => 'read'],
            ['code' => 'branch_locations.create', 'name' => 'Crear muelles', 'module' => 'branch_locations', 'action' => 'create'],
            ['code' => 'branch_locations.update', 'name' => 'Modificar muelles', 'module' => 'branch_locations', 'action' => 'update'],

            ['code' => 'unload_requests.read', 'name' => 'Consultar solicitudes de descargue', 'module' => 'unload_requests', 'action' => 'read'],
            ['code' => 'unload_requests.create', 'name' => 'Crear solicitudes de descargue', 'module' => 'unload_requests', 'action' => 'create'],
            ['code' => 'unload_requests.update', 'name' => 'Enviar solicitudes de descargue', 'module' => 'unload_requests', 'action' => 'update'],
            ['code' => 'unload_requests.decide', 'name' => 'Aprobar/rechazar solicitudes de descargue', 'module' => 'unload_requests', 'action' => 'decide'],

            ['code' => 'plant_reception_schedules.read', 'name' => 'Consultar citas de recepción en planta', 'module' => 'plant_reception_schedules', 'action' => 'read'],
            ['code' => 'plant_reception_schedules.manage', 'name' => 'Proponer/contraproponer/confirmar/reprogramar citas de recepción en planta', 'module' => 'plant_reception_schedules', 'action' => 'manage'],

            // Fase 4 "Modalidad 3" (revisión especialista-seguridad) -- ver
            // aviso de GAP en el docblock de esta clase.
            ['code' => 'gestor_carrier_authorizations.read', 'name' => 'Consultar autorizaciones de transportador', 'module' => 'gestor_carrier_authorizations', 'action' => 'read'],
            ['code' => 'gestor_carrier_authorizations.create', 'name' => 'Autorizar transportadores independientes', 'module' => 'gestor_carrier_authorizations', 'action' => 'create'],
            ['code' => 'gestor_carrier_authorizations.revoke', 'name' => 'Revocar autorizaciones de transportador', 'module' => 'gestor_carrier_authorizations', 'action' => 'revoke'],

            // Módulo Manifiesto de Descargue, Fase 5 (última fase del plan)
            // -- ver aviso de GAP en el docblock de esta clase.
            ['code' => 'manifest_unloads.read', 'name' => 'Consultar manifiestos de descargue', 'module' => 'manifest_unloads', 'action' => 'read'],
            ['code' => 'manifest_unloads.create', 'name' => 'Crear manifiestos de descargue', 'module' => 'manifest_unloads', 'action' => 'create'],
            ['code' => 'manifest_unloads.update', 'name' => 'Inspeccionar/generar/cerrar manifiestos de descargue', 'module' => 'manifest_unloads', 'action' => 'update'],
            ['code' => 'manifest_unloads.sign', 'name' => 'Firmar manifiestos de descargue (receptor/conductor)', 'module' => 'manifest_unloads', 'action' => 'sign'],
            ['code' => 'manifest_unloads.cancel', 'name' => 'Cancelar manifiestos de descargue', 'module' => 'manifest_unloads', 'action' => 'cancel'],
        ];

        foreach ($permissions as $permission) {
            Permission::query()->updateOrCreate(
                ['code' => $permission['code']],
                [
                    'tenant_organization_id' => null,
                    'name' => $permission['name'],
                    'module' => $permission['module'],
                    'action' => $permission['action'],
                    'scope' => 'tenant',
                    'is_system' => true,
                    'is_active' => true,
                    'is_critical' => in_array($permission['code'], self::CRITICAL_CODES, true),
                    'priority_level' => $this->priorityLevelFor($permission['code']),
                ],
            );
        }
    }

    private function priorityLevelFor(string $code): int
    {
        foreach (self::PRIORITY_LEVELS as $level => $codes) {
            if (in_array($code, $codes, true)) {
                return $level;
            }
        }

        // No debe alcanzarse -- los 16 códigos del catálogo están cubiertos
        // exhaustivamente arriba; si se agrega un permiso nuevo sin mapearlo,
        // falla explícito en vez de sembrar un priority_level arbitrario.
        throw new \LogicException("Permiso '{$code}' sin priority_level mapeado en PermissionSeeder::PRIORITY_LEVELS.");
    }
}
