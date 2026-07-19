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
        'generation_date' => null,
    ]);
    $waste->wasteStreamAssignments()->create([
        'tenant_organization_id' => $waste->tenant_organization_id,
        'organization_id' => $waste->organization_id,
        'waste_stream_id' => WasteStream::factory()->create()->id,
    ]);

    $actor = wasteActor(['wastes.submit'], $organization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/submit")
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['quantity', 'generation_date']);
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
