<?php

use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\Treatment;
use App\Models\User;
use App\Models\UserRole;

// Catálogo GLOBAL "Tratamientos" (RN-063/D-R02). Lectura disponible para
// cualquier actor con `treatments.read`; ESCRITURA exige ADEMÁS
// `isPlatformStaff()` -- mismo gate binario que
// OrganizationController/BusinessRoleController -- ver TreatmentPolicy.

function treatmentActor(array $codes = [], ?int $tenantOrganizationId = null): User
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

function treatmentPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return treatmentActor($codes, $platform->id);
}

// ---- viewAny/view: solo exige treatments.read, sin importar el tenant ----

test('index/show devuelven 403 sin treatments.read', function () {
    $treatment = Treatment::factory()->create();
    $actor = treatmentActor([]);

    $this->actingAs($actor)->getJson('/api/admin/treatments')->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/treatments/{$treatment->id}")->assertForbidden();
});

test('un admin de tenant (NO platform staff) SÍ puede leer el catálogo con treatments.read', function () {
    $treatment = Treatment::factory()->create();
    $actor = treatmentActor(['treatments.read'], Organization::factory()->create()->id);

    $this->actingAs($actor)->getJson('/api/admin/treatments')->assertOk();
    $this->actingAs($actor)->getJson("/api/admin/treatments/{$treatment->id}")->assertOk();
});

// ---- store/update/activate/deactivate: exige ADEMÁS isPlatformStaff() ----

test('un admin de tenant con treatments.create/.update NO puede escribir sin ser platform staff', function () {
    $treatment = Treatment::factory()->create();
    $actor = treatmentActor(
        ['treatments.read', 'treatments.create', 'treatments.update', 'treatments.activate', 'treatments.deactivate'],
        Organization::factory()->create()->id,
    );

    $this->actingAs($actor)->postJson('/api/admin/treatments', ['code' => 'X', 'name' => 'X'])->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/treatments/{$treatment->id}", ['name' => 'Y'])->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/treatments/{$treatment->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/treatments/{$treatment->id}/deactivate")->assertForbidden();
});

test('platform staff con treatments.create SÍ puede crear un tratamiento', function () {
    $actor = treatmentPlatformStaffActor(['treatments.read', 'treatments.create']);

    $response = $this->actingAs($actor)->postJson('/api/admin/treatments', [
        'code' => 'NUEVO_TRATAMIENTO',
        'name' => 'Nuevo Tratamiento de Prueba',
        'treatment_type' => 'THERMAL',
        'risk_level' => 'HIGH',
    ])->assertCreated();

    $response->assertJsonPath('treatment.code', 'NUEVO_TRATAMIENTO')
        ->assertJsonPath('treatment.is_system', false)
        ->assertJsonPath('treatment.is_active', true)
        ->assertJsonPath('treatment.tenant_organization_id', null);

    expect(Treatment::query()->where('code', 'NUEVO_TRATAMIENTO')->exists())->toBeTrue();
});

test('code duplicado devuelve 422 legible', function () {
    Treatment::factory()->create(['code' => 'DUPLICADO']);
    $actor = treatmentPlatformStaffActor(['treatments.read', 'treatments.create']);

    $this->actingAs($actor)->postJson('/api/admin/treatments', [
        'code' => 'DUPLICADO', 'name' => 'Otro nombre',
    ])->assertUnprocessable()->assertJsonValidationErrors('code');
});

test('platform staff con treatments.update SÍ puede modificar un tratamiento', function () {
    $treatment = Treatment::factory()->create(['name' => 'Nombre Original']);
    $actor = treatmentPlatformStaffActor(['treatments.read', 'treatments.update']);

    $this->actingAs($actor)->putJson("/api/admin/treatments/{$treatment->id}", [
        'name' => 'Nombre Modificado',
    ])->assertOk()->assertJsonPath('treatment.name', 'Nombre Modificado');
});

test('activate/deactivate exigen el permiso específico -- treatments.update en exclusiva NO basta', function () {
    $treatment = Treatment::factory()->create();
    $actor = treatmentPlatformStaffActor(['treatments.read', 'treatments.update']);

    $this->actingAs($actor)->postJson("/api/admin/treatments/{$treatment->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/treatments/{$treatment->id}/deactivate")->assertForbidden();
});

test('activate/deactivate togglean is_active', function () {
    $treatment = Treatment::factory()->create(['is_active' => true]);
    $actor = treatmentPlatformStaffActor(['treatments.read', 'treatments.update', 'treatments.activate', 'treatments.deactivate']);

    $this->actingAs($actor)->postJson("/api/admin/treatments/{$treatment->id}/deactivate")->assertOk()
        ->assertJsonPath('treatment.is_active', false);
    expect($treatment->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/treatments/{$treatment->id}/activate")->assertOk()
        ->assertJsonPath('treatment.is_active', true);
    expect($treatment->fresh()->is_active)->toBeTrue();
});

// ---- filtros ----

test('index filtra por search en code/name y por treatment_type', function () {
    Treatment::factory()->create(['code' => 'INC', 'name' => 'Incineración de residuos', 'treatment_type' => 'THERMAL']);
    Treatment::factory()->create(['code' => 'REC', 'name' => 'Reciclaje', 'treatment_type' => 'RECOVERY']);
    $actor = treatmentActor(['treatments.read']);

    $bySearch = collect($this->actingAs($actor)->getJson('/api/admin/treatments?search=Incineraci%C3%B3n')->assertOk()->json('data'))->pluck('code');
    expect($bySearch)->toContain('INC')->not->toContain('REC');

    $byType = collect($this->actingAs($actor)->getJson('/api/admin/treatments?treatment_type=RECOVERY')->assertOk()->json('data'))->pluck('code');
    expect($byType)->toContain('REC')->not->toContain('INC');
});

// ---- Hallazgo 2 (Medio, especialista-seguridad): auditoría de seguridad ausente en el catálogo GLOBAL ----
// Mismo patrón que BranchTreatmentController -- las 4 acciones de escritura deben quedar en security_logs.

test('store deja registro TREATMENT_CREATED en security_logs', function () {
    $actor = treatmentPlatformStaffActor(['treatments.read', 'treatments.create']);

    $this->actingAs($actor)->postJson('/api/admin/treatments', [
        'code' => 'AUDITADO_CREATE', 'name' => 'Tratamiento Auditado',
    ])->assertCreated();

    expect(SecurityLog::query()->where('event_type', 'TREATMENT_CREATED')->exists())->toBeTrue();
});

test('update deja registro TREATMENT_UPDATED en security_logs', function () {
    $treatment = Treatment::factory()->create();
    $actor = treatmentPlatformStaffActor(['treatments.read', 'treatments.update']);

    $this->actingAs($actor)->putJson("/api/admin/treatments/{$treatment->id}", [
        'name' => 'Nombre Modificado',
    ])->assertOk();

    expect(SecurityLog::query()->where('event_type', 'TREATMENT_UPDATED')->exists())->toBeTrue();
});

test('activate deja registro TREATMENT_ACTIVATED en security_logs', function () {
    $treatment = Treatment::factory()->create(['is_active' => false]);
    $actor = treatmentPlatformStaffActor(['treatments.read', 'treatments.update', 'treatments.activate']);

    $this->actingAs($actor)->postJson("/api/admin/treatments/{$treatment->id}/activate")->assertOk();

    expect(SecurityLog::query()->where('event_type', 'TREATMENT_ACTIVATED')->exists())->toBeTrue();
});

test('deactivate deja registro TREATMENT_DEACTIVATED en security_logs', function () {
    $treatment = Treatment::factory()->create(['is_active' => true]);
    $actor = treatmentPlatformStaffActor(['treatments.read', 'treatments.update', 'treatments.deactivate']);

    $this->actingAs($actor)->postJson("/api/admin/treatments/{$treatment->id}/deactivate")->assertOk();

    expect(SecurityLog::query()->where('event_type', 'TREATMENT_DEACTIVATED')->exists())->toBeTrue();
});

test('store rechaza treatment_type y risk_level fuera de la lista cerrada', function () {
    $actor = treatmentPlatformStaffActor(['treatments.read', 'treatments.create']);

    $this->actingAs($actor)->postJson('/api/admin/treatments', [
        'code' => 'BAD1', 'name' => 'Malo', 'treatment_type' => 'INVALIDO',
    ])->assertUnprocessable()->assertJsonValidationErrors('treatment_type');

    $this->actingAs($actor)->postJson('/api/admin/treatments', [
        'code' => 'BAD2', 'name' => 'Malo', 'risk_level' => 'INVALIDO',
    ])->assertUnprocessable()->assertJsonValidationErrors('risk_level');
});
