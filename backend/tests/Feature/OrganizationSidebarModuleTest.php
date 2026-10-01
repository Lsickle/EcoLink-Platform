<?php

use App\Models\Organization;
use App\Models\OrganizationSidebarModule;
use App\Models\SidebarModule;

// Organization::enabledSidebarModuleCodes() -- códigos de los módulos de
// sidebar HABILITADOS para esta organización individual, mismo criterio de
// prueba que OrganizationCapabilityTest (Organization::hasCapability()).

test('devuelve solo los códigos con pivote is_enabled=true y catálogo is_active=true', function () {
    $organization = Organization::factory()->create();
    $enabled = SidebarModule::query()->where('code', 'RESIDUOS')->firstOrFail();
    $disabled = SidebarModule::query()->where('code', 'CERTIFICADOS')->firstOrFail();

    OrganizationSidebarModule::query()->create([
        'organization_id' => $organization->id,
        'sidebar_module_id' => $enabled->id,
        'enabled_at' => now(),
        'is_enabled' => true,
    ]);
    OrganizationSidebarModule::query()->create([
        'organization_id' => $organization->id,
        'sidebar_module_id' => $disabled->id,
        'enabled_at' => now(),
        'is_enabled' => false,
    ]);

    expect($organization->enabledSidebarModuleCodes())->toBe(['RESIDUOS']);
});

test('ignora un módulo habilitado en el pivote pero desactivado en el catálogo', function () {
    $organization = Organization::factory()->create();
    $sidebarModule = SidebarModule::factory()->create(['code' => 'CUSTOM', 'is_active' => false]);

    OrganizationSidebarModule::query()->create([
        'organization_id' => $organization->id,
        'sidebar_module_id' => $sidebarModule->id,
        'enabled_at' => now(),
        'is_enabled' => true,
    ]);

    expect($organization->enabledSidebarModuleCodes())->toBe([]);
});

test('devuelve un array vacío cuando la organización no tiene ninguna fila en el pivote', function () {
    $organization = Organization::factory()->create();

    expect($organization->enabledSidebarModuleCodes())->toBe([]);
});

// Organization::enableAllSidebarModulesByDefault() -- gap cerrado 2026-09-28:
// toda organización nueva nace con los 7 módulos de sidebar en is_enabled=true,
// mismo criterio con el que el backfill dejó a las organizaciones existentes.

test('habilita los 7 módulos activos del catálogo para una organización sin filas previas', function () {
    $organization = Organization::factory()->create();

    $organization->enableAllSidebarModulesByDefault();

    $activeModuleIds = SidebarModule::query()->where('is_active', true)->pluck('id');

    expect($activeModuleIds)->toHaveCount(7);

    $pivotRows = OrganizationSidebarModule::query()
        ->where('organization_id', $organization->id)
        ->whereIn('sidebar_module_id', $activeModuleIds)
        ->get();

    expect($pivotRows)->toHaveCount(7);
    expect($pivotRows->every(fn (OrganizationSidebarModule $pivot) => $pivot->is_enabled === true))->toBeTrue();
    expect($pivotRows->every(fn (OrganizationSidebarModule $pivot) => $pivot->enabled_at !== null))->toBeTrue();
});

test('no toca un módulo ya deshabilitado explícitamente al volver a llamarse', function () {
    $organization = Organization::factory()->create();
    $disabledModule = SidebarModule::query()->where('code', 'CERTIFICADOS')->firstOrFail();

    OrganizationSidebarModule::query()->create([
        'organization_id' => $organization->id,
        'sidebar_module_id' => $disabledModule->id,
        'enabled_at' => now(),
        'is_enabled' => false,
    ]);

    $organization->enableAllSidebarModulesByDefault();

    $pivot = OrganizationSidebarModule::query()
        ->where('organization_id', $organization->id)
        ->where('sidebar_module_id', $disabledModule->id)
        ->firstOrFail();

    expect($pivot->is_enabled)->toBeFalse();

    // El resto de los módulos activos del catálogo sí queda habilitado.
    $otherActiveModuleIds = SidebarModule::query()
        ->where('is_active', true)
        ->where('id', '!=', $disabledModule->id)
        ->pluck('id');

    $otherPivotRows = OrganizationSidebarModule::query()
        ->where('organization_id', $organization->id)
        ->whereIn('sidebar_module_id', $otherActiveModuleIds)
        ->get();

    expect($otherPivotRows)->toHaveCount($otherActiveModuleIds->count());
    expect($otherPivotRows->every(fn (OrganizationSidebarModule $pivot) => $pivot->is_enabled === true))->toBeTrue();
});
