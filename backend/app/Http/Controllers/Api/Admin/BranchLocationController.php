<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\BranchLocation;
use App\Policies\BranchLocationPolicy;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * CRUD MÍNIMO de Muelles (`branch_locations`, Fase 4 "Cita de Recepción en
 * Planta") -- para que un Gestor administre los muelles de sus propias
 * sedes. Mismo patrón anti-IDOR que `VehicleController`/
 * `TransportPersonnelController`: `branch_id` debe pertenecer a la
 * organización actora. Sin `activate()`/`deactivate()` dedicados (a
 * diferencia de `VehicleController`) -- `branch_locations` solo tiene
 * `is_active`, gestionado directamente vía `update()`, mismo criterio que
 * `TransportPersonnelController`.
 */
class BranchLocationController extends Controller
{
    use LogsSecurityEvents;

    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new BranchLocationPolicy)->viewAny($actor), 403, 'No tiene permiso para consultar muelles.');

        $branchId = $request->input('branch_id');
        $search = $request->input('search');

        $locations = BranchLocation::query()
            ->when(! $actor->isPlatformStaff(), function ($query) use ($actor) {
                $query->whereHas('branch', fn ($query) => $query->where('organization_id', $actor->tenant_organization_id));
            })
            ->when($branchId, fn ($query) => $query->where('branch_id', $branchId))
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('code', 'ILIKE', "%{$search}%")
                        ->orWhere('name', 'ILIKE', "%{$search}%");
                });
            })
            ->when($request->has('is_active'), fn ($query) => $query->where('is_active', $request->boolean('is_active')))
            ->with(['branch:id,name,organization_id'])
            ->orderBy('code')
            ->paginate($request->integer('per_page', 15));

        return response()->json($locations);
    }

    public function show(Request $request, BranchLocation $branchLocation)
    {
        abort_unless((new BranchLocationPolicy)->view($request->user(), $branchLocation), 403, 'No tiene acceso a este muelle.');

        $branchLocation->load(['branch:id,name,organization_id', 'createdBy:id,username', 'updatedBy:id,username']);

        return response()->json(['branch_location' => $branchLocation]);
    }

    public function store(Request $request)
    {
        $actor = $request->user();
        abort_unless((new BranchLocationPolicy)->create($actor), 403, 'No tiene permiso para crear muelles.');

        $data = $request->validate($this->validationRules());

        $this->assertBranchBelongsToOrganization((int) $data['branch_id'], $actor);

        $data['is_active'] = true;
        $data['created_by'] = $actor->id;
        $data['updated_by'] = $actor->id;

        try {
            $branchLocation = BranchLocation::query()->create($data);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'code' => ['Ya existe un muelle con este código en la sede indicada.'],
            ]);
        }

        $this->logSecurityEvent(
            $request, 'BRANCH_LOCATION_CREATED', 'SUCCESS',
            "Muelle '{$branchLocation->code}' creado.", $actor,
            ['branch_location_id' => $branchLocation->id, 'branch_id' => $branchLocation->branch_id],
        );

        return response()->json(['branch_location' => $branchLocation->fresh(['branch:id,name,organization_id'])], 201);
    }

    /**
     * `branch_id` NO editable tras creación -- mismo criterio que
     * `organization_id` en `Vehicle`/`TransportPersonnel`.
     */
    public function update(Request $request, BranchLocation $branchLocation)
    {
        $actor = $request->user();
        abort_unless((new BranchLocationPolicy)->update($actor, $branchLocation), 403, 'No tiene acceso a este muelle.');

        $data = $request->validate($this->validationRules(sometimes: true));
        unset($data['branch_id']);

        $branchLocation->fill($data);
        $branchLocation->updated_by = $actor->id;

        try {
            $branchLocation->save();
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'code' => ['Ya existe un muelle con este código en la sede indicada.'],
            ]);
        }

        $this->logSecurityEvent(
            $request, 'BRANCH_LOCATION_UPDATED', 'SUCCESS',
            "Muelle '{$branchLocation->code}' modificado.", $actor,
            ['branch_location_id' => $branchLocation->id, 'branch_id' => $branchLocation->branch_id],
        );

        return response()->json(['branch_location' => $branchLocation->fresh(['branch:id,name,organization_id'])]);
    }

    private function validationRules(bool $sometimes = false): array
    {
        $required = $sometimes ? 'sometimes' : 'required';

        return [
            'branch_id' => [$required, 'integer', 'exists:branches,id'],
            'code' => [$required, 'string', 'max:50'],
            'name' => [$required, 'string', 'max:150'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * Anti-IDOR: `branch_id` debe pertenecer a la organización actora (o
     * cualquiera si platform staff) -- mismo criterio EXACTO que
     * `VehicleController::assertBranchBelongsToOrganization()`.
     * `withTrashed()` -- una sede soft-eliminada de OTRA organización no
     * debe pasar silenciosamente el chequeo.
     */
    private function assertBranchBelongsToOrganization(int $branchId, $actor): void
    {
        if ($actor->isPlatformStaff()) {
            return;
        }

        $branch = Branch::withTrashed()->find($branchId);

        if ($branch && (int) $branch->organization_id !== (int) $actor->tenant_organization_id) {
            throw ValidationException::withMessages([
                'branch_id' => ['La sede indicada no pertenece a su organización.'],
            ]);
        }
    }
}
