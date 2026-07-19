<?php

use App\Models\Branch;
use App\Models\Organization;
use App\Models\OrganizationContact;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\SecurityLog;
use App\Models\User;
use App\Models\UserRole;
use Illuminate\Database\QueryException;

// D-P02 / L-08 -- Contactos = pivote N:N real `organization_contacts`.
// Acceso DUAL (a diferencia del resto de OrganizationController, exclusivo
// de platform staff): platform staff gestiona los contactos de CUALQUIER
// organización, un admin de tenant solo los de la SUYA
// (`tenant_organization_id`).

function contactActor(array $codes = [], ?int $tenantOrganizationId = null): User
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

function contactPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return contactActor($codes, $platform->id);
}

// ---- Aislamiento tenant vs. platform staff ----

test('contacts()/storeContact() devuelven 403 sin el permiso contacts.read/contacts.create', function () {
    $organization = Organization::factory()->create();
    $actor = contactActor();

    $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}/contacts")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/contacts", [
        'document_type' => 'CC', 'document_number' => '111', 'first_name' => 'A', 'last_name' => 'B',
    ])->assertForbidden();
});

test('contacts()/storeContact() devuelven 403 para un admin de tenant con permiso pero de OTRA organización', function () {
    $organization = Organization::factory()->create();
    $otherTenant = Organization::factory()->create();
    $actor = contactActor(['contacts.read', 'contacts.create'], $otherTenant->id);

    $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}/contacts")->assertForbidden();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/contacts", [
        'document_type' => 'CC', 'document_number' => '111', 'first_name' => 'A', 'last_name' => 'B',
    ])->assertForbidden();
});

test('un admin de tenant SÍ accede a los contactos de SU PROPIA organización', function () {
    $organization = Organization::factory()->create();
    $actor = contactActor(['contacts.read'], $organization->id);

    OrganizationContact::factory()->create(['organization_id' => $organization->id]);

    $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}/contacts")->assertOk();
});

test('platform staff accede a los contactos de CUALQUIER organización', function () {
    $organization = Organization::factory()->create();
    $actor = contactPlatformStaffActor(['contacts.read']);

    OrganizationContact::factory()->create(['organization_id' => $organization->id]);

    $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}/contacts")->assertOk();
});

test('updateContact()/revokeContact() devuelven 403 para un admin de OTRO tenant', function () {
    $organization = Organization::factory()->create();
    $otherTenant = Organization::factory()->create();
    $organizationContact = OrganizationContact::factory()->create(['organization_id' => $organization->id]);

    $actor = contactActor(['contacts.update'], $otherTenant->id);

    $this->actingAs($actor)->putJson(
        "/api/admin/organizations/{$organization->id}/contacts/{$organizationContact->id}",
        ['position_title' => 'Hackeado'],
    )->assertForbidden();

    $this->actingAs($actor)->postJson(
        "/api/admin/organizations/{$organization->id}/contacts/{$organizationContact->id}/revoke",
    )->assertForbidden();
});

test('searchContacts() devuelve 403 sin contacts.read', function () {
    $actor = contactActor();

    $this->actingAs($actor)->getJson('/api/admin/organizations/contacts/search?q=test')->assertForbidden();
});

// ---- Crear contacto NUEVO ----

test('storeContact crea una Person nueva y su vínculo en una sola transacción', function () {
    $organization = Organization::factory()->create();
    $actor = contactPlatformStaffActor(['contacts.create']);

    $response = $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/contacts", [
        'document_type' => 'CC',
        'document_number' => '900111222',
        'first_name' => 'Nuevo',
        'last_name' => 'Contacto',
        'email' => 'nuevo.contacto@example.com',
        'position_title' => 'Gerente Ambiental',
        'relationship_type' => 'Empleado',
        'is_primary' => true,
    ])->assertCreated();

    $person = Person::query()->where('document_number', '900111222')->firstOrFail();

    $organizationContact = OrganizationContact::query()
        ->where('contact_id', $person->id)
        ->where('organization_id', $organization->id)
        ->firstOrFail();

    expect($organizationContact->is_active)->toBeTrue()
        ->and($organizationContact->position_title)->toBe('Gerente Ambiental')
        ->and($organizationContact->relationship_type)->toBe('Empleado')
        ->and($organizationContact->is_primary)->toBeTrue()
        ->and($organizationContact->created_by)->toBe($actor->id);

    expect(SecurityLog::query()->where('event_type', 'CONTACT_LINKED')
        ->where('metadata->organization_id', $organization->id)
        ->where('metadata->contact_id', $person->id)
        ->exists())->toBeTrue();

    $response->assertJsonPath('organization_contact.contact_id', $person->id);
});

test('storeContact exige document_type/document_number/first_name/last_name cuando NO viene existing_contact_id (422)', function () {
    $organization = Organization::factory()->create();
    $actor = contactPlatformStaffActor(['contacts.create']);

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/contacts", [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['document_type', 'document_number', 'first_name', 'last_name']);
});

// ---- Vincular persona EXISTENTE -- caso central: 2 organizaciones a la vez ----

test('storeContact con existing_contact_id vincula una persona YA registrada, sin crear una Person nueva', function () {
    $organization = Organization::factory()->create();
    $person = Person::factory()->create();
    $actor = contactPlatformStaffActor(['contacts.create']);

    $personCountBefore = Person::query()->count();

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/contacts", [
        'existing_contact_id' => $person->id,
        'relationship_type' => 'Consultor',
    ])->assertCreated();

    expect(Person::query()->count())->toBe($personCountBefore);
    expect(OrganizationContact::query()
        ->where('contact_id', $person->id)
        ->where('organization_id', $organization->id)
        ->where('relationship_type', 'Consultor')
        ->exists())->toBeTrue();
});

test('la MISMA persona puede ser contacto de DOS organizaciones distintas simultáneamente (D-P02, caso central del lote)', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();
    $actor = contactPlatformStaffActor(['contacts.create']);

    $storeResponse = $this->actingAs($actor)->postJson("/api/admin/organizations/{$orgA->id}/contacts", [
        'document_type' => 'CC', 'document_number' => '900333444',
        'first_name' => 'Multi', 'last_name' => 'Organizacion',
        'relationship_type' => 'Empleado',
    ])->assertCreated();

    $personId = $storeResponse->json('organization_contact.contact_id');

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$orgB->id}/contacts", [
        'existing_contact_id' => $personId,
        'relationship_type' => 'Consultor',
    ])->assertCreated();

    $links = OrganizationContact::query()->where('contact_id', $personId)->get();

    expect($links)->toHaveCount(2)
        ->and($links->pluck('organization_id')->sort()->values()->all())->toBe(collect([$orgA->id, $orgB->id])->sort()->values()->all())
        ->and($links->every(fn (OrganizationContact $link) => $link->is_active))->toBeTrue();
});

// ---- branch_id debe pertenecer a organization_id ----

test('storeContact rechaza con 422 un branch_id que pertenece a OTRA organización', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $branchFromOtherOrg = Branch::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = contactPlatformStaffActor(['contacts.create']);

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/contacts", [
        'document_type' => 'CC', 'document_number' => '900555666',
        'first_name' => 'Rechazado', 'last_name' => 'PorSede',
        'branch_id' => $branchFromOtherOrg->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('branch_id');
});

test('storeContact acepta un branch_id que SÍ pertenece a la organización', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);

    $actor = contactPlatformStaffActor(['contacts.create']);

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/contacts", [
        'document_type' => 'CC', 'document_number' => '900777888',
        'first_name' => 'Aceptado', 'last_name' => 'PorSede',
        'branch_id' => $branch->id,
    ])->assertCreated()->assertJsonPath('organization_contact.branch_id', $branch->id);
});

test('updateContact rechaza con 422 un branch_id de OTRA organización', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $branchFromOtherOrg = Branch::factory()->create(['organization_id' => $otherOrganization->id]);
    $organizationContact = OrganizationContact::factory()->create(['organization_id' => $organization->id]);

    $actor = contactPlatformStaffActor(['contacts.update']);

    $this->actingAs($actor)->putJson(
        "/api/admin/organizations/{$organization->id}/contacts/{$organizationContact->id}",
        ['branch_id' => $branchFromOtherOrg->id],
    )->assertUnprocessable()->assertJsonValidationErrors('branch_id');
});

// ---- updateContact() ----

test('updateContact edita SOLO campos del vínculo, nunca datos de Person', function () {
    $organization = Organization::factory()->create();
    $person = Person::factory()->create(['first_name' => 'Original']);
    $organizationContact = OrganizationContact::factory()->create([
        'organization_id' => $organization->id,
        'contact_id' => $person->id,
        'position_title' => 'Cargo Viejo',
    ]);

    $actor = contactPlatformStaffActor(['contacts.update']);

    $this->actingAs($actor)->putJson(
        "/api/admin/organizations/{$organization->id}/contacts/{$organizationContact->id}",
        ['position_title' => 'Cargo Nuevo', 'first_name' => 'Deberia Ser Ignorado'],
    )->assertOk()->assertJsonPath('organization_contact.position_title', 'Cargo Nuevo');

    expect($person->fresh()->first_name)->toBe('Original');
    expect(SecurityLog::query()->where('event_type', 'CONTACT_LINK_UPDATED')->exists())->toBeTrue();
});

test('updateContact rechaza cuando el vínculo no pertenece a la organización de la ruta (422)', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();
    $organizationContact = OrganizationContact::factory()->create(['organization_id' => $otherOrganization->id]);

    $actor = contactPlatformStaffActor(['contacts.update']);

    $this->actingAs($actor)->putJson(
        "/api/admin/organizations/{$organization->id}/contacts/{$organizationContact->id}",
        ['position_title' => 'X'],
    )->assertUnprocessable();
});

// ---- revokeContact(): no afecta el otro vínculo de la misma persona ----

test('revokeContact pone is_active=false, es idempotente, y NO afecta el otro vínculo de la misma persona con otra organización', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();
    $person = Person::factory()->create();

    $linkA = OrganizationContact::factory()->create(['organization_id' => $orgA->id, 'contact_id' => $person->id, 'is_active' => true]);
    $linkB = OrganizationContact::factory()->create(['organization_id' => $orgB->id, 'contact_id' => $person->id, 'is_active' => true]);

    $actor = contactPlatformStaffActor(['contacts.update']);

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$orgA->id}/contacts/{$linkA->id}/revoke")->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$orgA->id}/contacts/{$linkA->id}/revoke")->assertOk();

    expect($linkA->fresh()->is_active)->toBeFalse()
        ->and($linkB->fresh()->is_active)->toBeTrue();

    // La Person NUNCA se borra, ni tampoco la organización.
    expect(Person::query()->whereKey($person->id)->exists())->toBeTrue();
    expect(SecurityLog::query()->where('event_type', 'CONTACT_UNLINKED')->exists())->toBeTrue();
});

test('contacts() expone un organization_contact_id no nulo y usable para revoke() (regresión: withPivot() sin "id")', function () {
    $organization = Organization::factory()->create();
    $link = OrganizationContact::factory()->create(['organization_id' => $organization->id]);
    $actor = contactPlatformStaffActor(['contacts.read', 'contacts.update']);

    $response = $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}/contacts")->assertOk();
    $organizationContactId = $response->json('data.0.organization_contact_id');

    expect($organizationContactId)->not->toBeNull()->toBe($link->id);

    $this->actingAs($actor)
        ->postJson("/api/admin/organizations/{$organization->id}/contacts/{$organizationContactId}/revoke")
        ->assertOk();

    expect($link->fresh()->is_active)->toBeFalse();
});

// ---- searchContacts() ----

test('searchContacts acota a personas con vínculo accesible cuando el actor NO es platform staff', function () {
    $organization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();

    $inTenant = Person::factory()->create(['first_name' => 'Buscable', 'last_name' => 'EnTenant']);
    OrganizationContact::factory()->create(['organization_id' => $organization->id, 'contact_id' => $inTenant->id]);

    $outsideTenant = Person::factory()->create(['first_name' => 'Buscable', 'last_name' => 'Afuera']);
    OrganizationContact::factory()->create(['organization_id' => $otherOrganization->id, 'contact_id' => $outsideTenant->id]);

    $withoutAnyLink = Person::factory()->create(['first_name' => 'Buscable', 'last_name' => 'SinVinculo']);

    $actor = contactActor(['contacts.read'], $organization->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/organizations/contacts/search?q=Buscable')->assertOk();

    $ids = collect($response->json('data'))->pluck('id');
    expect($ids)->toContain($inTenant->id)
        ->not->toContain($outsideTenant->id)
        ->not->toContain($withoutAnyLink->id);
});

test('searchContacts NO acota resultados cuando el actor es platform staff', function () {
    $organization = Organization::factory()->create();
    $person = Person::factory()->create(['first_name' => 'SinVinculo', 'last_name' => 'Alguno']);

    $actor = contactPlatformStaffActor(['contacts.read']);

    $response = $this->actingAs($actor)->getJson('/api/admin/organizations/contacts/search?q=SinVinculo')->assertOk();

    expect(collect($response->json('data'))->pluck('id'))->toContain($person->id);

    $row = collect($response->json('data'))->firstWhere('id', $person->id);
    expect(array_keys($row))->toBe(['id', 'first_name', 'last_name', 'document_number', 'email', 'position_title']);
});

test('searchContacts incluye el position_title DEL VÍNCULO con la organización del actor cuando la misma persona tiene cargos distintos en varias organizaciones', function () {
    $orgA = Organization::factory()->create();
    $orgB = Organization::factory()->create();
    $person = Person::factory()->create(['first_name' => 'MultiCargo', 'last_name' => 'Persona']);

    OrganizationContact::factory()->create([
        'organization_id' => $orgA->id, 'contact_id' => $person->id, 'branch_id' => null, 'position_title' => 'Conductor',
    ]);
    OrganizationContact::factory()->create([
        'organization_id' => $orgB->id, 'contact_id' => $person->id, 'branch_id' => null, 'position_title' => 'Gerente Ambiental',
    ]);

    $actor = contactActor(['contacts.read'], $orgA->id);

    $response = $this->actingAs($actor)->getJson('/api/admin/organizations/contacts/search?q=MultiCargo')->assertOk();

    $row = collect($response->json('data'))->firstWhere('id', $person->id);
    expect($row)->not->toBeNull()
        ->and($row['position_title'])->toBe('Conductor');
});

// ---- Índice único (Postgres, índices parciales) ----

test('el índice único parcial impide 2 vínculos del mismo contacto a la MISMA organización SIN sede (branch_id NULL)', function () {
    $organization = Organization::factory()->create();
    $person = Person::factory()->create();

    OrganizationContact::factory()->create(['organization_id' => $organization->id, 'contact_id' => $person->id, 'branch_id' => null]);

    expect(fn () => OrganizationContact::factory()->create(['organization_id' => $organization->id, 'contact_id' => $person->id, 'branch_id' => null]))
        ->toThrow(QueryException::class);
});

test('el índice único parcial impide 2 vínculos del mismo contacto a la MISMA organización+sede', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $person = Person::factory()->create();

    OrganizationContact::factory()->create(['organization_id' => $organization->id, 'contact_id' => $person->id, 'branch_id' => $branch->id]);

    expect(fn () => OrganizationContact::factory()->create(['organization_id' => $organization->id, 'contact_id' => $person->id, 'branch_id' => $branch->id]))
        ->toThrow(QueryException::class);
});

test('el mismo contacto SÍ puede tener un vínculo SIN sede y otro CON sede a la MISMA organización', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id]);
    $person = Person::factory()->create();

    OrganizationContact::factory()->create(['organization_id' => $organization->id, 'contact_id' => $person->id, 'branch_id' => null]);
    $withBranch = OrganizationContact::factory()->create(['organization_id' => $organization->id, 'contact_id' => $person->id, 'branch_id' => $branch->id]);

    expect($withBranch->exists)->toBeTrue();
    expect(OrganizationContact::query()->where('contact_id', $person->id)->count())->toBe(2);
});

// ---- Hallazgos de especialista-seguridad, 2026-07-15 (cerrados en el mismo lote) ----

test('storeContact rechaza (422) un existing_contact_id que pertenece a una persona SIN vínculo con el tenant del actor (hallazgo Crítico, IDOR cross-tenant)', function () {
    $ownOrganization = Organization::factory()->create();
    $otherOrganization = Organization::factory()->create();

    // Persona conocida SOLO por la otra organización -- el actor no debería
    // poder "descubrirla" ni vincularla por id aunque exista en el sistema.
    $strangerPerson = Person::factory()->create();
    OrganizationContact::factory()->create(['organization_id' => $otherOrganization->id, 'contact_id' => $strangerPerson->id]);

    $actor = contactActor(['contacts.create'], $ownOrganization->id);

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$ownOrganization->id}/contacts", [
        'existing_contact_id' => $strangerPerson->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('existing_contact_id');

    expect(OrganizationContact::query()->where('organization_id', $ownOrganization->id)->where('contact_id', $strangerPerson->id)->exists())->toBeFalse();
});

test('storeContact SÍ permite vincular una persona ya conocida por el tenant del actor (vía otra organización propia o la misma)', function () {
    $organizationA = Organization::factory()->create();
    $organizationB = Organization::factory()->create();

    // El actor pertenece al tenant de organizationA -- una persona ya
    // vinculada a organizationA es "conocida" y puede reutilizarse.
    $knownPerson = Person::factory()->create();
    OrganizationContact::factory()->create(['organization_id' => $organizationA->id, 'contact_id' => $knownPerson->id, 'branch_id' => null]);

    $actor = contactActor(['contacts.create'], $organizationA->id);

    // Ya existe un vínculo activo idéntico (org+sin sede) -- pasa la
    // validación de "conocida" y, por el fix de reactivación, actualiza la
    // fila existente en vez de fallar por el índice único (201, no un
    // segundo registro).
    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organizationA->id}/contacts", [
        'existing_contact_id' => $knownPerson->id,
        'branch_id' => null,
    ])->assertCreated();

    expect(OrganizationContact::query()->where('organization_id', $organizationA->id)->where('contact_id', $knownPerson->id)->count())->toBe(1);

    // Vinculación válida: misma persona conocida, pero como platform staff
    // hacia una organización DISTINTA (organizationB) -- caso "Juan".
    $platformActor = contactPlatformStaffActor(['contacts.create']);
    $this->actingAs($platformActor)->postJson("/api/admin/organizations/{$organizationB->id}/contacts", [
        'existing_contact_id' => $knownPerson->id,
    ])->assertCreated();
});

test('platform staff puede vincular cualquier persona existente sin restricción de "conocida" (hallazgo Crítico, excepción esperada)', function () {
    $organization = Organization::factory()->create();
    $anyPerson = Person::factory()->create();

    $actor = contactPlatformStaffActor(['contacts.create']);

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/contacts", [
        'existing_contact_id' => $anyPerson->id,
    ])->assertCreated();
});

test('contacts() responde 403 sin contacts.read aunque el actor SÍ pertenezca a la organización (hallazgo Alto, RBAC ausente)', function () {
    $organization = Organization::factory()->create();
    // Mismo tenant que la organización -- el chequeo de aislamiento tenant
    // por sí solo pasaría; sin el permiso RBAC, debe seguir siendo 403.
    $actor = contactActor([], $organization->id);

    $this->actingAs($actor)->getJson("/api/admin/organizations/{$organization->id}/contacts")->assertForbidden();
});

test('storeContact reactiva un vínculo previamente revocado en vez de fallar por el índice único (hallazgo Medio)', function () {
    $organization = Organization::factory()->create();
    $person = Person::factory()->create();
    $actor = contactActor(['contacts.create', 'contacts.update'], $organization->id);

    $link = OrganizationContact::factory()->create([
        'organization_id' => $organization->id, 'contact_id' => $person->id, 'branch_id' => null, 'is_active' => true,
    ]);

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/contacts/{$link->id}/revoke")->assertOk();
    expect($link->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson("/api/admin/organizations/{$organization->id}/contacts", [
        'existing_contact_id' => $person->id,
        'position_title' => 'Consultor de vuelta',
    ])->assertCreated();

    expect(OrganizationContact::query()->where('organization_id', $organization->id)->where('contact_id', $person->id)->where('branch_id', null)->count())->toBe(1);
    expect($link->fresh())
        ->is_active->toBeTrue()
        ->position_title->toBe('Consultor de vuelta');
});
