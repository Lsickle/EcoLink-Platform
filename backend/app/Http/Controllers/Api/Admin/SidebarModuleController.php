<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Organization;
use App\Models\OrganizationSidebarModule;
use App\Models\SidebarModule;
use Illuminate\Http\Request;

/**
 * Habilitación/deshabilitación de los 7 grupos temáticos del sidebar del
 * frontend (Organización/Residuos/Servicios/Logística/Operaciones/
 * Certificados/Administración), POR ORGANIZACIÓN INDIVIDUAL -- a diferencia
 * de `business_roles` (habilitado por TIPO de organización, ver
 * `OrganizationController::assignBusinessRole()`/`revokeBusinessRole()`),
 * este mecanismo no tiene relación con el tipo de negocio de la
 * organización.
 *
 * Mismo gate exclusivo de platform staff que `OrganizationController`
 * (`isPlatformStaff()`, sin Policy de modelo) y mismo patrón de auditoría
 * (`LogsSecurityEvents`, calca `assignBusinessRole()`/`revokeBusinessRole()`).
 */
class SidebarModuleController extends Controller
{
    use LogsSecurityEvents;

    /**
     * Catálogo completo de los 7 módulos, para la pantalla admin que los
     * administra.
     */
    public function index(Request $request)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede consultar este catálogo.');

        $sidebarModules = SidebarModule::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get(['id', 'code', 'name', 'sort_order', 'is_active']);

        return response()->json(['data' => $sidebarModules]);
    }

    /**
     * Catálogo de los 7 módulos con `is_enabled`/`enabled_at` resueltos para
     * `$organization` -- LEFT JOIN para no fallar si por algún motivo falta
     * el backfill de alguno de los 7 (queda `is_enabled=false`/
     * `enabled_at=null` por defecto en vez de omitir la fila).
     */
    public function forOrganization(Request $request, Organization $organization)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede consultar este catálogo.');

        $sidebarModules = SidebarModule::query()
            ->where('sidebar_modules.is_active', true)
            ->leftJoin('organization_sidebar_modules', function ($join) use ($organization) {
                $join->on('organization_sidebar_modules.sidebar_module_id', '=', 'sidebar_modules.id')
                    ->where('organization_sidebar_modules.organization_id', '=', $organization->id);
            })
            ->orderBy('sidebar_modules.sort_order')
            ->get([
                'sidebar_modules.id',
                'sidebar_modules.code',
                'sidebar_modules.name',
                'sidebar_modules.sort_order',
                'organization_sidebar_modules.is_enabled',
                'organization_sidebar_modules.enabled_at',
            ])
            ->map(fn ($sidebarModule) => [
                'id' => $sidebarModule->id,
                'code' => $sidebarModule->code,
                'name' => $sidebarModule->name,
                'sort_order' => $sidebarModule->sort_order,
                'is_enabled' => (bool) $sidebarModule->is_enabled,
                'enabled_at' => $sidebarModule->enabled_at,
            ]);

        return response()->json(['data' => $sidebarModules]);
    }

    /**
     * Calca EXACTAMENTE `OrganizationController::assignBusinessRole()` --
     * pivote idempotente vía `updateOrCreate`, nunca borra la fila.
     */
    public function enable(Request $request, Organization $organization, SidebarModule $sidebarModule)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');

        OrganizationSidebarModule::query()->updateOrCreate(
            ['organization_id' => $organization->id, 'sidebar_module_id' => $sidebarModule->id],
            ['enabled_by' => $request->user()->id, 'enabled_at' => now(), 'is_enabled' => true],
        );

        $this->logSecurityEvent(
            $request, 'SIDEBAR_MODULE_ENABLED', 'SUCCESS',
            "Módulo de sidebar '{$sidebarModule->name}' habilitado para '{$organization->legal_name}'.", $request->user(),
            ['organization_id' => $organization->id, 'sidebar_module_id' => $sidebarModule->id],
        );

        return response()->json(['message' => 'Módulo de sidebar habilitado.']);
    }

    /**
     * Calca EXACTAMENTE `OrganizationController::revokeBusinessRole()` --
     * pone `is_enabled=false`, idempotente (deshabilitar algo ya
     * deshabilitado o nunca habilitado sigue siendo éxito).
     */
    public function disable(Request $request, Organization $organization, SidebarModule $sidebarModule)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');

        OrganizationSidebarModule::query()->updateOrCreate(
            ['organization_id' => $organization->id, 'sidebar_module_id' => $sidebarModule->id],
            ['enabled_by' => $request->user()->id, 'enabled_at' => now(), 'is_enabled' => false],
        );

        $this->logSecurityEvent(
            $request, 'SIDEBAR_MODULE_DISABLED', 'SUCCESS',
            "Módulo de sidebar '{$sidebarModule->name}' deshabilitado para '{$organization->legal_name}'.", $request->user(),
            ['organization_id' => $organization->id, 'sidebar_module_id' => $sidebarModule->id],
        );

        return response()->json(['message' => 'Módulo de sidebar deshabilitado.']);
    }
}
