<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Organization;
use App\Models\TransportPersonnel;
use App\Models\TransportRoute;
use App\Models\TransportRouteStop;
use App\Models\TransportSchedule;
use App\Models\TransportScheduleItem;
use App\Models\TransportStatus;
use App\Models\Vehicle;
use App\Models\WasteServiceRequest;
use App\Models\WasteServiceRequestItem;
use App\Policies\TransportSchedulePolicy;
use App\Models\User;
use App\Services\TransportScheduleWorkflowService;
use App\Services\UnloadRequestAutomationService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Módulo Programación Logística, Fase 2a (D-PRG-01 a D-PRG-14) --
 * "Programar Recolección" (CU-026), reprogramar/editar mientras esté en
 * Borrador/Pend. Asignación (CU-027), cancelar (CU-028), asignar vehículo/
 * conductor (CU-029/030, YA obligatorios desde la creación, ver AVISO
 * abajo), y agrupación simple en ruta (CU-059). Mismo patrón exacto de
 * resolución de workflow + `WorkflowLog` + anti-IDOR que
 * `ServiceRequestController`/`ServiceRequestApprovalService`.
 *
 * AVISO explícito (tensión de diseño señalada por la tarea anterior,
 * resuelta aquí): a diferencia de `ServiceRequestController::store()` --
 * que crea la cabecera en DRAFT y permite ítems incompletos hasta
 * `submit()` -- aquí `vehicle_id`/`transport_personnel_id` son NOT NULL
 * desde el Draft (D-PRG-03, "NUNCA null en NINGUNA modalidad"). Por lo
 * tanto `store()` EXIGE ambos recursos en el payload de creación -- no
 * existe un estado "borrador sin vehículo asignado" en este módulo, mismo
 * criterio que `ServiceRequestController::store()` exige `items` desde la
 * creación (sin DRAFT de solo-cabecera). El estado inicial del WORKFLOW
 * (`transport_status_id=BOR`) es independiente de esa obligatoriedad: BOR
 * simplemente es el primer peldaño del ciclo humano de confirmación
 * (BOR->PEND->PROG->CONF), no una fase de "todavía sin recursos".
 *
 * Regla central (RN-090/D-PRG-04): la organización actora (Gestor/Subgestor,
 * o Generador con doble rol GENERATOR+TRANSPORTER en autotransporte) debe
 * tener `can_transport_waste` (`Organization::hasCapability()`).
 * El vehículo y el conductor deben pertenecer a la MISMA organización que
 * programa -- sin caso especial adicional por modalidad, instrucción
 * explícita de la tarea ("no compliques de más").
 *
 * Cada `waste_service_request_item_id` debe (a) pertenecer a LA MISMA
 * `waste_service_request_id` indicada en la cabecera -- una fila de
 * `transport_schedules` referencia UNA sola solicitud de origen (columna
 * NOT NULL, ver migración); el agrupamiento de VARIAS solicitudes lo cubre
 * `transport_routes` (varias `transport_schedules`, cada una de SU propia
 * solicitud, agrupadas en una ruta) -- (b) pertenecer a una
 * `WasteTreatmentApproval` de la organización actora (mismo criterio anti-
 * IDOR que `ServiceRequestApprovalService::assertActorOwnsItemGestor()`) --
 * (c) tener `item_status=ACCEPTED` -- (d) no estar ya cubierto por OTRA
 * `transport_schedule` NO FINAL (evita doble-programación).
 *
 * FLAG explícito (no resuelto por ningún D-PRG, señalado en vez de
 * decidido en silencio): la interacción entre la Modalidad 2 (autotransporte
 * del Generador+TRANSPORTER) y el criterio anti-IDOR (b) no está aclarada en
 * ninguna decisión -- `waste_treatment_approvals.organization_id` es SIEMPRE
 * el Gestor que evaluó el tratamiento (nunca el Generador), así que un
 * Generador en Modalidad 2 solo podría "programar" ítems cuya aprobación le
 * pertenezca a ÉL como Gestor de sí mismo, lo cual no es el escenario típico
 * de autotransporte descrito por D-PRG-02/03. Se implementa el criterio (b)
 * literalmente tal como lo pide la tarea, sin inventar una excepción de
 * modalidad no especificada -- si Modalidad 2 requiere una regla distinta,
 * es una decisión de negocio pendiente, no de este lote.
 *
 * Transiciones `CONF->EJEC`/`EJEC->FIN` (placeholder `ADMINISTRADOR`, ver
 * `TransportScheduleWorkflowSeeder`) NO se exponen aquí -- mismo criterio
 * que `APPROVED->SCHEDULED` en Solicitudes: quedan sembradas para completar
 * el grafo, pertenecen al futuro módulo de Transporte/Ejecución (CU-035-037).
 *
 * Nombres de transición (`submit()`/`confirm()`/`cancel()`, decisión de
 * diseño de este lote -- el motor de Workflow solo identifica transiciones
 * por código from/to, NUNCA por nombre simbólico, así que la elección de
 * qué endpoint cubre qué arista es responsabilidad de este controller):
 * `submit()` cubre BOR->PEND (un solo salto); `confirm()` cubre el resto del
 * tramo humano hasta CONF (PEND->PROG->CONF, encadenando 2 transiciones en
 * una sola llamada si el estado actual es PEND, o solo PROG->CONF si ya
 * está en PROG) -- mismo patrón EXACTO que
 * `ServiceRequestController::submit()`, que encadena 2 transiciones
 * (DRAFT->SUBMITTED->UNDER_REVIEW) en una sola llamada.
 */
class TransportScheduleController extends Controller
{
    use LogsSecurityEvents;

    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new TransportSchedulePolicy)->viewAny($actor), 403, 'No tiene permiso para consultar programaciones de transporte.');

        $organizationId = $request->input('organization_id');
        $search = $request->input('search');
        $statusCode = $request->input('status');

        $schedules = TransportSchedule::query()
            ->when($actor->isPlatformStaff(), fn ($query) => $query->when($organizationId, fn ($query) => $query->where('organization_id', $organizationId)))
            ->when(! $actor->isPlatformStaff(), fn ($query) => $query->where('organization_id', $actor->tenant_organization_id))
            ->when($search, fn ($query) => $query->where('schedule_number', 'ILIKE', "%{$search}%"))
            ->when($statusCode, function ($query) use ($statusCode) {
                $query->whereHas('transportStatus', fn ($query) => $query->where('code', $statusCode));
            })
            ->with(['organization:id,legal_name', 'wasteServiceRequest:id,request_code', 'transportStatus', 'vehicle:id,plate_number', 'sourceBranch:id,name', 'destinationBranch:id,name'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($schedules);
    }

    public function show(Request $request, TransportSchedule $schedule)
    {
        $actor = $request->user();
        abort_unless((new TransportSchedulePolicy)->view($actor, $schedule), 403, 'No tiene acceso a esta programación de transporte.');

        $schedule->load([
            'organization:id,legal_name',
            'wasteServiceRequest:id,request_code,organization_id',
            'transportStatus',
            'sourceBranch:id,name',
            'destinationBranch:id,name',
            'vehicle',
            'transportPersonnel.person',
            'responsibleUser:id,username',
            'items.waste:id,name,code',
            'items.measurementUnit',
            'routeStop.transportRoute',
        ]);

        return response()->json(['transport_schedule' => $schedule]);
    }

    /**
     * Crea la cabecera (estado inicial `transport_status_id=BOR`) +
     * `transport_schedule_items`, en una única transacción. Ver el docblock
     * completo de la clase para el detalle de todas las validaciones.
     */
    public function store(Request $request)
    {
        $actor = $request->user();

        // Anti-role-smuggling (mismo criterio que ServiceRequestController::store()):
        // un tenant admin SIEMPRE programa desde SU propia organización.
        $organizationId = $actor->isPlatformStaff()
            ? $request->integer('organization_id')
            : $actor->tenant_organization_id;

        abort_unless((new TransportSchedulePolicy)->create($actor, $organizationId), 403, 'No tiene permiso para crear programaciones de transporte.');

        $rules = array_merge($this->headerValidationRules(), $this->itemValidationRules());

        if ($actor->isPlatformStaff()) {
            $rules['organization_id'] = ['required', 'integer', 'exists:organizations,id'];
        }

        $data = $request->validate($rules);

        $this->assertOrganizationCanTransportWaste($organizationId);

        $wasteServiceRequestId = (int) $data['waste_service_request_id'];
        $wasteServiceRequest = WasteServiceRequest::query()->findOrFail($wasteServiceRequestId);

        // Consistencia mínima: el punto de recolección declarado debe ser el
        // mismo de la solicitud de origen -- evita que se programe un
        // origen arbitrario sin relación con la solicitud (decisión de
        // diseño de este lote, sin D-PRG que lo exija literalmente).
        if ((int) $data['source_branch_id'] !== (int) $wasteServiceRequest->branch_id) {
            throw ValidationException::withMessages([
                'source_branch_id' => ['La sede de recolección debe ser la misma sede de la solicitud de servicio de origen.'],
            ]);
        }

        $this->assertVehicleBelongsToOrganization((int) $data['vehicle_id'], $organizationId);
        $this->assertTransportPersonnelBelongsToOrganization((int) $data['transport_personnel_id'], $organizationId);
        $this->assertBranchBelongsToOrganization((int) $data['destination_branch_id'], $organizationId, 'destination_branch_id');

        if (array_key_exists('responsible_user_id', $data) && $data['responsible_user_id'] !== null) {
            $this->assertUserBelongsToOrganization((int) $data['responsible_user_id'], $organizationId);
        }

        $items = $data['items'];
        unset($data['items'], $data['organization_id']);

        $resolvedItems = $this->resolveAndValidateItems($items, $organizationId, $wasteServiceRequestId);

        $borStatusId = $this->defaultTransportStatusId('BOR');

        try {
            $schedule = DB::transaction(function () use ($data, $organizationId, $wasteServiceRequestId, $actor, $resolvedItems, $borStatusId) {
                $data['tenant_organization_id'] = $actor->tenant_organization_id;
                $data['organization_id'] = $organizationId;
                $data['waste_service_request_id'] = $wasteServiceRequestId;
                $data['schedule_number'] = $this->generateScheduleNumber($organizationId);
                $data['is_active'] = true;

                // `transport_status_id`/`created_by`/`updated_by` se retiran
                // deliberadamente del $fillable del modelo (ver su docblock) --
                // solo deben cambiar vía forceFill(), nunca mass-assignment.
                $schedule = new TransportSchedule;
                $schedule->fill($data);
                $schedule->forceFill([
                    'transport_status_id' => $borStatusId,
                    'created_by' => $actor->id,
                    'updated_by' => $actor->id,
                ]);
                $schedule->save();

                foreach ($resolvedItems as $resolved) {
                    /** @var WasteServiceRequestItem $item */
                    $item = $resolved['item'];
                    $itemData = $resolved['data'];

                    TransportScheduleItem::query()->create([
                        ...collect($itemData)->except(['waste_service_request_item_id'])->all(),
                        'tenant_organization_id' => $actor->tenant_organization_id,
                        'transport_schedule_id' => $schedule->id,
                        'waste_service_request_item_id' => $item->id,
                        'waste_id' => $item->waste_id,
                        'is_active' => true,
                    ]);
                }

                return $schedule;
            });
        } catch (UniqueConstraintViolationException) {
            // Hallazgo Medio (revisión de seguridad Programación/Dispatch,
            // 2026-07-19): red de seguridad del índice único parcial
            // `transport_schedule_items_active_unique` -- cubre tanto la
            // condición de carrera entre 2 requests concurrentes como el
            // caso determinístico de un mismo `waste_service_request_item_id`
            // repetido dos veces dentro del MISMO payload (el pre-chequeo
            // `resolveAndValidateItems()`/`itemAlreadyScheduled()` solo mira
            // programaciones YA EXISTENTES, no duplicados dentro del propio
            // array `items` que se está insertando).
            throw ValidationException::withMessages([
                'items' => ['Uno o más ítems ya quedaron asignados a otra programación de transporte activa. Intente nuevamente.'],
            ]);
        }

        $this->logSecurityEvent(
            $request, 'TRANSPORT_SCHEDULE_CREATED', 'SUCCESS',
            "Programación de transporte '{$schedule->schedule_number}' creada.", $actor,
            ['transport_schedule_id' => $schedule->id, 'organization_id' => $organizationId],
        );

        return response()->json(['transport_schedule' => $schedule->fresh(['items', 'transportStatus', 'organization:id,legal_name', 'vehicle', 'transportPersonnel'])], 201);
    }

    /**
     * D-PRG-11: editar campos de cabecera SOLO mientras la programación esté
     * en `BOR` (Borrador) o `PEND` (Pend. Asignación) -- los 2 estados NO
     * terminales TEMPRANOS del pipeline lineal (`BOR/PEND/PROG/CONF/EJEC` no
     * finales, `FIN/CANC` finales). A partir de `PROG` la programación se
     * considera ya comprometida operativamente -- fuera de alcance de este
     * método el sync de ítems (agregar/quitar líneas), mismo AVISO que
     * `ServiceRequestController::update()`.
     */
    public function update(Request $request, TransportSchedule $schedule)
    {
        $actor = $request->user();
        abort_unless((new TransportSchedulePolicy)->update($actor, $schedule), 403, 'No tiene acceso a esta programación de transporte.');

        $currentCode = $schedule->transportStatus?->code;

        if (! in_array($currentCode, ['BOR', 'PEND'], true)) {
            throw ValidationException::withMessages([
                'transport_status' => ['Solo se puede editar una programación en estado Borrador o Pend. Asignación.'],
            ]);
        }

        $data = $request->validate($this->headerValidationRules(sometimes: true));

        if (array_key_exists('vehicle_id', $data)) {
            $this->assertVehicleBelongsToOrganization((int) $data['vehicle_id'], $schedule->organization_id);
        }

        if (array_key_exists('transport_personnel_id', $data)) {
            $this->assertTransportPersonnelBelongsToOrganization((int) $data['transport_personnel_id'], $schedule->organization_id);
        }

        if (array_key_exists('destination_branch_id', $data)) {
            $this->assertBranchBelongsToOrganization((int) $data['destination_branch_id'], $schedule->organization_id, 'destination_branch_id');
        }

        if (array_key_exists('responsible_user_id', $data) && $data['responsible_user_id'] !== null) {
            $this->assertUserBelongsToOrganization((int) $data['responsible_user_id'], $schedule->organization_id);
        }

        unset($data['waste_service_request_id']);

        $schedule->fill($data);
        $schedule->updated_by = $actor->id;
        $schedule->save();

        $this->logSecurityEvent(
            $request, 'TRANSPORT_SCHEDULE_UPDATED', 'SUCCESS',
            "Programación de transporte '{$schedule->schedule_number}' modificada.", $actor,
            ['transport_schedule_id' => $schedule->id, 'organization_id' => $schedule->organization_id],
        );

        return response()->json(['transport_schedule' => $schedule->fresh(['items', 'transportStatus'])]);
    }

    /**
     * BOR -> PEND (un solo salto humano, rol LOGÍSTICA).
     */
    public function submit(Request $request, TransportSchedule $schedule)
    {
        $actor = $request->user();
        abort_unless((new TransportSchedulePolicy)->update($actor, $schedule), 403, 'No tiene acceso a esta programación de transporte.');

        if ($schedule->transportStatus?->code !== 'BOR') {
            throw ValidationException::withMessages([
                'transport_status' => ['Solo se puede enviar una programación en estado Borrador.'],
            ]);
        }

        $schedule = TransportScheduleWorkflowService::transition($schedule, $actor, 'PEND');

        $this->logSecurityEvent(
            $request, 'TRANSPORT_SCHEDULE_SUBMITTED', 'SUCCESS',
            "Programación de transporte '{$schedule->schedule_number}' enviada.", $actor,
            ['transport_schedule_id' => $schedule->id, 'organization_id' => $schedule->organization_id],
        );

        return response()->json(['transport_schedule' => $schedule->fresh(['transportStatus'])]);
    }

    /**
     * PEND -> PROG -> CONF (encadena ambas transiciones si el estado actual
     * es PEND; solo PROG -> CONF si ya está en PROG) -- ver docblock de la
     * clase para el razonamiento completo de este diseño.
     */
    public function confirm(Request $request, TransportSchedule $schedule)
    {
        $actor = $request->user();
        abort_unless((new TransportSchedulePolicy)->update($actor, $schedule), 403, 'No tiene acceso a esta programación de transporte.');

        $currentCode = $schedule->transportStatus?->code;

        if (! in_array($currentCode, ['PEND', 'PROG'], true)) {
            throw ValidationException::withMessages([
                'transport_status' => ['Solo se puede confirmar una programación en estado Pend. Asignación o Programada.'],
            ]);
        }

        if ($currentCode === 'PEND') {
            $schedule = TransportScheduleWorkflowService::transition($schedule, $actor, 'PROG');
        }

        $schedule = TransportScheduleWorkflowService::transition($schedule->fresh(), $actor, 'CONF');

        $this->logSecurityEvent(
            $request, 'TRANSPORT_SCHEDULE_CONFIRMED', 'SUCCESS',
            "Programación de transporte '{$schedule->schedule_number}' confirmada.", $actor,
            ['transport_schedule_id' => $schedule->id, 'organization_id' => $schedule->organization_id],
        );

        // D-PRG-13 (Fase 4, "Cita de Recepción en Planta"): al confirmar la
        // programación, dispara la creación automática de una
        // `unload_requests` derivada -- implementación DIRECTA en código de
        // aplicación (NO el motor genérico de acciones automáticas,
        // diferido explícitamente por falta de un segundo caso de uso real,
        // ver docblock de `UnloadRequestAutomationService`). El
        // `plant_reception_schedule` inicial NO se crea aquí todavía -- eso
        // requiere que la `unload_request` esté `Approved` primero
        // (RN-RCP-015), disparado a mano vía
        // `PlantReceptionScheduleController::propose()`.
        $unloadRequest = UnloadRequestAutomationService::createFromConfirmedSchedule($schedule, $actor);

        $this->logSecurityEvent(
            $request, 'UNLOAD_REQUEST_CREATED', 'SUCCESS',
            "Solicitud de descargue '{$unloadRequest->request_number}' creada automáticamente al confirmar la programación de transporte '{$schedule->schedule_number}'.", $actor,
            ['unload_request_id' => $unloadRequest->id, 'transport_schedule_id' => $schedule->id],
        );

        return response()->json([
            'transport_schedule' => $schedule->fresh(['transportStatus']),
            'unload_request' => $unloadRequest->fresh(['unloadRequestStatus']),
        ]);
    }

    /**
     * -> CANC, alcanzable desde BOR/PEND/PROG/CONF (estados NO operativos,
     * `TransportScheduleWorkflowSeeder::NON_OPERATIONAL_STATUSES`) -- desde
     * EJEC (en ejecución) NO existe una `workflow_transition` sembrada hacia
     * CANC, así que `TransportScheduleWorkflowService::transition()` la
     * rechaza automáticamente con 422, sin necesidad de una verificación
     * adicional aquí.
     */
    public function cancel(Request $request, TransportSchedule $schedule)
    {
        $actor = $request->user();
        abort_unless((new TransportSchedulePolicy)->cancel($actor, $schedule), 403, 'No tiene acceso a esta programación de transporte.');

        $schedule = TransportScheduleWorkflowService::transition($schedule, $actor, 'CANC');

        $this->logSecurityEvent(
            $request, 'TRANSPORT_SCHEDULE_CANCELLED', 'SUCCESS',
            "Programación de transporte '{$schedule->schedule_number}' cancelada.", $actor,
            ['transport_schedule_id' => $schedule->id, 'organization_id' => $schedule->organization_id],
        );

        return response()->json(['transport_schedule' => $schedule->fresh(['transportStatus'])]);
    }

    /**
     * Agrupa esta programación dentro de una `transport_route` (CU-059,
     * alcance mínimo viable, SIN motor de optimización -- ver docblock de
     * `create_transport_routes_table`). `stop_sequence` es OPCIONAL: si no
     * se indica, se calcula como el siguiente disponible dentro de esa ruta
     * (diseño de este lote, sin más detalle especificado en la tarea).
     */
    public function assignToRoute(Request $request, TransportSchedule $schedule)
    {
        $actor = $request->user();
        abort_unless((new TransportSchedulePolicy)->update($actor, $schedule), 403, 'No tiene acceso a esta programación de transporte.');

        $data = $request->validate([
            'transport_route_id' => ['required', 'integer', 'exists:transport_routes,id'],
            'stop_sequence' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ]);

        $route = TransportRoute::query()->findOrFail($data['transport_route_id']);

        if ((int) $route->organization_id !== (int) $schedule->organization_id) {
            throw ValidationException::withMessages([
                'transport_route_id' => ['La ruta indicada no pertenece a la misma organización que la programación.'],
            ]);
        }

        $stopSequence = $data['stop_sequence']
            ?? ((int) TransportRouteStop::query()->where('transport_route_id', $route->id)->max('stop_sequence') + 1);

        $stop = TransportRouteStop::query()->updateOrCreate(
            ['transport_schedule_id' => $schedule->id],
            ['transport_route_id' => $route->id, 'stop_sequence' => $stopSequence],
        );

        $this->logSecurityEvent(
            $request, 'TRANSPORT_SCHEDULE_ASSIGNED_TO_ROUTE', 'SUCCESS',
            "Programación de transporte '{$schedule->schedule_number}' asignada a la ruta '{$route->route_code}'.", $actor,
            ['transport_schedule_id' => $schedule->id, 'transport_route_id' => $route->id, 'organization_id' => $schedule->organization_id],
        );

        return response()->json(['route_stop' => $stop->fresh(['transportRoute'])]);
    }

    /**
     * @return array<int, array{item: WasteServiceRequestItem, data: array}>
     */
    private function resolveAndValidateItems(array $items, int $organizationId, int $wasteServiceRequestId): array
    {
        $resolved = [];

        foreach ($items as $index => $itemData) {
            $item = WasteServiceRequestItem::query()
                ->with(['wasteTreatmentApproval', 'itemStatus'])
                ->find($itemData['waste_service_request_item_id']);

            if (! $item || (int) $item->service_request_id !== $wasteServiceRequestId) {
                throw ValidationException::withMessages([
                    "items.{$index}.waste_service_request_item_id" => ['El ítem indicado no pertenece a la solicitud de servicio de esta programación.'],
                ]);
            }

            $gestorOrganizationId = $item->wasteTreatmentApproval?->organization_id;

            if ($gestorOrganizationId === null || (int) $gestorOrganizationId !== $organizationId) {
                throw ValidationException::withMessages([
                    "items.{$index}.waste_service_request_item_id" => ['El ítem indicado no pertenece a su organización.'],
                ]);
            }

            if ($item->itemStatus?->code !== 'ACCEPTED') {
                throw ValidationException::withMessages([
                    "items.{$index}.waste_service_request_item_id" => ['El ítem debe estar Aceptado antes de poder programarse.'],
                ]);
            }

            if ($this->itemAlreadyScheduled($item->id)) {
                throw ValidationException::withMessages([
                    "items.{$index}.waste_service_request_item_id" => ['Este ítem ya está asignado a otra programación de transporte activa.'],
                ]);
            }

            $resolved[$index] = ['item' => $item, 'data' => $itemData];
        }

        return $resolved;
    }

    /**
     * "Activa" = pertenece a una `transport_schedule` `is_active=true` cuyo
     * `transport_status` NO es final (`FIN`/`CANC` no bloquean re-programar
     * el mismo ítem -- una vez cancelada o finalizada esa programación, el
     * ítem queda libre de nuevo). Decisión de diseño de este lote, sin más
     * detalle especificado en la tarea.
     */
    private function itemAlreadyScheduled(int $wasteServiceRequestItemId): bool
    {
        return TransportScheduleItem::query()
            ->where('waste_service_request_item_id', $wasteServiceRequestItemId)
            ->where('is_active', true)
            ->whereHas('transportSchedule', function ($query) {
                $query->where('is_active', true)
                    ->whereHas('transportStatus', fn ($query) => $query->where('is_final', false));
            })
            ->exists();
    }

    private function assertVehicleBelongsToOrganization(int $vehicleId, ?int $organizationId): void
    {
        $vehicle = Vehicle::query()->find($vehicleId);

        if (! $vehicle || (int) $vehicle->organization_id !== (int) $organizationId) {
            throw ValidationException::withMessages([
                'vehicle_id' => ['El vehículo indicado no pertenece a su organización.'],
            ]);
        }
    }

    private function assertTransportPersonnelBelongsToOrganization(int $transportPersonnelId, ?int $organizationId): void
    {
        $personnel = TransportPersonnel::query()->find($transportPersonnelId);

        if (! $personnel || (int) $personnel->organization_id !== (int) $organizationId) {
            throw ValidationException::withMessages([
                'transport_personnel_id' => ['El conductor indicado no pertenece a su organización.'],
            ]);
        }
    }

    /**
     * Hallazgo Medio (revisión de seguridad Programación/Dispatch,
     * 2026-07-19): `destination_branch_id` NO se validaba contra la
     * organización actora -- a diferencia de `source_branch_id`, que sí se
     * valida contra la sede de la solicitud de servicio de origen (ver
     * arriba en `store()`). Mismo patrón exacto que
     * `VehicleController::assertBranchBelongsToOrganization()`/
     * `ServiceRequestController::assertBranchBelongsToOrganization()`
     * (`withTrashed()` -- una sede soft-eliminada de OTRA organización no
     * debe pasar silenciosamente el chequeo). `$field` parametriza el
     * nombre del campo en el mensaje de validación, reutilizable para
     * `destination_branch_id` en `store()`/`update()`.
     */
    private function assertBranchBelongsToOrganization(int $branchId, ?int $organizationId, string $field): void
    {
        $branch = Branch::withTrashed()->find($branchId);

        if ($branch && (int) $branch->organization_id !== (int) $organizationId) {
            throw ValidationException::withMessages([
                $field => ['La sede indicada no pertenece a la organización de la programación.'],
            ]);
        }
    }

    /**
     * Hallazgo Medio (revisión de seguridad Programación/Dispatch,
     * 2026-07-19): `responsible_user_id` solo se validaba con
     * `exists:users,id` -- cualquier usuario de CUALQUIER organización
     * podía asignarse como responsable logístico de una programación ajena.
     * Se valida pertenencia por `tenant_organization_id` (campo canónico de
     * aislamiento multi-tenant de `User`, ver
     * `User::belongsToSameOrganizationAs()`/`isPlatformStaff()`), no por
     * `organization_id` (que en `users` representa la organización CLIENTE
     * a la que un usuario de plataforma da soporte, un concepto distinto).
     * No se contempla ningún escenario legítimo de responsable de OTRA
     * organización -- si el negocio lo requiere en el futuro (p. ej. un
     * responsable de EcoLink supervisando una programación de un tenant),
     * es una decisión de negocio pendiente, no asumida aquí.
     */
    private function assertUserBelongsToOrganization(int $userId, ?int $organizationId): void
    {
        $user = User::query()->find($userId);

        if ($user && (int) $user->tenant_organization_id !== (int) $organizationId) {
            throw ValidationException::withMessages([
                'responsible_user_id' => ['El usuario responsable indicado no pertenece a su organización.'],
            ]);
        }
    }

    private function assertOrganizationCanTransportWaste(?int $organizationId): void
    {
        $organization = Organization::query()->find($organizationId);

        if (! $organization || ! $organization->hasCapability('can_transport_waste')) {
            throw ValidationException::withMessages([
                'organization_id' => ['Solo organizaciones con capacidad de transporte pueden crear programaciones de transporte.'],
            ]);
        }
    }

    private function defaultTransportStatusId(string $code): int
    {
        $id = TransportStatus::query()->where('code', $code)->value('id');

        if ($id === null) {
            throw new \LogicException("Catálogo transport_statuses sin el valor '{$code}' sembrado.");
        }

        return $id;
    }

    /**
     * Mismo criterio que `ServiceRequestController::generateRequestCode()`:
     * `transport_schedules.schedule_number` es NOT NULL UNIQUE (global, sin
     * mecanismo de generación confirmado por ningún D-PRG) -- se genera
     * server-side, nunca se acepta del cliente.
     */
    private function generateScheduleNumber(int $organizationId): string
    {
        do {
            $code = sprintf('PRG-%d-%s', $organizationId, Str::upper(Str::random(8)));
        } while (TransportSchedule::withTrashed()->where('schedule_number', $code)->exists());

        return $code;
    }

    private function headerValidationRules(bool $sometimes = false): array
    {
        $required = $sometimes ? 'sometimes' : 'required';

        return [
            'waste_service_request_id' => [$required, 'integer', 'exists:waste_service_requests,id'],
            'vehicle_id' => [$required, 'integer', 'exists:vehicles,id'],
            'transport_personnel_id' => [$required, 'integer', 'exists:transport_personnel,id'],
            'source_branch_id' => [$required, 'integer', 'exists:branches,id'],
            'destination_branch_id' => [$required, 'integer', 'exists:branches,id'],
            'scheduled_pickup_at' => [$required, 'date'],
            'pickup_window_start' => ['sometimes', 'nullable', 'date'],
            'pickup_window_end' => ['sometimes', 'nullable', 'date'],
            'priority' => ['sometimes', 'string', 'max:20'],
            'estimated_weight_kg' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'estimated_volume_m3' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'planned_distance_km' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'planned_duration_minutes' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'requires_special_handling' => ['sometimes', 'boolean'],
            'observations' => ['sometimes', 'nullable', 'string'],
            'responsible_user_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ];
    }

    private function itemValidationRules(): array
    {
        return [
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.waste_service_request_item_id' => ['required', 'integer', 'exists:waste_service_request_items,id'],
            'items.*.scheduled_quantity' => ['required', 'numeric', 'min:0'],
            'items.*.measurement_unit_id' => ['sometimes', 'nullable', 'integer', 'exists:measurement_units,id'],
            'items.*.estimated_weight_kg' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.estimated_volume_m3' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.container_quantity' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'items.*.packaging_type' => ['sometimes', 'nullable', 'string', 'max:100'],
            'items.*.length_cm' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.width_cm' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.height_cm' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'items.*.requires_special_handling' => ['sometimes', 'boolean'],
            'items.*.observations' => ['sometimes', 'nullable', 'string'],
            'items.*.metadata' => ['sometimes', 'nullable', 'array'],
        ];
    }
}
