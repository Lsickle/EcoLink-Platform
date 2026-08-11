<?php

use App\Models\BusinessRole;
use App\Models\GeneratorGestorRelationship;
use App\Models\GeneratorSubgestorRelationship;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use App\Models\UserRole;
use App\Models\UserStatus;
use App\Services\GeneratorBulkImportService;
use Database\Seeders\BranchTypeSeeder;
use Database\Seeders\BusinessRoleSeeder;
use Database\Seeders\OrganizationStatusSeeder;
use Illuminate\Http\UploadedFile;

// Carga Masiva de Generadores (CSV) por Subgestor/Gestor -- autoservicio
// confirmado por el usuario, 2026-08-11. Ver docblock de
// GeneratorBulkImportController/GeneratorBulkImportService.
//
// `GeneratorBulkImportService`/`UserProvisioningService::createActiveAdminForOrganization()`
// resuelven varios catálogos por código real (OrganizationStatus 'ACT',
// BusinessRole 'GENERATOR', BranchType 'ADM', UserStatus 'ACTIVE', Role
// 'ADMINISTRADOR') -- se seedan/crean explícitamente aquí, mismo criterio
// liviano que CreateAdminCommandTest (sin correr el seeder pesado completo
// de roles/permisos).
beforeEach(function () {
    $this->seed(OrganizationStatusSeeder::class);
    $this->seed(BusinessRoleSeeder::class);
    $this->seed(BranchTypeSeeder::class);
    UserStatus::query()->firstOrCreate(['code' => 'ACTIVE'], ['name' => 'Activo', 'is_system' => true, 'is_active' => true]);
    Role::query()->firstOrCreate(['code' => 'ADMINISTRADOR'], ['name' => 'Administrador', 'is_system' => true, 'is_active' => true]);
});

function gbiActor(array $codes = [], ?int $tenantOrganizationId = null): User
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

function gbiOrganizationWithBusinessRole(string $flag): Organization
{
    $organization = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create([$flag => true]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $businessRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    return $organization->fresh();
}

function gbiSubgestorOrganization(): Organization
{
    return gbiOrganizationWithBusinessRole('can_transport_waste');
}

function gbiGeneratorOrganization(string $taxId): Organization
{
    $organization = Organization::factory()->create(['tax_id' => $taxId, 'tax_id_type' => 'NIT']);
    $businessRole = BusinessRole::factory()->create(['can_generate_waste' => true]);

    OrganizationBusinessRole::query()->create([
        'organization_id' => $organization->id,
        'business_role_id' => $businessRole->id,
        'assigned_at' => now(),
        'is_active' => true,
    ]);

    return $organization->fresh();
}

function gbiCsvFile(string $csvContent): UploadedFile
{
    return UploadedFile::fake()->createWithContent('generadores.csv', $csvContent);
}

const GBI_CSV_COLUMNS = [
    'tax_id', 'tax_id_type', 'legal_name', 'trade_name', 'organization_email', 'organization_phone',
    'username', 'branch_name', 'branch_code', 'branch_address', 'environmental_license', 'license_expiration_date',
];

/**
 * Arma una fila CSV a partir de un mapa columna=>valor (columnas omitidas
 * quedan vacías) -- evita el error de contar comas a mano al escribir CSV
 * literal en los tests.
 */
function gbiCsvRow(array $values): string
{
    return implode(',', array_map(fn ($column) => (string) ($values[$column] ?? ''), GBI_CSV_COLUMNS));
}

function gbiOneNewGeneratorCsv(string $taxId = '900111222'): string
{
    return implode("\n", [
        implode(',', GBI_CSV_COLUMNS),
        gbiCsvRow(['tax_id' => $taxId, 'tax_id_type' => 'NIT', 'legal_name' => 'Generador Nuevo S.A.S.', 'branch_name' => 'Sede Principal', 'branch_code' => 'SP01', 'branch_address' => 'Calle 1 #2-3']),
        gbiCsvRow(['tax_id' => $taxId, 'tax_id_type' => 'NIT', 'legal_name' => 'Generador Nuevo S.A.S.', 'branch_name' => 'Sede Norte', 'branch_code' => 'SN01', 'branch_address' => 'Calle 4 #5-6']),
    ]);
}

// ---- Autorización ----

test('store rechaza a un actor cuya organización NO tiene can_transport_waste ni can_treat_waste', function () {
    $actingOrganization = Organization::factory()->create();
    $actor = gbiActor(['generator_subgestor_relationships.create', 'generator_gestor_relationships.create'], $actingOrganization->id);

    $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', [
        'file' => gbiCsvFile(gbiOneNewGeneratorCsv()),
    ])->assertForbidden();
});

test('store rechaza a un actor sin el permiso correspondiente aunque su organización tenga la capacidad', function () {
    $subgestor = gbiSubgestorOrganization();
    $actor = gbiActor([], $subgestor->id); // sin generator_subgestor_relationships.create

    $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', [
        'file' => gbiCsvFile(gbiOneNewGeneratorCsv()),
    ])->assertForbidden();
});

test('store (anti-role-smuggling): un tenant admin NO puede indicar on_behalf_of_organization_id -- siempre actúa desde su propio tenant', function () {
    $subgestor = gbiSubgestorOrganization();
    $otherSubgestor = gbiSubgestorOrganization();
    $actor = gbiActor(['generator_subgestor_relationships.create'], $subgestor->id);

    $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', [
        'on_behalf_of_organization_id' => $otherSubgestor->id,
        'file' => gbiCsvFile(gbiOneNewGeneratorCsv()),
    ])->assertOk();

    expect(GeneratorSubgestorRelationship::query()->where('subgestor_organization_id', $subgestor->id)->exists())->toBeTrue()
        ->and(GeneratorSubgestorRelationship::query()->where('subgestor_organization_id', $otherSubgestor->id)->exists())->toBeFalse();
});

// ---- Creación de Generador nuevo (organización + sedes + usuario) ----

test('crea la organización, sus sedes y un usuario ADMINISTRADOR ACTIVE con credenciales cuando el NIT no existe', function () {
    $subgestor = gbiSubgestorOrganization();
    $actor = gbiActor(['generator_subgestor_relationships.create'], $subgestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', [
        'file' => gbiCsvFile(gbiOneNewGeneratorCsv('900111222')),
    ])->assertOk();

    $response->assertJsonPath('created', 1)
        ->assertJsonPath('linked_existing', 0)
        ->assertJsonPath('errors', []);

    $generator = Organization::query()->where('tax_id', '900111222')->firstOrFail();
    expect($generator->legal_name)->toBe('Generador Nuevo S.A.S.')
        ->and($generator->hasCapability('can_generate_waste'))->toBeTrue()
        ->and($generator->branches()->count())->toBe(2);

    $user = $generator->users()->firstOrFail();
    expect($user->status->code)->toBe('ACTIVE')
        ->and($user->roles()->where('code', 'ADMINISTRADOR')->exists())->toBeTrue()
        // Cambio de contraseña obligatorio en el primer login (2026-08-11):
        // el actor que subió el CSV conoce esta contraseña, el Generador
        // debe cambiarla antes de poder usar el resto de la aplicación.
        ->and($user->must_change_password)->toBeTrue();

    $payload = $response->json('generators.0');
    expect($payload['user_created'])->toBeTrue()
        ->and($payload['username'])->toBe($user->username)
        ->and($payload['temporary_password'])->not->toBeEmpty();

    expect(GeneratorSubgestorRelationship::query()
        ->where('generator_organization_id', $generator->id)
        ->where('subgestor_organization_id', $subgestor->id)
        ->where('is_active', true)
        ->exists())->toBeTrue();
});

test('el usuario creado puede loguearse de verdad con el username y la contraseña temporal devueltos', function () {
    $subgestor = gbiSubgestorOrganization();
    $actor = gbiActor([], $subgestor->id);

    $handle = tmpfile();
    fwrite($handle, gbiOneNewGeneratorCsv('900111222'));
    $path = stream_get_meta_data($handle)['uri'];
    $file = new UploadedFile($path, 'generadores.csv', 'text/csv', null, true);

    $result = (new GeneratorBulkImportService)->import($file, $subgestor, $actor, null);
    $payload = $result['generators'][0];

    // EnsureFrontendRequestsAreStateful solo activa la sesión (necesaria
    // para el login web -- ver AuthController::login()) si detecta un
    // Referer/Origin en SANCTUM_STATEFUL_DOMAINS -- mismo criterio que
    // AuthTest.php > 'web login (sin device_name) autentica por sesión'.
    $this->withHeaders(['Referer' => 'http://localhost:3000'])
        ->postJson('/api/login', [
            'login' => $payload['username'],
            'password' => $payload['temporary_password'],
        ])->assertOk()->assertJsonPath('user.username', $payload['username']);
});

test('la contraseña temporal nunca se persiste en claro (password_hash queda hasheado)', function () {
    $subgestor = gbiSubgestorOrganization();
    $actor = gbiActor(['generator_subgestor_relationships.create'], $subgestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', [
        'file' => gbiCsvFile(gbiOneNewGeneratorCsv('900111222')),
    ])->assertOk();

    $payload = $response->json('generators.0');
    $generator = Organization::query()->where('tax_id', '900111222')->firstOrFail();
    $user = $generator->users()->firstOrFail();

    expect($user->getRawOriginal('password_hash'))->not->toBe($payload['temporary_password'])
        ->and(\Illuminate\Support\Facades\Hash::check($payload['temporary_password'], $user->getRawOriginal('password_hash')))->toBeTrue();
});

// ---- Deduplicación ----

test('si el NIT YA existe como Generador, NO se tocan sus datos/sedes -- solo se crea el vínculo', function () {
    $subgestor = gbiSubgestorOrganization();
    $actor = gbiActor(['generator_subgestor_relationships.create'], $subgestor->id);
    $existingGenerator = gbiGeneratorOrganization('900111222');
    $originalLegalName = $existingGenerator->legal_name;

    $response = $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', [
        'file' => gbiCsvFile(gbiOneNewGeneratorCsv('900111222')),
    ])->assertOk();

    $response->assertJsonPath('created', 0)->assertJsonPath('linked_existing', 1);

    $existingGenerator->refresh();
    expect($existingGenerator->legal_name)->toBe($originalLegalName) // NO se sobrescribió con "Generador Nuevo S.A.S."
        ->and($existingGenerator->branches()->count())->toBe(0); // NO se crearon sedes del CSV

    expect(GeneratorSubgestorRelationship::query()
        ->where('generator_organization_id', $existingGenerator->id)
        ->where('subgestor_organization_id', $subgestor->id)
        ->where('is_active', true)
        ->exists())->toBeTrue();
});

test('un NIT existente que YA tiene un usuario no recibe un usuario duplicado', function () {
    $subgestor = gbiSubgestorOrganization();
    $actor = gbiActor(['generator_subgestor_relationships.create'], $subgestor->id);
    $existingGenerator = gbiGeneratorOrganization('900111222');
    User::factory()->create(['tenant_organization_id' => $existingGenerator->id, 'organization_id' => $existingGenerator->id]);

    $response = $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', [
        'file' => gbiCsvFile(gbiOneNewGeneratorCsv('900111222')),
    ])->assertOk();

    expect($response->json('generators.0.user_created'))->toBeFalse()
        ->and($existingGenerator->users()->count())->toBe(1);
});

test('hallazgo Crítico corregido (especialista-seguridad, 2026-08-11): un NIT existente SIN ningún usuario NUNCA recibe uno nuevo por esta vía -- evita que cualquier Subgestor/Gestor tome el primer acceso de un Generador ajeno', function () {
    $subgestor = gbiSubgestorOrganization();
    $actor = gbiActor(['generator_subgestor_relationships.create'], $subgestor->id);
    $existingGenerator = gbiGeneratorOrganization('900111222');

    $response = $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', [
        'file' => gbiCsvFile(gbiOneNewGeneratorCsv('900111222')),
    ])->assertOk();

    expect($response->json('generators.0.user_created'))->toBeFalse()
        ->and($response->json('generators.0.username'))->toBeNull()
        ->and($response->json('generators.0.temporary_password'))->toBeNull()
        ->and($existingGenerator->users()->count())->toBe(0);
});

test('un NIT existente que NO es de tipo Generador se reporta como error de fila, sin vincularse', function () {
    $subgestor = gbiSubgestorOrganization();
    $actor = gbiActor(['generator_subgestor_relationships.create'], $subgestor->id);
    $nonGenerator = Organization::factory()->create(['tax_id' => '900111222', 'tax_id_type' => 'NIT']);

    $response = $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', [
        'file' => gbiCsvFile(gbiOneNewGeneratorCsv('900111222')),
    ])->assertOk();

    $response->assertJsonPath('created', 0)->assertJsonPath('linked_existing', 0);
    expect($response->json('errors'))->toHaveCount(1);
    expect(GeneratorSubgestorRelationship::query()->where('generator_organization_id', $nonGenerator->id)->exists())->toBeFalse();
});

test('recargar el mismo CSV es idempotente -- no falla, no duplica organización/usuario/vínculo', function () {
    $subgestor = gbiSubgestorOrganization();
    $actor = gbiActor(['generator_subgestor_relationships.create'], $subgestor->id);
    $csv = gbiOneNewGeneratorCsv('900111222');

    $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', ['file' => gbiCsvFile($csv)])->assertOk();
    $second = $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', ['file' => gbiCsvFile($csv)])->assertOk();

    $second->assertJsonPath('created', 0)->assertJsonPath('linked_existing', 1)->assertJsonPath('errors', []);

    $generator = Organization::query()->where('tax_id', '900111222')->firstOrFail();
    expect($generator->users()->count())->toBe(1)
        ->and(GeneratorSubgestorRelationship::query()->where('generator_organization_id', $generator->id)->count())->toBe(1);
});

// ---- Filas inválidas no bloquean el resto del archivo ----

test('una fila con columnas faltantes se reporta como error sin bloquear los demás Generadores del archivo', function () {
    $subgestor = gbiSubgestorOrganization();
    $actor = gbiActor(['generator_subgestor_relationships.create'], $subgestor->id);

    $csv = implode("\n", [
        implode(',', GBI_CSV_COLUMNS),
        gbiCsvRow(['tax_id_type' => 'NIT', 'legal_name' => 'Sin NIT', 'branch_name' => 'Sede']), // fila inválida (tax_id vacío)
        gbiCsvRow(['tax_id' => '900333444', 'tax_id_type' => 'NIT', 'legal_name' => 'Generador Válido S.A.S.', 'branch_name' => 'Sede Única']),
    ]);

    $response = $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', [
        'file' => gbiCsvFile($csv),
    ])->assertOk();

    $response->assertJsonPath('created', 1);
    expect($response->json('errors'))->toHaveCount(1);
    expect(Organization::query()->where('tax_id', '900333444')->exists())->toBeTrue();
});

// ---- Gestor directo (sin Subgestor de por medio) ----

test('cuando la organización actora es Gestor, se crea generator_gestor_relationships en vez de generator_subgestor_relationships', function () {
    $gestor = gbiOrganizationWithBusinessRole('can_treat_waste');
    $actor = gbiActor(['generator_gestor_relationships.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', [
        'file' => gbiCsvFile(gbiOneNewGeneratorCsv('900555666')),
    ])->assertOk();

    $generator = Organization::query()->where('tax_id', '900555666')->firstOrFail();
    expect(GeneratorGestorRelationship::query()->where('generator_organization_id', $generator->id)->where('gestor_organization_id', $gestor->id)->exists())->toBeTrue()
        ->and(GeneratorSubgestorRelationship::query()->where('generator_organization_id', $generator->id)->exists())->toBeFalse();
});

// ---- Rate limiting (especialista-seguridad, 2026-08-11) ----

test('el rate limiter de carga masiva (5/hora por actor) responde 429 al superarse', function () {
    $subgestor = gbiSubgestorOrganization();
    $actor = gbiActor(['generator_subgestor_relationships.create'], $subgestor->id);

    foreach (range(1, 5) as $attempt) {
        $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', [
            'file' => gbiCsvFile(gbiOneNewGeneratorCsv("90000000{$attempt}")),
        ])->assertOk();
    }

    $this->actingAs($actor)->postJson('/api/admin/generators/bulk-import', [
        'file' => gbiCsvFile(gbiOneNewGeneratorCsv('900999999')),
    ])->assertStatus(429);
});
