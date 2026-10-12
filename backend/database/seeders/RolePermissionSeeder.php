<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use Illuminate\Database\Seeder;

/**
 * Matriz CRUD (módulo Usuarios y Seguridad): ADMINISTRADOR = CRUD completo
 * + ASS (assign) en Usuarios, Roles y Permisos.
 *
 * DECISIÓN CONFIRMADA (2026-07-14, por el usuario del proyecto, no por
 * asunción del agente): `audit.read`/`audit.export` SÍ se asignan a
 * ADMINISTRADOR. La Matriz CRUD revisada en el lote original de RBAC no
 * tenía una fila que lo confirmara explícitamente, pero la descripción de
 * rol de ADMINISTRADOR ("control total sobre usuarios, roles y permisos")
 * y el hecho de que sin esto nadie puede ver la pestaña Auditoría de
 * ningún rol lo hacían necesario. El usuario lo confirmó explícitamente.
 */
class RolePermissionSeeder extends Seeder
{
    private const ADMINISTRADOR_PERMISSION_CODES = [
        'users.create', 'users.read', 'users.update', 'users.delete', 'users.activate', 'users.deactivate', 'users.reset-password',
        'roles.create', 'roles.read', 'roles.update', 'roles.delete', 'roles.assign',
        'permissions.read', 'permissions.assign',
        'audit.read', 'audit.export',
        'waste_streams.read', 'waste_streams.manage',
        'un_codes.read', 'un_codes.manage',
        'geography.read', 'geography.manage',
        'branch_types.read', 'branch_types.manage',
        'organizational_areas.read', 'organizational_areas.manage',
        'hazard_characteristics.read', 'hazard_characteristics.manage',
        'waste_categories.read', 'waste_categories.manage',
        'physical_states.read', 'physical_states.manage',
        'packaging_types.read', 'packaging_types.manage',
        'packaging_conditions.read', 'packaging_conditions.manage',
        'vehicle_types.read', 'vehicle_types.manage',
        'contacts.read', 'contacts.create', 'contacts.update',
        'branches.read', 'branches.create', 'branches.update', 'branches.activate', 'branches.deactivate',
        'vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.activate', 'vehicles.deactivate',
        'treatments.read', 'treatments.create', 'treatments.update', 'treatments.activate', 'treatments.deactivate',
        'branch_treatments.read', 'branch_treatments.create', 'branch_treatments.update', 'branch_treatments.activate', 'branch_treatments.deactivate',
        'waste_types.read', 'waste_types.manage',
        'measurement_units.read', 'measurement_units.manage',
        'generation_frequencies.read', 'generation_frequencies.manage',
        'waste_operational_statuses.read', 'waste_operational_statuses.manage',
        'wastes.read', 'wastes.create', 'wastes.update', 'wastes.activate', 'wastes.deactivate',
        'wastes.submit', 'wastes.review', 'wastes.classify', 'wastes.reject', 'wastes.suspend',
        'treatment_approvals.read', 'treatment_approvals.create', 'treatment_approvals.update', 'treatment_approvals.evaluate', 'treatment_approvals.approve',
        // Fase 2 (2026-08-15): lo ejercen EcoLink y los Subgestores sobre
        // Gestores DE REFERENCIA. Cada organizacion puede reasignarlo al rol
        // que corresponda, igual que la aprobacion final.
        'treatment_approvals.assign_delegated',
        'subgestor_gestor_relationships.read', 'subgestor_gestor_relationships.create', 'subgestor_gestor_relationships.revoke',
        'preapproved_wastes.read', 'preapproved_wastes.manage',
        'workflows.manage',
        'service_requests.read', 'service_requests.create', 'service_requests.update', 'service_requests.cancel', 'service_requests.evaluate',
        'transport_schedules.read', 'transport_schedules.create', 'transport_schedules.update', 'transport_schedules.cancel',
        'transport_personnel.read', 'transport_personnel.create', 'transport_personnel.update',
        'transport_routes.read', 'transport_routes.create',
        'manifest_loads.read', 'manifest_loads.create', 'manifest_loads.update', 'manifest_loads.sign', 'manifest_loads.cancel',
        'branch_locations.read', 'branch_locations.create', 'branch_locations.update',
        'unload_requests.read', 'unload_requests.create', 'unload_requests.update', 'unload_requests.decide',
        'plant_reception_schedules.read', 'plant_reception_schedules.manage',
        'gestor_carrier_authorizations.read', 'gestor_carrier_authorizations.create', 'gestor_carrier_authorizations.revoke',
        'manifest_unloads.read', 'manifest_unloads.create', 'manifest_unloads.update', 'manifest_unloads.sign', 'manifest_unloads.cancel',
        'generator_subgestor_relationships.read', 'generator_subgestor_relationships.create', 'generator_subgestor_relationships.revoke',
        'generator_gestor_relationships.read', 'generator_gestor_relationships.create', 'generator_gestor_relationships.revoke',
    ];

    /**
     * LOGÍSTICA (CU-051, 2026-07-16) es SOLO de lectura sobre vehículos --
     * decisión ya confirmada por el usuario, no un descuido: "los
     * coordinadores de logística también pueden ver los vehículos de su
     * organización" (ver, no crear/editar).
     *
     * `transport_schedules.*` (revisión de seguridad Programación/Dispatch,
     * 2026-07-19, hallazgo Alto CONFIRMADO por el usuario): sin estos 4
     * permisos, un usuario con SOLO el rol de sistema `LOGÍSTICA` (sin
     * `ADMINISTRADOR`) quedaba bloqueado en TODO el ciclo de
     * `TransportScheduleController` -- `TransportSchedulePolicy` exige
     * `hasPermission('transport_schedules.*')` en cada método, y
     * `TransportScheduleWorkflowSeeder` YA autoriza las transiciones
     * humanas (`submit()`/`confirm()`/`cancel()`) contra el rol `LOGÍSTICA`
     * -- el rol tenía la autorización de WORKFLOW pero no el permiso base
     * de la Policy, un bloqueo funcional real, no solo un hallazgo teórico.
     *
     * `transport_personnel.read` (gap real de contrato, 2026-07-19): mismo
     * criterio EXACTO que `vehicles.read` -- LOGÍSTICA consulta los
     * conductores de su organización, pero NO los crea/edita (eso queda
     * SOLO en ADMINISTRADOR, igual que con vehículos). `transport_routes.read`/
     * `.create` SÍ se asignan completos (a diferencia de `transport_personnel`):
     * a diferencia de vehículos/conductores (recursos de flota, datos
     * maestros), las rutas son parte de la coordinación ACTIVA del día a día
     * de LOGÍSTICA -- mismo criterio que su acceso completo a
     * `transport_schedules.*`, con el que las rutas se usan en conjunto vía
     * `assignToRoute()`.
     *
     * `manifest_loads.*` (Módulo Manifiesto de Cargue, Fase 3, 2026-07-20):
     * acceso COMPLETO (los 5 códigos), mismo criterio que
     * `transport_schedules.*` -- LOGÍSTICA es el mismo actor que ya crea/
     * gestiona la programación de transporte de la que se deriva el
     * manifiesto. `manifest_loads.sign` se incluye a propósito: la
     * autorización real de "quién puede firmar como generador/conductor" NO
     * depende del ROL del actor sino de a qué ORGANIZACIÓN pertenece
     * (`ManifestLoadSignatureService::assertActorCanSign()`, ver su
     * docblock) -- así que un usuario con rol LOGÍSTICA perteneciente a la
     * organización Generadora puede firmar como generador, y uno
     * perteneciente a la Transportadora puede firmar como conductor, con el
     * MISMO permiso base. FLAG explícito (gap real, no resuelto en este
     * lote): el catálogo canónico de 9 roles todavía solo tiene 2 sembrados
     * (ADMINISTRADOR/LOGÍSTICA) -- no existe un rol de sistema dedicado al
     * lado Generador; hasta que se siembre uno, cualquier actor del lado
     * Generador que necesite firmar debe tener asignado ADMINISTRADOR o
     * LOGÍSTICA.
     *
     * REPARTO POR LADO (decisión del usuario, 2026-10-12 -- CIERRA el FLAG
     * "ambos lados usan el MISMO rol de sistema LOGÍSTICA hasta que existan
     * roles dedicados por lado" que este docblock arrastraba desde Fase 4):
     * sin roles nuevos, siguiendo `roles-canonicos.md`, LOGÍSTICA = lado
     * TRANSPORTADOR (programador logístico: rutas, vehículos, conductores,
     * programación) y OPERACIONES = lado PLANTA RECEPTORA (operador de
     * planta / manifiestos). La restricción fina de "qué organización
     * concreta" sigue viviendo en las Policies (`UnloadRequestPolicy`/
     * `PlantReceptionSchedulePolicy`/`ManifestUnloadPolicy`) y NO cambió;
     * lo que cambia es qué ROL trae el permiso base de cada lado.
     *
     * `unload_requests.read`/`.create`/`.update` (Fase 4 "Cita de Recepción
     * en Planta", D-PRG-02/D-PRG-13): el transportador crea y envía su
     * solicitud. SIN `unload_requests.decide` -- aprobar/rechazar es
     * exclusivo de la planta receptora (`UnloadRequestPolicy::decide()`),
     * ahora en `OPERACIONES_PERMISSION_CODES`.
     * `plant_reception_schedules.*` se CONSERVA completo: la cita es
     * BILATERAL por diseño (el transportador propone/contrapropone la
     * franja, ver `PlantReceptionSchedulePolicy`), así que lo tienen ambos
     * roles. `branch_locations.*` NO se asigna a LOGÍSTICA -- mismo criterio
     * que `branches.*` (gestión de sedes/muelles queda SOLO en
     * ADMINISTRADOR).
     *
     * `gestor_carrier_authorizations.*` (revisión especialista-seguridad,
     * "Modalidad 3"): acceso COMPLETO -- LOGÍSTICA ya gestiona toda la
     * relación de transporte (`transport_schedules.*`), autorizar/revocar un
     * transportador independiente es parte de la misma coordinación.
     *
     * `gestor_carrier_authorizations.*` NO se movió en el reparto de
     * 2026-10-12, aunque su `create`/`revoke` lo ejerce el Gestor que
     * autoriza: no fue parte de la decisión.
     *
     * `manifest_unloads.read`/`.sign` (Módulo Manifiesto de Descargue, Fase
     * 5): el lado transportador solo LEE y FIRMA como conductor
     * (`ManifestUnloadSignatureService::assertActorCanSign()`). SIN
     * `.create`/`.update`/`.cancel` -- gestionar/inspeccionar/generar/
     * cerrar/cancelar es exclusivo de la planta receptora
     * (`ManifestUnloadPolicy`), ahora en `OPERACIONES_PERMISSION_CODES`.
     */
    private const LOGISTICA_PERMISSION_CODES = [
        'vehicles.read',
        // 'contacts.read' (verificación E2E, 2026-07-20): sin este permiso,
        // LOGÍSTICA no puede usar ContactSearchSelect en NINGUNO de los
        // flujos que ya opera (registrar conductor, firmante Generador de
        // Manifiesto de Cargue, firmante Receptor de Manifiesto de Descargue)
        // -- se reprodujo en vivo "No tiene permiso para buscar contactos."
        // al intentar generar un Manifiesto de Cargue como LOGÍSTICA.
        'contacts.read',
        'transport_schedules.read', 'transport_schedules.create', 'transport_schedules.update', 'transport_schedules.cancel',
        'transport_personnel.read',
        'transport_routes.read', 'transport_routes.create',
        'manifest_loads.read', 'manifest_loads.create', 'manifest_loads.update', 'manifest_loads.sign', 'manifest_loads.cancel',
        'unload_requests.read', 'unload_requests.create', 'unload_requests.update',
        'plant_reception_schedules.read', 'plant_reception_schedules.manage',
        'gestor_carrier_authorizations.read', 'gestor_carrier_authorizations.create', 'gestor_carrier_authorizations.revoke',
        'manifest_unloads.read', 'manifest_unloads.sign',
    ];

    /**
     * Códigos que LOGÍSTICA TUVO hasta el reparto por lado de 2026-10-12 y
     * que ya no le corresponden (exclusivos de la planta receptora). Quitar
     * un código de `LOGISTICA_PERMISSION_CODES` NO limpia una base ya
     * sembrada -- dev local y staging corren `migrate --seed` sin `:fresh` --,
     * así que `run()` los DESACTIVA explícitamente (`is_active=false`, nunca
     * se borra la fila: mismo criterio que
     * `PermissionController::revokeFromRole()`).
     *
     * Lista explícita a propósito, en vez de "desactivar todo lo que no esté
     * en el array": así el seeder solo retira lo que ESTA decisión retiró y
     * no pisa permisos que platform staff haya asignado a mano al rol.
     * Consecuencia: si alguien reasigna uno de estos 4 a LOGÍSTICA desde la
     * UI, el siguiente `db:seed` lo vuelve a retirar.
     */
    private const LOGISTICA_RETIRED_PERMISSION_CODES = [
        'unload_requests.decide',
        'manifest_unloads.create', 'manifest_unloads.update', 'manifest_unloads.cancel',
    ];

    /**
     * `OPERACIONES` (rol #6 del catálogo canónico, verificación
     * RBAC/privacidad de Residuos, 2026-08-09): lado "dueño del residuo" --
     * cualquier organización, sin importar su business_role, declara y
     * gestiona sus propios residuos y puede solicitar evaluación a un
     * Gestor (`treatment_approvals.create`, la elección del
     * `branch_treatment_id` ES la invitación -- ver
     * `WasteTreatmentApprovalController`). `treatment_approvals.read` se
     * incluye porque `indexForWaste()` lo exige para ver las evaluaciones
     * que el propio residuo recibió. NINGÚN código de
     * `Permission::GESTOR_ONLY_CODES` -- ese lado va en
     * `TECNICO_AMBIENTAL_PERMISSION_CODES`.
     *
     * REPARTO POR LADO (decisión del usuario, 2026-10-12, ver docblock de
     * `LOGISTICA_PERMISSION_CODES`): OPERACIONES es además el lado PLANTA
     * RECEPTORA del descargue (operador de planta / manifiestos, según
     * `roles-canonicos.md`). Igual que el resto de sus códigos, tenerlos no
     * habilita nada por sí solo: `UnloadRequestPolicy::decide()` y
     * `ManifestUnloadPolicy` exigen además SER la organización receptora.
     */
    private const OPERACIONES_PERMISSION_CODES = [
        'wastes.read', 'wastes.create', 'wastes.update', 'wastes.activate', 'wastes.deactivate',
        'wastes.submit', 'wastes.review', 'wastes.classify', 'wastes.reject',
        'treatment_approvals.read', 'treatment_approvals.create',
        // Cadena Generador -> Subgestor -> Gestor (confirmado por
        // stakeholders reales, 2026-08-09): OPERACIONES es el rol
        // operativo del lado declarante, incluido el Subgestor -- consulta
        // qué Generadores son sus clientes y puede revocar el vínculo.
        //
        // SIN los dos `.create` (decisión del usuario, 2026-10-12, hallazgo
        // de seguridad): sumados al `contacts.read` de abajo permitían que un
        // usuario OPERACIONES se autoasignara una relación con CUALQUIER
        // Generador y leyera sus contactos vía
        // `OrganizationController::contacts()`. Crear el vínculo queda en
        // ADMINISTRADOR. Consecuencia aceptada: OPERACIONES pierde también la
        // carga masiva de Generadores (`GeneratorBulkImportController`,
        // gateada por estos mismos `.create`). Ver
        // `OPERACIONES_RETIRED_PERMISSION_CODES`.
        'generator_subgestor_relationships.read', 'generator_subgestor_relationships.revoke',
        'generator_gestor_relationships.read', 'generator_gestor_relationships.revoke',
        // Solicitudes de Servicio (2026-08-19). Hasta hoy los cinco
        // `service_requests.*` estaban SOLO en ADMINISTRADOR, asi que el rol
        // operativo no podia ni crear una solicitud.
        'service_requests.read', 'service_requests.create', 'service_requests.update', 'service_requests.cancel',
        // `evaluate` tambien aqui, y NO es una contradiccion con "OPERACIONES
        // es el lado declarante": desde el destinatario unico (2026-08-18) una
        // solicitud puede ir dirigida a un SUBGESTOR, y el rol operativo de un
        // Subgestor es este. Concederlo a un GENERADOR no le habilita nada --
        // el permiso por si solo no basta: `ServiceRequestPolicy::evaluateItem()`
        // exige ademas ser el destinatario de esa solicitud
        // (`WasteServiceRequestItem::isEvaluableBy()`), y un Generador nunca lo
        // es. Por eso `service_requests.evaluate` tampoco esta en
        // `Permission::GESTOR_ONLY_CODES`: si lo estuviera, una organizacion
        // Subgestora no podria recibirlo.
        'service_requests.evaluate',
        // Lado PLANTA RECEPTORA (2026-10-12). `unload_requests`: ver y
        // decidir (aprobar/rechazar) -- SIN `.create`/`.update`, que son del
        // transportador que crea y envía la solicitud.
        'unload_requests.read', 'unload_requests.decide',
        // Bilateral: la planta también propone/contrapropone/confirma la franja.
        'plant_reception_schedules.read', 'plant_reception_schedules.manage',
        // Completo: crea, inspecciona, genera, firma como receptor, cierra y
        // cancela el manifiesto de descargue.
        'manifest_unloads.read', 'manifest_unloads.create', 'manifest_unloads.update', 'manifest_unloads.sign', 'manifest_unloads.cancel',
        // El selector de `receiver_person_id` (firmante receptor) usa
        // ContactSearchSelect -- misma omisión que ya causó un bug en
        // LOGÍSTICA (ver su `contacts.read`).
        'contacts.read',
    ];

    /**
     * Códigos que OPERACIONES TUVO hasta la decisión de 2026-10-12 (ver el
     * comentario de las relaciones comerciales en
     * `OPERACIONES_PERMISSION_CODES`). Mismo mecanismo y mismas consecuencias
     * que `LOGISTICA_RETIRED_PERMISSION_CODES`: `run()` los DESACTIVA en una
     * base ya sembrada, sin borrar la fila, y un `db:seed` posterior vuelve a
     * retirarlos si alguien los reasigna a OPERACIONES desde la UI.
     */
    private const OPERACIONES_RETIRED_PERMISSION_CODES = [
        'generator_subgestor_relationships.create',
        'generator_gestor_relationships.create',
    ];

    /**
     * `TECNICO_AMBIENTAL` (rol #5 del catálogo canónico): lado evaluador --
     * SOLO tiene sentido dentro de una organización Gestor
     * (`can_treat_waste=true`). Sus códigos de `treatment_approvals`/
     * `preapproved_wastes` son exactamente `Permission::GESTOR_ONLY_CODES`;
     * los de `service_requests` (2026-08-19) NO lo son a propósito, para que
     * una organización Subgestora pueda recibirlos -- la gobernanza de "quién puede
     * recibir este rol" (o cualquier rol custom con estos permisos) la
     * hacen `RoleController::assignToUser()`/`PermissionController::assignToRole()`,
     * no este seeder.
     */
    private const TECNICO_AMBIENTAL_PERMISSION_CODES = [
        // SIN `treatment_approvals.approve` a proposito (2026-08-14): quien
        // asigna el tratamiento no debe darse a si mismo el visto bueno final.
        // Ese permiso queda en ADMINISTRADOR y cada organizacion lo asigna al
        // rol que corresponda -- control de cuatro ojos.
        'treatment_approvals.read', 'treatment_approvals.update', 'treatment_approvals.evaluate',
        'preapproved_wastes.read', 'preapproved_wastes.manage',
        // Solicitudes de Servicio (2026-08-19): el lado evaluador tambien
        // decide sobre las solicitudes que recibe su organizacion. `read` va
        // junto a `evaluate` porque sin ver la solicitud no hay nada que
        // evaluar.
        'service_requests.read', 'service_requests.evaluate',
    ];

    public function run(): void
    {
        $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
        $this->assignPermissions($administrador, self::ADMINISTRADOR_PERMISSION_CODES);

        $logistica = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();
        $this->assignPermissions($logistica, self::LOGISTICA_PERMISSION_CODES);
        $this->retirePermissions($logistica, self::LOGISTICA_RETIRED_PERMISSION_CODES);

        $operaciones = Role::query()->where('code', 'OPERACIONES')->firstOrFail();
        $this->assignPermissions($operaciones, self::OPERACIONES_PERMISSION_CODES);
        $this->retirePermissions($operaciones, self::OPERACIONES_RETIRED_PERMISSION_CODES);

        $tecnicoAmbiental = Role::query()->where('code', 'TECNICO_AMBIENTAL')->firstOrFail();
        $this->assignPermissions($tecnicoAmbiental, self::TECNICO_AMBIENTAL_PERMISSION_CODES);
    }

    /**
     * @param  list<string>  $codes
     */
    private function assignPermissions(Role $role, array $codes): void
    {
        $permissionIds = Permission::query()
            ->whereIn('code', $codes)
            ->pluck('id', 'code');

        foreach ($codes as $code) {
            $permissionId = $permissionIds->get($code);

            if ($permissionId === null) {
                continue;
            }

            RolePermission::query()->updateOrCreate(
                ['role_id' => $role->id, 'permission_id' => $permissionId],
                ['is_active' => true],
            );
        }
    }

    /**
     * Desactiva (sin borrar) las asignaciones de `$codes` que `$role` pudiera
     * tener de una siembra anterior. No-op en una base nueva.
     *
     * @param  list<string>  $codes
     */
    private function retirePermissions(Role $role, array $codes): void
    {
        RolePermission::query()
            ->where('role_id', $role->id)
            ->whereIn('permission_id', Permission::query()->whereIn('code', $codes)->select('id'))
            ->where('is_active', true)
            ->update(['is_active' => false]);
    }
}
