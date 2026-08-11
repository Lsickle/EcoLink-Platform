<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Services\GeneratorBulkImportService;
use Illuminate\Http\Request;

/**
 * Carga Masiva de Generadores (CSV) por Subgestor/Gestor -- autoservicio
 * confirmado por el usuario, 2026-08-11. NO reutiliza
 * `OrganizationController::store()` (exclusivo de `isPlatformStaff()`) --
 * este endpoint es una excepción de autorización nueva y deliberadamente
 * ACOTADA: crea organizaciones ÚNICAMENTE con business_role GENERATOR
 * forzado (ver `GeneratorBulkImportService::createOrganization()`), nunca
 * expone ninguna otra operación de organizaciones (editar/eliminar/asignar
 * otro business_role), y solo para actores cuya organización tenga
 * capacidad `can_transport_waste` (Subgestor) o `can_treat_waste` (Gestor).
 *
 * Reutiliza los permisos que YA gobiernan "esta organización puede
 * vincularse con Generadores" (`generator_subgestor_relationships.create`
 * / `generator_gestor_relationships.create`) -- no se creó un permiso
 * dedicado a "carga masiva" en sí, la carga es solo una versión por lotes
 * de la misma acción que esos permisos ya autorizan una fila a la vez.
 *
 * Anti-role-smuggling (mismo criterio que `BranchController::store()`): un
 * tenant admin SIEMPRE ejecuta la carga en nombre de SU PROPIA
 * organización; solo platform staff puede indicar
 * `on_behalf_of_organization_id` explícito.
 */
class GeneratorBulkImportController extends Controller
{
    use LogsSecurityEvents;

    public function store(Request $request)
    {
        $actor = $request->user();

        if ($actor->isPlatformStaff()) {
            $request->validate(['on_behalf_of_organization_id' => ['required', 'integer', 'exists:organizations,id']]);
            $actingOrganizationId = $request->integer('on_behalf_of_organization_id');
        } else {
            $actingOrganizationId = $actor->tenant_organization_id;
        }

        $actingOrganization = Organization::query()->find($actingOrganizationId);
        abort_unless($actingOrganization !== null, 422, 'Organización actora inválida.');

        $canActAsSubgestor = $actingOrganization->hasCapability('can_transport_waste')
            && $actor->hasPermission('generator_subgestor_relationships.create');
        $canActAsGestor = $actingOrganization->hasCapability('can_treat_waste')
            && $actor->hasPermission('generator_gestor_relationships.create');

        abort_unless($canActAsSubgestor || $canActAsGestor, 403, 'No tiene permiso para registrar Generadores clientes por esta vía.');

        $rules = ['file' => ['required', 'file', 'mimes:csv,txt', 'max:5120']];

        // Solo se exige elegir explícitamente cuando la organización actora
        // tiene AMBAS capacidades (caso raro) -- en el caso común (una sola
        // capacidad) se infiere automáticamente, ver
        // `GeneratorBulkImportService::linkToActingOrganization()`.
        $rules['link_as'] = $canActAsSubgestor && $canActAsGestor
            ? ['required', 'in:gestor,subgestor']
            : ['sometimes', 'nullable', 'in:gestor,subgestor'];

        $data = $request->validate($rules);

        $linkAs = $data['link_as'] ?? null;
        abort_unless(
            $linkAs === null || ($linkAs === 'gestor' && $canActAsGestor) || ($linkAs === 'subgestor' && $canActAsSubgestor),
            422,
            'link_as no es válido para esta organización.'
        );

        $result = (new GeneratorBulkImportService)->import($request->file('file'), $actingOrganization, $actor, $linkAs);

        $this->logSecurityEvent(
            $request, 'GENERATOR_BULK_IMPORT_EXECUTED', 'SUCCESS',
            "Carga masiva de Generadores ejecutada en nombre de la organización #{$actingOrganization->id}: {$result['created']} creados, {$result['linked_existing']} vinculados a organizaciones existentes, ".count($result['errors']).' errores.',
            $actor,
            [
                'on_behalf_of_organization_id' => $actingOrganization->id,
                'created' => $result['created'],
                'linked_existing' => $result['linked_existing'],
                'errors_count' => count($result['errors']),
            ],
        );

        return response()->json($result);
    }
}
