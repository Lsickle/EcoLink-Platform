<?php

use App\Models\Branch;
use App\Models\BranchTreatment;
use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\Treatment;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Waste;
use App\Models\WasteStream;
use App\Models\WasteStreamAssignment;
use App\Models\WasteTreatmentApproval;
use App\Models\WasteType;
use App\Models\Workflow;
use App\Models\WorkflowLog;
use App\Models\WorkflowServiceBinding;
use App\Models\WorkflowTransition;
use App\Models\WorkflowTransitionRole;
use App\Models\WorkflowVersion;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\WorkflowSeeder;

// "Evaluación del Gestor" (waste_treatment_approvals). Mecanismo de
// invitación simple: el Generador (dueño del residuo) elige un
// branch_treatment_id de un Gestor concreto y crea la solicitud -- esa
// elección ES la invitación. Acceso CRUZADO controlado: organization_id de
// la fila es SIEMPRE el Gestor evaluador, waste_id puede pertenecer a
// CUALQUIER otra organización (el Generador) -- ver
// WasteTreatmentApproval::isAccessibleBy()/isEditableBy().
//
// item 17/D-WF-02: cada transición (approveTechnical/rejectTechnical/
// approveCommercial/rejectCommercial/quote/negotiate/cancel) ahora resuelve
// el workflow BASE "RESPEL" (WorkflowSeeder) y valida
// `workflow_transition_roles` contra el actor -- de ahí la seeding chain
// (RoleSeeder/RespelStatusSeeder/WorkflowSeeder) y que
// `treatmentApprovalActor()` otorgue TAMBIÉN el rol literal `ADMINISTRADOR`
// cuando se pide el permiso `treatment_approvals.evaluate`: en producción
// ese permiso SOLO lo tiene ese rol (RolePermissionSeeder), y las 17
// transiciones del workflow BASE están autorizadas exactamente para ese rol
// (WorkflowSeeder/WorkflowSeederTest) -- se replica esa misma equivalencia
// aquí en vez de inventar un mecanismo de autorización nuevo para los
// tests.
beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(RespelStatusSeeder::class);
    $this->seed(WorkflowSeeder::class);
});

function treatmentApprovalActor(array $codes = [], ?int $tenantOrganizationId = null): User
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

        // Ver docblock de arriba: el motor de Workflow autoriza por ROL
        // (workflow_transition_roles.role_id), no por permiso -- se otorga
        // el rol ADMINISTRADOR real además del permiso ad hoc de siempre,
        // replicando la equivalencia rol<->permiso ya documentada/probada
        // en WorkflowSeeder/WorkflowSeederTest.
        if (in_array('treatment_approvals.evaluate', $codes, true)) {
            $administrador = Role::query()->where('code', 'ADMINISTRADOR')->first();

            if ($administrador !== null) {
                UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $administrador->id, 'is_active' => true]);
            }
        }
    }

    return $actor;
}

function treatmentApprovalPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return treatmentApprovalActor($codes, $platform->id);
}

/**
 * Organización con business_role GESTOR activo (can_treat_waste=true).
 */
function gestorOrganization(): Organization
{
    $organization = Organization::factory()->create();
    $gestor = BusinessRole::factory()->create(['can_treat_waste' => true]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $gestor->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    return $organization->fresh();
}

// ---- storeForWaste(): el Generador elige un branch_treatment_id de un Gestor ----

test('storeForWaste crea la solicitud con organization_id del GESTOR, nunca el del Generador', function () {
    $generatorOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);

    $gestor = gestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $gestor->id]);
    $branchTreatment = BranchTreatment::factory()->create([
        'organization_id' => $gestor->id,
        'branch_id' => $branch->id,
        'treatment_id' => Treatment::factory()->create()->id,
    ]);

    $actor = treatmentApprovalActor(['wastes.update', 'treatment_approvals.create'], $generatorOrganization->id);

    $response = $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/treatment-approvals", [
        'branch_treatment_id' => $branchTreatment->id,
    ])->assertCreated();

    $response->assertJsonPath('treatment_approval.organization_id', $gestor->id)
        ->assertJsonPath('treatment_approval.waste_id', $waste->id)
        ->assertJsonPath('treatment_approval.branch_treatment_id', $branchTreatment->id)
        ->assertJsonPath('treatment_approval.technical_status', 'PENDING')
        ->assertJsonPath('treatment_approval.commercial_status', 'DRAFT');

    expect($response->json('treatment_approval.organization_id'))->not->toBe($generatorOrganization->id);
    expect(SecurityLog::query()->where('event_type', 'WASTE_TREATMENT_APPROVAL_CREATED')->exists())->toBeTrue();
});

test('storeForWaste rechaza un branch_treatment_id de una organización que NO es GESTOR', function () {
    $generatorOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);

    $nonGestorOrganization = Organization::factory()->create();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $nonGestorOrganization->id]);

    $actor = treatmentApprovalActor(['wastes.update', 'treatment_approvals.create'], $generatorOrganization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/treatment-approvals", [
        'branch_treatment_id' => $branchTreatment->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('branch_treatment_id');
});

test('storeForWaste exige wastes.update (dueño del residuo) Y treatment_approvals.create', function () {
    $generatorOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);
    $gestor = gestorOrganization();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $gestor->id]);

    $onlyWasteUpdate = treatmentApprovalActor(['wastes.update'], $generatorOrganization->id);
    $this->actingAs($onlyWasteUpdate)->postJson("/api/admin/wastes/{$waste->id}/treatment-approvals", [
        'branch_treatment_id' => $branchTreatment->id,
    ])->assertForbidden();

    $onlyCreate = treatmentApprovalActor(['treatment_approvals.create'], $generatorOrganization->id);
    $this->actingAs($onlyCreate)->postJson("/api/admin/wastes/{$waste->id}/treatment-approvals", [
        'branch_treatment_id' => $branchTreatment->id,
    ])->assertForbidden();
});

test('storeForWaste rechaza si el actor NO es dueño del residuo (IDOR)', function () {
    $generatorOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);
    $gestor = gestorOrganization();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $gestor->id]);

    $otherOrganization = Organization::factory()->create();
    $foreignActor = treatmentApprovalActor(['wastes.update', 'treatment_approvals.create'], $otherOrganization->id);

    $this->actingAs($foreignActor)->postJson("/api/admin/wastes/{$waste->id}/treatment-approvals", [
        'branch_treatment_id' => $branchTreatment->id,
    ])->assertForbidden();
});

test('storeForWaste rechaza una segunda solicitud activa duplicada (mismo waste_id + branch_treatment_id)', function () {
    $generatorOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);
    $gestor = gestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $gestor->id]);
    $branchTreatment = BranchTreatment::factory()->create([
        'organization_id' => $gestor->id,
        'branch_id' => $branch->id,
        'treatment_id' => Treatment::factory()->create()->id,
    ]);

    $actor = treatmentApprovalActor(['wastes.update', 'treatment_approvals.create'], $generatorOrganization->id);

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/treatment-approvals", [
        'branch_treatment_id' => $branchTreatment->id,
    ])->assertCreated();

    $this->actingAs($actor)->postJson("/api/admin/wastes/{$waste->id}/treatment-approvals", [
        'branch_treatment_id' => $branchTreatment->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('branch_treatment_id');

    expect(WasteTreatmentApproval::query()
        ->where('waste_id', $waste->id)
        ->where('branch_treatment_id', $branchTreatment->id)
        ->count())->toBe(1);
});

// ---- Acceso CRUZADO: view (ambos lados) vs. edit (solo el Gestor) ----

test('un Gestor ajeno a la fila NO puede verla ni editarla (IDOR)', function () {
    $waste = Waste::factory()->create();
    $ownGestor = gestorOrganization();
    $otherGestor = gestorOrganization();

    $approval = WasteTreatmentApproval::factory()->create([
        'organization_id' => $ownGestor->id,
        'waste_id' => $waste->id,
    ]);

    $foreignActor = treatmentApprovalActor(['treatment_approvals.read', 'treatment_approvals.update'], $otherGestor->id);

    $this->actingAs($foreignActor)->getJson("/api/admin/treatment-approvals/{$approval->id}")->assertForbidden();
    $this->actingAs($foreignActor)->putJson("/api/admin/treatment-approvals/{$approval->id}", ['unit_price' => 100])->assertForbidden();
});

test('el dueño del residuo puede VER pero NO EDITAR una fila de un Gestor', function () {
    $generatorOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);
    $gestor = gestorOrganization();

    $approval = WasteTreatmentApproval::factory()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
    ]);

    $actor = treatmentApprovalActor(['treatment_approvals.read', 'treatment_approvals.update'], $generatorOrganization->id);

    $this->actingAs($actor)->getJson("/api/admin/treatment-approvals/{$approval->id}")->assertOk();
    $this->actingAs($actor)->putJson("/api/admin/treatment-approvals/{$approval->id}", ['unit_price' => 100])->assertForbidden();

    expect($approval->fresh()->unit_price)->toBeNull();
});

test('el Gestor dueño de la fila SÍ puede verla y editarla', function () {
    $waste = Waste::factory()->create();
    $gestor = gestorOrganization();

    $approval = WasteTreatmentApproval::factory()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
    ]);

    $actor = treatmentApprovalActor(['treatment_approvals.read', 'treatment_approvals.update'], $gestor->id);

    $this->actingAs($actor)->getJson("/api/admin/treatment-approvals/{$approval->id}")->assertOk();
    $this->actingAs($actor)->putJson("/api/admin/treatment-approvals/{$approval->id}", [
        'unit_price' => 150.50,
        'currency' => 'USD',
    ])->assertOk()->assertJsonPath('treatment_approval.currency', 'USD');

    expect((float) $approval->fresh()->unit_price)->toBe(150.50);
});

// Gap de contrato de API (frontend Residuos): el Gestor evaluador no tiene
// acceso directo a GET /admin/wastes/{id} (WastePolicy::view() lo bloquea,
// correctamente, para quien no es dueño del residuo/platform staff) -- la
// única vía autorizada para que vea QUÉ está evaluando (corrientes/UN/
// características de peligrosidad) es a través de esta relación ya
// autorizada. show() debe eager-cargar esas 3 relaciones anidadas sobre
// `waste`.
test('el Gestor dueño de la fila recibe las corrientes/UN/características del residuo evaluado', function () {
    $generatorOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);
    $stream = WasteStream::factory()->create();
    WasteStreamAssignment::factory()->create(['waste_id' => $waste->id, 'waste_stream_id' => $stream->id]);
    $unCode = \App\Models\UnCode::factory()->create();
    $waste->wasteUnCodes()->create(['un_code_id' => $unCode->id]);
    $hazardCharacteristic = \App\Models\HazardCharacteristic::factory()->create();
    $waste->hazardCharacteristics()->sync([$hazardCharacteristic->id]);

    $gestor = gestorOrganization();
    $approval = WasteTreatmentApproval::factory()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
    ]);

    $actor = treatmentApprovalActor(['treatment_approvals.read'], $gestor->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/treatment-approvals/{$approval->id}")->assertOk();

    $response->assertJsonPath('treatment_approval.waste.waste_stream_assignments.0.waste_stream.id', $stream->id)
        ->assertJsonPath('treatment_approval.waste.waste_un_codes.0.un_code.id', $unCode->id)
        ->assertJsonPath('treatment_approval.waste.waste_hazard_characteristics.0.hazard_characteristic.id', $hazardCharacteristic->id);
});

test('platform staff SÍ puede ver/editar CUALQUIER evaluación', function () {
    $waste = Waste::factory()->create();
    $gestor = gestorOrganization();
    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $gestor->id, 'waste_id' => $waste->id]);

    $actor = treatmentApprovalPlatformStaffActor(['treatment_approvals.read', 'treatment_approvals.update']);

    $this->actingAs($actor)->getJson("/api/admin/treatment-approvals/{$approval->id}")->assertOk();
    $this->actingAs($actor)->putJson("/api/admin/treatment-approvals/{$approval->id}", ['unit_price' => 200])->assertOk();
});

// ---- indexForWaste(): dueño ve todas, Gestor solo la suya ----

test('indexForWaste: el dueño del residuo ve TODAS las evaluaciones de CUALQUIER Gestor', function () {
    $generatorOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);
    $gestorA = gestorOrganization();
    $gestorB = gestorOrganization();

    $approvalA = WasteTreatmentApproval::factory()->create(['organization_id' => $gestorA->id, 'waste_id' => $waste->id]);
    $approvalB = WasteTreatmentApproval::factory()->create(['organization_id' => $gestorB->id, 'waste_id' => $waste->id]);

    $actor = treatmentApprovalActor(['treatment_approvals.read'], $generatorOrganization->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}/treatment-approvals")->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($approvalA->id)->toContain($approvalB->id);
});

test('indexForWaste: un Gestor NO dueño del residuo solo ve SU PROPIA evaluación', function () {
    $waste = Waste::factory()->create();
    $gestorA = gestorOrganization();
    $gestorB = gestorOrganization();

    $approvalA = WasteTreatmentApproval::factory()->create(['organization_id' => $gestorA->id, 'waste_id' => $waste->id]);
    WasteTreatmentApproval::factory()->create(['organization_id' => $gestorB->id, 'waste_id' => $waste->id]);

    $actor = treatmentApprovalActor(['treatment_approvals.read'], $gestorA->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}/treatment-approvals")->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids->all())->toBe([$approvalA->id]);
});

test('indexForWaste: un Gestor SIN ninguna evaluación sobre ese residuo recibe 403', function () {
    $waste = Waste::factory()->create();
    $gestorWithApproval = gestorOrganization();
    WasteTreatmentApproval::factory()->create(['organization_id' => $gestorWithApproval->id, 'waste_id' => $waste->id]);

    $unrelatedGestor = gestorOrganization();
    $actor = treatmentApprovalActor(['treatment_approvals.read'], $unrelatedGestor->id);

    $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}/treatment-approvals")->assertForbidden();
});

// ---- index() general (perspectiva del Gestor) ----

test('index acota el listado a la organización Gestor del actor cuando NO es platform staff', function () {
    $ownGestor = gestorOrganization();
    $otherGestor = gestorOrganization();

    $ownApproval = WasteTreatmentApproval::factory()->create(['organization_id' => $ownGestor->id]);
    $foreignApproval = WasteTreatmentApproval::factory()->create(['organization_id' => $otherGestor->id]);

    $actor = treatmentApprovalActor(['treatment_approvals.read'], $ownGestor->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/treatment-approvals')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($ownApproval->id)->not->toContain($foreignApproval->id);
});

// ---- Transiciones: técnico ----

test('approveTechnical aprueba desde PENDING sin restricciones', function () {
    $gestor = gestorOrganization();
    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $gestor->id]);

    $actor = treatmentApprovalActor(['treatment_approvals.evaluate'], $gestor->id);

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/approve-technical")
        ->assertOk()
        ->assertJsonPath('treatment_approval.technical_status', 'APPROVED');

    expect($approval->fresh()->technical_approved_by)->toBe($actor->id);
    expect(SecurityLog::query()->where('event_type', 'WASTE_TREATMENT_APPROVAL_TECHNICAL_APPROVED')->exists())->toBeTrue();
});

test('approveTechnical con restrictions no vacío resulta en RESTRICTED', function () {
    $gestor = gestorOrganization();
    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $gestor->id]);

    $actor = treatmentApprovalActor(['treatment_approvals.evaluate'], $gestor->id);

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/approve-technical", [
        'restrictions' => 'Solo en horario diurno',
    ])->assertOk()->assertJsonPath('treatment_approval.technical_status', 'RESTRICTED');
});

test('approveTechnical rechaza si el estado técnico NO es PENDING', function () {
    $gestor = gestorOrganization();
    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $gestor->id, 'technical_status' => 'APPROVED']);

    $actor = treatmentApprovalActor(['treatment_approvals.evaluate'], $gestor->id);

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/approve-technical")
        ->assertUnprocessable()->assertJsonValidationErrors('technical_status');
});

test('rejectTechnical exige technical_notes y pasa a REJECTED', function () {
    $gestor = gestorOrganization();
    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $gestor->id]);

    $actor = treatmentApprovalActor(['treatment_approvals.evaluate'], $gestor->id);

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/reject-technical")
        ->assertUnprocessable()->assertJsonValidationErrors('technical_notes');

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/reject-technical", [
        'technical_notes' => 'No cumple con la ficha técnica requerida.',
    ])->assertOk()->assertJsonPath('treatment_approval.technical_status', 'REJECTED');
});

test('el dueño del residuo NO puede evaluar (approve/reject técnico) -- solo el Gestor', function () {
    $generatorOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);
    $gestor = gestorOrganization();
    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $gestor->id, 'waste_id' => $waste->id]);

    $actor = treatmentApprovalActor(['treatment_approvals.evaluate'], $generatorOrganization->id);

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/approve-technical")->assertForbidden();
});

// ---- Transiciones: comercial ----

test('approveCommercial exige unit_price ya fijado (422 legible si no)', function () {
    $gestor = gestorOrganization();
    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $gestor->id, 'unit_price' => null]);

    $actor = treatmentApprovalActor(['treatment_approvals.evaluate'], $gestor->id);

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/approve-commercial")
        ->assertUnprocessable()->assertJsonValidationErrors('unit_price');
});

test('approveCommercial aprueba cuando unit_price ya está fijado', function () {
    $gestor = gestorOrganization();
    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $gestor->id, 'unit_price' => 500]);

    $actor = treatmentApprovalActor(['treatment_approvals.evaluate'], $gestor->id);

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/approve-commercial")
        ->assertOk()->assertJsonPath('treatment_approval.commercial_status', 'APPROVED');

    expect($approval->fresh()->commercial_approved_by)->toBe($actor->id);
});

test('quote pasa de DRAFT a QUOTED; negotiate a NEGOTIATING; cancel a CANCELLED', function () {
    $gestor = gestorOrganization();
    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $gestor->id]);

    $actor = treatmentApprovalActor(['treatment_approvals.evaluate'], $gestor->id);

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/quote")
        ->assertOk()->assertJsonPath('treatment_approval.commercial_status', 'QUOTED');

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/negotiate")
        ->assertOk()->assertJsonPath('treatment_approval.commercial_status', 'NEGOTIATING');

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/cancel")
        ->assertOk()->assertJsonPath('treatment_approval.commercial_status', 'CANCELLED');
});

test('transiciones comerciales rechazan operar sobre un estado final (APPROVED/REJECTED/CANCELLED)', function () {
    $gestor = gestorOrganization();
    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $gestor->id, 'commercial_status' => 'CANCELLED']);

    $actor = treatmentApprovalActor(['treatment_approvals.evaluate'], $gestor->id);

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/negotiate")
        ->assertUnprocessable()->assertJsonValidationErrors('commercial_status');

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/cancel")
        ->assertUnprocessable()->assertJsonValidationErrors('commercial_status');
});

// ---- Waste::hasViableTreatment() / scopeWithViableTreatment() ----

test('Waste::hasViableTreatment() refleja correctamente ambos estados aprobados', function () {
    $waste = Waste::factory()->create();

    expect($waste->hasViableTreatment())->toBeFalse();

    WasteTreatmentApproval::factory()->create([
        'waste_id' => $waste->id,
        'technical_status' => 'APPROVED',
        'commercial_status' => 'DRAFT',
    ]);

    expect($waste->fresh()->hasViableTreatment())->toBeFalse();

    WasteTreatmentApproval::factory()->create([
        'waste_id' => $waste->id,
        'technical_status' => 'APPROVED',
        'commercial_status' => 'APPROVED',
    ]);

    $waste->refresh();
    expect($waste->hasViableTreatment())->toBeTrue();

    $viableIds = Waste::query()->withViableTreatment()->pluck('id');
    expect($viableIds)->toContain($waste->id);
});

test('Waste::hasViableTreatment() es falso si la aprobación viable está INACTIVA', function () {
    $waste = Waste::factory()->create();

    WasteTreatmentApproval::factory()->create([
        'waste_id' => $waste->id,
        'technical_status' => 'APPROVED',
        'commercial_status' => 'APPROVED',
        'is_active' => false,
    ]);

    expect($waste->hasViableTreatment())->toBeFalse();
});

// ---- Preaprobación automática ----

test('preapprovedMatches encuentra un match solo si comparte corriente Y tiene AMBOS ejes aprobados', function () {
    $generatorOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);
    $stream = WasteStream::factory()->create();
    WasteStreamAssignment::factory()->create(['waste_id' => $waste->id, 'waste_stream_id' => $stream->id]);

    $preapprovedType = WasteType::query()->firstOrCreate(['code' => 'PREAPPROVED'], ['name' => 'Preaprobado', 'is_system' => true, 'is_active' => true]);

    $gestor = gestorOrganization();
    $sourceWaste = Waste::factory()->create(['waste_type_id' => $preapprovedType->id]);
    WasteStreamAssignment::factory()->create(['waste_id' => $sourceWaste->id, 'waste_stream_id' => $stream->id]);

    $viableMatch = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $sourceWaste->id,
    ]);

    // Residuo preaprobado SIN corriente compartida -- NO debe aparecer.
    $unrelatedWaste = Waste::factory()->create(['waste_type_id' => $preapprovedType->id]);
    WasteTreatmentApproval::factory()->viable()->create(['waste_id' => $unrelatedWaste->id]);

    // Comparte corriente pero SIN ambos ejes aprobados -- NO debe aparecer.
    $incompleteWaste = Waste::factory()->create(['waste_type_id' => $preapprovedType->id]);
    WasteStreamAssignment::factory()->create(['waste_id' => $incompleteWaste->id, 'waste_stream_id' => $stream->id]);
    WasteTreatmentApproval::factory()->create([
        'waste_id' => $incompleteWaste->id,
        'technical_status' => 'APPROVED',
        'commercial_status' => 'DRAFT',
    ]);

    $actor = treatmentApprovalActor(['wastes.read', 'wastes.update', 'treatment_approvals.create'], $generatorOrganization->id);

    $response = $this->actingAs($actor)->getJson("/api/admin/wastes/{$waste->id}/preapproved-matches")->assertOk();

    $matchIds = collect($response->json('matches'))->pluck('id');
    expect($matchIds->all())->toBe([$viableMatch->id]);
});

test('usePreapprovedMatch crea una fila NUEVA que nace PENDING/DRAFT (no auto-aprobada)', function () {
    $generatorOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);
    $stream = WasteStream::factory()->create();
    WasteStreamAssignment::factory()->create(['waste_id' => $waste->id, 'waste_stream_id' => $stream->id]);

    $preapprovedType = WasteType::query()->firstOrCreate(['code' => 'PREAPPROVED'], ['name' => 'Preaprobado', 'is_system' => true, 'is_active' => true]);
    $gestor = gestorOrganization();
    $sourceWaste = Waste::factory()->create(['waste_type_id' => $preapprovedType->id]);
    WasteStreamAssignment::factory()->create(['waste_id' => $sourceWaste->id, 'waste_stream_id' => $stream->id]);

    $sourceApproval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $sourceWaste->id,
        'unit_price' => 999.99,
        'restrictions' => 'Máximo 500kg/mes',
    ]);

    $actor = treatmentApprovalActor(['wastes.read', 'wastes.update', 'treatment_approvals.create'], $generatorOrganization->id);

    $response = $this->actingAs($actor)
        ->postJson("/api/admin/wastes/{$waste->id}/preapproved-matches/{$sourceApproval->id}/use")
        ->assertCreated();

    $response->assertJsonPath('treatment_approval.technical_status', 'PENDING')
        ->assertJsonPath('treatment_approval.commercial_status', 'DRAFT')
        ->assertJsonPath('treatment_approval.organization_id', $gestor->id)
        ->assertJsonPath('treatment_approval.waste_id', $waste->id)
        ->assertJsonPath('treatment_approval.restrictions', 'Máximo 500kg/mes');

    expect((float) $response->json('treatment_approval.unit_price'))->toBe(999.99);
    expect($waste->fresh()->is_preapproved)->toBeTrue();
    expect($waste->fresh()->preapproved_by_organization_id)->toBe($gestor->id);

    // La fila FUENTE (ya aprobada) NO se modifica.
    expect($sourceApproval->fresh()->technical_status)->toBe('APPROVED');
});

test('usePreapprovedMatch rechaza un approvalId que NO es un match preaprobado real para este residuo', function () {
    $generatorOrganization = Organization::factory()->create();
    $waste = Waste::factory()->create(['organization_id' => $generatorOrganization->id]);

    // Aprobación viable, pero de un residuo SIN corriente compartida.
    $unrelatedWaste = Waste::factory()->create();
    $unrelatedApproval = WasteTreatmentApproval::factory()->viable()->create(['waste_id' => $unrelatedWaste->id]);

    $actor = treatmentApprovalActor(['wastes.read', 'wastes.update', 'treatment_approvals.create'], $generatorOrganization->id);

    $this->actingAs($actor)
        ->postJson("/api/admin/wastes/{$waste->id}/preapproved-matches/{$unrelatedApproval->id}/use")
        ->assertUnprocessable();
});

// ---- Exploración: GET /admin/branch-treatments/available ----

test('available() lista tratamientos ACTIVOS de organizaciones GESTOR SIN exponer campos sensibles', function () {
    $gestor = gestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $gestor->id]);
    $branchTreatment = BranchTreatment::factory()->create([
        'organization_id' => $gestor->id,
        'branch_id' => $branch->id,
        'environmental_license_number' => 'SECRETO-123',
        'observations' => 'Notas internas sensibles del Gestor',
    ]);

    $inactiveBranchTreatment = BranchTreatment::factory()->create(['organization_id' => $gestor->id, 'is_active' => false]);

    $actor = treatmentApprovalActor();

    $response = $this->actingAs($actor)->getJson('/api/admin/branch-treatments/available')->assertOk();

    $items = collect($response->json('branch_treatments'));
    $item = $items->firstWhere('id', $branchTreatment->id);

    expect($item)->not->toBeNull();
    expect(array_keys($item))->toEqualCanonicalizing(['id', 'treatment_name', 'organization_name', 'branch_name', 'max_capacity', 'capacity_unit']);
    expect($items->pluck('id'))->not->toContain($inactiveBranchTreatment->id);
});

test('available() excluye tratamientos de organizaciones que NO son GESTOR', function () {
    $nonGestorOrganization = Organization::factory()->create();
    $branchTreatment = BranchTreatment::factory()->create(['organization_id' => $nonGestorOrganization->id]);

    $actor = treatmentApprovalActor();

    $response = $this->actingAs($actor)->getJson('/api/admin/branch-treatments/available')->assertOk();

    expect(collect($response->json('branch_treatments'))->pluck('id'))->not->toContain($branchTreatment->id);
});

test('available() filtra por waste_stream_ids[]', function () {
    $gestor = gestorOrganization();
    $matchingStream = WasteStream::factory()->create();
    $otherStream = WasteStream::factory()->create();

    $matchingBranchTreatment = BranchTreatment::factory()->create(['organization_id' => $gestor->id]);
    $matchingBranchTreatment->allowedWasteStreams()->sync([$matchingStream->id]);

    $nonMatchingBranchTreatment = BranchTreatment::factory()->create(['organization_id' => $gestor->id]);
    $nonMatchingBranchTreatment->allowedWasteStreams()->sync([$otherStream->id]);

    $actor = treatmentApprovalActor();

    $response = $this->actingAs($actor)
        ->getJson("/api/admin/branch-treatments/available?waste_stream_ids[]={$matchingStream->id}")
        ->assertOk();

    $ids = collect($response->json('branch_treatments'))->pluck('id');
    expect($ids)->toContain($matchingBranchTreatment->id)->not->toContain($nonMatchingBranchTreatment->id);
});

// ---- Motor de Workflow: personalización por organización (item 17/D-WF-01/D-WF-02) ----

/**
 * Clona el workflow BASE "RESPEL" (las 17 transiciones ya sembradas por
 * WorkflowSeeder, todas autorizadas para ADMINISTRADOR) hacia un workflow
 * PROPIO de `$organization`, y le agrega 2 transiciones EXTRA que el base no
 * tiene: `TECH_PENDING -> TECH_UNDER_REVIEW` y `TECH_UNDER_REVIEW ->
 * TECH_APPROVED` (usa el código `TECH_UNDER_REVIEW` ya sembrado por
 * RespelStatusSeeder pero sin ninguna transición viva hasta ahora). Enlaza
 * el workflow nuevo a `$organization` vía `workflow_service_bindings`
 * (`scope_type=organization`).
 *
 * Deliberado: se CLONAN las 17 transiciones del base (no se quita la
 * directa TECH_PENDING->TECH_APPROVED) -- el enunciado de la tarea pide una
 * transición "EXTRA", no un reemplazo, así que un WasteTreatmentApproval de
 * esta organización sigue aprobándose técnicamente IGUAL que antes vía
 * approveTechnical() (no regresiona); la personalización real que se prueba
 * es que el camino adicional YA EXISTE y es resoluble en el motor -- no hay
 * todavía un endpoint que lo RECORRA (eso depende del futuro
 * WorkflowController de administración, explícitamente fuera de alcance de
 * esta tarea).
 */
function cloneRespelWorkflowWithUnderReviewStep(Organization $organization): Workflow
{
    $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
    $baseVersion = Workflow::query()->where('code', 'RESPEL')->whereNull('tenant_organization_id')->firstOrFail()->currentVersion;

    $customWorkflow = Workflow::factory()->create([
        'tenant_organization_id' => $organization->id,
        'entity_type' => 'TREATMENT',
        'is_system' => false,
        'is_active' => true,
    ]);

    $customVersion = WorkflowVersion::factory()->published()->create(['workflow_id' => $customWorkflow->id]);
    $customWorkflow->forceFill(['current_version_id' => $customVersion->id])->save();

    $extraTransitions = [['TECH_PENDING', 'TECH_UNDER_REVIEW'], ['TECH_UNDER_REVIEW', 'TECH_APPROVED']];

    foreach ([...$baseVersion->transitions, ...collect($extraTransitions)->map(fn ($pair) => (object) ['from_status_code' => $pair[0], 'to_status_code' => $pair[1], 'is_automatic' => false, 'requires_approval' => false])] as $sourceTransition) {
        $transition = WorkflowTransition::query()->create([
            'workflow_version_id' => $customVersion->id,
            'from_status_code' => $sourceTransition->from_status_code,
            'to_status_code' => $sourceTransition->to_status_code,
            'is_automatic' => $sourceTransition->is_automatic,
            'requires_approval' => $sourceTransition->requires_approval,
        ]);

        WorkflowTransitionRole::query()->create(['workflow_transition_id' => $transition->id, 'role_id' => $administrador->id]);
    }

    WorkflowServiceBinding::query()->create([
        'workflow_id' => $customWorkflow->id,
        'scope_type' => 'organization',
        'scope_id' => $organization->id,
    ]);

    return $customWorkflow;
}

test('un Gestor con workflow personalizado tiene la transición extra TECH_PENDING->TECH_UNDER_REVIEW->TECH_APPROVED disponible, y otro Gestor SIN personalizar sigue usando el workflow base sin ese paso', function () {
    $customGestor = gestorOrganization();
    $customWorkflow = cloneRespelWorkflowWithUnderReviewStep($customGestor);

    // Organización GESTOR SIN ningún workflow_service_binding propio --
    // representa el caso "EcoTrata" del enunciado: sigue resolviendo al
    // workflow BASE, tal como antes de esta tarea.
    $unpersonalizedGestor = gestorOrganization();

    // (a) Resolución: la organización personalizada resuelve a SU workflow,
    // la organización sin personalizar cae al BASE (mismo Workflow::resolveFor()
    // ya probado en WorkflowResolverTest, aquí contra los códigos RESPEL reales).
    $resolvedForCustom = Workflow::resolveFor('TREATMENT', $customGestor->id);
    $resolvedForUnpersonalized = Workflow::resolveFor('TREATMENT', $unpersonalizedGestor->id);
    $baseWorkflow = Workflow::query()->where('code', 'RESPEL')->whereNull('tenant_organization_id')->firstOrFail();

    expect($resolvedForCustom->id)->toBe($customWorkflow->id)
        ->and($resolvedForCustom->id)->not->toBe($baseWorkflow->id)
        ->and($resolvedForUnpersonalized->id)->toBe($baseWorkflow->id);

    // (b) La transición extra SÍ existe (y es resoluble) en el workflow del
    // Gestor personalizado...
    $customVersion = $resolvedForCustom->currentVersion;
    expect($customVersion->transitions()->where('from_status_code', 'TECH_PENDING')->where('to_status_code', 'TECH_UNDER_REVIEW')->exists())->toBeTrue()
        ->and($customVersion->transitions()->where('from_status_code', 'TECH_UNDER_REVIEW')->where('to_status_code', 'TECH_APPROVED')->exists())->toBeTrue();

    // ...pero NO existe en el workflow BASE que sigue usando el Gestor sin
    // personalizar -- "tal como antes" (RN del enunciado de la tarea).
    $baseVersion = $baseWorkflow->currentVersion;
    expect($baseVersion->transitions()->where('from_status_code', 'TECH_PENDING')->where('to_status_code', 'TECH_UNDER_REVIEW')->exists())->toBeFalse()
        ->and($baseVersion->transitions()->where('from_status_code', 'TECH_UNDER_REVIEW')->where('to_status_code', 'TECH_APPROVED')->exists())->toBeFalse();

    // (c) De punta a punta contra el controller REAL: approveTechnical()
    // sigue funcionando IGUAL para AMBOS Gestores (la transición directa
    // TECH_PENDING->TECH_APPROVED se preservó en el clon) -- la
    // personalización agrega un camino nuevo, no rompe el existente.
    $customApproval = WasteTreatmentApproval::factory()->create(['organization_id' => $customGestor->id]);
    $unpersonalizedApproval = WasteTreatmentApproval::factory()->create(['organization_id' => $unpersonalizedGestor->id]);

    $actorForCustom = treatmentApprovalActor(['treatment_approvals.evaluate'], $customGestor->id);
    $actorForUnpersonalized = treatmentApprovalActor(['treatment_approvals.evaluate'], $unpersonalizedGestor->id);

    $this->actingAs($actorForCustom)->postJson("/api/admin/treatment-approvals/{$customApproval->id}/approve-technical")
        ->assertOk()->assertJsonPath('treatment_approval.technical_status', 'APPROVED');

    $this->actingAs($actorForUnpersonalized)->postJson("/api/admin/treatment-approvals/{$unpersonalizedApproval->id}/approve-technical")
        ->assertOk()->assertJsonPath('treatment_approval.technical_status', 'APPROVED');
});

test('approveTechnical escribe un workflow_log con los códigos PREFIJADOS de la transición aplicada', function () {
    $gestor = gestorOrganization();
    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $gestor->id]);
    $actor = treatmentApprovalActor(['treatment_approvals.evaluate'], $gestor->id);

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/approve-technical")->assertOk();

    $log = WorkflowLog::query()->where('process_type', 'TREATMENT')->where('process_id', $approval->id)->first();

    expect($log)->not->toBeNull()
        ->and($log->previous_status)->toBe('TECH_PENDING')
        ->and($log->new_status)->toBe('TECH_APPROVED')
        ->and($log->event_code)->toBe('WASTE_TREATMENT_APPROVAL_TECHNICAL_APPROVED')
        ->and($log->user_id)->toBe($actor->id);
});

test('approveTechnical rechaza con 422 (workflow) cuando la transición NO existe en el workflow resuelto para esa organización', function () {
    // Workflow personalizado SIN ninguna transición sembrada (organización
    // "quitó" toda transición técnica) -- demuestra que el motor, no un
    // hardcode, es quien decide si la transición es válida.
    $emptyGestor = gestorOrganization();

    $emptyWorkflow = Workflow::factory()->create([
        'tenant_organization_id' => $emptyGestor->id,
        'entity_type' => 'TREATMENT',
        'is_system' => false,
        'is_active' => true,
    ]);
    $emptyVersion = WorkflowVersion::factory()->published()->create(['workflow_id' => $emptyWorkflow->id]);
    $emptyWorkflow->forceFill(['current_version_id' => $emptyVersion->id])->save();

    WorkflowServiceBinding::query()->create([
        'workflow_id' => $emptyWorkflow->id,
        'scope_type' => 'organization',
        'scope_id' => $emptyGestor->id,
    ]);

    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $emptyGestor->id]);
    $actor = treatmentApprovalActor(['treatment_approvals.evaluate'], $emptyGestor->id);

    $this->actingAs($actor)->postJson("/api/admin/treatment-approvals/{$approval->id}/approve-technical")
        ->assertUnprocessable()->assertJsonValidationErrors('workflow');

    expect($approval->fresh()->technical_status)->toBe('PENDING');
});

// ---- Fix de seguridad (requisito 5, revisión especialista-seguridad sobre WorkflowController): ----
// workflow_logs.tenant_organization_id debe ser el de la ORGANIZACIÓN DUEÑA
// de la evaluación (treatmentApproval->organization_id, el Gestor), NUNCA el
// tenant del actor -- de lo contrario, cuando actúa platform staff (tenant
// distinto del Gestor) sobre la evaluación de un Gestor, el log queda
// atribuido al tenant PLATAFORMA en vez de al Gestor real dueño del proceso,
// rompiendo la trazabilidad multi-tenant del log.
test('approveTechnical registra workflow_logs.tenant_organization_id de la organización DUEÑA de la evaluación, no del tenant del actor', function () {
    $gestor = gestorOrganization();
    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $gestor->id]);

    $platformActor = treatmentApprovalPlatformStaffActor(['treatment_approvals.evaluate']);

    $this->actingAs($platformActor)->postJson("/api/admin/treatment-approvals/{$approval->id}/approve-technical")->assertOk();

    $log = WorkflowLog::query()->where('process_type', 'TREATMENT')->where('process_id', $approval->id)->firstOrFail();

    expect($log->tenant_organization_id)->toBe($gestor->id)
        ->and($log->tenant_organization_id)->not->toBe($platformActor->tenant_organization_id);
});
