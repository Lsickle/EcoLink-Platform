<?php

use App\Models\InvitationRequest;
use App\Models\Organization;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;
use App\Models\UserStatus;
use App\Notifications\UserInvitationNotification;
use Illuminate\Support\Facades\Notification;

// Mecanismo de "solicitud de invitación" (tarea 2, reemplaza el registro
// público -- CU-006.1 modificado). `store()` es público; `index()`/
// `approve()`/`reject()` viven en admin/*.

beforeEach(function () {
    UserStatus::query()->firstOrCreate(['code' => 'PENDING_ACTIVATION'], ['name' => 'Pendiente de activación', 'is_system' => true, 'is_active' => true]);
    UserStatus::query()->firstOrCreate(['code' => 'ACTIVE'], ['name' => 'Activo', 'is_system' => true, 'is_active' => true]);
});

function invitationRequestActor(array $codes, ?int $tenantId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantId]);
    $role = Role::factory()->create();

    foreach ($codes as $code) {
        $permission = Permission::query()->firstOrCreate(['code' => $code], [
            'name' => $code, 'module' => explode('.', $code)[0], 'action' => explode('.', $code)[1] ?? $code,
            'scope' => 'tenant', 'is_system' => true, 'is_active' => true,
        ]);
        RolePermission::query()->create(['role_id' => $role->id, 'permission_id' => $permission->id, 'is_active' => true]);
    }

    UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);

    return $actor;
}

// Hallazgo Alto (especialista-seguridad, 2026-07-14): index()/approve()/
// reject() ahora exigen AMBOS -- el permiso RBAC (users.create) y ser staff
// de la organización plataforma (User::isPlatformStaff()). Este helper crea
// un actor que cumple ambos requisitos, reutilizando invitationRequestActor()
// para el permiso.
function platformStaffActor(array $codes = ['users.create']): User
{
    $platform = Organization::factory()->create(['is_platform_tenant' => true]);

    return invitationRequestActor($codes, $platform->id);
}

function validInvitationRequestPayload(array $overrides = []): array
{
    return array_merge([
        'first_name' => 'Ana',
        'last_name' => 'Gomez',
        'document_type' => 'CC',
        'document_number' => '800111333',
        'email' => 'ana.gomez@example.com',
        'phone' => '3001234567',
    ], $overrides);
}

// ---- store() público ----

test('store crea la solicitud PENDING y responde con el mensaje genérico', function () {
    $response = $this->postJson('/api/invitation-requests', validInvitationRequestPayload());

    $response->assertSuccessful()->assertJsonPath('message', 'Tu solicitud fue enviada. Un administrador la revisará.');

    $this->assertDatabaseHas('invitation_requests', [
        'email' => 'ana.gomez@example.com',
        'status' => 'PENDING',
    ]);

    expect(SecurityLog::query()->where('event_type', 'INVITATION_REQUEST_SUBMITTED')->where('result', 'SUCCESS')->exists())->toBeTrue();
});

test('store con email ya existente en users responde igual el mensaje genérico y NO crea fila', function () {
    $existing = User::factory()->create(['email' => 'ana.gomez@example.com']);

    $response = $this->postJson('/api/invitation-requests', validInvitationRequestPayload());

    $response->assertSuccessful()->assertJsonPath('message', 'Tu solicitud fue enviada. Un administrador la revisará.');

    expect(InvitationRequest::query()->where('email', 'ana.gomez@example.com')->exists())->toBeFalse();
    expect(SecurityLog::query()->where('event_type', 'INVITATION_REQUEST_SUBMITTED')->where('result', 'DUPLICATE_IGNORED')->exists())->toBeTrue();

    expect($existing)->not->toBeNull();
});

test('store con una invitation_request PENDING ya existente para el mismo email responde igual y no duplica la fila', function () {
    InvitationRequest::factory()->create(['email' => 'ana.gomez@example.com', 'status' => 'PENDING']);

    $this->postJson('/api/invitation-requests', validInvitationRequestPayload())
        ->assertSuccessful()
        ->assertJsonPath('message', 'Tu solicitud fue enviada. Un administrador la revisará.');

    expect(InvitationRequest::query()->where('email', 'ana.gomez@example.com')->count())->toBe(1);
});

test('store con document_number duplicado en people responde igual el mensaje genérico y no crea fila', function () {
    Person::factory()->create(['document_number' => '800111333']);

    $this->postJson('/api/invitation-requests', validInvitationRequestPayload(['email' => 'otro.correo@example.com']))
        ->assertSuccessful()
        ->assertJsonPath('message', 'Tu solicitud fue enviada. Un administrador la revisará.');

    expect(InvitationRequest::query()->where('email', 'otro.correo@example.com')->exists())->toBeFalse();
});

test('store aplica rate limiting por IP (throttle:invitation-request)', function () {
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/invitation-requests', validInvitationRequestPayload(['email' => "correo{$i}@example.com", 'document_number' => "80011133{$i}"]))
            ->assertSuccessful();
    }

    $this->postJson('/api/invitation-requests', validInvitationRequestPayload(['email' => 'sextocorreo@example.com', 'document_number' => '800111339']))
        ->assertStatus(429);
});

// ---- index() admin ----

test('index rechaza sin autenticar (401), sin users.create (403), y permite con el permiso siendo platform staff', function () {
    $this->getJson('/api/admin/invitation-requests')->assertUnauthorized();

    $withoutPermission = User::factory()->create();
    $this->actingAs($withoutPermission)->getJson('/api/admin/invitation-requests')->assertForbidden();

    $reader = platformStaffActor(['users.create']);
    InvitationRequest::factory()->count(3)->create();

    $this->actingAs($reader)->getJson('/api/admin/invitation-requests')->assertOk();
});

test('index pagina y filtra por status', function () {
    InvitationRequest::factory()->count(2)->create(['status' => 'PENDING']);
    InvitationRequest::factory()->create(['status' => 'REJECTED']);

    $reader = platformStaffActor(['users.create']);

    $response = $this->actingAs($reader)->getJson('/api/admin/invitation-requests?status=PENDING')->assertOk();

    $statuses = collect($response->json('data'))->pluck('status');
    expect($statuses)->each->toBe('PENDING')
        ->and($statuses)->toHaveCount(2);
});

// ---- Hallazgo Alto (especialista-seguridad, 2026-07-14): gate de plataforma ----
//
// Solo el staff de la organización PLATAFORMA (organizations.is_platform_tenant
// = true) puede ver/aprobar/rechazar esta cola -- ningún admin de una
// empresa cliente, aunque tenga users.create (confirmado explícitamente por
// el usuario del proyecto).

test('index deniega (403) a un admin de un tenant NORMAL (no plataforma) con users.create', function () {
    $normalTenant = Organization::factory()->create(['is_platform_tenant' => false]);
    $actor = invitationRequestActor(['users.create'], $normalTenant->id);

    $this->actingAs($actor)->getJson('/api/admin/invitation-requests')->assertForbidden();
});

test('approve deniega (403) a un admin de un tenant NORMAL (no plataforma) con users.create', function () {
    $normalTenant = Organization::factory()->create(['is_platform_tenant' => false]);
    $actor = invitationRequestActor(['users.create'], $normalTenant->id);
    $role = Role::factory()->create();
    $invitationRequest = InvitationRequest::factory()->create(['status' => 'PENDING']);

    $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$invitationRequest->id}/approve", [
        'role_ids' => [$role->id],
    ])->assertForbidden();
});

test('reject deniega (403) a un admin de un tenant NORMAL (no plataforma) con users.create', function () {
    $normalTenant = Organization::factory()->create(['is_platform_tenant' => false]);
    $actor = invitationRequestActor(['users.create'], $normalTenant->id);
    $invitationRequest = InvitationRequest::factory()->create(['status' => 'PENDING']);

    $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$invitationRequest->id}/reject")->assertForbidden();
});

test('index/approve/reject SÍ permiten al staff de la organización plataforma con users.create', function () {
    Notification::fake();

    $actor = platformStaffActor(['users.create']);
    $role = Role::factory()->create();

    InvitationRequest::factory()->count(2)->create(['status' => 'PENDING']);
    $this->actingAs($actor)->getJson('/api/admin/invitation-requests')->assertOk();

    $toApprove = InvitationRequest::factory()->create(['status' => 'PENDING']);
    $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$toApprove->id}/approve", [
        'role_ids' => [$role->id],
    ])->assertCreated();

    $toReject = InvitationRequest::factory()->create(['status' => 'PENDING']);
    $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$toReject->id}/reject")->assertOk();
});

// ---- approve() ----

test('approve exitoso crea User+Person, asigna roles, dispara UserInvitationNotification y marca APPROVED', function () {
    Notification::fake();

    $actor = platformStaffActor(['users.create']);
    $role = Role::factory()->create();
    $invitationRequest = InvitationRequest::factory()->create(['status' => 'PENDING']);

    $response = $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$invitationRequest->id}/approve", [
        'role_ids' => [$role->id],
    ]);

    $response->assertCreated()->assertJsonPath('invitation_request.status', 'APPROVED');

    $user = User::query()->where('email', $invitationRequest->email)->firstOrFail();

    expect($user->person)->not->toBeNull()
        ->and($user->person->document_number)->toBe($invitationRequest->document_number)
        ->and($user->status->code)->toBe('PENDING_ACTIVATION')
        ->and(UserRole::query()->where('user_id', $user->id)->where('role_id', $role->id)->exists())->toBeTrue();

    $invitationRequest->refresh();
    expect($invitationRequest->status)->toBe('APPROVED')
        ->and($invitationRequest->resulting_user_id)->toBe($user->id)
        ->and($invitationRequest->reviewed_by)->toBe($actor->id)
        ->and($invitationRequest->reviewed_at)->not->toBeNull();

    Notification::assertSentTo($user, UserInvitationNotification::class);

    expect(SecurityLog::query()->where('event_type', 'INVITATION_REQUEST_APPROVED')->exists())->toBeTrue();
});

test('approve sin users.create devuelve 403', function () {
    $actor = User::factory()->create();
    $invitationRequest = InvitationRequest::factory()->create(['status' => 'PENDING']);
    $role = Role::factory()->create();

    $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$invitationRequest->id}/approve", [
        'role_ids' => [$role->id],
    ])->assertForbidden();
});

test('approve exige al menos un rol', function () {
    $actor = platformStaffActor(['users.create']);
    $invitationRequest = InvitationRequest::factory()->create(['status' => 'PENDING']);

    $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$invitationRequest->id}/approve", [
        'role_ids' => [],
    ])->assertUnprocessable()->assertJsonValidationErrors('role_ids');
});

test('approve sobre una solicitud ya revisada devuelve 422', function () {
    $actor = platformStaffActor(['users.create']);
    $role = Role::factory()->create();
    $invitationRequest = InvitationRequest::factory()->create(['status' => 'APPROVED']);

    $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$invitationRequest->id}/approve", [
        'role_ids' => [$role->id],
    ])->assertUnprocessable()->assertJsonValidationErrors('invitation_request');
});

test('approve rechaza role_ids que pertenecen a OTRO tenant (422) -- hallazgo Crítico, role smuggling cross-tenant', function () {
    // Hallazgo Crítico (especialista-seguridad, 2026-07-14): mismo hallazgo
    // que en UserManagementControllerTest -- UserProvisioningService es el
    // punto compartido usado también por approve(), así que el fix (y su
    // cobertura) deben protegerlo igual.
    Notification::fake();

    $orgB = Organization::factory()->create();
    $actor = platformStaffActor(['users.create']);
    $roleOtherTenant = Role::factory()->create(['tenant_organization_id' => $orgB->id]);
    $invitationRequest = InvitationRequest::factory()->create(['status' => 'PENDING']);

    $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$invitationRequest->id}/approve", [
        'role_ids' => [$roleOtherTenant->id],
    ])->assertUnprocessable()->assertJsonValidationErrors('role_ids');

    expect(User::query()->where('email', $invitationRequest->email)->exists())->toBeFalse();
    expect($invitationRequest->fresh()->status)->toBe('PENDING');
});

// ---- reject() ----

test('reject exitoso marca REJECTED con motivo', function () {
    $actor = platformStaffActor(['users.create']);
    $invitationRequest = InvitationRequest::factory()->create(['status' => 'PENDING']);

    $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$invitationRequest->id}/reject", [
        'reason' => 'Documentación insuficiente.',
    ])->assertOk()->assertJsonPath('invitation_request.status', 'REJECTED');

    $invitationRequest->refresh();
    expect($invitationRequest->status)->toBe('REJECTED')
        ->and($invitationRequest->rejection_reason)->toBe('Documentación insuficiente.')
        ->and($invitationRequest->reviewed_by)->toBe($actor->id)
        ->and($invitationRequest->reviewed_at)->not->toBeNull();

    expect(SecurityLog::query()->where('event_type', 'INVITATION_REQUEST_REJECTED')->exists())->toBeTrue();
});

test('reject exitoso sin motivo (reason opcional)', function () {
    $actor = platformStaffActor(['users.create']);
    $invitationRequest = InvitationRequest::factory()->create(['status' => 'PENDING']);

    $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$invitationRequest->id}/reject")
        ->assertOk()
        ->assertJsonPath('invitation_request.status', 'REJECTED');

    expect($invitationRequest->fresh()->rejection_reason)->toBeNull();
});

test('reject sin users.create devuelve 403', function () {
    $actor = User::factory()->create();
    $invitationRequest = InvitationRequest::factory()->create(['status' => 'PENDING']);

    $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$invitationRequest->id}/reject")->assertForbidden();
});

test('reject sobre una solicitud ya revisada devuelve 422', function () {
    $actor = platformStaffActor(['users.create']);
    $invitationRequest = InvitationRequest::factory()->create(['status' => 'REJECTED']);

    $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$invitationRequest->id}/reject")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('invitation_request');
});

// ---- aislamiento cross-tenant ----
//
// `invitation_requests` no lleva `tenant_organization_id` (cola PRE-tenant --
// el solicitante todavía no pertenece a ninguna organización), así que el
// aislamiento posible es restringir QUIÉN puede aprobarla (gate de
// plataforma, ver arriba); el tenant resultante del usuario nuevo lo fija
// `UserProvisioningService` a partir del tenant del ACTOR que aprueba (nunca
// del input), igual que `UserManagementController::store()`.
test('approve fija tenant_organization_id del actor que aprueba, nunca del cliente', function () {
    Notification::fake();

    $orgA = Organization::factory()->create(['is_platform_tenant' => true]);
    $orgB = Organization::factory()->create();
    $actor = invitationRequestActor(['users.create'], $orgA->id);
    $role = Role::factory()->create();
    $invitationRequest = InvitationRequest::factory()->create(['status' => 'PENDING']);

    $this->actingAs($actor)->postJson("/api/admin/invitation-requests/{$invitationRequest->id}/approve", [
        'role_ids' => [$role->id],
        'organization_id' => null,
        'tenant_organization_id' => $orgB->id,
    ])->assertCreated();

    $user = User::query()->where('email', $invitationRequest->email)->firstOrFail();
    expect($user->tenant_organization_id)->toBe($orgA->id);
});
