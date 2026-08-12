<?php

use App\Models\Branch;
use App\Models\BusinessRole;
use App\Models\GenerationFrequency;
use App\Models\GeneratorGestorRelationship;
use App\Models\GeneratorSubgestorRelationship;
use App\Models\HazardCharacteristic;
use App\Models\MeasurementUnit;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\PhysicalState;
use App\Models\Permission;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\UnCode;
use App\Models\User;
use App\Models\UserRole;
use App\Models\Waste;
use App\Models\WasteCategory;
use App\Models\WasteOperationalStatus;
use App\Models\WasteStream;
use App\Models\WasteType;
use Illuminate\Http\UploadedFile;

// Carga Masiva de Residuos (CSV) -- pedido explícito del usuario, 2026-08-11.
// Mismo patrón de test que GeneratorBulkImportControllerTest.php, prefijo
// `wbi` en los helpers para no colisionar con `wasteActor()`/`gbiActor()` de
// otros archivos de test (cada archivo de este proyecto declara los suyos).

function wbiActor(array $codes = [], ?int $tenantOrganizationId = null): User
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

function wbiPlatformStaffActor(array $codes = []): User
{
    $platform = Organization::query()->where('is_platform_tenant', true)->first()
        ?? Organization::factory()->create(['is_platform_tenant' => true]);

    return wbiActor($codes, $platform->id);
}

function wbiCsvFile(string $content): UploadedFile
{
    return UploadedFile::fake()->createWithContent('residuos.csv', $content);
}

const WBI_CSV_COLUMNS = [
    'name', 'branch_code', 'waste_category_code', 'physical_state_code', 'measurement_unit_code',
    'quantity', 'average_weight', 'generation_frequency_code', 'generation_date',
    'hazard_characteristics_codes', 'waste_stream_codes', 'un_code_codes',
    'code', 'description', 'internal_reference', 'operational_notes',
    'requires_special_transport', 'requires_special_ppe',
];

function wbiCsvRow(array $values): string
{
    return implode(',', array_map(fn ($column) => (string) ($values[$column] ?? ''), WBI_CSV_COLUMNS));
}

function wbiCsv(array ...$rows): string
{
    return implode("\n", [implode(',', WBI_CSV_COLUMNS), ...array_map(wbiCsvRow(...), $rows)]);
}

beforeEach(function () {
    WasteType::query()->firstOrCreate(['code' => 'OPERATIONAL'], ['name' => 'Operacional', 'is_system' => true, 'is_active' => true]);
    MeasurementUnit::query()->firstOrCreate(['code' => 'KG'], ['name' => 'Kilogramo', 'is_system' => true, 'is_active' => true]);
    WasteOperationalStatus::query()->firstOrCreate(['code' => 'ACTIVE'], ['name' => 'Activo', 'is_system' => true, 'is_active' => true]);
});

// ---- Autoservicio ----

test('un Generador declara masivamente sus propios residuos', function () {
    $organization = Organization::factory()->create();
    $actor = wbiActor(['wastes.create'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'file' => wbiCsvFile(wbiCsv(
            ['name' => 'Chatarra Metálica'],
            ['name' => 'Aceite Usado'],
        )),
    ])->assertOk();

    $response->assertJsonPath('created', 2)->assertJsonPath('errors', []);
    expect(Waste::query()->where('organization_id', $organization->id)->count())->toBe(2);
});

test('un Subgestor SIN capacidad can_generate_waste declara residuos para sí mismo igual que cualquier otro rol', function () {
    $subgestor = Organization::factory()->create();
    $businessRole = BusinessRole::factory()->create(['can_transport_waste' => true, 'can_generate_waste' => false]);
    OrganizationBusinessRole::query()->create(['organization_id' => $subgestor->id, 'business_role_id' => $businessRole->id, 'assigned_at' => now(), 'is_active' => true]);
    $actor = wbiActor(['wastes.create'], $subgestor->id);

    $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo Propio del Subgestor'])),
    ])->assertOk()->assertJsonPath('created', 1);

    expect(Waste::query()->where('organization_id', $subgestor->id)->where('name', 'Residuo Propio del Subgestor')->exists())->toBeTrue();
});

test('sin el permiso wastes.create responde 403', function () {
    $actor = wbiActor([], Organization::factory()->create()->id);

    $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo'])),
    ])->assertForbidden();
});

// ---- A nombre de un Generador vinculado ----

test('un Subgestor con relación ACTIVA declara residuos a nombre del Generador vinculado', function () {
    $subgestor = Organization::factory()->create();
    $generator = Organization::factory()->create();
    GeneratorSubgestorRelationship::factory()->create([
        'generator_organization_id' => $generator->id, 'subgestor_organization_id' => $subgestor->id,
    ]);
    $actor = wbiActor(['wastes.create'], $subgestor->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'on_behalf_of_organization_id' => $generator->id,
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo del Generador'])),
    ])->assertOk();

    $response->assertJsonPath('created', 1);
    expect(Waste::query()->where('organization_id', $generator->id)->where('name', 'Residuo del Generador')->exists())->toBeTrue();
});

test('un Gestor con relación ACTIVA declara residuos a nombre del Generador vinculado', function () {
    $gestor = Organization::factory()->create();
    $generator = Organization::factory()->create();
    GeneratorGestorRelationship::factory()->create([
        'generator_organization_id' => $generator->id, 'gestor_organization_id' => $gestor->id,
    ]);
    $actor = wbiActor(['wastes.create'], $gestor->id);

    $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'on_behalf_of_organization_id' => $generator->id,
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo del Generador (Gestor)'])),
    ])->assertOk()->assertJsonPath('created', 1);
});

test('un Subgestor SIN relación activa hacia el Generador indicado recibe 403', function () {
    $subgestor = Organization::factory()->create();
    $generator = Organization::factory()->create();
    $actor = wbiActor(['wastes.create'], $subgestor->id);

    $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'on_behalf_of_organization_id' => $generator->id,
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo No Autorizado'])),
    ])->assertForbidden();

    expect(Waste::query()->where('organization_id', $generator->id)->exists())->toBeFalse();
});

test('una relación REVOCADA ya no habilita declarar a nombre del Generador', function () {
    $subgestor = Organization::factory()->create();
    $generator = Organization::factory()->create();
    GeneratorSubgestorRelationship::factory()->revoked()->create([
        'generator_organization_id' => $generator->id, 'subgestor_organization_id' => $subgestor->id,
    ]);
    $actor = wbiActor(['wastes.create'], $subgestor->id);

    $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'on_behalf_of_organization_id' => $generator->id,
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo'])),
    ])->assertForbidden();
});

test('platform staff exige on_behalf_of_organization_id explícito (422 si falta)', function () {
    $actor = wbiPlatformStaffActor(['wastes.create']);

    $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo'])),
    ])->assertUnprocessable()->assertJsonValidationErrors('on_behalf_of_organization_id');
});

// ---- Peligrosidad -> ficha de seguridad ----

test('una fila con características de peligrosidad marca requires_sds=true automáticamente y calcula waste_danger', function () {
    $organization = Organization::factory()->create();
    $actor = wbiActor(['wastes.create'], $organization->id);
    HazardCharacteristic::factory()->create(['code' => 'COR', 'risk_level' => 5]);
    HazardCharacteristic::factory()->create(['code' => 'EXP', 'risk_level' => 9]);

    $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo Peligroso', 'hazard_characteristics_codes' => 'COR;EXP'])),
    ])->assertOk()->assertJsonPath('created', 1);

    $waste = Waste::query()->where('name', 'Residuo Peligroso')->firstOrFail();
    expect($waste->requires_sds)->toBeTrue()
        ->and($waste->waste_danger)->toBe('EXP')
        ->and($waste->hazardCharacteristics()->count())->toBe(2);
});

test('una fila SIN características de peligrosidad NO fuerza requires_sds', function () {
    $organization = Organization::factory()->create();
    $actor = wbiActor(['wastes.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo Inofensivo'])),
    ])->assertOk();

    $waste = Waste::query()->where('name', 'Residuo Inofensivo')->firstOrFail();
    expect($waste->requires_sds)->toBeFalse();
});

// ---- Resolución de catálogos por código ----

test('resuelve branch_code/waste_category_code/physical_state_code/measurement_unit_code/generation_frequency_code a sus ids', function () {
    $organization = Organization::factory()->create();
    $branch = Branch::factory()->create(['organization_id' => $organization->id, 'code' => 'SEDE01']);
    $category = WasteCategory::factory()->create(['code' => 'INDUSTRIAL']);
    $physicalState = PhysicalState::factory()->create(['code' => 'SOLIDO']);
    MeasurementUnit::query()->firstOrCreate(['code' => 'TON'], ['name' => 'Tonelada', 'is_system' => true, 'is_active' => true]);
    $frequency = GenerationFrequency::factory()->create(['code' => 'DAILY']);
    $actor = wbiActor(['wastes.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'file' => wbiCsvFile(wbiCsv([
            'name' => 'Residuo Completo', 'branch_code' => 'SEDE01', 'waste_category_code' => 'INDUSTRIAL',
            'physical_state_code' => 'SOLIDO', 'measurement_unit_code' => 'TON', 'quantity' => '12.5',
            'generation_frequency_code' => 'DAILY',
        ])),
    ])->assertOk()->assertJsonPath('created', 1);

    $waste = Waste::query()->where('name', 'Residuo Completo')->firstOrFail();
    expect($waste->branch_id)->toBe($branch->id)
        ->and($waste->waste_category_id)->toBe($category->id)
        ->and($waste->physical_state_id)->toBe($physicalState->id)
        ->and($waste->measurementUnit->code)->toBe('TON')
        ->and((float) $waste->quantity)->toBe(12.5)
        ->and($waste->generation_frequency_id)->toBe($frequency->id);
});

test('resuelve waste_stream_codes/un_code_codes (separados por ;) y sincroniza los pivotes', function () {
    $organization = Organization::factory()->create();
    $streamA = WasteStream::factory()->create(['code' => 'Y1']);
    $streamB = WasteStream::factory()->create(['code' => 'Y2']);
    $unCode = UnCode::factory()->create(['code' => 'UN1230']);
    $actor = wbiActor(['wastes.create'], $organization->id);

    $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'file' => wbiCsvFile(wbiCsv([
            'name' => 'Residuo Clasificado', 'waste_stream_codes' => 'Y1;Y2', 'un_code_codes' => 'UN1230',
        ])),
    ])->assertOk()->assertJsonPath('created', 1);

    $waste = Waste::query()->where('name', 'Residuo Clasificado')->firstOrFail();
    expect($waste->wasteStreams()->pluck('waste_streams.id')->sort()->values()->all())->toBe([$streamA->id, $streamB->id])
        ->and($waste->unCodes()->pluck('un_codes.id')->all())->toBe([$unCode->id]);
});

// Hallazgo Medio (especialista-seguridad, 2026-08-12): la accesibilidad de
// waste_stream_codes/un_code_codes se evalúa contra la organización DUEÑA
// del residuo (`$actingOrganizationId`, el Generador cuando se declara "a
// nombre de"), NUNCA contra el actor real -- sin esto, un Subgestor podría
// etiquetar el residuo de un Generador con una corriente PRIVADA del
// Subgestor, visible luego para el Generador aunque nunca tendría acceso a
// ese catálogo si lo consultara directamente.
test('un Subgestor NO puede usar sus propias corrientes/códigos UN PRIVADOS al declarar a nombre de un Generador vinculado', function () {
    $subgestor = Organization::factory()->create();
    $generator = Organization::factory()->create();
    GeneratorSubgestorRelationship::factory()->create([
        'generator_organization_id' => $generator->id, 'subgestor_organization_id' => $subgestor->id,
    ]);
    $actor = wbiActor(['wastes.create'], $subgestor->id);
    WasteStream::factory()->create(['code' => 'Y-PRIVADO-SUBGESTOR', 'tenant_organization_id' => $subgestor->id]);

    $response = $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'on_behalf_of_organization_id' => $generator->id,
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo Con Corriente Ajena', 'waste_stream_codes' => 'Y-PRIVADO-SUBGESTOR'])),
    ])->assertOk();

    $response->assertJsonPath('created', 0);
    expect($response->json('errors.0.message'))->toContain('no son accesibles');
});

test('el mismo Subgestor SÍ puede usar esa corriente privada al declarar para SÍ MISMO', function () {
    $subgestor = Organization::factory()->create();
    $actor = wbiActor(['wastes.create'], $subgestor->id);
    $stream = WasteStream::factory()->create(['code' => 'Y-PRIVADO-SUBGESTOR', 'tenant_organization_id' => $subgestor->id]);

    $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo Propio Con Corriente Privada', 'waste_stream_codes' => 'Y-PRIVADO-SUBGESTOR'])),
    ])->assertOk()->assertJsonPath('created', 1);

    $waste = Waste::query()->where('name', 'Residuo Propio Con Corriente Privada')->firstOrFail();
    expect($waste->wasteStreams()->pluck('waste_streams.id')->all())->toBe([$stream->id]);
});

// ---- Auditoría (especialista-seguridad, 2026-08-12) ----

test('un intento SIN relación activa hacia on_behalf_of_organization_id queda registrado como SecurityLog FAILURE', function () {
    $subgestor = Organization::factory()->create();
    $generator = Organization::factory()->create();
    $actor = wbiActor(['wastes.create'], $subgestor->id);

    $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'on_behalf_of_organization_id' => $generator->id,
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo No Autorizado'])),
    ])->assertForbidden();

    $log = \App\Models\SecurityLog::query()->where('event_type', 'WASTE_BULK_IMPORT_EXECUTED')->where('result', 'FAILURE')->first();
    expect($log)->not->toBeNull()
        ->and($log->user_id)->toBe($actor->id)
        ->and($log->metadata['on_behalf_of_organization_id'])->toBe($generator->id);
});

// ---- Errores por fila (no abortan el archivo) ----

test('un código de catálogo inválido genera un error de fila SIN abortar el resto del archivo', function () {
    $organization = Organization::factory()->create();
    $actor = wbiActor(['wastes.create'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'file' => wbiCsvFile(wbiCsv(
            ['name' => 'Residuo Válido'],
            ['name' => 'Residuo Con Categoría Inválida', 'waste_category_code' => 'NO_EXISTE'],
        )),
    ])->assertOk();

    $response->assertJsonPath('created', 1);
    expect($response->json('errors'))->toHaveCount(1)
        ->and($response->json('errors.0.row'))->toBe(3);
    expect(Waste::query()->where('organization_id', $organization->id)->count())->toBe(1);
});

test('un code duplicado en la misma organización genera un error de fila amigable', function () {
    $organization = Organization::factory()->create();
    Waste::factory()->create(['organization_id' => $organization->id, 'code' => 'RES-001']);
    $actor = wbiActor(['wastes.create'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo Duplicado', 'code' => 'RES-001'])),
    ])->assertOk();

    $response->assertJsonPath('created', 0);
    expect($response->json('errors.0.message'))->toContain('código en la organización');
});

test('name faltante en una fila genera error de fila', function () {
    $organization = Organization::factory()->create();
    $actor = wbiActor(['wastes.create'], $organization->id);

    $response = $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'file' => wbiCsvFile(implode("\n", [implode(',', WBI_CSV_COLUMNS), wbiCsvRow(['name' => ''])])),
    ])->assertOk();

    $response->assertJsonPath('created', 0);
    expect($response->json('errors'))->toHaveCount(1);
});

// ---- Rate limiting ----

test('el rate limiter de carga masiva de residuos (5/hora por actor) responde 429 al superarse', function () {
    $organization = Organization::factory()->create();
    $actor = wbiActor(['wastes.create'], $organization->id);

    foreach (range(1, 5) as $attempt) {
        $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
            'file' => wbiCsvFile(wbiCsv(['name' => "Residuo {$attempt}"])),
        ])->assertOk();
    }

    $this->actingAs($actor)->postJson('/api/admin/wastes/bulk-import', [
        'file' => wbiCsvFile(wbiCsv(['name' => 'Residuo 6'])),
    ])->assertStatus(429);
});
