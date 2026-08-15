<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\Waste;
use App\Services\WasteBulkImportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Carga Masiva de Residuos (CSV) -- pedido explícito del usuario,
 * 2026-08-11, mismo patrón que `GeneratorBulkImportController`. Reutiliza el
 * permiso que YA gobierna la declaración manual de un residuo
 * (`wastes.create`, ver `WastePolicy::create()`) -- no se creó un permiso
 * dedicado a "carga masiva" en sí.
 *
 * Tres escenarios de `$actingOrganizationId`:
 * 1) Autoservicio (default): un Generador/Subgestor/Gestor declara SUS
 *    propios residuos -- ya funcionaba así en `WasteController::store()`
 *    sin restricción de business_role, sin cambios de autorización aquí.
 * 2) `on_behalf_of_organization_id` explícito por un actor NO platform
 *    staff: SOLO válido si `$actor->hasActiveGeneratorRelationshipWith()`
 *    -- pieza nueva de este lote (antes, ninguna organización podía crear
 *    residuos a nombre de otra sin ser platform staff).
 * 3) `on_behalf_of_organization_id` por platform staff: sin restricción,
 *    mismo criterio que `GeneratorBulkImportController`.
 */
class WasteBulkImportController extends Controller
{
    use LogsSecurityEvents;

    public function store(Request $request)
    {
        $actor = $request->user();
        Gate::authorize('create', Waste::class);

        if ($actor->isPlatformStaff()) {
            $request->validate(['on_behalf_of_organization_id' => ['required', 'integer', 'exists:organizations,id']]);
            $actingOrganizationId = $request->integer('on_behalf_of_organization_id');
        } elseif ($request->filled('on_behalf_of_organization_id')) {
            $onBehalfOfOrganizationId = $request->integer('on_behalf_of_organization_id');

            // Hallazgo Medio (especialista-seguridad, 2026-08-12): este es el
            // primer endpoint de ESCRITURA cross-tenant del proyecto -- a
            // diferencia de los rechazos de lectura ya auditados, un intento
            // de declarar residuos a nombre de una organización SIN relación
            // activa queda registrado como `SecurityLog` FAILURE (antes solo
            // se logueaba el resultado exitoso final).
            if (! $actor->hasActiveGeneratorRelationshipWith($onBehalfOfOrganizationId)) {
                $this->logSecurityEvent(
                    $request, 'WASTE_BULK_IMPORT_EXECUTED', 'FAILURE',
                    "Intento de carga masiva de Residuos a nombre de la organización #{$onBehalfOfOrganizationId} SIN relación comercial activa.",
                    $actor,
                    ['on_behalf_of_organization_id' => $onBehalfOfOrganizationId],
                );

                abort(403, 'No tiene una relación comercial activa con esa organización.');
            }

            $actingOrganizationId = $onBehalfOfOrganizationId;
        } else {
            $actingOrganizationId = $actor->tenant_organization_id;
        }

        $actingOrganization = Organization::query()->find($actingOrganizationId);
        abort_unless($actingOrganization !== null, 422, 'Organización actora inválida.');

        $request->validate(['file' => ['required', 'file', 'mimes:csv,txt', 'max:5120']]);

        $result = (new WasteBulkImportService)->import($request->file('file'), $actingOrganization, $actor);

        // Trazabilidad POR REGISTRO (pedido del usuario, 2026-08-14): el evento
        // agregado de abajo dice cuántos se crearon, pero deja cada residuo sin
        // historia propia -- su pestaña "Actividad" salía vacía y no había forma
        // de saber quién lo creó ni cuándo. Se emite el MISMO evento
        // `WASTE_CREATED` que `WasteController::store()`, con `waste_id` en la
        // metadata, que es por donde filtra `WasteController::activity()`.
        foreach ($result['wastes'] as $waste) {
            $this->logSecurityEvent(
                $request, 'WASTE_CREATED', 'SUCCESS',
                "Residuo '{$waste['name']}' creado por carga masiva.", $actor,
                ['waste_id' => $waste['id'], 'organization_id' => $actingOrganization->id, 'source' => 'BULK_IMPORT'],
            );
        }

        $this->logSecurityEvent(
            $request, 'WASTE_BULK_IMPORT_EXECUTED', 'SUCCESS',
            "Carga masiva de Residuos ejecutada en nombre de la organización #{$actingOrganization->id}: {$result['created']} creados, ".count($result['errors']).' errores.',
            $actor,
            [
                'on_behalf_of_organization_id' => $actingOrganization->id,
                'created' => $result['created'],
                'errors_count' => count($result['errors']),
            ],
        );

        return response()->json($result);
    }
}
