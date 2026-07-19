<?php

use App\Models\Organization;
use App\Models\Permission;
use App\Models\RespelStatus;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// CU-021 "Configurar Workflow" -- catálogo de solo lectura consumido por el
// formulario de transiciones (from_status_code/to_status_code). Gap real
// encontrado por el agente de frontend: no existía ningún endpoint para
// resolver esos códigos a su fila completa. Gateado por `workflows.manage`
// (no isPlatformStaff()) -- ver docblock de RespelStatusController.

function respelStatusActor(array $codes = ['workflows.manage']): User
{
    $actor = User::factory()->create();

    if ($codes !== []) {
        $role = Role::factory()->create();

        foreach ($codes as $code) {
            $permission = Permission::query()->firstOrCreate(['code' => $code], [
                'name' => $code, 'module' => explode('.', $code)[0], 'action' => explode('.', $code)[1] ?? $code,
                'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
            ]);
            RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
        }

        UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);
    }

    return $actor;
}

test('index responde 403 sin el permiso workflows.manage', function () {
    $actor = respelStatusActor(codes: []);

    $this->actingAs($actor)->getJson('/api/admin/respel-statuses')->assertForbidden();
});

test('index devuelve los respel_statuses ordenados por sort_order, con los campos que el frontend necesita', function () {
    $actor = respelStatusActor();
    $platform = Organization::factory()->create();

    RespelStatus::factory()->create([
        'tenant_organization_id' => $platform->id,
        'code' => 'ZZ_B', 'name' => 'Estado B', 'sort_order' => 998,
        'is_initial' => false, 'is_final' => true,
        'is_approved_status' => true, 'is_rejected_status' => false,
        'color_hex' => '#000000',
    ]);
    RespelStatus::factory()->create([
        'tenant_organization_id' => $platform->id,
        'code' => 'ZZ_A', 'name' => 'Estado A', 'sort_order' => 997,
        'is_initial' => true, 'is_final' => false,
        'is_approved_status' => false, 'is_rejected_status' => false,
        'color_hex' => '#ffffff',
    ]);

    $response = $this->actingAs($actor)->getJson('/api/admin/respel-statuses')->assertOk();

    $rows = collect($response->json('data'));
    $indexA = $rows->search(fn ($row) => $row['code'] === 'ZZ_A');
    $indexB = $rows->search(fn ($row) => $row['code'] === 'ZZ_B');

    expect($indexA)->not->toBeFalse()
        ->and($indexB)->not->toBeFalse()
        ->and($indexA)->toBeLessThan($indexB)
        ->and($rows[$indexA]['name'])->toBe('Estado A')
        ->and($rows[$indexA]['is_initial'])->toBeTrue()
        ->and($rows[$indexB]['is_final'])->toBeTrue()
        ->and($rows[$indexB]['is_approved_status'])->toBeTrue()
        ->and($rows[$indexA]['color_hex'])->toBe('#ffffff');
});

test('index filtra por active_only cuando se pide', function () {
    $actor = respelStatusActor();

    RespelStatus::factory()->create(['code' => 'ZZ_ACTIVE_RESPEL', 'is_active' => true]);
    RespelStatus::factory()->create(['code' => 'ZZ_INACTIVE_RESPEL', 'is_active' => false]);

    $response = $this->actingAs($actor)->getJson('/api/admin/respel-statuses?active_only=1')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');

    expect($codes)->toContain('ZZ_ACTIVE_RESPEL')->not->toContain('ZZ_INACTIVE_RESPEL');
});
