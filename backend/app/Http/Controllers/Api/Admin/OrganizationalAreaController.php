<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\OrganizationalArea;
use App\Models\Person;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Catálogo Maestro "Áreas Organizacionales" -- Batch 1/3 de Catálogos
 * Maestros. A diferencia de los 5 catálogos hermanos de este lote (globales
 * o de solo lectura), `organizational_areas.organization_id` es NOT NULL --
 * cada fila pertenece a UNA organización concreta. Gateado por
 * `organizational_areas.read`/`organizational_areas.manage` -- gap
 * señalado en el resumen entregado al hilo principal (`PermissionSeeder`
 * no tenía permisos para este módulo antes de este lote).
 *
 * AVISO -- criterio de aislamiento cross-tenant (señalado explícitamente al
 * hilo principal para revisión, por no tener un CU/RN fuente confirmado
 * literalmente para ESTE endpoint): replica el patrón ya usado por
 * `PermissionController::show()/roles()/users()` -- `isPlatformStaff()`
 * exime del scoping por organización (staff de la organización PLATAFORMA
 * ve cualquier organización); cualquier otro actor queda SIEMPRE forzado a
 * `tenant_organization_id` propio, tanto en `index` (parámetro
 * `organization_id` OPCIONAL solo para `isPlatformStaff()` -- sin él ve
 * TODAS las organizaciones, confirmado explícitamente por el usuario
 * 2026-07-18, corrige el bug donde era obligatorio; ignorado para el
 * resto) como en `store` (nunca se confía en el `organization_id` del body
 * salvo que el actor sea `isPlatformStaff()`) y en `show`/`update`/
 * `activate`/`deactivate` (vía `OrganizationalArea::isAccessibleBy()`,
 * Gate). Elegido deliberadamente el criterio MÁS conservador posible:
 * nunca se expone un área de una organización a la que el actor no tiene
 * acceso.
 */
class OrganizationalAreaController extends Controller
{
    private const LEVELS = ['Dirección', 'Gerencia', 'Coordinación'];

    /**
     * `organization_id`: filtro OPCIONAL para `isPlatformStaff()` -- sin
     * filtro, ve las áreas de TODAS las organizaciones (bug reportado por el
     * usuario 2026-07-18: antes exigía elegir una organización primero, sin
     * poder ver todas por defecto). Ignorado/forzado al tenant del actor
     * para cualquier otro caso -- eso NO cambia.
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', OrganizationalArea::class);

        $actor = $request->user();
        $isMultiOrganization = false;

        if ($actor->isPlatformStaff()) {
            $data = $request->validate([
                'organization_id' => ['nullable', 'integer', 'exists:organizations,id'],
            ]);
            $organizationId = $data['organization_id'] ?? null;
            $isMultiOrganization = $organizationId === null;
        } else {
            $organizationId = $actor->tenant_organization_id;
        }

        $search = $request->input('search');
        $status = $request->input('status');
        $parentAreaId = $request->input('parent_area_id');

        $sortableColumns = ['code', 'name', 'level', 'is_active', 'created_at'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'name';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $areas = OrganizationalArea::query()
            ->when($organizationId !== null, fn ($query) => $query->where('organization_id', $organizationId))
            // La respuesta puede mezclar áreas de varias organizaciones solo
            // cuando isPlatformStaff() no filtró por ninguna -- eager-carga
            // la organización de cada fila (mismo patrón que
            // BranchController::index()) para que el frontend no tenga que
            // resolverla aparte.
            ->when($isMultiOrganization, fn ($query) => $query->with('organization:id,legal_name,tax_id'))
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('code', 'ILIKE', "%{$search}%")
                        ->orWhere('name', 'ILIKE', "%{$search}%");
                });
            })
            ->when($status === 'active', fn ($query) => $query->where('is_active', true))
            ->when($status === 'inactive', fn ($query) => $query->where('is_active', false))
            ->when($request->filled('parent_area_id'), fn ($query) => $query->where('parent_area_id', $parentAreaId))
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        return response()->json($areas);
    }

    public function show(OrganizationalArea $organizationalArea)
    {
        Gate::authorize('view', $organizationalArea);

        return response()->json(['organizational_area' => $organizationalArea]);
    }

    /**
     * SIEMPRE fija `organization_id` del actor autenticado (nunca del input
     * del cliente), salvo `isPlatformStaff()` -- mismo criterio "nunca se
     * confía en tenant_organization_id del cliente" ya usado en
     * `UnCodeController::store()`/`WasteStreamController::store()`.
     */
    public function store(Request $request)
    {
        Gate::authorize('create', OrganizationalArea::class);

        $actor = $request->user();

        $data = $request->validate([
            'organization_id' => [$actor->isPlatformStaff() ? 'required' : 'nullable', 'integer', 'exists:organizations,id'],
            'code' => ['required', 'string', 'max:255'],
            'name' => ['required', 'string', 'max:255'],
            'parent_area_id' => ['nullable', 'integer', 'exists:organizational_areas,id'],
            'level' => ['required', 'string', Rule::in(self::LEVELS)],
            'responsible_person_id' => ['nullable', 'integer', 'exists:people,id'],
        ]);

        $organizationId = $actor->isPlatformStaff() ? $data['organization_id'] : $actor->tenant_organization_id;

        if ($organizationId === null) {
            throw ValidationException::withMessages([
                'organization_id' => ['No fue posible determinar la organización del área.'],
            ]);
        }

        if (! empty($data['parent_area_id'])) {
            $parent = OrganizationalArea::query()->find($data['parent_area_id']);

            if (! $parent || $parent->organization_id !== $organizationId) {
                throw ValidationException::withMessages([
                    'parent_area_id' => ['El área padre debe pertenecer a la misma organización.'],
                ]);
            }
        }

        if (! empty($data['responsible_person_id'])) {
            $this->assertPersonBelongsToOrganization((int) $data['responsible_person_id'], $organizationId);
        }

        $area = OrganizationalArea::query()->create([
            ...$data,
            'organization_id' => $organizationId,
            'is_active' => true,
        ]);

        return response()->json(['organizational_area' => $area], 201);
    }

    public function update(Request $request, OrganizationalArea $organizationalArea)
    {
        Gate::authorize('update', $organizationalArea);

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:255'],
            'name' => ['sometimes', 'string', 'max:255'],
            'parent_area_id' => ['sometimes', 'nullable', 'integer', 'exists:organizational_areas,id'],
            'level' => ['sometimes', 'string', Rule::in(self::LEVELS)],
            'responsible_person_id' => ['sometimes', 'nullable', 'integer', 'exists:people,id'],
        ]);

        if (array_key_exists('parent_area_id', $data) && $data['parent_area_id'] !== null) {
            if ((int) $data['parent_area_id'] === $organizationalArea->id) {
                throw ValidationException::withMessages([
                    'parent_area_id' => ['Un área no puede ser su propio padre.'],
                ]);
            }

            $parent = OrganizationalArea::query()->find($data['parent_area_id']);

            if (! $parent || $parent->organization_id !== $organizationalArea->organization_id) {
                throw ValidationException::withMessages([
                    'parent_area_id' => ['El área padre debe pertenecer a la misma organización.'],
                ]);
            }
        }

        if (array_key_exists('responsible_person_id', $data) && $data['responsible_person_id'] !== null) {
            $this->assertPersonBelongsToOrganization((int) $data['responsible_person_id'], $organizationalArea->organization_id);
        }

        $organizationalArea->fill($data);
        $organizationalArea->save();

        return response()->json(['organizational_area' => $organizationalArea]);
    }

    public function activate(OrganizationalArea $organizationalArea)
    {
        Gate::authorize('update', $organizationalArea);

        $organizationalArea->forceFill(['is_active' => true])->save();

        return response()->json(['organizational_area' => $organizationalArea->fresh()]);
    }

    public function deactivate(OrganizationalArea $organizationalArea)
    {
        Gate::authorize('update', $organizationalArea);

        $organizationalArea->forceFill(['is_active' => false])->save();

        return response()->json(['organizational_area' => $organizationalArea->fresh()]);
    }

    /**
     * Anti-IDOR: `responsible_person_id` debe pertenecer a la organización
     * indicada.
     *
     * CORREGIDO (verificación E2E, 2026-07-20 -- mismo patrón encontrado y
     * corregido en `TransportPersonnelController`/`ManifestLoadController`/
     * `ManifestUnloadController`): la versión original comparaba contra
     * `people.organization_id` -- columna LEGACY que queda `NULL` para todo
     * contacto creado por el flujo real vigente (`organization_contacts`,
     * D-P02/L-08), lo que rechazaba a CUALQUIER contacto real como
     * responsable de área. Ahora valida pertenencia vía `organizationLinks()`
     * (pivote `organization_contacts`) con vínculo ACTIVO -- mismo criterio
     * ya usado en `OrganizationController::searchContacts()`.
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
                'responsible_person_id' => ['La persona responsable debe pertenecer a la misma organización.'],
            ]);
        }
    }
}
