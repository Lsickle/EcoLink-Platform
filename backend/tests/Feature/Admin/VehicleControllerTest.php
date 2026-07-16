<?php

use App\Models\Branch;
use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Vehicle;
use App\Models\VehicleType;

// CRUD de Vehículos (RN-VEH-001 a RN-VEH-008, CU-051.1/.2/.3/.4). Acceso
// DUAL (mismo patrón que Sedes): platform staff gestiona TODOS los
// vehículos, un admin de tenant o un usuario con rol LOGÍSTICA (solo
// lectura) solo los de su propia organización -- ver
// Vehicle::isAccessibleBy()/VehiclePolicy.

function vehicleActor(array $codes = [], ?int $tenantOrganizationId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);

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

function vehiclePlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return vehicleActor($codes, $platform->id);
}

const VEHICLE_ALL_PERMISSIONS = ['vehicles.read', 'vehicles.create', 'vehicles.update', 'vehicles.activate', 'vehicles.deactivate'];

// ---- Aislamiento tenant vs. platform staff (incluye LOGÍSTICA) ----

test('todos los endpoints devuelven 403 sin el permiso vehicles.* correspondiente', function () {
    $organization = Organization::factory()->create();
    $vehicle = Vehicle::factory()->create(['organization_id' => $organization->id]);
    $actor = vehicleActor([], $organization->id);

    $this->actingAs($actor)->getJson('/api/admin/vehicles')->assertForbidden();
    $this->actingAs($actor)->postJson('/api/admin/vehicles', [])->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/vehicles/{$vehicle->id}")->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/vehicles/{$vehicle->id}", [])->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/vehicles/{$vehicle->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/vehicles/{$vehicle->id}/deactivate")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/vehicles/{$vehicle->id}/activity")->assertForbidden();
});

test('un admin de tenant con permiso NO puede ver/editar vehículos de OTRA organización', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $foreignVehicle = Vehicle::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = vehicleActor(VEHICLE_ALL_PERMISSIONS, $ownOrganization->id);

    $this->actingAs($actor)->getJson("/api/admin/vehicles/{$foreignVehicle->id}")->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/vehicles/{$foreignVehicle->id}", ['plate_number' => 'HCK999'])->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/vehicles/{$foreignVehicle->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/vehicles/{$foreignVehicle->id}/deactivate")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/vehicles/{$foreignVehicle->id}/activity")->assertForbidden();
});

test('platform staff SÍ puede ver/editar vehículos de CUALQUIER organización', function () {
    $organization = Organization::factory()->create();
    $vehicle = Vehicle::factory()->create(['organization_id' => $organization->id]);

    $actor = vehiclePlatformStaffActor(VEHICLE_ALL_PERMISSIONS);

    $this->actingAs($actor)->getJson("/api/admin/vehicles/{$vehicle->id}")->assertOk();
    $this->actingAs($actor)->putJson("/api/admin/vehicles/{$vehicle->id}", ['plate_number' => 'REN999'])->assertOk();
});

test('LOGÍSTICA solo ve los vehículos de SU organización y no puede crear/editar', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();

    $ownVehicle = Vehicle::factory()->create(['organization_id' => $ownOrganization->id]);
    $foreignVehicle = Vehicle::factory()->create(['organization_id' => $otherOrganization->id]);

    $logistica = vehicleActor(['vehicles.read'], $ownOrganization->id);

    $response = $this->actingAs($logistica)->getJson('/api/admin/vehicles')->assertOk();
    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($ownVehicle->id)->not->toContain($foreignVehicle->id);

    $this->actingAs($logistica)->getJson("/api/admin/vehicles/{$ownVehicle->id}")->assertOk();
    $this->actingAs($logistica)->getJson("/api/admin/vehicles/{$foreignVehicle->id}")->assertForbidden();

    // vehicles.read en exclusiva NO basta para crear/editar/activar/desactivar.
    $this->actingAs($logistica)->postJson('/api/admin/vehicles', [
        'plate_number' => 'LOG999', 'vehicle_type_id' => VehicleType::factory()->create()->id,
    ])->assertForbidden();
    $this->actingAs($logistica)->putJson("/api/admin/vehicles/{$ownVehicle->id}", ['brand' => 'Hackeado'])->assertForbidden();
    $this->actingAs($logistica)->postJson("/api/admin/vehicles/{$ownVehicle->id}/activate")->assertForbidden();
    $this->actingAs($logistica)->postJson("/api/admin/vehicles/{$ownVehicle->id}/deactivate")->assertForbidden();
});

test('index acota el listado a la organización del actor cuando NO es platform staff, e ignora organization_id del query', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();

    $ownVehicle = Vehicle::factory()->create(['organization_id' => $ownOrganization->id]);
    $foreignVehicle = Vehicle::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = vehicleActor(['vehicles.read'], $ownOrganization->id);

    $response = $this->actingAs($actor)
        ->getJson("/api/admin/vehicles?organization_id={$otherOrganization->id}")
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($ownVehicle->id)->not->toContain($foreignVehicle->id);
});

test('index respeta organization_id del query SOLO para platform staff', function () {
    $organizationA = Organization::factory()->create();
    $organizationB = Organization::factory()->create();

    $vehicleA = Vehicle::factory()->create(['organization_id' => $organizationA->id]);
    $vehicleB = Vehicle::factory()->create(['organization_id' => $organizationB->id]);

    $actor = vehiclePlatformStaffActor(['vehicles.read']);

    $response = $this->actingAs($actor)
        ->getJson("/api/admin/vehicles?organization_id={$organizationA->id}")
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($vehicleA->id)->not->toContain($vehicleB->id);
});

// ---- Regresión: eager-load de organization/vehicleType en index() ----

test('index() eager-carga organization/vehicle_type por fila (regresión: el listado mostraba "—" siempre)', function () {
    $organization = Organization::factory()->create(['legal_name' => 'Transportes de Prueba S.A.S.']);
    $vehicleType = VehicleType::factory()->create(['name' => 'TIPO DE PRUEBA']);
    Vehicle::factory()->create(['organization_id' => $organization->id, 'vehicle_type_id' => $vehicleType->id]);

    $actor = vehiclePlatformStaffActor(['vehicles.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/vehicles')->assertOk();

    $row = collect($response->json('data'))->firstWhere('organization_id', $organization->id);
    expect($row['organization']['legal_name'])->toBe('Transportes de Prueba S.A.S.')
        ->and($row['vehicle_type']['name'])->toBe('TIPO DE PRUEBA');
});

// ---- store(): anti-role-smuggling ----

test('store fuerza organization_id del actor para un admin de tenant, ignorando el payload (rechaza role-smuggling)', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $vehicleType = VehicleType::factory()->create();

    $actor = vehicleActor(['vehicles.create'], $ownOrganization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'organization_id' => $otherOrganization->id,
        'vehicle_type_id' => $vehicleType->id,
        'plate_number' => 'SMG123',
    ])->assertCreated();

    $vehicle = Vehicle::query()->where('plate_number', 'SMG123')->firstOrFail();
    expect($vehicle->organization_id)->toBe($ownOrganization->id)
        ->and($vehicle->organization_id)->not->toBe($otherOrganization->id)
        ->and($vehicle->created_by)->toBe($actor->id);

    $response->assertJsonPath('vehicle.organization_id', $ownOrganization->id);

    expect(SecurityLog::query()->where('event_type', 'VEHICLE_CREATED')->where('metadata->vehicle_id', $vehicle->id)->exists())->toBeTrue();
});

test('store exige organization_id explícito para platform staff (422 si falta)', function () {
    $vehicleType = VehicleType::factory()->create();
    $actor = vehiclePlatformStaffActor(['vehicles.create']);

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id,
        'plate_number' => 'PLT123',
    ])->assertUnprocessable()->assertJsonValidationErrors('organization_id');
});

test('store con platform staff crea el vehículo en la organización indicada', function () {
    $organization = Organization::factory()->create();
    $vehicleType = VehicleType::factory()->create();
    $actor = vehiclePlatformStaffActor(['vehicles.create']);

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'organization_id' => $organization->id,
        'vehicle_type_id' => $vehicleType->id,
        'plate_number' => 'PLT456',
    ])->assertCreated()->assertJsonPath('vehicle.organization_id', $organization->id);
});

test('store normaliza plate_number a mayúsculas', function () {
    $organization = Organization::factory()->create();
    $vehicleType = VehicleType::factory()->create();
    $actor = vehicleActor(['vehicles.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id,
        'plate_number' => 'low123',
    ])->assertCreated()->assertJsonPath('vehicle.plate_number', 'LOW123');
});

test('store fija operational_status en ACTIVE ignorando lo que envíe el cliente (RN-VEH-005)', function () {
    $organization = Organization::factory()->create();
    $vehicleType = VehicleType::factory()->create();
    $actor = vehicleActor(['vehicles.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id,
        'plate_number' => 'OPS123',
        'operational_status' => 'OUT_OF_SERVICE',
    ])->assertCreated()->assertJsonPath('vehicle.operational_status', 'ACTIVE');
});

test('store fija is_active en true ignorando lo que envíe el cliente (hallazgo Medio, especialista-seguridad 2026-07-16)', function () {
    $organization = Organization::factory()->create();
    $vehicleType = VehicleType::factory()->create();
    $actor = vehicleActor(['vehicles.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id,
        'plate_number' => 'ACT123',
        'is_active' => false,
    ])->assertCreated()->assertJsonPath('vehicle.is_active', true);
});

test('update ignora cambios a is_active -- solo activate()/deactivate() lo controlan (hallazgo Medio, especialista-seguridad 2026-07-16)', function () {
    $organization = Organization::factory()->create();
    $vehicle = Vehicle::factory()->create(['organization_id' => $organization->id, 'is_active' => true]);
    $actor = vehicleActor(['vehicles.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/vehicles/{$vehicle->id}", [
        'is_active' => false,
    ])->assertOk()->assertJsonPath('vehicle.is_active', true);

    expect($vehicle->fresh()->is_active)->toBeTrue();
});

// ---- unicidad de plate_number / vin (RN-VEH-002), excluye soft-deletes ----

test('plate_number es único globalmente y devuelve 422 legible en duplicado', function () {
    $organization = Organization::factory()->create();
    $vehicleType = VehicleType::factory()->create();
    $actor = vehicleActor(['vehicles.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id, 'plate_number' => 'DUP123',
    ])->assertCreated();

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id, 'plate_number' => 'DUP123',
    ])->assertUnprocessable()->assertJsonValidationErrors('plate_number');
});

test('plate_number EXCLUYE vehículos soft-eliminados de la unicidad', function () {
    $organization = Organization::factory()->create();
    $vehicleType = VehicleType::factory()->create();
    $actor = vehicleActor(['vehicles.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id, 'plate_number' => 'SFT123',
    ])->assertCreated();

    Vehicle::query()->where('plate_number', 'SFT123')->firstOrFail()->delete();

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id, 'plate_number' => 'SFT123',
    ])->assertCreated();
});

test('vin duplicado devuelve 422 legible (RN-VEH-002, único si se registra)', function () {
    $organization = Organization::factory()->create();
    $vehicleType = VehicleType::factory()->create();
    $actor = vehicleActor(['vehicles.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id, 'plate_number' => 'VIN001', 'vin' => 'VIN-DUPLICADO',
    ])->assertCreated();

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id, 'plate_number' => 'VIN002', 'vin' => 'VIN-DUPLICADO',
    ])->assertUnprocessable()->assertJsonValidationErrors('vin');
});

test('vin puede omitirse (NULL) en múltiples vehículos sin chocar con la unicidad', function () {
    $organization = Organization::factory()->create();
    $vehicleType = VehicleType::factory()->create();
    $actor = vehicleActor(['vehicles.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id, 'plate_number' => 'NVN001',
    ])->assertCreated();

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id, 'plate_number' => 'NVN002',
    ])->assertCreated();
});

// ---- RN-VEH-008: capacidad > 0 si se registra ----

test('max_load_capacity <= 0 es rechazado (RN-VEH-008)', function () {
    $organization = Organization::factory()->create();
    $vehicleType = VehicleType::factory()->create();
    $actor = vehicleActor(['vehicles.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id, 'plate_number' => 'CAP123', 'max_load_capacity' => 0,
    ])->assertUnprocessable()->assertJsonValidationErrors('max_load_capacity');

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id, 'plate_number' => 'CAP124', 'max_load_capacity' => -5,
    ])->assertUnprocessable()->assertJsonValidationErrors('max_load_capacity');
});

// ---- vehicle_type_id inexistente ----

test('vehicle_type_id inexistente es rechazado', function () {
    $organization = Organization::factory()->create();
    $actor = vehicleActor(['vehicles.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => 999999, 'plate_number' => 'TYP123',
    ])->assertUnprocessable()->assertJsonValidationErrors('vehicle_type_id');
});

// ---- branch_id debe pertenecer a la organización del vehículo ----

test('branch_id que no pertenece a la organización es rechazado', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $foreignBranch = Branch::factory()->create(['organization_id' => $otherOrganization->id]);
    $vehicleType = VehicleType::factory()->create();

    $actor = vehicleActor(['vehicles.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id, 'plate_number' => 'BRA123', 'branch_id' => $foreignBranch->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('branch_id');
});

test('branch_id soft-eliminado de otra organización TAMBIÉN es rechazado (hallazgo Bajo, especialista-seguridad 2026-07-16)', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $foreignBranch = Branch::factory()->create(['organization_id' => $otherOrganization->id]);
    $foreignBranch->delete();
    $vehicleType = VehicleType::factory()->create();

    $actor = vehicleActor(['vehicles.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/vehicles', [
        'vehicle_type_id' => $vehicleType->id, 'plate_number' => 'TRA123', 'branch_id' => $foreignBranch->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('branch_id');
});

// ---- update(): organization_id no editable ----

test('update ignora cambios a organization_id (no editable tras creación)', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $vehicle = Vehicle::factory()->create(['organization_id' => $organization->id]);

    $actor = vehicleActor(['vehicles.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/vehicles/{$vehicle->id}", [
        'organization_id' => $otherOrganization->id,
        'brand' => 'Marca Actualizada',
    ])->assertOk()->assertJsonPath('vehicle.brand', 'Marca Actualizada');

    expect($vehicle->fresh()->organization_id)->toBe($organization->id);
    expect(SecurityLog::query()->where('event_type', 'VEHICLE_UPDATED')->where('metadata->vehicle_id', $vehicle->id)->exists())->toBeTrue();
});

// ---- activate()/deactivate(): permiso específico, no solo `update` ----

test('activate/deactivate exigen el permiso específico -- vehicles.update en exclusiva NO basta', function () {
    $organization = Organization::factory()->create();
    $vehicle = Vehicle::factory()->create(['organization_id' => $organization->id]);

    $actor = vehicleActor(['vehicles.update'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/vehicles/{$vehicle->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/vehicles/{$vehicle->id}/deactivate")->assertForbidden();
});

test('activate/deactivate togglean operational_status/is_active y registran auditoría', function () {
    $organization = Organization::factory()->create();
    $vehicle = Vehicle::factory()->create(['organization_id' => $organization->id, 'operational_status' => 'ACTIVE', 'is_active' => true]);

    $actor = vehicleActor(['vehicles.update', 'vehicles.activate', 'vehicles.deactivate'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/vehicles/{$vehicle->id}/deactivate")->assertOk();
    expect($vehicle->fresh()->operational_status)->toBe('OUT_OF_SERVICE')->and($vehicle->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/vehicles/{$vehicle->id}/activate")->assertOk();
    expect($vehicle->fresh()->operational_status)->toBe('ACTIVE')->and($vehicle->fresh()->is_active)->toBeTrue();

    expect(SecurityLog::query()->where('event_type', 'VEHICLE_ACTIVATED')->exists())->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'VEHICLE_DEACTIVATED')->exists())->toBeTrue();
});

// ---- activity() ----

test('activity exige AMBOS: audit.read Y accesibilidad del vehículo, y filtra por metadata->vehicle_id', function () {
    $organization = Organization::factory()->create();
    $vehicle = Vehicle::factory()->create(['organization_id' => $organization->id]);
    $otherVehicle = Vehicle::factory()->create(['organization_id' => $organization->id]);

    $noAuditRead = vehicleActor(['vehicles.update', 'vehicles.activate', 'vehicles.deactivate'], $organization->id);
    $this->actingAs($noAuditRead)->getJson("/api/admin/vehicles/{$vehicle->id}/activity")->assertForbidden();

    $actor = vehicleActor(['vehicles.update', 'vehicles.activate', 'vehicles.deactivate', 'audit.read'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/vehicles/{$vehicle->id}", ['brand' => 'Actividad Test'])->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/vehicles/{$vehicle->id}/deactivate")->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/vehicles/{$vehicle->id}/activate")->assertOk();

    // ruido: evento de OTRO vehículo.
    $this->actingAs($actor)->postJson("/api/admin/vehicles/{$otherVehicle->id}/deactivate")->assertOk();

    $response = $this->actingAs($actor)->getJson("/api/admin/vehicles/{$vehicle->id}/activity")->assertOk();

    $events = collect($response->json('data'))->pluck('event_type');
    expect($events)->toContain('VEHICLE_UPDATED')
        ->and($events)->toContain('VEHICLE_ACTIVATED')
        ->and($events)->toContain('VEHICLE_DEACTIVATED')
        ->and($events->count())->toBe(3);
});

// ---- KPIs ----

test('index calcula los KPIs (total/active/inactive) con la MISMA visibilidad que el listado', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();

    Vehicle::factory()->count(2)->create(['organization_id' => $organization->id, 'is_active' => true]);
    Vehicle::factory()->create(['organization_id' => $organization->id, 'is_active' => false]);
    Vehicle::factory()->count(5)->create(['organization_id' => $otherOrganization->id, 'is_active' => true]);

    $actor = vehicleActor(['vehicles.read'], $organization->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/vehicles')->assertOk();

    expect($response->json('kpis'))->toBe([
        'total' => 3,
        'active' => 2,
        'inactive' => 1,
    ]);
});
