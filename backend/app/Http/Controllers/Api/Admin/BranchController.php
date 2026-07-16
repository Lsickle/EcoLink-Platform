<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Department;
use App\Models\Locality;
use App\Models\Municipality;
use App\Models\Person;
use App\Models\SecurityLog;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * CRUD de Sedes (Branches) vs. Figma. Acceso DUAL (a diferencia de
 * `OrganizationController`, exclusivo de platform staff): platform staff
 * gestiona TODAS las sedes de TODAS las organizaciones; un admin de tenant
 * gestiona SOLO las de su propia organización (`tenant_organization_id`) --
 * ver `Branch::isAccessibleBy()`/`BranchPolicy`. Sin variantes por tipo de
 * organización (`business_role` de la organización dueña) -- una sola
 * vista/lógica, decisión ya confirmada en el plan de este lote.
 *
 * Calca el patrón de tenant-scoping/anti-role-smuggling de
 * `OrganizationController::store()` y el estilo de filtros/sort/Gate de
 * `BranchTypeController`.
 */
class BranchController extends Controller
{
    use LogsSecurityEvents;

    private const STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

    private const BRANCH_EVENTS = ['BRANCH_CREATED', 'BRANCH_UPDATED', 'BRANCH_ACTIVATED', 'BRANCH_DEACTIVATED'];

    /**
     * `organization_id` como filtro SOLO tiene efecto para platform staff --
     * un tenant admin ya está acotado a la suya, el parámetro se ignora si
     * lo manda (no es un error, simplemente no aporta nada nuevo).
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', Branch::class);
        $actor = $request->user();

        $search = $request->input('search');
        $organizationId = $request->input('organization_id');
        $departmentId = $request->input('department_id');
        $municipalityId = $request->input('municipality_id');
        $status = $request->input('status');
        $branchTypeId = $request->input('branch_type_id');

        $sortableColumns = ['name', 'code', 'status', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'name';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $branches = Branch::query()
            ->when(! $actor->isPlatformStaff(), fn ($query) => $query->where('organization_id', $actor->tenant_organization_id))
            ->when($actor->isPlatformStaff() && $organizationId, fn ($query) => $query->where('organization_id', $organizationId))
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('name', 'ILIKE', "%{$search}%")
                        ->orWhere('code', 'ILIKE', "%{$search}%");
                });
            })
            ->when($departmentId, fn ($query) => $query->where('department_id', $departmentId))
            ->when($municipalityId, fn ($query) => $query->where('municipality_id', $municipalityId))
            ->when($status, fn ($query) => $query->where('status', $status))
            ->when($branchTypeId, fn ($query) => $query->where('branch_type_id', $branchTypeId))
            ->with(['organization:id,legal_name', 'municipality:id,name'])
            ->withCount('users')
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        return response()->json([
            ...$branches->toArray(),
            'kpis' => $this->statusKpis($actor),
        ]);
    }

    public function show(Request $request, Branch $branch)
    {
        Gate::authorize('view', $branch);

        $branch->load([
            'organization:id,legal_name',
            'branchType',
            'country',
            'department',
            'municipality',
            'locality',
            'createdBy:id,username',
            'updatedBy:id,username',
        ]);
        $branch->loadCount('users');

        return response()->json(['branch' => $branch]);
    }

    public function store(Request $request)
    {
        Gate::authorize('create', Branch::class);
        $actor = $request->user();

        // Anti-role-smuggling (mismo criterio que
        // OrganizationController::store()): un tenant admin SIEMPRE crea en
        // SU propia organización, sin importar lo que venga en el payload.
        $organizationId = $actor->isPlatformStaff()
            ? $request->integer('organization_id')
            : $actor->tenant_organization_id;

        $rules = $this->validationRules($organizationId);

        if ($actor->isPlatformStaff()) {
            $rules['organization_id'] = ['required', 'integer', 'exists:organizations,id'];
        }

        $data = $request->validate($rules);
        $data['organization_id'] = $organizationId;

        $this->assertGeographyChainIsCoherent($data);

        $data['status'] = $data['status'] ?? 'ACTIVE';
        $data['is_active'] = $data['is_active'] ?? true;
        $data['created_by'] = $actor->id;
        $data['updated_by'] = $actor->id;

        // Hallazgo Medio (especialista-seguridad, 2026-07-15): ventana
        // residual de carrera sobre el índice único parcial de `code` --
        // mismo patrón ya establecido en OrganizationController::store().
        try {
            $branch = Branch::query()->create($data);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'code' => ['Ya existe una sede con este código en la organización.'],
            ]);
        }

        $this->logSecurityEvent(
            $request, 'BRANCH_CREATED', 'SUCCESS',
            "Sede '{$branch->name}' creada.", $actor,
            ['branch_id' => $branch->id, 'organization_id' => $branch->organization_id],
        );

        return response()->json(['branch' => $branch->fresh(['organization:id,legal_name', 'branchType'])], 201);
    }

    /**
     * `organization_id` NO editable tras creación -- mismo criterio que
     * `tax_id`/`tax_id_type` de Organización: se descarta explícitamente de
     * los datos validados si viene en el payload, nunca falla por su
     * presencia.
     */
    public function update(Request $request, Branch $branch)
    {
        Gate::authorize('update', $branch);
        $actor = $request->user();

        $rules = $this->validationRules($branch->organization_id, $branch->id, sometimes: true);
        $data = $request->validate($rules);
        unset($data['organization_id']);

        $this->assertGeographyChainIsCoherent([
            'country_id' => array_key_exists('country_id', $data) ? $data['country_id'] : $branch->country_id,
            'department_id' => array_key_exists('department_id', $data) ? $data['department_id'] : $branch->department_id,
            'municipality_id' => array_key_exists('municipality_id', $data) ? $data['municipality_id'] : $branch->municipality_id,
            'locality_id' => array_key_exists('locality_id', $data) ? $data['locality_id'] : $branch->locality_id,
        ]);

        $branch->fill($data);
        $branch->updated_by = $actor->id;
        $branch->save();

        $this->logSecurityEvent(
            $request, 'BRANCH_UPDATED', 'SUCCESS',
            "Sede '{$branch->name}' modificada.", $actor,
            ['branch_id' => $branch->id, 'organization_id' => $branch->organization_id],
        );

        return response()->json(['branch' => $branch->fresh(['organization:id,legal_name', 'branchType'])]);
    }

    /**
     * `update` autoriza el acceso a ESTA sede; `branches.activate` es el
     * permiso ESPECÍFICO que gobierna la acción (no basta con
     * `branches.update` en exclusiva, mismo criterio granular ya usado en
     * `users.activate`/`users.deactivate`).
     */
    public function activate(Request $request, Branch $branch)
    {
        Gate::authorize('update', $branch);
        abort_unless($request->user()->hasPermission('branches.activate'), 403, 'No tiene permiso para activar sedes.');

        $branch->forceFill(['status' => 'ACTIVE', 'is_active' => true, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'BRANCH_ACTIVATED', 'SUCCESS',
            "Sede '{$branch->name}' activada.", $request->user(),
            ['branch_id' => $branch->id, 'organization_id' => $branch->organization_id],
        );

        return response()->json(['branch' => $branch->fresh()]);
    }

    public function deactivate(Request $request, Branch $branch)
    {
        Gate::authorize('update', $branch);
        abort_unless($request->user()->hasPermission('branches.deactivate'), 403, 'No tiene permiso para inactivar sedes.');

        $branch->forceFill(['status' => 'INACTIVE', 'is_active' => false, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'BRANCH_DEACTIVATED', 'SUCCESS',
            "Sede '{$branch->name}' inactivada.", $request->user(),
            ['branch_id' => $branch->id, 'organization_id' => $branch->organization_id],
        );

        return response()->json(['branch' => $branch->fresh()]);
    }

    /**
     * Tab "Usuarios" -- mismo shape que
     * `OrganizationController::users()`/`UserManagementController::index()`.
     */
    public function users(Request $request, Branch $branch)
    {
        Gate::authorize('view', $branch);

        $users = User::query()
            ->where('branch_id', $branch->id)
            ->with(['person', 'status', 'roles'])
            ->paginate($request->integer('per_page', 15));

        return response()->json($users);
    }

    /**
     * Tab "Contactos" -- mismo shape que `OrganizationController::contacts()`.
     */
    public function contacts(Request $request, Branch $branch)
    {
        Gate::authorize('view', $branch);

        $contacts = $branch->contacts()->with('user:id,person_id')->paginate($request->integer('per_page', 15));

        $contacts->getCollection()->transform(function (Person $person) {
            $data = $person->toArray();
            $data['has_user_account'] = $person->user !== null;
            $data['organization_contact_id'] = $person->pivot->id;
            $data['organization_id'] = $person->pivot->organization_id;
            $data['position_title'] = $person->pivot->position_title;
            $data['relationship_type'] = $person->pivot->relationship_type;
            $data['is_primary'] = $person->pivot->is_primary;
            unset($data['user'], $data['pivot']);

            return $data;
        });

        return response()->json($contacts);
    }

    /**
     * Tab "Actividad" -- mismo patrón que
     * `OrganizationController::activity()`/`RoleController::activity()`:
     * exige `audit.read` Y que la sede sea accesible por el actor.
     */
    public function activity(Request $request, Branch $branch)
    {
        abort_unless($request->user()->hasPermission('audit.read'), 403, 'No tiene permiso para consultar la auditoría de sedes.');
        abort_unless($branch->isAccessibleBy($request->user()), 403, 'No tiene acceso a esta sede.');

        $logs = SecurityLog::query()
            ->whereIn('event_type', self::BRANCH_EVENTS)
            ->where('metadata->branch_id', $branch->id)
            ->with('user:id,username')
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 15));

        $logs->getCollection()->transform(fn ($log) => [
            'event_type' => $log->event_type,
            'description' => $log->description,
            'actor' => $log->user,
            'created_at' => $log->occurred_at,
        ]);

        return response()->json($logs);
    }

    /**
     * KPIs del listado: 3 conteos por el valor real de `status`
     * (ACTIVE/INACTIVE/SUSPENDED) + total, con la MISMA visibilidad/scoping
     * que `index()` -- si es tenant admin, los KPIs son solo de su
     * organización.
     */
    private function statusKpis(User $actor): array
    {
        $base = Branch::query()->when(
            ! $actor->isPlatformStaff(),
            fn ($query) => $query->where('organization_id', $actor->tenant_organization_id),
        );

        return [
            'total' => (clone $base)->count(),
            'active' => (clone $base)->where('status', 'ACTIVE')->count(),
            'inactive' => (clone $base)->where('status', 'INACTIVE')->count(),
            'suspended' => (clone $base)->where('status', 'SUSPENDED')->count(),
        ];
    }

    /**
     * `organization_id` se maneja aparte (`store()`/`update()`, distinto
     * criterio de required/forzado según platform staff vs. tenant admin) --
     * este set cubre el resto del formulario. `code` es único COMPUESTO con
     * `organization_id` (esquema-bd: `branches.unique(['organization_id',
     * 'code'])`), excluyendo soft-deletes desde el inicio (mismo criterio ya
     * aplicado en `OrganizationController` para `tax_id`).
     */
    private function validationRules(?int $organizationId, ?int $ignoreBranchId = null, bool $sometimes = false): array
    {
        $required = $sometimes ? 'sometimes' : 'required';

        return [
            'branch_type_id' => [$required, 'integer', 'exists:branch_types,id'],
            'code' => [
                $required, 'string', 'max:50',
                Rule::unique('branches', 'code')
                    ->where(fn ($query) => $query->where('organization_id', $organizationId))
                    ->whereNull('deleted_at')
                    ->ignore($ignoreBranchId),
            ],
            'name' => [$required, 'string', 'max:255'],
            'status' => ['sometimes', 'string', Rule::in(self::STATUSES)],
            'country_id' => ['sometimes', 'nullable', 'integer', 'exists:countries,id'],
            'department_id' => ['sometimes', 'nullable', 'integer', 'exists:departments,id'],
            'municipality_id' => ['sometimes', 'nullable', 'integer', 'exists:municipalities,id'],
            'locality_id' => ['sometimes', 'nullable', 'integer', 'exists:localities,id'],
            'address' => ['sometimes', 'nullable', 'string'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
            'email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'environmental_license' => ['sometimes', 'nullable', 'string', 'max:255'],
            'license_expiration_date' => ['sometimes', 'nullable', 'date'],
            'operational_capacity' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'observations' => ['sometimes', 'nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * Coherencia de la cadena geográfica (país->departamento->municipio->
     * localidad) -- `exists:*,id` por sí solo no puede expresar que un
     * departamento pertenezca al país dado, ni que un municipio pertenezca
     * al departamento dado, etc. Cada eslabón solo se valida si AMBOS
     * extremos vienen presentes (no obliga a completar toda la cadena).
     */
    private function assertGeographyChainIsCoherent(array $data): void
    {
        if (! empty($data['department_id']) && ! empty($data['country_id'])) {
            $department = Department::query()->find($data['department_id']);
            if ($department && (int) $department->country_id !== (int) $data['country_id']) {
                throw ValidationException::withMessages([
                    'department_id' => ['El departamento indicado no pertenece al país seleccionado.'],
                ]);
            }
        }

        if (! empty($data['municipality_id']) && ! empty($data['department_id'])) {
            $municipality = Municipality::query()->find($data['municipality_id']);
            if ($municipality && (int) $municipality->department_id !== (int) $data['department_id']) {
                throw ValidationException::withMessages([
                    'municipality_id' => ['El municipio indicado no pertenece al departamento seleccionado.'],
                ]);
            }
        }

        if (! empty($data['locality_id']) && ! empty($data['municipality_id'])) {
            $locality = Locality::query()->find($data['locality_id']);
            if ($locality && (int) $locality->municipality_id !== (int) $data['municipality_id']) {
                throw ValidationException::withMessages([
                    'locality_id' => ['La localidad indicada no pertenece al municipio seleccionado.'],
                ]);
            }
        }
    }
}
