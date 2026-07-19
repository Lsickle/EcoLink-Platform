<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\CancellationReason;
use Illuminate\Http\Request;

/**
 * Catálogo de solo lectura de `cancellation_reasons` (D-S09) -- gap real
 * encontrado por el agente de frontend al construir el flujo "Cancelar
 * Solicitud" del Módulo Solicitudes de Servicio: no existía ningún endpoint,
 * el selector de motivo quedó deshabilitado en el cliente.
 *
 * Gateado por `service_requests.read` (no `isPlatformStaff()` como
 * `BusinessRoleController`/`OrganizationStatusController`) -- mismo criterio
 * que `RespelStatusController`: este catálogo lo consume CUALQUIER actor ya
 * autorizado a operar sobre Solicitudes de Servicio (el Generador dueño que
 * va a cancelar su propia solicitud), no solo platform staff.
 */
class CancellationReasonController extends Controller
{
    public function index(Request $request)
    {
        abort_unless($request->user()->hasPermission('service_requests.read'), 403, 'No tiene permiso para consultar este catálogo.');

        $reasons = CancellationReason::query()
            ->when($request->boolean('active_only'), fn ($query) => $query->where('is_active', true))
            ->orderBy('name')
            ->get(['id', 'code', 'name', 'is_other', 'is_system', 'is_active']);

        return response()->json(['data' => $reasons]);
    }
}
