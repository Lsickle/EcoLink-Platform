<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\OrganizationStatus;
use Illuminate\Http\Request;

/**
 * Catálogo de solo lectura de `organization_statuses` -- mismo gap y mismo
 * criterio que {@see BusinessRoleController}: el modelo/seeder ya existían
 * (5 estados reales: PRO/ACT/SUS/INA/BLO), pero nunca se expuso ningún
 * endpoint. El frontend de Organizaciones necesita los ids reales para el
 * select "Estado de la Organización" del formulario de creación/edición.
 */
class OrganizationStatusController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede consultar este catálogo.');

        $statuses = OrganizationStatus::query()
            ->when($request->boolean('active_only'), fn ($query) => $query->where('is_active', true))
            ->orderBy('sort_order')
            ->get(['id', 'code', 'name', 'color_hex', 'sort_order', 'is_active']);

        return response()->json(['data' => $statuses]);
    }
}
