<?php

use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;
use App\Models\WasteTreatmentApproval;
use App\Models\Workflow;
use App\Models\WorkflowServiceBinding;
use App\Models\WorkflowVersion;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\WorkflowSeeder;
use Illuminate\Validation\ValidationException;

// CU-021 "Configurar Workflow" -- administración del motor de Workflow
// genérico (item 17/D-WF-01), ya consumido en producción por
// WasteTreatmentApprovalController. El workflow BASE "RESPEL" ya viene
// sembrado por WorkflowSeeder (17 transiciones, entity_type=TREATMENT); este
// controller permite que platform staff lo administre y que un admin de
// organización Gestor lo clone hacia SU PROPIO workflow.

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(RespelStatusSeeder::class);
    $this->seed(WorkflowSeeder::class);
});

function workflowControllerActor(array $codes = ['workflows.manage'], ?int $tenantOrganizationId = null): User
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

function workflowControllerPlatformStaffActor(array $codes = ['workflows.manage']): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return workflowControllerActor($codes, $platform->id);
}

/**
 * Organización con business_role GESTOR activo (can_treat_waste=true) --
 * requisito de `WorkflowPolicy::clone()`.
 */
function workflowGestorOrganization(): Organization
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

/**
 * Otorga a `$actor` el rol ADMINISTRADOR real -- necesario para que
 * `WasteTreatmentApprovalController::assertActorAuthorizedForTransition()`
 * lo autorice (las transiciones clonadas del BASE están todas atadas a ese
 * rol, ver WorkflowSeeder).
 */
function grantAdministradorRole(User $actor): void
{
    $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
    UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $administrador->id, 'is_active' => true]);
}

function baseRespelWorkflow(): Workflow
{
    return Workflow::query()->where('code', 'RESPEL')->whereNull('tenant_organization_id')->firstOrFail();
}

// ---- index()/show(): visibilidad BASE vs. propio vs. ajeno ----

test('index: platform staff ve TODOS los workflows (base + de cualquier organización)', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);
    $baseWorkflowId = baseRespelWorkflow()->id;
    $this->actingAs($actor)->postJson("/api/admin/workflows/{$baseWorkflowId}/clone")->assertCreated();

    $platformStaff = workflowControllerPlatformStaffActor();
    $response = $this->actingAs($platformStaff)->getJson('/api/admin/workflows')->assertOk();

    $tenantIds = collect($response->json('data'))->pluck('tenant_organization_id');
    expect($tenantIds)->toContain(null)->toContain($gestor->id);
});

test('index: un admin de organización Gestor ve el BASE + el suyo propio, NUNCA el de otra organización', function () {
    $ownGestor = workflowGestorOrganization();
    $ownActor = workflowControllerActor(tenantOrganizationId: $ownGestor->id);
    $this->actingAs($ownActor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated();

    $otherGestor = workflowGestorOrganization();
    $otherActor = workflowControllerActor(tenantOrganizationId: $otherGestor->id);
    $this->actingAs($otherActor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated();

    $response = $this->actingAs($ownActor)->getJson('/api/admin/workflows')->assertOk();

    $workflows = collect($response->json('data'));
    expect($workflows->pluck('tenant_organization_id'))->toContain(null)->toContain($ownGestor->id)
        ->not->toContain($otherGestor->id);
});

test('show: un Gestor puede ver el BASE (solo lectura) pero NO el workflow personalizado de OTRA organización (IDOR)', function () {
    $otherGestor = workflowGestorOrganization();
    $otherActor = workflowControllerActor(tenantOrganizationId: $otherGestor->id);
    $otherWorkflowId = $this->actingAs($otherActor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');

    $actor = workflowControllerActor(tenantOrganizationId: workflowGestorOrganization()->id);

    $this->actingAs($actor)->getJson('/api/admin/workflows/'.baseRespelWorkflow()->id)->assertOk();
    $this->actingAs($actor)->getJson("/api/admin/workflows/{$otherWorkflowId}")->assertForbidden();
});

test('index/show exigen el permiso workflows.manage', function () {
    $actor = workflowControllerActor(codes: [], tenantOrganizationId: workflowGestorOrganization()->id);

    $this->actingAs($actor)->getJson('/api/admin/workflows')->assertForbidden();
    $this->actingAs($actor)->getJson('/api/admin/workflows/'.baseRespelWorkflow()->id)->assertForbidden();
});

// ---- clone(): CU-021_13 ----

test('clone: un admin de organización Gestor SIN workflow propio clona el BASE exitosamente', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated();

    $response->assertJsonPath('workflow.tenant_organization_id', $gestor->id)
        ->assertJsonPath('workflow.entity_type', 'TREATMENT')
        ->assertJsonPath('workflow.is_system', false);

    $customWorkflow = Workflow::query()->findOrFail($response->json('workflow.id'));
    expect($customWorkflow->current_version_id)->toBeNull(); // requisito 4: nace SIN version publicada

    $draftVersion = $customWorkflow->versions()->where('status', 'DRAFT')->firstOrFail();
    expect($draftVersion->transitions()->count())->toBe(17);

    $binding = WorkflowServiceBinding::query()->where('scope_type', 'organization')->where('scope_id', $gestor->id)->firstOrFail();
    expect($binding->workflow_id)->toBe($customWorkflow->id)
        ->and($binding->entity_type)->toBe('TREATMENT');

    expect(SecurityLog::query()->where('event_type', 'WORKFLOW_CLONED')->exists())->toBeTrue();
});

test('clone: rechaza con 422 si la organización YA tiene un workflow propio de ese entity_type', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated();
    $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')
        ->assertUnprocessable()->assertJsonValidationErrors('workflow');

    expect(Workflow::query()->where('tenant_organization_id', $gestor->id)->count())->toBe(1);
});

test('clone: rechaza a platform staff (clonar es una acción del Gestor, no de EcoLink)', function () {
    $platformStaff = workflowControllerPlatformStaffActor();

    $this->actingAs($platformStaff)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertForbidden();
});

test('clone: rechaza a una organización SIN capacidad can_treat_waste', function () {
    $nonGestor = Organization::factory()->create();
    $actor = workflowControllerActor(tenantOrganizationId: $nonGestor->id);

    $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertForbidden();
});

test('clone: rechaza sin el permiso workflows.manage', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(codes: [], tenantOrganizationId: $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertForbidden();
});

test('clone: rechaza clonar un workflow que NO es el BASE (tenant_organization_id no nulo)', function () {
    $gestorA = workflowGestorOrganization();
    $actorA = workflowControllerActor(tenantOrganizationId: $gestorA->id);
    $customWorkflowId = $this->actingAs($actorA)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');

    $gestorB = workflowGestorOrganization();
    $actorB = workflowControllerActor(tenantOrganizationId: $gestorB->id);

    $this->actingAs($actorB)->postJson("/api/admin/workflows/{$customWorkflowId}/clone")->assertForbidden();
});

// ---- Requisito de seguridad 1: integridad del binding (workflow_id debe pertenecer al scope) ----

test('requisito 1: WorkflowServiceBinding::assertBindingIntegrity() rechaza un workflow_id que NO pertenece a la organización del scope', function () {
    $organizationA = Organization::factory()->create();
    $organizationB = Organization::factory()->create();

    $workflowOfA = Workflow::factory()->create(['tenant_organization_id' => $organizationA->id]);

    expect(fn () => WorkflowServiceBinding::assertBindingIntegrity($workflowOfA, 'organization', $organizationB->id))
        ->toThrow(ValidationException::class);

    // No lanza cuando SÍ coincide.
    WorkflowServiceBinding::assertBindingIntegrity($workflowOfA, 'organization', $organizationA->id);
    expect(true)->toBeTrue();
});

test('requisito 1: assertBindingIntegrity no aplica a scope_type distinto de organization', function () {
    $organizationA = Organization::factory()->create();
    $organizationB = Organization::factory()->create();
    $workflowOfA = Workflow::factory()->create(['tenant_organization_id' => $organizationA->id]);

    // scope_type='branch' (u otro) no se valida contra tenant_organization_id
    // -- no debe lanzar aunque el scope_id no "coincida" con nada de A.
    WorkflowServiceBinding::assertBindingIntegrity($workflowOfA, 'branch', $organizationB->id);

    expect(true)->toBeTrue();
});

// ---- Requisito de seguridad 3: unicidad de binding activo (UNIQUE de BD) ----

test('requisito 3: la BD rechaza dos workflow_service_bindings activos apuntando a workflows DISTINTOS para el mismo scope+entity_type', function () {
    $organization = Organization::factory()->create();
    $workflowOne = Workflow::factory()->create(['tenant_organization_id' => $organization->id, 'entity_type' => 'TREATMENT']);
    $workflowTwo = Workflow::factory()->create(['tenant_organization_id' => $organization->id, 'entity_type' => 'TREATMENT']);

    WorkflowServiceBinding::query()->create([
        'workflow_id' => $workflowOne->id,
        'scope_type' => 'organization',
        'scope_id' => $organization->id,
    ]);

    // Envuelto en su propia transacción (SAVEPOINT) -- si no, el violation
    // de UNIQUE deja la transacción envolvente de RefreshDatabase abortada
    // para el resto del test (comportamiento estándar de Postgres).
    expect(fn () => \Illuminate\Support\Facades\DB::transaction(fn () => WorkflowServiceBinding::query()->create([
        'workflow_id' => $workflowTwo->id,
        'scope_type' => 'organization',
        'scope_id' => $organization->id,
    ])))->toThrow(\Illuminate\Database\QueryException::class);

    expect(WorkflowServiceBinding::query()->where('scope_type', 'organization')->where('scope_id', $organization->id)->count())->toBe(1);
});

test('requisito 3: clone() rechaza si ya existe un binding activo del mismo entity_type para esa organización (defensa en profundidad, sin pasar por otro Workflow custom)', function () {
    $gestor = workflowGestorOrganization();

    // Binding "huérfano" preexistente para simular el caso defensivo (sin
    // pasar por un segundo Workflow custom, que ya está bloqueado por la
    // validación de "ya tiene un workflow propio").
    $orphanWorkflow = Workflow::factory()->create(['entity_type' => 'TREATMENT']);
    WorkflowServiceBinding::query()->create([
        'workflow_id' => $orphanWorkflow->id,
        'scope_type' => 'organization',
        'scope_id' => $gestor->id,
    ]);

    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')
        ->assertUnprocessable();
});

// ---- Requisito de seguridad 4: current_version_id SOLO apunta a PUBLISHED ----

test('requisito 4: current_version_id no es mass-assignable (Fillable), solo vía forceFill()', function () {
    $version = WorkflowVersion::factory()->create();

    $workflow = Workflow::query()->create([
        'tenant_organization_id' => null,
        'code' => 'WF_TEST_'.uniqid(),
        'name' => 'Test',
        'entity_type' => 'TREATMENT',
        'is_system' => false,
        'is_active' => true,
        'current_version_id' => $version->id,
    ]);

    expect($workflow->fresh()->current_version_id)->toBeNull();
});

test('requisito 4: publishVersion() es atómico -- fija version.status=PUBLISHED Y workflow.current_version_id en el mismo paso', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);

    $customWorkflowId = $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');
    $customWorkflow = Workflow::query()->findOrFail($customWorkflowId);
    $draftVersion = $customWorkflow->versions()->where('status', 'DRAFT')->firstOrFail();

    expect($customWorkflow->current_version_id)->toBeNull();

    $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/versions/{$draftVersion->id}/publish")
        ->assertOk()
        ->assertJsonPath('workflow.current_version_id', $draftVersion->id);

    $draftVersion->refresh();
    expect($draftVersion->status)->toBe('PUBLISHED')
        ->and($draftVersion->published_at)->not->toBeNull()
        ->and($draftVersion->published_by)->toBe($actor->id)
        ->and($customWorkflow->fresh()->current_version_id)->toBe($draftVersion->id);

    expect(SecurityLog::query()->where('event_type', 'WORKFLOW_VERSION_PUBLISHED')->exists())->toBeTrue();
});

test('requisito 4: publishVersion() rechaza publicar una versión que NO está en DRAFT', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);

    $customWorkflowId = $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');
    $customWorkflow = Workflow::query()->findOrFail($customWorkflowId);
    $draftVersion = $customWorkflow->versions()->where('status', 'DRAFT')->firstOrFail();

    $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/versions/{$draftVersion->id}/publish")->assertOk();

    $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/versions/{$draftVersion->id}/publish")
        ->assertUnprocessable()->assertJsonValidationErrors('workflow_version');
});

// ---- Requisito de seguridad 2: permiso dedicado + auditoría (crear/editar/versionar/publicar) ----

test('requisito 2: cada cambio de definición (versionar, crear/editar/eliminar transición) queda auditado en security_logs, NUNCA en workflow_logs', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);

    $customWorkflowId = $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');

    $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();

    $transitionResponse = $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/transitions", [
        'from_status_code' => 'TECH_PENDING',
        'to_status_code' => 'TECH_UNDER_REVIEW',
        'roles' => [['role_id' => $administrador->id]],
    ])->assertCreated();

    $transitionId = $transitionResponse->json('workflow_transition.id');

    $this->actingAs($actor)->putJson("/api/admin/workflows/{$customWorkflowId}/transitions/{$transitionId}", [
        'requires_approval' => true,
    ])->assertOk();

    $this->actingAs($actor)->deleteJson("/api/admin/workflows/{$customWorkflowId}/transitions/{$transitionId}")->assertNoContent();

    expect(SecurityLog::query()->where('event_type', 'WORKFLOW_CLONED')->exists())->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'WORKFLOW_TRANSITION_CREATED')->exists())->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'WORKFLOW_TRANSITION_UPDATED')->exists())->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'WORKFLOW_TRANSITION_DELETED')->exists())->toBeTrue();

    // NUNCA workflow_logs -- esa tabla es para EJECUCIÓN de transiciones
    // sobre una entidad real, no para cambios de configuración.
    expect(\App\Models\WorkflowLog::query()->count())->toBe(0);
});

test('requisito 2: editar/versionar/publicar exige el permiso workflows.manage (no basta ser dueño de la organización)', function () {
    $gestor = workflowGestorOrganization();
    $actorWithoutPermission = workflowControllerActor(codes: [], tenantOrganizationId: $gestor->id);
    $actorWithPermission = workflowControllerActor(tenantOrganizationId: $gestor->id);

    $customWorkflowId = $this->actingAs($actorWithPermission)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');

    $this->actingAs($actorWithoutPermission)->postJson("/api/admin/workflows/{$customWorkflowId}/transitions", [
        'from_status_code' => 'TECH_PENDING',
        'to_status_code' => 'TECH_UNDER_REVIEW',
    ])->assertForbidden();
});

// ---- Edición de transiciones: SOLO sobre versión DRAFT, nunca PUBLISHED ----

test('editar/eliminar una transición de una versión PUBLICADA rechaza con 422 (inmutabilidad)', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);

    $customWorkflowId = $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');
    $customWorkflow = Workflow::query()->findOrFail($customWorkflowId);
    $draftVersion = $customWorkflow->versions()->where('status', 'DRAFT')->firstOrFail();
    $existingTransition = $draftVersion->transitions()->first();

    $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/versions/{$draftVersion->id}/publish")->assertOk();

    $this->actingAs($actor)->putJson("/api/admin/workflows/{$customWorkflowId}/transitions/{$existingTransition->id}", ['requires_approval' => true])
        ->assertUnprocessable()->assertJsonValidationErrors('workflow_transition');

    $this->actingAs($actor)->deleteJson("/api/admin/workflows/{$customWorkflowId}/transitions/{$existingTransition->id}")
        ->assertUnprocessable()->assertJsonValidationErrors('workflow_transition');
});

test('storeVersion (CU-021_12) rechaza crear una nueva versión si YA existe una DRAFT sin publicar', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);

    $customWorkflowId = $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');

    $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/versions")
        ->assertUnprocessable()->assertJsonValidationErrors('workflow');
});

test('storeTransition rechaza roles con AMBOS o NINGUNO de role_id/business_role_id', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);
    $customWorkflowId = $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');

    $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
    $businessRole = BusinessRole::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/transitions", [
        'from_status_code' => 'TECH_PENDING',
        'to_status_code' => 'TECH_UNDER_REVIEW',
        'roles' => [['role_id' => $administrador->id, 'business_role_id' => $businessRole->id]],
    ])->assertUnprocessable();

    $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/transitions", [
        'from_status_code' => 'TECH_PENDING',
        'to_status_code' => 'TECH_UNDER_REVIEW',
        'roles' => [['role_id' => null, 'business_role_id' => null]],
    ])->assertUnprocessable();
});

// ---- Autorización: un Gestor nunca edita el BASE ni el workflow de otra organización ----

test('un Gestor NO puede editar/versionar/publicar el workflow BASE', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);
    $base = baseRespelWorkflow();

    $this->actingAs($actor)->postJson("/api/admin/workflows/{$base->id}/versions")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/workflows/{$base->id}/transitions", [
        'from_status_code' => 'TECH_PENDING', 'to_status_code' => 'TECH_UNDER_REVIEW',
    ])->assertForbidden();
});

test('un Gestor NO puede editar el workflow personalizado de OTRA organización (IDOR)', function () {
    $otherGestor = workflowGestorOrganization();
    $otherActor = workflowControllerActor(tenantOrganizationId: $otherGestor->id);
    $otherWorkflowId = $this->actingAs($otherActor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');

    $foreignActor = workflowControllerActor(tenantOrganizationId: workflowGestorOrganization()->id);

    $this->actingAs($foreignActor)->postJson("/api/admin/workflows/{$otherWorkflowId}/versions")->assertForbidden();
});

test('platform staff SÍ puede versionar/editar/publicar el workflow BASE', function () {
    $platformStaff = workflowControllerPlatformStaffActor();
    $base = baseRespelWorkflow();

    $this->actingAs($platformStaff)->postJson("/api/admin/workflows/{$base->id}/versions")->assertCreated();

    $draftVersion = $base->versions()->where('status', 'DRAFT')->firstOrFail();
    $this->actingAs($platformStaff)->postJson("/api/admin/workflows/{$base->id}/versions/{$draftVersion->id}/publish")->assertOk();
});

// ---- E2E: Gestor clona, agrega paso intermedio, publica -- afecta SOLO a su organización ----

test('E2E: un Gestor clona el BASE, agrega TECH_PENDING->TECH_UNDER_REVIEW->TECH_APPROVED, quita el paso directo, publica, y SOLO su organización queda obligada al paso extra', function () {
    $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();

    $customGestor = workflowGestorOrganization();
    $customActor = workflowControllerActor(tenantOrganizationId: $customGestor->id);

    $customWorkflowId = $this->actingAs($customActor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');
    $customWorkflow = Workflow::query()->findOrFail($customWorkflowId);
    $draftVersion = $customWorkflow->versions()->where('status', 'DRAFT')->firstOrFail();

    // Agrega el paso intermedio nuevo (dos transiciones).
    $this->actingAs($customActor)->postJson("/api/admin/workflows/{$customWorkflowId}/transitions", [
        'from_status_code' => 'TECH_PENDING', 'to_status_code' => 'TECH_UNDER_REVIEW',
        'roles' => [['role_id' => $administrador->id]],
    ])->assertCreated();

    $this->actingAs($customActor)->postJson("/api/admin/workflows/{$customWorkflowId}/transitions", [
        'from_status_code' => 'TECH_UNDER_REVIEW', 'to_status_code' => 'TECH_APPROVED',
        'roles' => [['role_id' => $administrador->id]],
    ])->assertCreated();

    // Quita el paso directo (ahora la aprobación técnica EXIGE pasar por
    // TECH_UNDER_REVIEW).
    $directTransition = $draftVersion->transitions()->where('from_status_code', 'TECH_PENDING')->where('to_status_code', 'TECH_APPROVED')->firstOrFail();
    $this->actingAs($customActor)->deleteJson("/api/admin/workflows/{$customWorkflowId}/transitions/{$directTransition->id}")->assertNoContent();

    // Publica.
    $this->actingAs($customActor)->postJson("/api/admin/workflows/{$customWorkflowId}/versions/{$draftVersion->id}/publish")->assertOk();

    // Su organización: approve-technical DIRECTO ahora falla (el paso
    // directo ya no existe en su workflow publicado).
    $customApproval = WasteTreatmentApproval::factory()->create(['organization_id' => $customGestor->id]);
    $evaluatorForCustom = workflowControllerActor(['treatment_approvals.evaluate'], $customGestor->id);
    grantAdministradorRole($evaluatorForCustom);

    $this->actingAs($evaluatorForCustom)->postJson("/api/admin/treatment-approvals/{$customApproval->id}/approve-technical")
        ->assertUnprocessable()->assertJsonValidationErrors('workflow');

    expect($customApproval->fresh()->technical_status)->toBe('PENDING');

    // Pero el camino de dos pasos SÍ existe y es resoluble en su workflow.
    expect($draftVersion->transitions()->where('from_status_code', 'TECH_PENDING')->where('to_status_code', 'TECH_UNDER_REVIEW')->exists())->toBeTrue()
        ->and($draftVersion->transitions()->where('from_status_code', 'TECH_UNDER_REVIEW')->where('to_status_code', 'TECH_APPROVED')->exists())->toBeTrue();

    // Otra organización SIN personalizar sigue con el comportamiento BASE
    // (approve-technical directo sigue funcionando igual que siempre).
    $unpersonalizedGestor = workflowGestorOrganization();
    $unpersonalizedApproval = WasteTreatmentApproval::factory()->create(['organization_id' => $unpersonalizedGestor->id]);
    $evaluatorForUnpersonalized = workflowControllerActor(['treatment_approvals.evaluate'], $unpersonalizedGestor->id);
    grantAdministradorRole($evaluatorForUnpersonalized);

    $this->actingAs($evaluatorForUnpersonalized)->postJson("/api/admin/treatment-approvals/{$unpersonalizedApproval->id}/approve-technical")
        ->assertOk()->assertJsonPath('treatment_approval.technical_status', 'APPROVED');
});

// ---- Revisión especialista-seguridad, hallazgo 1: platform staff SÍ administra el workflow personalizado de CUALQUIER organización Gestor (decisión confirmada por el usuario, mismo patrón "acceso total de plataforma" de Waste/Vehicle/Branch) ----

test('decisión confirmada: platform staff puede crear/editar/versionar/publicar/borrar transiciones del workflow personalizado de una organización Gestor de prueba, sin ser su dueño', function () {
    $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();

    $gestor = workflowGestorOrganization();
    $gestorActor = workflowControllerActor(tenantOrganizationId: $gestor->id);
    $customWorkflowId = $this->actingAs($gestorActor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');

    $platformStaff = workflowControllerPlatformStaffActor();
    expect($platformStaff->tenant_organization_id)->not->toBe($gestor->id); // confirma que NO es dueño de la organización

    $v1 = Workflow::query()->findOrFail($customWorkflowId)->versions()->where('status', 'DRAFT')->firstOrFail();

    // Crear transición.
    $created = $this->actingAs($platformStaff)->postJson("/api/admin/workflows/{$customWorkflowId}/transitions", [
        'from_status_code' => 'TECH_PENDING',
        'to_status_code' => 'TECH_UNDER_REVIEW',
        'roles' => [['role_id' => $administrador->id]],
    ])->assertCreated();
    $transitionId = $created->json('workflow_transition.id');

    // Editar esa transición.
    $this->actingAs($platformStaff)->putJson("/api/admin/workflows/{$customWorkflowId}/transitions/{$transitionId}", [
        'requires_approval' => true,
    ])->assertOk();

    // Borrar esa transición (todavía DRAFT).
    $this->actingAs($platformStaff)->deleteJson("/api/admin/workflows/{$customWorkflowId}/transitions/{$transitionId}")->assertNoContent();

    // Publicar la versión DRAFT.
    $this->actingAs($platformStaff)->postJson("/api/admin/workflows/{$customWorkflowId}/versions/{$v1->id}/publish")->assertOk();

    // Versionar (crea una nueva DRAFT a partir de la publicada).
    $v2 = $this->actingAs($platformStaff)->postJson("/api/admin/workflows/{$customWorkflowId}/versions")->assertCreated()->json('workflow_version.id');

    // Borrar una transición clonada en la nueva versión DRAFT (v2).
    $anyTransitionOfV2 = WorkflowVersion::query()->findOrFail($v2)->transitions()->firstOrFail();
    $this->actingAs($platformStaff)->deleteJson("/api/admin/workflows/{$customWorkflowId}/transitions/{$anyTransitionOfV2->id}")->assertNoContent();

    expect(SecurityLog::query()->where('event_type', 'WORKFLOW_TRANSITION_CREATED')->exists())->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'WORKFLOW_TRANSITION_UPDATED')->exists())->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'WORKFLOW_TRANSITION_DELETED')->count())->toBe(2)
        ->and(SecurityLog::query()->where('event_type', 'WORKFLOW_VERSION_PUBLISHED')->exists())->toBeTrue()
        ->and(SecurityLog::query()->where('event_type', 'WORKFLOW_VERSION_CREATED')->exists())->toBeTrue();
});

// ---- Revisión especialista-seguridad, hallazgo 2 (gap ya identificado, sin test de regresión): current_version_id=NULL entre el clon y la primera publicación ----

test('gap: clonar el BASE deja current_version_id=NULL hasta publicar -- ejecutar una transición real de WasteTreatmentApproval ANTES de publicar responde 422 controlado (nunca 500, nunca cae al workflow de otro tenant)', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);

    $customWorkflowId = $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');
    $customWorkflow = Workflow::query()->findOrFail($customWorkflowId);
    expect($customWorkflow->current_version_id)->toBeNull(); // requisito 4, todavía sin publicar

    $approval = WasteTreatmentApproval::factory()->create(['organization_id' => $gestor->id]);
    $evaluator = workflowControllerActor(['treatment_approvals.evaluate'], $gestor->id);
    grantAdministradorRole($evaluator);

    $response = $this->actingAs($evaluator)->postJson("/api/admin/treatment-approvals/{$approval->id}/approve-technical");

    $response->assertUnprocessable()->assertJsonValidationErrors('workflow');
    expect($approval->fresh()->technical_status)->toBe('PENDING');

    // Otra organización SIN clonar (workflow BASE, con version publicada) sigue
    // funcionando con normalidad -- confirma que el 422 de arriba no "cayó"
    // silenciosamente al workflow de otro tenant ni rompió su aislamiento.
    $unrelatedGestor = workflowGestorOrganization();
    $unrelatedApproval = WasteTreatmentApproval::factory()->create(['organization_id' => $unrelatedGestor->id]);
    $unrelatedEvaluator = workflowControllerActor(['treatment_approvals.evaluate'], $unrelatedGestor->id);
    grantAdministradorRole($unrelatedEvaluator);

    $this->actingAs($unrelatedEvaluator)->postJson("/api/admin/treatment-approvals/{$unrelatedApproval->id}/approve-technical")
        ->assertOk()->assertJsonPath('treatment_approval.technical_status', 'APPROVED');
});

// ---- Hallazgo de bajo costo aceptado: from_status_code/to_status_code deben existir en respel_statuses ----

test('storeTransition rechaza from_status_code/to_status_code que no existan en respel_statuses', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);
    $customWorkflowId = $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');

    $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/transitions", [
        'from_status_code' => 'TECH_PENDING',
        'to_status_code' => 'CODIGO_INEXISTENTE',
    ])->assertUnprocessable()->assertJsonValidationErrors('to_status_code');

    $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/transitions", [
        'from_status_code' => 'CODIGO_INEXISTENTE',
        'to_status_code' => 'TECH_APPROVED',
    ])->assertUnprocessable()->assertJsonValidationErrors('from_status_code');
});

// ---- Gaps de contrato de API encontrados por el agente de frontend (CU-021) ----

test('gap 1: show()/clone()/storeVersion()/storeTransition() resuelven from_status/to_status a la fila completa de respel_statuses (no solo el código crudo)', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);
    $customWorkflowId = $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');

    // clone(): ya viene resuelto en la respuesta inmediata.
    $cloneTransition = collect($this->actingAs($actor)->getJson("/api/admin/workflows/{$customWorkflowId}")->json('workflow.versions.0.transitions'))->first();
    expect($cloneTransition['from_status']['code'])->not->toBeNull()
        ->and($cloneTransition['from_status']['name'])->not->toBeNull()
        ->and($cloneTransition['to_status']['code'])->not->toBeNull();

    // storeTransition(): la transición recién creada también trae from_status/to_status completos.
    $created = $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/transitions", [
        'from_status_code' => 'TECH_UNDER_REVIEW',
        'to_status_code' => 'TECH_APPROVED',
    ])->assertCreated();

    expect($created->json('workflow_transition.from_status.code'))->toBe('TECH_UNDER_REVIEW')
        ->and($created->json('workflow_transition.from_status.name'))->not->toBeNull()
        ->and($created->json('workflow_transition.to_status.code'))->toBe('TECH_APPROVED')
        ->and($created->json('workflow_transition.to_status.is_approved_status'))->toBeTrue();

    // storeVersion(): tras publicar, una nueva versión DRAFT también resuelve from_status/to_status.
    $draftVersion = \App\Models\Workflow::query()->findOrFail($customWorkflowId)->versions()->where('status', 'DRAFT')->firstOrFail();
    $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/versions/{$draftVersion->id}/publish")->assertOk();

    $newVersion = $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/versions")->assertCreated();
    $newVersionTransition = collect($newVersion->json('workflow_version.transitions'))->first();
    expect($newVersionTransition['from_status']['code'])->not->toBeNull()
        ->and($newVersionTransition['to_status']['code'])->not->toBeNull();
});

test('gap 2: show() eager-carga transitions.roles de TODAS las versiones (incluida una versión DRAFT recién creada), no solo currentVersion', function () {
    $administrador = Role::query()->where('code', 'ADMINISTRADOR')->firstOrFail();
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);
    $customWorkflowId = $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated()->json('workflow.id');

    $draftVersion = Workflow::query()->findOrFail($customWorkflowId)->versions()->where('status', 'DRAFT')->firstOrFail();
    $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/versions/{$draftVersion->id}/publish")->assertOk();

    // Nueva versión DRAFT, sin currentVersion apuntar a ella todavía.
    $newVersionId = $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/versions")->assertCreated()->json('workflow_version.id');

    $this->actingAs($actor)->postJson("/api/admin/workflows/{$customWorkflowId}/transitions", [
        'from_status_code' => 'TECH_UNDER_REVIEW',
        'to_status_code' => 'TECH_APPROVED',
        'roles' => [['role_id' => $administrador->id]],
    ])->assertCreated();

    $response = $this->actingAs($actor)->getJson("/api/admin/workflows/{$customWorkflowId}")->assertOk();

    $versions = collect($response->json('workflow.versions'));
    $newVersionPayload = $versions->firstWhere('id', $newVersionId);

    expect($newVersionPayload)->not->toBeNull();

    $transitionWithRole = collect($newVersionPayload['transitions'])
        ->first(fn ($transition) => $transition['from_status_code'] === 'TECH_UNDER_REVIEW' && $transition['to_status_code'] === 'TECH_APPROVED');

    expect($transitionWithRole)->not->toBeNull()
        ->and($transitionWithRole['roles'])->not->toBeEmpty()
        ->and($transitionWithRole['roles'][0]['role_id'])->toBe($administrador->id);
});

test('gap 3: index() eager-carga tenantOrganization -- el listado expone la razón social, no solo el id', function () {
    $gestor = workflowGestorOrganization();
    $actor = workflowControllerActor(tenantOrganizationId: $gestor->id);
    $this->actingAs($actor)->postJson('/api/admin/workflows/'.baseRespelWorkflow()->id.'/clone')->assertCreated();

    $platformStaff = workflowControllerPlatformStaffActor();
    $response = $this->actingAs($platformStaff)->getJson('/api/admin/workflows')->assertOk();

    $customWorkflowRow = collect($response->json('data'))->firstWhere('tenant_organization_id', $gestor->id);

    expect($customWorkflowRow)->not->toBeNull()
        ->and($customWorkflowRow['tenant_organization']['legal_name'])->toBe($gestor->legal_name);
});
