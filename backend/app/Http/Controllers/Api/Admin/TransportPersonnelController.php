<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Person;
use App\Models\TransportPersonnel;
use App\Policies\TransportPersonnelPolicy;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * CRUD de Conductores (`transport_personnel`, extensión 1:1 de `Person` --
 * esquema-bd hallazgo #7, CU-030/D-PRG-03/D-PRG-04). Gap real señalado por
 * el agente de frontend: `TransportScheduleController::store()`/`update()`
 * ya EXIGEN un `transport_personnel_id` válido desde Fase 2a, pero no
 * existía ningún endpoint para darlos de alta -- mismo patrón EXACTO que
 * `VehicleController` (acceso DUAL, anti-role-smuggling de
 * `organization_id`, Policy explícita vía `new TransportPersonnelPolicy`, no
 * `Gate::authorize()`).
 *
 * Sin `activate()`/`deactivate()` dedicados (a diferencia de
 * `VehicleController`): `transport_personnel` solo tiene `is_active` (no un
 * `operational_status` separado como `Vehicle`), así que se gestiona
 * directamente vía `update()` bajo el único permiso
 * `transport_personnel.update` -- decisión de este lote, catálogo de solo 3
 * permisos (`.read`/`.create`/`.update`, no 5 como `vehicles.*`).
 *
 * `person_id` (UNIQUE 1:1 en `transport_personnel`, esquema-bd): la
 * constraint de la migración real es un UNIQUE simple, NO parcial
 * (`WHERE deleted_at IS NULL`) como sí ocurre con `vehicles.plate_number`/
 * `.vin`/`.code` -- un registro de conductor soft-eliminado sigue ocupando
 * el slot de unicidad de esa persona. Gap de esquema señalado explícitamente
 * (no corregido en este lote, requeriría una migración de índice parcial);
 * se cubre en la capa de aplicación capturando
 * `UniqueConstraintViolationException` y devolviendo un 422 legible, mismo
 * patrón que `VehicleController::messagesForUniqueViolation()`.
 */
class TransportPersonnelController extends Controller
{
    use LogsSecurityEvents;

    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new TransportPersonnelPolicy)->viewAny($actor), 403, 'No tiene permiso para consultar conductores.');

        $organizationId = $request->input('organization_id');
        $search = $request->input('search');

        $personnel = TransportPersonnel::query()
            ->when(! $actor->isPlatformStaff(), fn ($query) => $query->where('organization_id', $actor->tenant_organization_id))
            ->when($actor->isPlatformStaff() && $organizationId, fn ($query) => $query->where('organization_id', $organizationId))
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('license_number', 'ILIKE', "%{$search}%")
                        ->orWhereHas('person', function ($query) use ($search) {
                            $query->where('full_name', 'ILIKE', "%{$search}%")
                                ->orWhere('document_number', 'ILIKE', "%{$search}%");
                        });
                });
            })
            ->when($request->has('is_active'), fn ($query) => $query->where('is_active', $request->boolean('is_active')))
            ->with(['organization:id,legal_name', 'person:id,full_name,document_number'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($personnel);
    }

    public function show(Request $request, TransportPersonnel $transportPersonnel)
    {
        abort_unless((new TransportPersonnelPolicy)->view($request->user(), $transportPersonnel), 403, 'No tiene acceso a este conductor.');

        $transportPersonnel->load([
            'organization:id,legal_name',
            'person',
            'createdBy:id,username',
            'updatedBy:id,username',
        ]);

        return response()->json(['transport_personnel' => $transportPersonnel]);
    }

    public function store(Request $request)
    {
        $actor = $request->user();

        // Anti-role-smuggling (mismo criterio que VehicleController::store()):
        // un tenant admin SIEMPRE registra el conductor en SU propia
        // organización, sin importar lo que venga en el payload.
        $organizationId = $actor->isPlatformStaff()
            ? $request->integer('organization_id')
            : $actor->tenant_organization_id;

        abort_unless((new TransportPersonnelPolicy)->create($actor, $organizationId), 403, 'No tiene permiso para crear conductores.');

        $rules = $this->validationRules();

        if ($actor->isPlatformStaff()) {
            $rules['organization_id'] = ['required', 'integer', 'exists:organizations,id'];
        }

        $data = $request->validate($rules);
        $data['organization_id'] = $organizationId;

        $this->assertPersonBelongsToOrganization((int) $data['person_id'], $organizationId);

        // is_active SIEMPRE nace en true, ignora cualquier valor enviado por
        // el cliente en creación -- mismo criterio que
        // VehicleController::store() (hallazgo Medio, especialista-
        // seguridad, 2026-07-16).
        $data['is_active'] = true;
        $data['created_by'] = $actor->id;
        $data['updated_by'] = $actor->id;

        try {
            $personnel = TransportPersonnel::query()->create($data);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'person_id' => ['Esta persona ya está registrada como conductor.'],
            ]);
        }

        $this->logSecurityEvent(
            $request, 'TRANSPORT_PERSONNEL_CREATED', 'SUCCESS',
            "Conductor registrado (persona #{$personnel->person_id}).", $actor,
            ['transport_personnel_id' => $personnel->id, 'organization_id' => $personnel->organization_id],
        );

        return response()->json(['transport_personnel' => $personnel->fresh(['organization:id,legal_name', 'person'])], 201);
    }

    /**
     * `organization_id`/`person_id` NO editables tras creación -- mismo
     * criterio que `organization_id` en `Vehicle`/`Branch` (el vínculo 1:1
     * con la persona y la organización dueña del recurso se fijan solo en
     * creación).
     */
    public function update(Request $request, TransportPersonnel $transportPersonnel)
    {
        $actor = $request->user();
        abort_unless((new TransportPersonnelPolicy)->update($actor, $transportPersonnel), 403, 'No tiene acceso a este conductor.');

        $data = $request->validate($this->validationRules(sometimes: true));
        unset($data['organization_id'], $data['person_id']);

        $transportPersonnel->fill($data);
        $transportPersonnel->updated_by = $actor->id;
        $transportPersonnel->save();

        $this->logSecurityEvent(
            $request, 'TRANSPORT_PERSONNEL_UPDATED', 'SUCCESS',
            "Conductor #{$transportPersonnel->id} modificado.", $actor,
            ['transport_personnel_id' => $transportPersonnel->id, 'organization_id' => $transportPersonnel->organization_id],
        );

        return response()->json(['transport_personnel' => $transportPersonnel->fresh(['organization:id,legal_name', 'person'])]);
    }

    private function validationRules(bool $sometimes = false): array
    {
        $required = $sometimes ? 'sometimes' : 'required';

        return [
            'person_id' => [
                $required, 'integer', 'exists:people,id',
                Rule::unique('transport_personnel', 'person_id')->whereNull('deleted_at'),
            ],
            'license_number' => ['sometimes', 'nullable', 'string', 'max:100'],
            'license_category' => ['sometimes', 'nullable', 'string', 'max:20'],
            'license_expiration_date' => ['sometimes', 'nullable', 'date'],
            'has_hazmat_permit' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ];
    }

    /**
     * Anti-IDOR (mismo criterio EXACTO que
     * `TransportScheduleController::assertBranchBelongsToOrganization()`):
     * CORREGIDO (verificación E2E, 2026-07-20): la versión original comparaba
     * contra `people.organization_id` -- columna LEGACY que queda `NULL` para
     * todo contacto creado por el flujo real vigente (`organization_contacts`,
     * D-P02/L-08), lo que rechazaba a CUALQUIER contacto real como conductor
     * ("La persona indicada no pertenece a la organización.", reproducido en
     * vivo con un contacto de demo). Mismo criterio ya usado y correcto en
     * `OrganizationController::searchContacts()`: pertenencia vía
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
                'person_id' => ['La persona indicada no pertenece a la organización.'],
            ]);
        }
    }
}
