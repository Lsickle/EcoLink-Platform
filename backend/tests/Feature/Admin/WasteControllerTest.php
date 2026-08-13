<?php

use App\Models\Branch;
use App\Models\GenerationFrequency;
use App\Models\HazardCharacteristic;
use App\Models\MeasurementUnit;
use App\Models\Organization;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\UnCode;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Waste;
use App\Models\WasteCategory;
use App\Models\WasteStream;
use App\Models\WasteTreatmentApproval;
use App\Models\WasteType;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;

// Núcleo del Módulo Residuos (declaración + clasificación). Acceso DUAL,
// mismo patrón exacto que Sedes/Vehículos/Tratamientos por Sede -- ver
// Waste::isAccessibleBy()/WastePolicy. SIN restricción de business_role
// (confirmado por el usuario: "cualquier rol de negocio puede registrar
// residuos").

function wasteActor(array $codes = [], ?int $tenantOrganizationId = null): User
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

function wastePlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return wasteActor($codes, $platform->id);
}

const WASTE_ALL_PERMISSIONS = ['wastes.read', 'wastes.create', 'wastes.update', 'wastes.activate', 'wastes.deactivate'];
const WASTE_WORKFLOW_PERMISSIONS = ['wastes.submit', 'wastes.review', 'wastes.classify', 'wastes.reject'];

// Defaults de aplicación de WasteController::store() (OPERATIONAL/KG/ACTIVE)
// -- necesarios en CUALQUIER test que llame a store() sin enviar
// waste_type_id/measurement_unit_id/operational_status_id explícitos.
// item 17/D-WF-02: RespelStatusSeeder (+ dependencias) necesario en CUALQUIER
// test que cree una WasteTreatmentApproval -- `technical_status`/
// `commercial_status` ya no son VARCHAR libres, resuelven su FK real
// (`technical_status_id`/`commercial_status_id`) contra este catálogo.
beforeEach(function () {
    \App\Models\WasteType::query()->firstOrCreate(['code' => 'OPERATIONAL'], ['name' => 'Operacional', 'is_system' => true, 'is_active' => true]);
    \App\Models\MeasurementUnit::query()->firstOrCreate(['code' => 'KG'], ['name' => 'Kilogramo', 'is_system' => true, 'is_active' => true]);
    \App\Models\WasteOperationalStatus::query()->firstOrCreate(['code' => 'ACTIVE'], ['name' => 'Activo', 'is_system' => true, 'is_active' => true]);
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RespelStatusSeeder::class);
});

// ---- Aislamiento tenant vs. platform staff ----

test('todos los endpoints devuelven 403 sin el permiso wastes.* correspondiente', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $actor = wasteActor([], $organization->id);

    $this->actingAs($actor)->getJson('/api/admin/wastes')->assertForbidden();
    $this->actingAs($actor)->postJson('/api/admin/wastes', [])->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}")->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/wastes/{$waste->id}", [])->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/deactivate")->assertForbidden();
    $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}/activity")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/submit")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/start-review")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/classify")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/reject", ['reason' => 'x'])->assertForbidden();
});

test('un admin de tenant con permiso NO puede ver/editar residuos de OTRA organización', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $foreignWaste = Waste::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = wasteActor(WASTE_ALL_PERMISSIONS, $ownOrganization->id);

    $this->actingAs($actor)->getJson("/api/admin/wastes/{$foreignWaste->id}")->assertForbidden();
    $this->actingAs($actor)->putJson("/api/admin/wastes/{$foreignWaste->id}", ['name' => 'Hackeado'])->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$foreignWaste->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$foreignWaste->id}/deactivate")->assertForbidden();
});

test('platform staff SÍ puede ver/editar residuos de CUALQUIER organización', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);

    $actor = wastePlatformStaffActor(WASTE_ALL_PERMISSIONS);

    $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}")->assertOk();
    $this->actingAs($actor)->putJson("/api/admin/wastes/{$waste->id}", ['name' => 'Modificado'])->assertOk();
});

test('index acota el listado a la organización del actor cuando NO es platform staff, e ignora organization_id del query', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();

    $ownWaste = Waste::factory()->create(['organization_id' => $ownOrganization->id]);
    $foreignWaste = Waste::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = wasteActor(['wastes.read'], $ownOrganization->id);

    $response = $this->actingAs($actor)
        ->getJson("/api/admin/wastes?organization_id={$otherOrganization->id}")
        ->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($ownWaste->id)->not->toContain($foreignWaste->id);
});

// Gap de contrato encontrado por el agente de frontend (wizard de
// Solicitudes de Servicio, Paso 2): Waste::scopeWithViableTreatment() ya
// existía en el modelo, pero index() nunca lo exponía como filtro --
// obligaba a un workaround N+1 en el cliente. `with_viable_treatment=1`
// aplica el scope (ambos ejes de AL MENOS una aprobación activa en
// APPROVED); sin el filtro, el comportamiento es el mismo de siempre.
test('index filtra por with_viable_treatment cuando se pide, sin alterar el aislamiento de organización', function () {
    $organization = Organization::factory()->create();
    $actor = wasteActor(['wastes.read'], $organization->id);

    $wasteWithViableTreatment = Waste::factory()->create(['organization_id' => $organization->id]);
    WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $organization->id,
        'waste_id' => $wasteWithViableTreatment->id,
    ]);

    $wasteWithoutViableTreatment = Waste::factory()->create(['organization_id' => $organization->id]);
    WasteTreatmentApproval::factory()->create([
        'organization_id' => $organization->id,
        'waste_id' => $wasteWithoutViableTreatment->id,
        'technical_status' => 'PENDING',
        'commercial_status' => 'DRAFT',
    ]);

    $withoutFilter = $this->actingAs($actor)->getJson('/api/admin/wastes')->assertOk();
    $idsWithoutFilter = collect($withoutFilter->json('data'))->pluck('id');
    expect($idsWithoutFilter)->toContain($wasteWithViableTreatment->id)->toContain($wasteWithoutViableTreatment->id);

    $withFilter = $this->actingAs($actor)->getJson('/api/admin/wastes?with_viable_treatment=1')->assertOk();
    $idsWithFilter = collect($withFilter->json('data'))->pluck('id');
    expect($idsWithFilter)->toContain($wasteWithViableTreatment->id)->not->toContain($wasteWithoutViableTreatment->id);
});

// ---- store(): defaults + anti-role-smuggling ----

test('store crea un residuo con los defaults correctos (waste_type OPERATIONAL, measurement_unit KG, operational_status ACTIVE, status BR)', function () {
    $this->seed(\Database\Seeders\WasteTypeSeeder::class);
    $this->seed(\Database\Seeders\MeasurementUnitSeeder::class);
    $this->seed(\Database\Seeders\WasteOperationalStatusSeeder::class);

    $organization = Organization::factory()->create();
    $actor = wasteActor(['wastes.create'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/wastes', [
        'name' => 'Residuo de Prueba',
    ])->assertCreated();

    $waste = Waste::query()->where('name', 'Residuo de Prueba')->firstOrFail();

    expect($waste->organization_id)->toBe($organization->id)
        ->and($waste->wasteType->code)->toBe('OPERATIONAL')
        ->and($waste->measurementUnit->code)->toBe('KG')
        ->and($waste->operationalStatus->code)->toBe('ACTIVE')
        ->and($waste->status)->toBe('BR')
        ->and($waste->is_active)->toBeTrue()
        ->and($waste->waste_danger)->toBeNull();

    expect(SecurityLog::query()->where('event_type', 'WASTE_CREATED')->exists())->toBeTrue();
});

test('store fuerza organization_id del actor para un admin de tenant, ignorando el payload (rechaza role-smuggling)', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $actor = wasteActor(['wastes.create'], $ownOrganization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/wastes', [
        'organization_id' => $otherOrganization->id,
        'name' => 'Residuo Smuggled',
    ])->assertCreated();

    $response->assertJsonPath('waste.organization_id', $ownOrganization->id);
});

test('store con platform staff exige organization_id explícito (422 si falta)', function () {
    $actor = wastePlatformStaffActor(['wastes.create']);

    $this->actingAs($actor)->postJson('/api/admin/wastes', [
        'name' => 'Residuo Sin Organización',
    ])->assertUnprocessable()->assertJsonValidationErrors('organization_id');
});

test('store ignora waste_danger/status enviados por el cliente', function () {
    $organization = Organization::factory()->create();
    $actor = wasteActor(['wastes.create'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/wastes', [
        'name' => 'Residuo Blindado',
        'waste_danger' => 'TOXICO',
        'status' => 'CLS',
    ])->assertCreated();

    $response->assertJsonPath('waste.waste_danger', null)
        ->assertJsonPath('waste.status', 'BR');
});

test('branch_id que no pertenece a la organización es rechazado', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $foreignBranch = Branch::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = wasteActor(['wastes.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/wastes', [
        'name' => 'Residuo Con Sede Ajena',
        'branch_id' => $foreignBranch->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('branch_id');
});

// ---- update(): organization_id no editable ----

test('update ignora cambios a organization_id (no editable tras creación)', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);

    $actor = wasteActor(['wastes.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/wastes/{$waste->id}", [
        'organization_id' => $otherOrganization->id,
        'name' => 'Nombre Actualizado',
    ])->assertOk()->assertJsonPath('waste.name', 'Nombre Actualizado');

    expect($waste->fresh()->organization_id)->toBe($organization->id);
});

// ---- activate()/deactivate(): permiso específico ----

test('activate/deactivate exigen el permiso específico -- wastes.update en exclusiva NO basta', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);

    $actor = wasteActor(['wastes.update'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/activate")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/deactivate")->assertForbidden();
});

test('activate/deactivate togglean is_active', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id, 'is_active' => true]);

    $actor = wasteActor(['wastes.update', 'wastes.activate', 'wastes.deactivate'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/deactivate")->assertOk()
        ->assertJsonPath('waste.is_active', false);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/activate")->assertOk()
        ->assertJsonPath('waste.is_active', true);
});

// ---- Workflow: submit()/startReview()/classify()/reject() ----

test('submit rechaza sin al menos una corriente Y/A o código UN asignado', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create([
        'organization_id' => $organization->id,
        'quantity' => 10,
        'generation_date' => now()->toDateString(),
    ]);

    $actor = wasteActor(['wastes.submit'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/submit")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('waste_stream_ids');

    expect($waste->fresh()->status)->toBe('BR');
});

test('submit rechaza si faltan campos requeridos del wizard', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create([
        'organization_id' => $organization->id,
        'quantity' => null,
    ]);
    $waste->wasteStreamAssignments()->create([
        'tenant_organization_id' => $waste->tenant_organization_id,
        'organization_id' => $waste->organization_id,
        'waste_stream_id' => WasteStream::factory()->create()->id,
    ]);

    $actor = wasteActor(['wastes.submit'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/submit")
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['quantity']);
});

test('submit transiciona BR->DEC cuando el residuo está completo', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create([
        'organization_id' => $organization->id,
        'quantity' => 100,
        'generation_date' => now()->toDateString(),
    ]);
    $waste->wasteStreamAssignments()->create([
        'tenant_organization_id' => $waste->tenant_organization_id,
        'organization_id' => $waste->organization_id,
        'waste_stream_id' => WasteStream::factory()->create()->id,
    ]);

    $actor = wasteActor(['wastes.submit'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/submit")
        ->assertOk()
        ->assertJsonPath('waste.status', 'DEC');

    expect(SecurityLog::query()->where('event_type', 'WASTE_SUBMITTED')->exists())->toBeTrue();
});

test('submit acepta un código UN como clasificación alternativa (sin corriente Y/A)', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create([
        'organization_id' => $organization->id,
        'quantity' => 100,
        'generation_date' => now()->toDateString(),
    ]);
    $waste->wasteUnCodes()->create(['un_code_id' => UnCode::factory()->create()->id]);

    $actor = wasteActor(['wastes.submit'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/submit")->assertOk();
});

test('submit rechaza si el residuo NO está en Borrador', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id, 'status' => 'DEC']);

    $actor = wasteActor(['wastes.submit'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/submit")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('status');
});

// ---- business_role: SIN restricción -- cualquier rol de negocio declara y clasifica ----

test('una organización SUBGESTOR (transporta pero no trata residuos) declara y clasifica un residuo igual que cualquier otra', function () {
    $this->seed(\Database\Seeders\WasteTypeSeeder::class);
    $this->seed(\Database\Seeders\MeasurementUnitSeeder::class);
    $this->seed(\Database\Seeders\WasteOperationalStatusSeeder::class);

    $organization = Organization::factory()->create();
    $subgestor = \App\Models\BusinessRole::factory()->create(['can_transport_waste' => true, 'can_treat_waste' => false]);
    \App\Models\OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $subgestor->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    $actor = wasteActor([...WASTE_ALL_PERMISSIONS, ...WASTE_WORKFLOW_PERMISSIONS], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/wastes', [
        'name' => 'Residuo declarado por Subgestor',
        'quantity' => 50,
        'generation_date' => now()->toDateString(),
        'waste_category_id' => WasteCategory::factory()->create()->id,
        'generation_frequency_id' => \App\Models\GenerationFrequency::factory()->create()->id,
    ])->assertCreated();

    $waste = Waste::query()->findOrFail($response->json('waste.id'));
    expect($waste->organization_id)->toBe($organization->id)->and($waste->status)->toBe('BR');

    $waste->wasteStreamAssignments()->create([
        'tenant_organization_id' => $waste->tenant_organization_id,
        'organization_id' => $waste->organization_id,
        'waste_stream_id' => WasteStream::factory()->create()->id,
    ]);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/submit")
        ->assertOk()->assertJsonPath('waste.status', 'DEC');
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/start-review")
        ->assertOk()->assertJsonPath('waste.status', 'REV');
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/classify")
        ->assertOk()->assertJsonPath('waste.status', 'CLS');
});

test('una organización COMERCIALIZADOR (sin ningún flag de capacidad) también puede declarar un residuo', function () {
    $this->seed(\Database\Seeders\WasteTypeSeeder::class);
    $this->seed(\Database\Seeders\MeasurementUnitSeeder::class);
    $this->seed(\Database\Seeders\WasteOperationalStatusSeeder::class);

    $organization = Organization::factory()->create();
    $comercializador = \App\Models\BusinessRole::factory()->create([
        'can_generate_waste' => false, 'can_transport_waste' => false,
        'can_treat_waste' => false, 'can_approve_treatments' => false, 'can_issue_manifests' => false,
    ]);
    \App\Models\OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $comercializador->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    $actor = wasteActor(['wastes.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/wastes', [
        'name' => 'Residuo declarado por Comercializador',
    ])->assertCreated()->assertJsonPath('waste.organization_id', $organization->id);
});

// ---- Cadena Generador -> Subgestor -> Gestor (confirmado por stakeholders reales, 2026-08-09) ----

function wasteSubgestorRelationship(int $generatorOrganizationId, int $subgestorOrganizationId): void
{
    $subgestorBusinessRole = \App\Models\BusinessRole::factory()->create(['can_transport_waste' => true]);
    \App\Models\OrganizationBusinessRole::query()->create([
        'organization_id' => $subgestorOrganizationId,
        'business_role_id' => $subgestorBusinessRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    \App\Models\GeneratorSubgestorRelationship::query()->create([
        'generator_organization_id' => $generatorOrganizationId,
        'subgestor_organization_id' => $subgestorOrganizationId,
        'authorized_at' => now(),
        'is_active' => true,
    ]);
}

test('un Subgestor con relación ACTIVA puede VER (show) el residuo de su Generador cliente', function () {
    $generatorOrganization = Organization::factory()->create();
    $subgestorOrganization = Organization::factory()->create();
    wasteSubgestorRelationship($generatorOrganization->id, $subgestorOrganization->id);

    // 'status' => 'DEC': la visibilidad cruzada arranca en "Declarado", no
    // mientras el residuo sigue en Borrador (corrección 2026-08-12, ver
    // `Waste::isForwardableBySubgestor()`).
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id, 'status' => 'DEC']);
    $actor = wasteActor(['wastes.read'], $subgestorOrganization->id);

    $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}")->assertOk();
});

test('un Subgestor SIN relación activa NO puede ver el residuo de un Generador ajeno', function () {
    $generatorOrganization = Organization::factory()->create();
    $subgestorOrganization = Organization::factory()->create();
    // Sin wasteSubgestorRelationship() -- ninguna relación registrada.

    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);
    $actor = wasteActor(['wastes.read'], $subgestorOrganization->id);

    $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}")->assertForbidden();
});

test('un Subgestor CON relación activa NO puede ver un residuo que sigue en Borrador (BR) -- la visibilidad cruzada arranca en Declarado', function () {
    $generatorOrganization = Organization::factory()->create();
    $subgestorOrganization = Organization::factory()->create();
    wasteSubgestorRelationship($generatorOrganization->id, $subgestorOrganization->id);

    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id, 'status' => 'BR']);
    $actor = wasteActor(['wastes.read'], $subgestorOrganization->id);

    $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}")->assertForbidden();

    $response = $this->actingAs($actor)->getJson('/api/admin/wastes')->assertOk();
    expect(collect($response->json('data'))->pluck('id'))->not->toContain($waste->id);
});

test('un Subgestor con relación activa NO puede editar/clasificar/rechazar el residuo de su Generador cliente -- solo VER', function () {
    $generatorOrganization = Organization::factory()->create();
    $subgestorOrganization = Organization::factory()->create();
    wasteSubgestorRelationship($generatorOrganization->id, $subgestorOrganization->id);

    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id, 'status' => 'DEC']);
    $actor = wasteActor([...WASTE_ALL_PERMISSIONS, ...WASTE_WORKFLOW_PERMISSIONS], $subgestorOrganization->id);

    $this->actingAs($actor)->putJson("/api/admin/wastes/{$waste->id}", ['name' => 'Editado por Subgestor'])->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/start-review")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/reject", ['reason' => 'x'])->assertForbidden();
});

test('index() de un Subgestor incluye los residuos de sus Generadores clientes, además de los suyos propios', function () {
    $generatorOrganization = Organization::factory()->create();
    $subgestorOrganization = Organization::factory()->create();
    wasteSubgestorRelationship($generatorOrganization->id, $subgestorOrganization->id);

    Waste::factory()->create(['organization_id' => $generatorOrganization->id, 'name' => 'Residuo del Generador cliente', 'status' => 'DEC']);
    Waste::factory()->create(['organization_id' => $subgestorOrganization->id, 'name' => 'Residuo propio del Subgestor']);

    $otherOrganization = Organization::factory()->create();
    Waste::factory()->create(['organization_id' => $otherOrganization->id, 'name' => 'Residuo ajeno sin relación']);

    $actor = wasteActor(['wastes.read'], $subgestorOrganization->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/wastes')->assertOk();
    $names = collect($response->json('data'))->pluck('name');

    expect($names)->toContain('Residuo del Generador cliente')
        ->toContain('Residuo propio del Subgestor')
        ->not->toContain('Residuo ajeno sin relación');
});

test('index() NO incluye residuos de un Generador cuya relación con el Subgestor fue REVOCADA', function () {
    $generatorOrganization = Organization::factory()->create();
    $subgestorOrganization = Organization::factory()->create();
    wasteSubgestorRelationship($generatorOrganization->id, $subgestorOrganization->id);
    \App\Models\GeneratorSubgestorRelationship::query()
        ->where('generator_organization_id', $generatorOrganization->id)
        ->update(['is_active' => false]);

    Waste::factory()->create(['organization_id' => $generatorOrganization->id, 'name' => 'Residuo del ex-cliente']);

    $actor = wasteActor(['wastes.read'], $subgestorOrganization->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/wastes')->assertOk();
    expect(collect($response->json('data'))->pluck('name'))->not->toContain('Residuo del ex-cliente');
});

// Corrección del modelo de negocio, 2026-08-12: mismo bloque de arriba,
// espejado para Gestor (relación directa `generator_gestor_relationships`,
// SIN Subgestor de por medio) -- la declaración debe ser visible de
// inmediato, sin que nadie solicite evaluación primero.

function wasteGestorRelationship(int $generatorOrganizationId, int $gestorOrganizationId): void
{
    $gestorBusinessRole = \App\Models\BusinessRole::factory()->create(['can_treat_waste' => true]);
    \App\Models\OrganizationBusinessRole::query()->create([
        'organization_id' => $gestorOrganizationId,
        'business_role_id' => $gestorBusinessRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    \App\Models\GeneratorGestorRelationship::query()->create([
        'generator_organization_id' => $generatorOrganizationId,
        'gestor_organization_id' => $gestorOrganizationId,
        'authorized_at' => now(),
        'is_active' => true,
    ]);
}

test('un Gestor con relación ACTIVA puede VER (show) el residuo de su Generador cliente, SIN que nadie haya solicitado evaluación', function () {
    $generatorOrganization = Organization::factory()->create();
    $gestorOrganization = Organization::factory()->create();
    wasteGestorRelationship($generatorOrganization->id, $gestorOrganization->id);

    // 'status' => 'DEC': la visibilidad cruzada arranca en "Declarado", no
    // mientras el residuo sigue en Borrador (corrección 2026-08-12, ver
    // `Waste::isForwardableByGestor()`).
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id, 'status' => 'DEC']);
    $actor = wasteActor(['wastes.read'], $gestorOrganization->id);

    $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}")->assertOk();
});

test('un Gestor SIN relación activa NO puede ver el residuo de un Generador ajeno', function () {
    $generatorOrganization = Organization::factory()->create();
    $gestorOrganization = Organization::factory()->create();
    // Sin wasteGestorRelationship() -- ninguna relación registrada.

    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);
    $actor = wasteActor(['wastes.read'], $gestorOrganization->id);

    $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}")->assertForbidden();
});

test('un Gestor CON relación activa NO puede ver un residuo que sigue en Borrador (BR) -- la visibilidad cruzada arranca en Declarado', function () {
    $generatorOrganization = Organization::factory()->create();
    $gestorOrganization = Organization::factory()->create();
    wasteGestorRelationship($generatorOrganization->id, $gestorOrganization->id);

    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id, 'status' => 'BR']);
    $actor = wasteActor(['wastes.read'], $gestorOrganization->id);

    $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}")->assertForbidden();

    $response = $this->actingAs($actor)->getJson('/api/admin/wastes')->assertOk();
    expect(collect($response->json('data'))->pluck('id'))->not->toContain($waste->id);
});

test('un Gestor con relación activa NO puede editar/clasificar/rechazar el residuo de su Generador cliente -- solo VER/ofrecer tratamiento', function () {
    $generatorOrganization = Organization::factory()->create();
    $gestorOrganization = Organization::factory()->create();
    wasteGestorRelationship($generatorOrganization->id, $gestorOrganization->id);

    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id, 'status' => 'DEC']);
    $actor = wasteActor([...WASTE_ALL_PERMISSIONS, ...WASTE_WORKFLOW_PERMISSIONS], $gestorOrganization->id);

    $this->actingAs($actor)->putJson("/api/admin/wastes/{$waste->id}", ['name' => 'Editado por Gestor'])->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/start-review")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/reject", ['reason' => 'x'])->assertForbidden();
});

test('index() de un Gestor incluye los residuos de sus Generadores clientes, además de los suyos propios', function () {
    $generatorOrganization = Organization::factory()->create();
    $gestorOrganization = Organization::factory()->create();
    wasteGestorRelationship($generatorOrganization->id, $gestorOrganization->id);

    Waste::factory()->create(['organization_id' => $generatorOrganization->id, 'name' => 'Residuo del Generador cliente (Gestor)', 'status' => 'DEC']);
    Waste::factory()->create(['organization_id' => $gestorOrganization->id, 'name' => 'Residuo propio del Gestor']);

    $otherOrganization = Organization::factory()->create();
    Waste::factory()->create(['organization_id' => $otherOrganization->id, 'name' => 'Residuo ajeno sin relación (Gestor)']);

    $actor = wasteActor(['wastes.read'], $gestorOrganization->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/wastes')->assertOk();
    $names = collect($response->json('data'))->pluck('name');

    expect($names)->toContain('Residuo del Generador cliente (Gestor)')
        ->toContain('Residuo propio del Gestor')
        ->not->toContain('Residuo ajeno sin relación (Gestor)');
});

test('index() NO incluye residuos de un Generador cuya relación con el Gestor fue REVOCADA', function () {
    $generatorOrganization = Organization::factory()->create();
    $gestorOrganization = Organization::factory()->create();
    wasteGestorRelationship($generatorOrganization->id, $gestorOrganization->id);
    \App\Models\GeneratorGestorRelationship::query()
        ->where('generator_organization_id', $generatorOrganization->id)
        ->update(['is_active' => false]);

    Waste::factory()->create(['organization_id' => $generatorOrganization->id, 'name' => 'Residuo del ex-cliente (Gestor)']);

    $actor = wasteActor(['wastes.read'], $gestorOrganization->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/wastes')->assertOk();
    expect(collect($response->json('data'))->pluck('name'))->not->toContain('Residuo del ex-cliente (Gestor)');
});

test('index() con pending_evaluation=1 excluye residuos que YA tienen un tratamiento viable', function () {
    $organization = Organization::factory()->create();
    $wasteWithTreatment = Waste::factory()->create(['organization_id' => $organization->id, 'name' => 'Residuo con tratamiento viable']);
    Waste::factory()->create(['organization_id' => $organization->id, 'name' => 'Residuo pendiente']);

    \App\Models\WasteTreatmentApproval::factory()->create([
        'waste_id' => $wasteWithTreatment->id,
        'technical_status' => 'APPROVED',
        'commercial_status' => 'APPROVED',
        'is_active' => true,
    ]);

    $actor = wasteActor(['wastes.read'], $organization->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/wastes?pending_evaluation=1')->assertOk();
    $names = collect($response->json('data'))->pluck('name');

    expect($names)->toContain('Residuo pendiente')->not->toContain('Residuo con tratamiento viable');
});

test('show expone treatment_approval_mode: owner para el dueño, forward para el Subgestor, offer para el Gestor', function () {
    $generatorOrganization = Organization::factory()->create();
    $subgestorOrganization = Organization::factory()->create();
    $gestorOrganization = Organization::factory()->create();
    wasteSubgestorRelationship($generatorOrganization->id, $subgestorOrganization->id);
    wasteGestorRelationship($generatorOrganization->id, $gestorOrganization->id);

    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id, 'status' => 'DEC']);

    $owner = wasteActor(['wastes.read', 'wastes.update', 'treatment_approvals.create'], $generatorOrganization->id);
    $subgestor = wasteActor(['wastes.read', 'treatment_approvals.create'], $subgestorOrganization->id);
    $gestor = wasteActor(['wastes.read', 'treatment_approvals.create'], $gestorOrganization->id);

    $this->actingAs($owner)->getJson("/api/admin/wastes/{$waste->id}")->assertOk()->assertJsonPath('waste.treatment_approval_mode', 'owner');
    $this->actingAs($subgestor)->getJson("/api/admin/wastes/{$waste->id}")->assertOk()->assertJsonPath('waste.treatment_approval_mode', 'forward');
    $this->actingAs($gestor)->getJson("/api/admin/wastes/{$waste->id}")->assertOk()->assertJsonPath('waste.treatment_approval_mode', 'offer');
});

test('startReview transiciona DEC->REV', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id, 'status' => 'DEC']);

    $actor = wasteActor(['wastes.review'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/start-review")
        ->assertOk()
        ->assertJsonPath('waste.status', 'REV');

    expect(SecurityLog::query()->where('event_type', 'WASTE_REVIEW_STARTED')->exists())->toBeTrue();
});

test('startReview rechaza si el residuo no está Declarado', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id, 'status' => 'BR']);

    $actor = wasteActor(['wastes.review'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/start-review")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('status');
});

test('classify transiciona REV->CLS y fija last_classification_review_at', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id, 'status' => 'REV']);

    $actor = wasteActor(['wastes.classify'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/classify")
        ->assertOk()
        ->assertJsonPath('waste.status', 'CLS');

    expect($waste->fresh()->last_classification_review_at)->not->toBeNull();
    expect(SecurityLog::query()->where('event_type', 'WASTE_CLASSIFIED')->exists())->toBeTrue();
});

test('reject revierte DEC o REV a BR y guarda la razón en security_logs', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id, 'status' => 'REV']);

    $actor = wasteActor(['wastes.reject'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/reject", [
        'reason' => 'Documentación incompleta',
    ])->assertOk()->assertJsonPath('waste.status', 'BR');

    $log = SecurityLog::query()->where('event_type', 'WASTE_REJECTED')->latest('id')->first();
    expect($log)->not->toBeNull()
        ->and($log->metadata['reason'])->toBe('Documentación incompleta');
});

test('reject exige el motivo (reason)', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id, 'status' => 'DEC']);

    $actor = wasteActor(['wastes.reject'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/reject", [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('reason');
});

test('workflow: submit/startReview/classify/reject NO requieren wastes.update, solo su propio permiso', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create([
        'organization_id' => $organization->id,
        'status' => 'DEC',
        'quantity' => 10,
        'generation_date' => now()->toDateString(),
    ]);

    $actor = wasteActor(['wastes.review'], $organization->id);

    // Sin wastes.update, SÍ puede iniciar revisión con solo wastes.review.
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/start-review")->assertOk();
});

// ---- Clasificación N:M: syncWasteStreams/syncUnCodes/syncHazardCharacteristics ----

test('syncWasteStreams reemplaza la pivote completa', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $streamA = WasteStream::factory()->create();
    $streamB = WasteStream::factory()->create();

    $actor = wasteActor(['wastes.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/wastes/{$waste->id}/waste-streams", [
        'waste_stream_ids' => [$streamA->id, $streamB->id],
    ])->assertOk();

    expect($waste->wasteStreams()->count())->toBe(2);
});

test('syncUnCodes reemplaza la pivote completa', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $unCode = UnCode::factory()->create();

    $actor = wasteActor(['wastes.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/wastes/{$waste->id}/un-codes", [
        'un_code_ids' => [$unCode->id],
    ])->assertOk();

    expect($waste->wasteUnCodes()->count())->toBe(1);
});

test('syncHazardCharacteristics reemplaza la pivote Y recalcula waste_danger (mayor risk_level)', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $low = HazardCharacteristic::factory()->create(['code' => 'IRRITANTE', 'risk_level' => 1]);
    $high = HazardCharacteristic::factory()->create(['code' => 'TOXICO', 'risk_level' => 7]);

    $actor = wasteActor(['wastes.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/wastes/{$waste->id}/hazard-characteristics", [
        'hazard_characteristic_ids' => [$low->id, $high->id],
    ])->assertOk()->assertJsonPath('waste.waste_danger', 'TOXICO');

    expect($waste->fresh()->waste_danger)->toBe('TOXICO');
});

test('syncHazardCharacteristics con arreglo vacío deja waste_danger en NULL', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);
    $characteristic = HazardCharacteristic::factory()->create(['risk_level' => 5]);
    $waste->hazardCharacteristics()->sync([$characteristic->id]);
    $waste->recalculateWasteDanger();
    expect($waste->fresh()->waste_danger)->not->toBeNull();

    $actor = wasteActor(['wastes.update'], $organization->id);

    $this->actingAs($actor)->putJson("/api/admin/wastes/{$waste->id}/hazard-characteristics", [
        'hazard_characteristic_ids' => [],
    ])->assertOk()->assertJsonPath('waste.waste_danger', null);
});

// ---- Hallazgo Baja (especialista-seguridad): cobertura de IDOR cross-tenant en syncWasteStreams/syncUnCodes ----
// La lógica de assertWasteStreamsAccessibleBy()/assertUnCodesAccessibleBy() ya existe y es
// correcta (replicada del fix aplicado en BranchTreatmentController) -- estos tests solo agregan
// la cobertura que faltaba. Mismo patrón exacto que BranchTreatmentControllerTest.

test('syncWasteStreams rechaza un waste_stream_id privado de OTRO tenant (IDOR)', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $ownOrganization->id]);
    $foreignWasteStream = WasteStream::factory()->create(['tenant_organization_id' => $otherOrganization->id]);

    $actor = wasteActor(['wastes.update'], $ownOrganization->id);

    $this->actingAs($actor)->putJson("/api/admin/wastes/{$waste->id}/waste-streams", [
        'waste_stream_ids' => [$foreignWasteStream->id],
    ])->assertUnprocessable()->assertJsonValidationErrors('waste_stream_ids');

    expect($waste->wasteStreams()->count())->toBe(0);
});

test('syncUnCodes rechaza un un_code_id privado de OTRO tenant (IDOR)', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $ownOrganization->id]);
    $foreignUnCode = UnCode::factory()->create(['tenant_organization_id' => $otherOrganization->id]);

    $actor = wasteActor(['wastes.update'], $ownOrganization->id);

    $this->actingAs($actor)->putJson("/api/admin/wastes/{$waste->id}/un-codes", [
        'un_code_ids' => [$foreignUnCode->id],
    ])->assertUnprocessable()->assertJsonValidationErrors('un_code_ids');

    expect($waste->wasteUnCodes()->count())->toBe(0);
});

// ---- show(): eager-load de relaciones ----

test('show carga las relaciones esperadas', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);

    $actor = wasteActor(['wastes.read'], $organization->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}")->assertOk();

    $response->assertJsonStructure([
        'waste' => [
            'id', 'organization', 'waste_type', 'measurement_unit', 'operational_status',
        ],
    ]);
});

// Gap de contrato de API (frontend Residuos): show() debe exponer
// has_viable_treatment (Waste::hasViableTreatment() ya existía como método
// del modelo, pero nunca se serializaba en la respuesta JSON).
test('show incluye has_viable_treatment: true solo cuando existe una aprobación con AMBOS ejes APPROVED', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);

    $actor = wasteActor(['wastes.read'], $organization->id);

    $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}")
        ->assertOk()
        ->assertJsonPath('waste.has_viable_treatment', false);

    WasteTreatmentApproval::factory()->viable()->create(['waste_id' => $waste->id]);

    $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}")
        ->assertOk()
        ->assertJsonPath('waste.has_viable_treatment', true);
});

// ---- activity() ----

test('activity exige AMBOS: audit.read Y accesibilidad del residuo', function () {
    $organization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $organization->id]);

    $noAuditRead = wasteActor(['wastes.update', 'wastes.activate', 'wastes.deactivate'], $organization->id);
    $this->actingAs($noAuditRead)->getJson("/api/admin/wastes/{$waste->id}/activity")->assertForbidden();

    $actor = wasteActor(['wastes.update', 'wastes.activate', 'wastes.deactivate', 'audit.read'], $organization->id);
    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/deactivate")->assertOk();

    $response = $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}/activity")->assertOk();
    $events = collect($response->json('data'))->pluck('event_type');
    expect($events)->toContain('WASTE_DEACTIVATED');
});
