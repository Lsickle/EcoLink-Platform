<?php

use App\Models\CancellationReason;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;

// Gap real encontrado por el agente de frontend: el flujo "Cancelar
// Solicitud" (D-S09/RN-SOL-009) quedó con el selector de motivo
// deshabilitado -- no existía GET /api/admin/cancellation-reasons. Mismo
// patrón de catálogo de solo lectura que RespelStatusController: gateado
// por el permiso que YA protege el resto de Solicitudes de Servicio
// (`service_requests.read`), no por isPlatformStaff() -- lo consume
// cualquier Generador con acceso a sus propias solicitudes, no solo
// platform staff.

function cancellationReasonActor(array $codes = ['service_requests.read']): User
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

test('index responde 403 sin el permiso service_requests.read', function () {
    $actor = cancellationReasonActor(codes: []);

    $this->actingAs($actor)->getJson('/api/admin/cancellation-reasons')->assertForbidden();
});

test('index devuelve los cancellation_reasons con los campos que el frontend necesita', function () {
    $actor = cancellationReasonActor();

    CancellationReason::factory()->create([
        'code' => 'ZZ_OTHER', 'name' => 'Otra razón', 'is_other' => true, 'is_active' => true,
    ]);
    CancellationReason::factory()->create([
        'code' => 'ZZ_DUPLICATE', 'name' => 'Solicitud duplicada', 'is_other' => false, 'is_active' => true,
    ]);

    $response = $this->actingAs($actor)->getJson('/api/admin/cancellation-reasons')->assertOk();

    $rows = collect($response->json('data'));
    $other = $rows->firstWhere('code', 'ZZ_OTHER');
    $duplicate = $rows->firstWhere('code', 'ZZ_DUPLICATE');

    expect($other)->not->toBeNull()
        ->and($other['name'])->toBe('Otra razón')
        ->and($other['is_other'])->toBeTrue()
        ->and($duplicate)->not->toBeNull()
        ->and($duplicate['is_other'])->toBeFalse();
});

test('index filtra por active_only cuando se pide', function () {
    $actor = cancellationReasonActor();

    CancellationReason::factory()->create(['code' => 'ZZ_ACTIVE_REASON', 'is_active' => true]);
    CancellationReason::factory()->create(['code' => 'ZZ_INACTIVE_REASON', 'is_active' => false]);

    $response = $this->actingAs($actor)->getJson('/api/admin/cancellation-reasons?active_only=1')->assertOk();

    $codes = collect($response->json('data'))->pluck('code');

    expect($codes)->toContain('ZZ_ACTIVE_REASON')->not->toContain('ZZ_INACTIVE_REASON');
});
