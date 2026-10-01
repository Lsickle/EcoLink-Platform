<?php

use App\Models\Organization;
use App\Models\OrganizationSidebarModule;
use App\Models\SecurityLog;
use App\Models\SidebarModule;
use App\Models\User;

// enable()/disable() de SidebarModuleController -- calcan exactamente
// assignBusinessRole()/revokeBusinessRole() de OrganizationController: mismo
// gate (platform staff), mismo patrón de auditoría (LogsSecurityEvents),
// mismo mecanismo idempotente (updateOrCreate sobre el pivote).

function platformStaffActorForOrgSidebarModules(): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return User::factory()->create(['tenant_organization_id' => $platform->id]);
}

// Nota: `Organization::factory()->create()` en un test NO pasa por el
// backfill de despliegue (esa migración ya corrió antes de que existiera
// cualquier organización de prueba, ver OrganizationSidebarModuleBackfillTest)
// -- así que una organización de prueba recién creada, sin filas propias
// en `organization_sidebar_modules`, es exactamente el escenario "falta el
// backfill" que forOrganization() debe resolver sin fallar (default
// is_enabled=false/enabled_at=null), no el escenario "recién desplegada".
test('GET .../sidebar-modules devuelve los 7 módulos, reflejando true solo en los explícitamente habilitados', function () {
    $actor = platformStaffActorForOrgSidebarModules();
    $organization = Organization::factory()->create();

    $residuos = SidebarModule::query()->where('code', 'RESIDUOS')->firstOrFail();

    $this->actingAs($actor)
        ->postJson("/api/admin/organizations/{$organization->id}/sidebar-modules/{$residuos->id}/enable")
        ->assertOk();

    $response = $this->actingAs($actor)
        ->getJson("/api/admin/organizations/{$organization->id}/sidebar-modules")
        ->assertOk();

    $data = collect($response->json('data'))->keyBy('code');

    expect($data)->toHaveCount(7)
        ->and($data['RESIDUOS']['is_enabled'])->toBeTrue()
        ->and($data['RESIDUOS']['enabled_at'])->not->toBeNull()
        ->and($data['ORGANIZACION']['is_enabled'])->toBeFalse()
        ->and($data['ORGANIZACION']['enabled_at'])->toBeNull();
});

test('GET .../sidebar-modules no falla si a la organización le falta el backfill de algún módulo -- cae a is_enabled=false/enabled_at=null', function () {
    $actor = platformStaffActorForOrgSidebarModules();
    $organization = Organization::factory()->create();

    // Simula el escenario real de despliegue completo (los 7 backfillados)
    // y luego el hueco puntual de UNO solo -- mismo patrón que
    // OrganizationSidebarModuleBackfillTest, corriendo la migración real.
    $migration = require base_path('database/migrations/2026_09_28_000003_backfill_organization_sidebar_modules_table.php');
    $migration->up();

    $missingModule = SidebarModule::query()->where('code', 'CERTIFICADOS')->firstOrFail();
    OrganizationSidebarModule::query()
        ->where('organization_id', $organization->id)
        ->where('sidebar_module_id', $missingModule->id)
        ->delete();

    $response = $this->actingAs($actor)
        ->getJson("/api/admin/organizations/{$organization->id}/sidebar-modules")
        ->assertOk();

    $data = collect($response->json('data'))->keyBy('code');

    expect($data)->toHaveCount(7)
        ->and($data['ORGANIZACION']['is_enabled'])->toBeTrue()
        ->and($data['CERTIFICADOS']['is_enabled'])->toBeFalse()
        ->and($data['CERTIFICADOS']['enabled_at'])->toBeNull();
});

test('enable/disable son idempotentes y registran auditoría con el event_type y metadata correctos', function () {
    $actor = platformStaffActorForOrgSidebarModules();
    $organization = Organization::factory()->create();
    $sidebarModule = SidebarModule::query()->where('code', 'LOGISTICA')->firstOrFail();

    $this->actingAs($actor)
        ->postJson("/api/admin/organizations/{$organization->id}/sidebar-modules/{$sidebarModule->id}/enable")
        ->assertOk();
    $this->actingAs($actor)
        ->postJson("/api/admin/organizations/{$organization->id}/sidebar-modules/{$sidebarModule->id}/enable")
        ->assertOk();

    expect(OrganizationSidebarModule::query()
        ->where('organization_id', $organization->id)
        ->where('sidebar_module_id', $sidebarModule->id)
        ->count())->toBe(1)
        ->and(OrganizationSidebarModule::query()
            ->where('organization_id', $organization->id)
            ->where('sidebar_module_id', $sidebarModule->id)
            ->value('is_enabled'))->toBeTrue();

    $this->actingAs($actor)
        ->postJson("/api/admin/organizations/{$organization->id}/sidebar-modules/{$sidebarModule->id}/disable")
        ->assertOk();
    $this->actingAs($actor)
        ->postJson("/api/admin/organizations/{$organization->id}/sidebar-modules/{$sidebarModule->id}/disable")
        ->assertOk();

    expect(OrganizationSidebarModule::query()
        ->where('organization_id', $organization->id)
        ->where('sidebar_module_id', $sidebarModule->id)
        ->count())->toBe(1)
        ->and(OrganizationSidebarModule::query()
            ->where('organization_id', $organization->id)
            ->where('sidebar_module_id', $sidebarModule->id)
            ->value('is_enabled'))->toBeFalse();

    $enabledLog = SecurityLog::query()->where('event_type', 'SIDEBAR_MODULE_ENABLED')->first();
    expect($enabledLog)->not->toBeNull()
        ->and($enabledLog->metadata['organization_id'])->toBe($organization->id)
        ->and($enabledLog->metadata['sidebar_module_id'])->toBe($sidebarModule->id);

    $disabledLog = SecurityLog::query()->where('event_type', 'SIDEBAR_MODULE_DISABLED')->first();
    expect($disabledLog)->not->toBeNull()
        ->and($disabledLog->metadata['organization_id'])->toBe($organization->id)
        ->and($disabledLog->metadata['sidebar_module_id'])->toBe($sidebarModule->id);
});

test('enable/disable devuelven 403 para un actor que no es platform staff', function () {
    $tenant = Organization::factory()->create();
    $actor = User::factory()->create(['tenant_organization_id' => $tenant->id]);
    $organization = Organization::factory()->create();
    $sidebarModule = SidebarModule::query()->where('code', 'SERVICIOS')->firstOrFail();

    $this->actingAs($actor)
        ->postJson("/api/admin/organizations/{$organization->id}/sidebar-modules/{$sidebarModule->id}/enable")
        ->assertForbidden();
    $this->actingAs($actor)
        ->postJson("/api/admin/organizations/{$organization->id}/sidebar-modules/{$sidebarModule->id}/disable")
        ->assertForbidden();
    $this->actingAs($actor)
        ->getJson("/api/admin/organizations/{$organization->id}/sidebar-modules")
        ->assertForbidden();
});
