<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\ManifestLoad;
use App\Models\ManifestLoadItem;
use App\Models\ManifestStatus;
use App\Models\Person;
use App\Models\TransportSchedule;
use App\Policies\ManifestLoadPolicy;
use App\Services\ManifestLoadSignatureService;
use App\Services\ManifestLoadWorkflowService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Módulo Manifiesto de Cargue, Fase 3 -- el documento/registro que se genera
 * y firma en la planta del Generador ANTES de que el vehículo transporte los
 * residuos hacia el Gestor. Gobernado por el motor de Workflow genérico
 * (`entity_type=MANIFEST`, `ManifestLoadWorkflowSeeder`).
 *
 * Grafo cubierto por ESTE controller (ver `ManifestLoadWorkflowSeeder`):
 *   Draft ->(generate)-> Generated ->(sign, automático)-> PartiallySigned
 *   ->(sign, automático)-> Signed ->(startTransit)-> InTransit
 *   Cancelled alcanzable SOLO desde Generated/PartiallySigned.
 * `Received`/`Closed` pertenecen al ciclo de vida del futuro
 * `manifest_unloads` (Fase 5, descarga en planta del Gestor) -- NO se
 * transiciona hacia esos códigos en este controller (alcance diferido).
 *
 * `store()` deriva AUTOMÁTICAMENTE `generator_branch_id`/
 * `carrier_organization_id`/`vehicle_id`/`transport_personnel_id`/
 * `driver_signer_person_id` del `transport_schedule_id` recibido -- no se
 * aceptan independientes en el payload (decisión de diseño de esta tarea,
 * fuente única de verdad con la programación ya confirmada). Solo
 * `generator_signer_person_id` se elige a mano (anti-IDOR: debe pertenecer a
 * la organización Generadora dueña de `source_branch_id`, NO a la
 * organización actora que crea el manifiesto -- mismo criterio que
 * `TransportPersonnelController::assertPersonBelongsToOrganization()`,
 * adaptado a la organización del Generador en vez de la del actor).
 *
 * `manifest_load_items` se derivan, una línea por cada
 * `transport_schedule_item` vinculado -- no se seleccionan a mano.
 */
class ManifestLoadController extends Controller
{
    use LogsSecurityEvents;

    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new ManifestLoadPolicy)->viewAny($actor), 403, 'No tiene permiso para consultar manifiestos de cargue.');

        $organizationId = $request->input('organization_id');
        $search = $request->input('search');
        $statusCode = $request->input('status');

        $manifests = ManifestLoad::query()
            ->when(! $actor->isPlatformStaff(), function ($query) use ($actor) {
                $query->where(function ($query) use ($actor) {
                    $query->where('carrier_organization_id', $actor->tenant_organization_id)
                        ->orWhereHas('generatorBranch', fn ($query) => $query->where('organization_id', $actor->tenant_organization_id));
                });
            })
            ->when($actor->isPlatformStaff() && $organizationId, fn ($query) => $query->where('carrier_organization_id', $organizationId))
            ->when($search, fn ($query) => $query->where('manifest_number', 'ILIKE', "%{$search}%"))
            ->when($statusCode, function ($query) use ($statusCode) {
                $query->whereHas('manifestStatus', fn ($query) => $query->where('code', $statusCode));
            })
            ->with(['manifestStatus', 'transportSchedule:id,schedule_number', 'carrierOrganization:id,legal_name', 'generatorBranch:id,name,organization_id', 'vehicle:id,plate_number'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($manifests);
    }

    public function show(Request $request, ManifestLoad $manifestLoad)
    {
        $actor = $request->user();
        abort_unless((new ManifestLoadPolicy)->view($actor, $manifestLoad), 403, 'No tiene acceso a este manifiesto de cargue.');

        $manifestLoad->load([
            'manifestStatus',
            'transportSchedule:id,schedule_number,organization_id',
            'generatorBranch:id,name,organization_id',
            'carrierOrganization:id,legal_name',
            'vehicle',
            'transportPersonnel.person',
            'generatorSignerPerson',
            'driverSignerPerson',
            'items.waste:id,name,code',
            'items.approvedTreatment',
        ]);

        return response()->json(['manifest_load' => $manifestLoad]);
    }

    /**
     * Crea la cabecera (estado inicial `manifest_status_id=DRAFT`) +
     * `manifest_load_items` derivados del `transport_schedule_id`, en una
     * única transacción. Ver el docblock completo de la clase.
     */
    public function store(Request $request)
    {
        $actor = $request->user();

        $data = $request->validate([
            'transport_schedule_id' => ['required', 'integer', 'exists:transport_schedules,id'],
            'generator_signer_person_id' => ['required', 'integer', 'exists:people,id'],
            'load_date' => ['sometimes', 'nullable', 'date'],
            'observations' => ['sometimes', 'nullable', 'string'],
        ]);

        $transportSchedule = TransportSchedule::query()
            ->with(['sourceBranch', 'transportPersonnel', 'items.wasteServiceRequestItem', 'items.measurementUnit'])
            ->findOrFail($data['transport_schedule_id']);

        abort_unless((new ManifestLoadPolicy)->create($actor, $transportSchedule), 403, 'No tiene permiso para crear un manifiesto de cargue para esta programación.');

        $generatorOrganizationId = $transportSchedule->sourceBranch?->organization_id;
        $this->assertPersonBelongsToOrganization((int) $data['generator_signer_person_id'], $generatorOrganizationId);

        $carrierOrganizationId = $transportSchedule->organization_id;
        $draftStatusId = $this->defaultManifestStatusId('DRAFT');

        // Hallazgo Medio (revisión de seguridad Manifiesto de Cargue,
        // 2026-07-19): pre-chequeo de aplicación ANTES de tocar la BD, mismo
        // criterio que `TransportScheduleController::itemAlreadyScheduled()`
        // -- da un 422 con mensaje claro en el caso normal (secuencial); la
        // condición de carrera real (2 requests concurrentes) la cubre el
        // índice único parcial `manifest_loads_active_unique` + el
        // try/catch(UniqueConstraintViolationException) de abajo.
        if ($this->manifestAlreadyActiveForSchedule($transportSchedule->id)) {
            throw ValidationException::withMessages([
                'transport_schedule_id' => ['Ya existe un manifiesto de cargue activo para esta programación de transporte. Cancele el manifiesto anterior antes de crear uno de reemplazo.'],
            ]);
        }

        try {
            $manifestLoad = DB::transaction(function () use ($data, $transportSchedule, $carrierOrganizationId, $draftStatusId) {
                $manifestLoad = new ManifestLoad;
                $manifestLoad->fill([
                    'tenant_organization_id' => $carrierOrganizationId,
                    'manifest_number' => $this->generateManifestNumber($carrierOrganizationId),
                    'transport_schedule_id' => $transportSchedule->id,
                    'generator_branch_id' => $transportSchedule->source_branch_id,
                    'carrier_organization_id' => $carrierOrganizationId,
                    'vehicle_id' => $transportSchedule->vehicle_id,
                    'transport_personnel_id' => $transportSchedule->transport_personnel_id,
                    'load_date' => $data['load_date'] ?? now()->toDateString(),
                    'generator_signer_person_id' => $data['generator_signer_person_id'],
                    // RN-192: transportador SIEMPRE derivado del transport_schedule --
                    // ver docblock de la clase.
                    'driver_signer_person_id' => $transportSchedule->transportPersonnel->person_id,
                    'observations' => $data['observations'] ?? null,
                    'is_active' => true,
                ]);
                // `manifest_status_id` se retira del $fillable -- ver docblock del modelo.
                $manifestLoad->forceFill(['manifest_status_id' => $draftStatusId]);
                $manifestLoad->save();

                foreach ($transportSchedule->items as $scheduleItem) {
                    ManifestLoadItem::query()->create([
                        'tenant_organization_id' => $manifestLoad->tenant_organization_id,
                        'manifest_load_id' => $manifestLoad->id,
                        'transport_schedule_item_id' => $scheduleItem->id,
                        'waste_id' => $scheduleItem->waste_id,
                        'approved_treatment_id' => $scheduleItem->wasteServiceRequestItem?->waste_treatment_approval_id,
                        'declared_quantity' => $scheduleItem->scheduled_quantity,
                        'unit_of_measure' => $scheduleItem->measurementUnit?->code ?? 'KG',
                        'is_active' => true,
                    ]);
                }

                return $manifestLoad;
            });
        } catch (UniqueConstraintViolationException) {
            // Red de seguridad para la condición de carrera (2 requests
            // concurrentes creando un manifiesto para la misma programación)
            // -- el pre-chequeo de arriba solo ve manifiestos YA
            // confirmados/commiteados, no protege contra 2 transacciones
            // abiertas al mismo tiempo.
            throw ValidationException::withMessages([
                'transport_schedule_id' => ['Ya existe un manifiesto de cargue activo para esta programación de transporte. Intente nuevamente.'],
            ]);
        }

        $this->logSecurityEvent(
            $request, 'MANIFEST_LOAD_CREATED', 'SUCCESS',
            "Manifiesto de cargue '{$manifestLoad->manifest_number}' creado.", $actor,
            ['manifest_load_id' => $manifestLoad->id, 'carrier_organization_id' => $carrierOrganizationId],
        );

        return response()->json(['manifest_load' => $manifestLoad->fresh(['items', 'manifestStatus', 'carrierOrganization:id,legal_name', 'vehicle', 'transportPersonnel'])], 201);
    }

    /**
     * Draft -> Generated (rol LOGÍSTICA, lado transportador).
     */
    public function generate(Request $request, ManifestLoad $manifestLoad)
    {
        $actor = $request->user();
        abort_unless((new ManifestLoadPolicy)->manage($actor, $manifestLoad), 403, 'No tiene acceso a este manifiesto de cargue.');

        if ($manifestLoad->manifestStatus?->code !== 'DRAFT') {
            throw ValidationException::withMessages([
                'manifest_status' => ['Solo se puede generar un manifiesto en estado Borrador.'],
            ]);
        }

        $manifestLoad = ManifestLoadWorkflowService::transition($manifestLoad, $actor, 'GENERATED');

        $this->logSecurityEvent(
            $request, 'MANIFEST_LOAD_GENERATED', 'SUCCESS',
            "Manifiesto de cargue '{$manifestLoad->manifest_number}' generado.", $actor,
            ['manifest_load_id' => $manifestLoad->id, 'carrier_organization_id' => $manifestLoad->carrier_organization_id],
        );

        return response()->json(['manifest_load' => $manifestLoad->fresh(['manifestStatus'])]);
    }

    /**
     * RN-193 ("no puede iniciarse transporte sin firma completa"): guarda
     * EXPLÍCITA además de la que ya impone el motor de Workflow (solo existe
     * una `workflow_transition` Signed->InTransit, así que si el estado
     * actual no es `SIGNED` la transición ya fallaría de todos modos) --
     * defensa en profundidad, mismo criterio ya aplicado en otras fases de
     * este proyecto.
     */
    public function startTransit(Request $request, ManifestLoad $manifestLoad)
    {
        $actor = $request->user();
        abort_unless((new ManifestLoadPolicy)->manage($actor, $manifestLoad), 403, 'No tiene acceso a este manifiesto de cargue.');

        if ($manifestLoad->manifestStatus?->code !== 'SIGNED'
            || $manifestLoad->generator_signed_at === null
            || $manifestLoad->driver_signed_at === null) {
            throw ValidationException::withMessages([
                'manifest_status' => ['No puede iniciarse el tránsito sin que ambas firmas (generador y conductor) estén completas.'],
            ]);
        }

        $manifestLoad = ManifestLoadWorkflowService::transition($manifestLoad, $actor, 'IN_TRANSIT');

        $this->logSecurityEvent(
            $request, 'MANIFEST_LOAD_IN_TRANSIT', 'SUCCESS',
            "Manifiesto de cargue '{$manifestLoad->manifest_number}' inició tránsito.", $actor,
            ['manifest_load_id' => $manifestLoad->id, 'carrier_organization_id' => $manifestLoad->carrier_organization_id],
        );

        return response()->json(['manifest_load' => $manifestLoad->fresh(['manifestStatus'])]);
    }

    /**
     * Firma como generador o conductor (`ManifestLoadSignatureService::sign()`)
     * -- recalcula `manifest_status_id` automáticamente (Generated si ninguna
     * firma, PartiallySigned si una, Signed si ambas).
     */
    public function sign(Request $request, ManifestLoad $manifestLoad)
    {
        $actor = $request->user();
        abort_unless((new ManifestLoadPolicy)->sign($actor, $manifestLoad), 403, 'No tiene acceso a este manifiesto de cargue.');

        $data = $request->validate([
            'signer_type' => ['required', 'string', Rule::in([
                ManifestLoadSignatureService::SIGNER_GENERATOR,
                ManifestLoadSignatureService::SIGNER_DRIVER,
            ])],
        ]);

        $manifestLoad = ManifestLoadSignatureService::sign($manifestLoad, $actor, $data['signer_type']);

        $this->logSecurityEvent(
            $request, 'MANIFEST_LOAD_SIGNED', 'SUCCESS',
            "Manifiesto de cargue '{$manifestLoad->manifest_number}' firmado ({$data['signer_type']}).", $actor,
            ['manifest_load_id' => $manifestLoad->id, 'signer_type' => $data['signer_type']],
        );

        return response()->json(['manifest_load' => $manifestLoad->fresh(['manifestStatus'])]);
    }

    /**
     * -> Cancelled, alcanzable SOLO desde Generated/PartiallySigned -- desde
     * Draft/Signed/InTransit NO existe una `workflow_transition` sembrada
     * hacia Cancelled, así que `ManifestLoadWorkflowService::transition()` la
     * rechaza automáticamente con 422.
     */
    public function cancel(Request $request, ManifestLoad $manifestLoad)
    {
        $actor = $request->user();
        abort_unless((new ManifestLoadPolicy)->cancel($actor, $manifestLoad), 403, 'No tiene acceso a este manifiesto de cargue.');

        $manifestLoad = ManifestLoadWorkflowService::transition($manifestLoad, $actor, 'CANCELLED');

        $this->logSecurityEvent(
            $request, 'MANIFEST_LOAD_CANCELLED', 'SUCCESS',
            "Manifiesto de cargue '{$manifestLoad->manifest_number}' cancelado.", $actor,
            ['manifest_load_id' => $manifestLoad->id, 'carrier_organization_id' => $manifestLoad->carrier_organization_id],
        );

        return response()->json(['manifest_load' => $manifestLoad->fresh(['manifestStatus'])]);
    }

    /**
     * Anti-IDOR: `generator_signer_person_id` debe pertenecer a la
     * organización GENERADORA (dueña de `source_branch_id`), NO a la
     * organización actora que está creando el manifiesto (que es el
     * Gestor/carrier).
     *
     * CORREGIDO (verificación E2E, 2026-07-20): la versión original comparaba
     * contra `people.organization_id` -- columna LEGACY que queda `NULL` para
     * todo contacto creado por el flujo real vigente (`organization_contacts`,
     * D-P02/L-08), lo que rechazaba a CUALQUIER contacto real como firmante.
     * Mismo criterio ya corregido en
     * `TransportPersonnelController::assertPersonBelongsToOrganization()` y
     * ya usado en `OrganizationController::searchContacts()`: pertenencia vía
     * `organizationLinks()` (pivote `organization_contacts`) con vínculo
     * ACTIVO. `withTrashed()` -- una persona soft-eliminada de OTRA
     * organización no debe pasar silenciosamente el chequeo.
     */
    private function assertPersonBelongsToOrganization(int $personId, ?int $organizationId): void
    {
        $person = Person::withTrashed()->find($personId);

        if (! $person) {
            return;
        }

        $belongs = $person->organizationLinks()
            ->where('organization_id', $organizationId)
            ->where('is_active', true)
            ->exists();

        if (! $belongs) {
            throw ValidationException::withMessages([
                'generator_signer_person_id' => ['La persona indicada no pertenece a la organización Generadora de la sede de cargue.'],
            ]);
        }
    }

    /**
     * "Activo" = `is_active=true` (mismo criterio que
     * `TransportScheduleController::itemAlreadyScheduled()`) -- un manifiesto
     * CANCELLED apaga `is_active` a `false`
     * (`ManifestLoadWorkflowService::transition()`), así que queda libre de
     * inmediato para un manifiesto de reemplazo sobre la misma programación.
     */
    private function manifestAlreadyActiveForSchedule(int $transportScheduleId): bool
    {
        return ManifestLoad::query()
            ->where('transport_schedule_id', $transportScheduleId)
            ->where('is_active', true)
            ->exists();
    }

    private function defaultManifestStatusId(string $code): int
    {
        $id = ManifestStatus::query()->where('code', $code)->value('id');

        if ($id === null) {
            throw new \LogicException("Catálogo manifest_statuses sin el valor '{$code}' sembrado.");
        }

        return $id;
    }

    /**
     * Mismo criterio que `TransportScheduleController::generateScheduleNumber()`,
     * adaptado a D-MAN-03 (único POR ORGANIZACIÓN, no global) -- se genera
     * server-side, nunca se acepta del cliente.
     */
    private function generateManifestNumber(int $carrierOrganizationId): string
    {
        do {
            $code = sprintf('MAN-%d-%s', $carrierOrganizationId, Str::upper(Str::random(8)));
        } while (ManifestLoad::withTrashed()->where('tenant_organization_id', $carrierOrganizationId)->where('manifest_number', $code)->exists());

        return $code;
    }
}
