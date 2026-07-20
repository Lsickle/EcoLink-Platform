<?php

use App\Models\Branch;
use App\Models\BusinessRole;
use App\Models\ManifestLoad;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\OrganizationContact;
use App\Models\Person;
use App\Models\Role;
use App\Models\ServiceItemStatus;
use App\Models\TransportPersonnel;
use App\Models\TransportSchedule;
use App\Models\TransportScheduleItem;
use App\Models\TransportStatus;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Vehicle;
use App\Models\Waste;
use App\Models\WasteServiceRequest;
use App\Models\WasteServiceRequestItem;
use App\Models\WasteTreatmentApproval;
use App\Models\WorkflowLog;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\ManifestLoadWorkflowSeeder;
use Database\Seeders\ManifestStatusSeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PlatformOrganizationSeeder;
use Database\Seeders\RespelStatusSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\ServiceItemStatusSeeder;
use Database\Seeders\ServiceStatusSeeder;
use Database\Seeders\TransportScheduleWorkflowSeeder;
use Database\Seeders\TransportStatusSeeder;

// Módulo Manifiesto de Cargue, Fase 3 -- ManifestLoadController +
// ManifestLoadWorkflowService + ManifestLoadSignatureService. Mismo patrón de
// fixtures que TransportScheduleControllerTest (prefijo `ml`).

beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(PlatformOrganizationSeeder::class);
    $this->seed(RoleSeeder::class);
    $this->seed(PermissionSeeder::class);
    $this->seed(RolePermissionSeeder::class);
    $this->seed(BusinessRoleSeeder::class);
    $this->seed(RespelStatusSeeder::class);
    $this->seed(ServiceStatusSeeder::class);
    $this->seed(ServiceItemStatusSeeder::class);
    $this->seed(TransportStatusSeeder::class);
    $this->seed(TransportScheduleWorkflowSeeder::class);
    $this->seed(ManifestStatusSeeder::class);
    $this->seed(ManifestLoadWorkflowSeeder::class);
});

function mlActor(array $codes = [], ?int $tenantOrganizationId = null): User
{
    $actor = User::factory()->create(['tenant_organization_id' => $tenantOrganizationId]);

    if ($codes !== []) {
        $role = Role::query()->where('code', 'LOGÍSTICA')->firstOrFail();

        UserRole::query()->create(['user_id' => $actor->id, 'role_id' => $role->id, 'is_active' => true]);
    }

    return $actor;
}

function mlPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return mlActor($codes, $platform->id);
}

function mlGeneratorOrganization(): Organization
{
    $organization = Organization::factory()->create();
    $generator = BusinessRole::query()->where('code', 'GENERATOR')->firstOrFail();

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $generator->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    return $organization->fresh();
}

function mlGestorOrganization(): Organization
{
    $organization = Organization::factory()->create();
    $gestor = BusinessRole::query()->where('code', 'GESTOR')->firstOrFail();

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $gestor->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    return $organization->fresh();
}

// CORREGIDO (verificación E2E, 2026-07-20): el anti-IDOR de
// `assertPersonBelongsToOrganization()` pasó a validar pertenencia vía el
// pivote real `organization_contacts` (antes usaba la columna legacy
// `people.organization_id`, que queda NULL para contactos creados por el
// flujo vigente -- bug real reproducido en vivo). Este helper crea el
// vínculo real en vez de solo setear `Person.organization_id` -- mismo
// patrón que `tpPersonInOrganization()` en `TransportPersonnelControllerTest`.
function mlPersonInOrganization(int $organizationId): Person
{
    $person = Person::factory()->create(['organization_id' => $organizationId]);

    OrganizationContact::factory()->create([
        'contact_id' => $person->id,
        'organization_id' => $organizationId,
        'is_active' => true,
    ]);

    return $person;
}

/**
 * Construye una `TransportSchedule` CONFIRMADA (irrelevante para el
 * manifiesto qué `transport_status` tenga -- ManifestLoadController no lo
 * exige, mismo criterio que la tarea no lo pide) perteneciente a `$gestor`,
 * con 1 `transport_schedule_item`, `vehicle`/`transport_personnel` propios de
 * `$gestor`, `source_branch_id = $generatorBranch`.
 *
 * @return array{0: TransportSchedule, 1: TransportScheduleItem, 2: TransportPersonnel}
 */
function mlScheduleFixture(Organization $generator, Organization $gestor, Branch $generatorBranch): array
{
    $waste = Waste::factory()->create(['organization_id' => $generator->id]);
    $approval = WasteTreatmentApproval::factory()->viable()->create([
        'organization_id' => $gestor->id,
        'waste_id' => $waste->id,
    ]);

    $serviceRequest = WasteServiceRequest::factory()->create([
        'organization_id' => $generator->id,
        'branch_id' => $generatorBranch->id,
    ]);

    $acceptedStatusId = ServiceItemStatus::query()->where('code', 'ACCEPTED')->value('id');

    $requestItem = WasteServiceRequestItem::factory()->create([
        'service_request_id' => $serviceRequest->id,
        'waste_id' => $waste->id,
        'waste_treatment_approval_id' => $approval->id,
        'item_status_id' => $acceptedStatusId,
    ]);

    $vehicle = Vehicle::factory()->create(['organization_id' => $gestor->id]);
    $personnel = TransportPersonnel::factory()->create(['organization_id' => $gestor->id]);
    $destinationBranch = Branch::factory()->create(['organization_id' => $gestor->id]);

    $borStatusId = TransportStatus::query()->where('code', 'BOR')->value('id');

    $schedule = TransportSchedule::factory()->create([
        'organization_id' => $gestor->id,
        'waste_service_request_id' => $serviceRequest->id,
        'transport_status_id' => $borStatusId,
        'source_branch_id' => $generatorBranch->id,
        'destination_branch_id' => $destinationBranch->id,
        'vehicle_id' => $vehicle->id,
        'transport_personnel_id' => $personnel->id,
    ]);

    $item = TransportScheduleItem::factory()->create([
        'transport_schedule_id' => $schedule->id,
        'waste_service_request_item_id' => $requestItem->id,
        'waste_id' => $waste->id,
        'scheduled_quantity' => 100,
    ]);

    return [$schedule->fresh(), $item, $personnel];
}

// ---- store(): creación válida + anti-IDOR ----

test('store crea la cabecera en DRAFT + items derivados del transport_schedule', function () {
    $generator = mlGeneratorOrganization();
    $gestor = mlGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$schedule, $item, $personnel] = mlScheduleFixture($generator, $gestor, $branch);

    $generatorSigner = mlPersonInOrganization($generator->id);
    $actor = mlActor(['manifest_loads.create'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/manifest-loads', [
        'transport_schedule_id' => $schedule->id,
        'generator_signer_person_id' => $generatorSigner->id,
    ])->assertCreated();

    $response->assertJsonPath('manifest_load.carrier_organization_id', $gestor->id)
        ->assertJsonPath('manifest_load.generator_branch_id', $branch->id)
        ->assertJsonPath('manifest_load.vehicle_id', $schedule->vehicle_id)
        ->assertJsonPath('manifest_load.transport_personnel_id', $schedule->transport_personnel_id)
        ->assertJsonPath('manifest_load.driver_signer_person_id', $personnel->person_id)
        ->assertJsonPath('manifest_load.manifest_status.code', 'DRAFT')
        ->assertJsonPath('manifest_load.items.0.waste_id', $item->waste_id);

    expect(ManifestLoad::query()->where('transport_schedule_id', $schedule->id)->exists())->toBeTrue();
});

test('store rechaza un generator_signer_person_id que NO pertenece a la organización Generadora dueña de la sede de cargue', function () {
    $generator = mlGeneratorOrganization();
    $gestor = mlGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$schedule] = mlScheduleFixture($generator, $gestor, $branch);

    // El foreignPerson SÍ es contacto real de $gestor (organización distinta
    // a $generator, la dueña de la sede de cargue) -- escenario más
    // representativo que una persona sin ningún vínculo.
    $foreignPerson = mlPersonInOrganization($gestor->id);
    $actor = mlActor(['manifest_loads.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/manifest-loads', [
        'transport_schedule_id' => $schedule->id,
        'generator_signer_person_id' => $foreignPerson->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('generator_signer_person_id');

    expect(ManifestLoad::query()->count())->toBe(0);
});

test('store rechaza un actor que NO pertenece a la organización dueña del transport_schedule (anti-IDOR)', function () {
    $generator = mlGeneratorOrganization();
    $gestor = mlGestorOrganization();
    $foreignGestor = mlGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$schedule] = mlScheduleFixture($generator, $gestor, $branch);

    $generatorSigner = mlPersonInOrganization($generator->id);
    $actor = mlActor(['manifest_loads.create'], $foreignGestor->id);

    $this->actingAs($actor)->postJson('/api/admin/manifest-loads', [
        'transport_schedule_id' => $schedule->id,
        'generator_signer_person_id' => $generatorSigner->id,
    ])->assertForbidden();

    expect(ManifestLoad::query()->count())->toBe(0);
});

// ---- generate(): DRAFT -> GENERATED ----

test('generate() transiciona DRAFT->GENERATED y escribe un WorkflowLog', function () {
    $generator = mlGeneratorOrganization();
    $gestor = mlGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$schedule] = mlScheduleFixture($generator, $gestor, $branch);
    $generatorSigner = mlPersonInOrganization($generator->id);
    $actor = mlActor(['manifest_loads.create', 'manifest_loads.update'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/manifest-loads', [
        'transport_schedule_id' => $schedule->id,
        'generator_signer_person_id' => $generatorSigner->id,
    ])->assertCreated();

    $manifest = ManifestLoad::query()->findOrFail($response->json('manifest_load.id'));

    $this->actingAs($actor)->postJson("/api/admin/manifest-loads/{$manifest->id}/generate")
        ->assertOk()
        ->assertJsonPath('manifest_load.manifest_status.code', 'GENERATED');

    $log = WorkflowLog::query()
        ->where('process_type', 'MANIFEST_LOAD')
        ->where('process_id', $manifest->id)
        ->where('new_status', 'GENERATED')
        ->first();

    expect($log)->not->toBeNull()
        ->and($log->previous_status)->toBe('DRAFT')
        ->and($log->tenant_organization_id)->toBe($gestor->id);
});

test('generate() rechaza generar un manifiesto que ya está Generado', function () {
    $generator = mlGeneratorOrganization();
    $gestor = mlGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$schedule] = mlScheduleFixture($generator, $gestor, $branch);
    $generatorSigner = mlPersonInOrganization($generator->id);
    $actor = mlActor(['manifest_loads.create', 'manifest_loads.update'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/manifest-loads', [
        'transport_schedule_id' => $schedule->id,
        'generator_signer_person_id' => $generatorSigner->id,
    ])->assertCreated();

    $manifest = ManifestLoad::query()->findOrFail($response->json('manifest_load.id'));
    $this->actingAs($actor)->postJson("/api/admin/manifest-loads/{$manifest->id}/generate")->assertOk();

    $this->actingAs($actor)->postJson("/api/admin/manifest-loads/{$manifest->id}/generate")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('manifest_status');
});

// ---- sign(): firma cruzada + recálculo de estado + WorkflowLog ----

/**
 * @return array{0: ManifestLoad, 1: Organization, 2: Organization}
 */
function mlGeneratedManifestFixture(): array
{
    $generator = mlGeneratorOrganization();
    $gestor = mlGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$schedule] = mlScheduleFixture($generator, $gestor, $branch);
    $generatorSigner = mlPersonInOrganization($generator->id);
    $actor = mlActor(['manifest_loads.create', 'manifest_loads.update'], $gestor->id);

    $response = test()->actingAs($actor)->postJson('/api/admin/manifest-loads', [
        'transport_schedule_id' => $schedule->id,
        'generator_signer_person_id' => $generatorSigner->id,
    ])->assertCreated();

    $manifest = ManifestLoad::query()->findOrFail($response->json('manifest_load.id'));
    test()->actingAs($actor)->postJson("/api/admin/manifest-loads/{$manifest->id}/generate")->assertOk();

    return [$manifest->fresh(), $generator, $gestor];
}

test('sign(): la primera firma (DRIVER) mueve Generated->PartiallySigned; la segunda (GENERATOR) mueve a Signed', function () {
    [$manifest, $generator, $gestor] = mlGeneratedManifestFixture();

    $carrierActor = mlActor(['manifest_loads.sign'], $gestor->id);
    $generatorActor = mlActor(['manifest_loads.sign'], $generator->id);

    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])
        ->assertOk()
        ->assertJsonPath('manifest_load.manifest_status.code', 'PARTIALLY_SIGNED');

    $this->actingAs($generatorActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'GENERATOR'])
        ->assertOk()
        ->assertJsonPath('manifest_load.manifest_status.code', 'SIGNED');

    $logs = WorkflowLog::query()
        ->where('process_type', 'MANIFEST_LOAD')
        ->where('process_id', $manifest->id)
        ->orderBy('id')
        ->get();

    // generate() (DRAFT->GENERATED) + sign DRIVER (GENERATED->PARTIALLY_SIGNED) + sign GENERATOR (PARTIALLY_SIGNED->SIGNED)
    expect($logs)->toHaveCount(3);
    expect($logs[1]->new_status)->toBe('PARTIALLY_SIGNED');
    expect($logs[2]->new_status)->toBe('SIGNED');
});

test('sign() rechaza una segunda firma del MISMO tipo (ya firmado)', function () {
    [$manifest, $generator, $gestor] = mlGeneratedManifestFixture();
    $carrierActor = mlActor(['manifest_loads.sign'], $gestor->id);

    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])->assertOk();

    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('signer_type');
});

test('sign() rechaza (403) firmar como GENERADOR desde una organización que NO es la Generadora dueña de la sede de cargue', function () {
    [$manifest] = mlGeneratedManifestFixture();
    $foreignActor = mlActor(['manifest_loads.sign'], mlGeneratorOrganization()->id);

    $this->actingAs($foreignActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'GENERATOR'])
        ->assertForbidden();
});

test('sign() rechaza (403) firmar como CONDUCTOR desde una organización que NO es la Transportadora del manifiesto', function () {
    [$manifest] = mlGeneratedManifestFixture();
    $foreignActor = mlActor(['manifest_loads.sign'], mlGestorOrganization()->id);

    $this->actingAs($foreignActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])
        ->assertForbidden();
});

test('sign() rechaza firmar un manifiesto todavía en DRAFT (no generado)', function () {
    $generator = mlGeneratorOrganization();
    $gestor = mlGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$schedule] = mlScheduleFixture($generator, $gestor, $branch);
    $generatorSigner = mlPersonInOrganization($generator->id);
    $actor = mlActor(['manifest_loads.create', 'manifest_loads.sign'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/manifest-loads', [
        'transport_schedule_id' => $schedule->id,
        'generator_signer_person_id' => $generatorSigner->id,
    ])->assertCreated();

    $manifest = ManifestLoad::query()->findOrFail($response->json('manifest_load.id'));

    $this->actingAs($actor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('manifest_status');
});

// ---- startTransit(): RN-193, guarda explícita de firma completa ----

test('startTransit() rechaza (422) mientras falte cualquiera de las 2 firmas (RN-193)', function () {
    [$manifest, $generator, $gestor] = mlGeneratedManifestFixture();
    $carrierActor = mlActor(['manifest_loads.sign', 'manifest_loads.update'], $gestor->id);

    // Solo firma el conductor -- PartiallySigned, no Signed.
    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])->assertOk();

    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/start-transit")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('manifest_status');
});

test('startTransit() transiciona Signed->InTransit una vez completadas AMBAS firmas', function () {
    [$manifest, $generator, $gestor] = mlGeneratedManifestFixture();
    $carrierActor = mlActor(['manifest_loads.sign', 'manifest_loads.update'], $gestor->id);
    $generatorActor = mlActor(['manifest_loads.sign'], $generator->id);

    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])->assertOk();
    $this->actingAs($generatorActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'GENERATOR'])->assertOk();

    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/start-transit")
        ->assertOk()
        ->assertJsonPath('manifest_load.manifest_status.code', 'IN_TRANSIT');
});

// ---- cancel(): solo desde Generated/PartiallySigned ----

test('cancel() alcanzable desde Generated y escribe WorkflowLog', function () {
    [$manifest, $generator, $gestor] = mlGeneratedManifestFixture();
    $actor = mlActor(['manifest_loads.cancel'], $gestor->id);

    $this->actingAs($actor)->postJson("/api/admin/manifest-loads/{$manifest->id}/cancel")
        ->assertOk()
        ->assertJsonPath('manifest_load.manifest_status.code', 'CANCELLED');

    $log = WorkflowLog::query()
        ->where('process_type', 'MANIFEST_LOAD')
        ->where('process_id', $manifest->id)
        ->where('new_status', 'CANCELLED')
        ->first();

    expect($log)->not->toBeNull()->and($log->previous_status)->toBe('GENERATED');
});

test('cancel() alcanzable desde PartiallySigned', function () {
    [$manifest, $generator, $gestor] = mlGeneratedManifestFixture();
    $carrierActor = mlActor(['manifest_loads.sign', 'manifest_loads.cancel'], $gestor->id);

    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])->assertOk();

    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/cancel")
        ->assertOk()
        ->assertJsonPath('manifest_load.manifest_status.code', 'CANCELLED');
});

test('cancel() RECHAZA (422) desde Signed (transición inexistente)', function () {
    [$manifest, $generator, $gestor] = mlGeneratedManifestFixture();
    $carrierActor = mlActor(['manifest_loads.sign', 'manifest_loads.cancel'], $gestor->id);
    $generatorActor = mlActor(['manifest_loads.sign'], $generator->id);

    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])->assertOk();
    $this->actingAs($generatorActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'GENERATOR'])->assertOk();

    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/cancel")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('manifest_status');
});

test('cancel() RECHAZA (422) desde Draft (transición inexistente, RN de esta tarea)', function () {
    $generator = mlGeneratorOrganization();
    $gestor = mlGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$schedule] = mlScheduleFixture($generator, $gestor, $branch);
    $generatorSigner = mlPersonInOrganization($generator->id);
    $actor = mlActor(['manifest_loads.create', 'manifest_loads.cancel'], $gestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/manifest-loads', [
        'transport_schedule_id' => $schedule->id,
        'generator_signer_person_id' => $generatorSigner->id,
    ])->assertCreated();

    $manifest = ManifestLoad::query()->findOrFail($response->json('manifest_load.id'));

    $this->actingAs($actor)->postJson("/api/admin/manifest-loads/{$manifest->id}/cancel")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('manifest_status');
});

// ---- store(): unicidad de manifiesto activo por transport_schedule_id (Hallazgo Medio, revisión de seguridad Manifiesto de Cargue, 2026-07-19) ----

test('store() rechaza (422) un segundo manifiesto para el mismo transport_schedule_id mientras exista uno ACTIVO', function () {
    $generator = mlGeneratorOrganization();
    $gestor = mlGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$schedule] = mlScheduleFixture($generator, $gestor, $branch);
    $generatorSigner = mlPersonInOrganization($generator->id);
    $actor = mlActor(['manifest_loads.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/manifest-loads', [
        'transport_schedule_id' => $schedule->id,
        'generator_signer_person_id' => $generatorSigner->id,
    ])->assertCreated();

    // El primer manifiesto sigue en DRAFT (activo, no CANCELLED) -- un
    // segundo manifiesto para la MISMA programación debe rechazarse.
    $this->actingAs($actor)->postJson('/api/admin/manifest-loads', [
        'transport_schedule_id' => $schedule->id,
        'generator_signer_person_id' => $generatorSigner->id,
    ])->assertUnprocessable()->assertJsonValidationErrors('transport_schedule_id');

    expect(ManifestLoad::query()->where('transport_schedule_id', $schedule->id)->count())->toBe(1);
});

test('store() SÍ permite crear un manifiesto de reemplazo si el anterior para la misma programación fue CANCELLED', function () {
    $generator = mlGeneratorOrganization();
    $gestor = mlGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$schedule] = mlScheduleFixture($generator, $gestor, $branch);
    $generatorSigner = mlPersonInOrganization($generator->id);
    $actor = mlActor(['manifest_loads.create', 'manifest_loads.update', 'manifest_loads.cancel'], $gestor->id);

    $first = $this->actingAs($actor)->postJson('/api/admin/manifest-loads', [
        'transport_schedule_id' => $schedule->id,
        'generator_signer_person_id' => $generatorSigner->id,
    ])->assertCreated();

    $firstManifest = ManifestLoad::query()->findOrFail($first->json('manifest_load.id'));
    $this->actingAs($actor)->postJson("/api/admin/manifest-loads/{$firstManifest->id}/generate")->assertOk();
    $this->actingAs($actor)->postJson("/api/admin/manifest-loads/{$firstManifest->id}/cancel")
        ->assertOk()
        ->assertJsonPath('manifest_load.manifest_status.code', 'CANCELLED');

    expect($firstManifest->fresh()->is_active)->toBeFalse();

    $this->actingAs($actor)->postJson('/api/admin/manifest-loads', [
        'transport_schedule_id' => $schedule->id,
        'generator_signer_person_id' => $generatorSigner->id,
    ])->assertCreated();

    expect(ManifestLoad::query()->where('transport_schedule_id', $schedule->id)->count())->toBe(2);
    expect(ManifestLoad::query()->where('transport_schedule_id', $schedule->id)->where('is_active', true)->count())->toBe(1);
});

// ---- index()/show(): aislamiento (carrier + generator + platform staff) ----

test('index(): la organización Transportadora y la Generadora ven el manifiesto; una tercera organización no', function () {
    [$manifest, $generator, $gestor] = mlGeneratedManifestFixture();

    $carrierViewer = mlActor(['manifest_loads.read'], $gestor->id);
    $view = $this->actingAs($carrierViewer)->getJson('/api/admin/manifest-loads')->assertOk();
    expect($view->json('total'))->toBe(1);

    $generatorViewer = mlActor(['manifest_loads.read'], $generator->id);
    $view2 = $this->actingAs($generatorViewer)->getJson('/api/admin/manifest-loads')->assertOk();
    expect($view2->json('total'))->toBe(1);

    $foreignViewer = mlActor(['manifest_loads.read'], mlGestorOrganization()->id);
    $view3 = $this->actingAs($foreignViewer)->getJson('/api/admin/manifest-loads')->assertOk();
    expect($view3->json('total'))->toBe(0);
});

test('show(): una organización ajena recibe 403 (IDOR)', function () {
    [$manifest] = mlGeneratedManifestFixture();

    $foreignActor = mlActor(['manifest_loads.read'], mlGestorOrganization()->id);

    $this->actingAs($foreignActor)->getJson("/api/admin/manifest-loads/{$manifest->id}")->assertForbidden();
});

test('show(): el Generador (solo lectura) SÍ puede ver el manifiesto pero NO gestionar transiciones', function () {
    [$manifest, $generator, $gestor] = mlGeneratedManifestFixture();
    $generatorActor = mlActor(['manifest_loads.read'], $generator->id);

    $this->actingAs($generatorActor)->getJson("/api/admin/manifest-loads/{$manifest->id}")->assertOk();

    // Sin manifest_loads.update -- 403 aunque tuviera el permiso, el Generador
    // no es la organización carrier dueña del manifiesto.
    $generatorActorWithUpdate = mlActor(['manifest_loads.update'], $generator->id);
    $this->actingAs($generatorActorWithUpdate)->postJson("/api/admin/manifest-loads/{$manifest->id}/generate")->assertForbidden();
});

// ---- LOGÍSTICA real (RolePermissionSeeder de producción) ----

test('un actor con SOLO el rol LOGÍSTICA real completa store->generate->sign(driver)->sign(generator)->startTransit', function () {
    $generator = mlGeneratorOrganization();
    $gestor = mlGestorOrganization();
    $branch = Branch::factory()->create(['organization_id' => $generator->id]);
    [$schedule] = mlScheduleFixture($generator, $gestor, $branch);
    $generatorSigner = mlPersonInOrganization($generator->id);

    $carrierActor = mlActor(['manifest_loads.create'], $gestor->id);
    $generatorActor = mlActor(['manifest_loads.sign'], $generator->id);

    expect($carrierActor->hasRole('LOGÍSTICA'))->toBeTrue()
        ->and($carrierActor->hasRole('ADMINISTRADOR'))->toBeFalse();

    $response = $this->actingAs($carrierActor)->postJson('/api/admin/manifest-loads', [
        'transport_schedule_id' => $schedule->id,
        'generator_signer_person_id' => $generatorSigner->id,
    ])->assertCreated();

    $manifest = ManifestLoad::query()->findOrFail($response->json('manifest_load.id'));

    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/generate")
        ->assertOk()->assertJsonPath('manifest_load.manifest_status.code', 'GENERATED');

    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'DRIVER'])
        ->assertOk()->assertJsonPath('manifest_load.manifest_status.code', 'PARTIALLY_SIGNED');

    $this->actingAs($generatorActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/sign", ['signer_type' => 'GENERATOR'])
        ->assertOk()->assertJsonPath('manifest_load.manifest_status.code', 'SIGNED');

    $this->actingAs($carrierActor)->postJson("/api/admin/manifest-loads/{$manifest->id}/start-transit")
        ->assertOk()->assertJsonPath('manifest_load.manifest_status.code', 'IN_TRANSIT');
});
