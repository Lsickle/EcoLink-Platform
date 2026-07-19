<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\RespelStatus;
use Illuminate\Http\Request;

/**
 * Catálogo de solo lectura de `respel_statuses` -- gap real encontrado por el
 * agente de frontend al construir CU-021 "Configurar Workflow": no existía
 * ningún endpoint para resolver `from_status_code`/`to_status_code` (strings
 * crudos en `WorkflowTransition`) a su fila completa de catálogo
 * (nombre/orden/color/`is_initial`/`is_final`/`is_approved_status`/
 * `is_rejected_status`) -- el frontend no podía construir el selector de
 * transiciones sin adivinar esos valores.
 *
 * Gateado por `workflows.manage` (no `isPlatformStaff()` como
 * `BusinessRoleController`/`OrganizationStatusController`) -- este catálogo
 * lo consume CUALQUIER actor autorizado a administrar un workflow, incluido
 * un admin de organización Gestor editando SU PROPIO workflow clonado (ver
 * `WorkflowPolicy`), no solo platform staff. No existe un permiso
 * `.read` separado para el módulo `workflows` (ver `PermissionSeeder`) --
 * `workflows.manage` es el único gate disponible, mismo criterio que el
 * resto de `WorkflowController`.
 */
class RespelStatusController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()->hasPermission('workflows.manage'), 403, 'No tiene permiso para consultar este catálogo.');

        $statuses = RespelStatus::query()
            ->when($request->boolean('active_only'), fn ($query) => $query->where('is_active', true))
            ->orderBy('sort_order')
            ->get([
                'id', 'code', 'name', 'description', 'sort_order',
                'is_initial', 'is_final', 'is_approved_status', 'is_rejected_status',
                'color_hex', 'icon', 'is_active',
            ]);

        return response()->json(['data' => $statuses]);
    }
}
