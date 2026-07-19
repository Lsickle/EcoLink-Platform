<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\InvitationRequestController;
use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\OrganizationContact;
use App\Models\OrganizationStatus;
use App\Models\Person;
use App\Models\SecurityLog;
use App\Models\User;
use Database\Seeders\PlatformOrganizationSeeder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * CRUD de Organizaciones vs. Figma -- pantalla EXCLUSIVA de platform staff
 * (mismo criterio que {@see InvitationRequestController}:
 * `$request->user()->isPlatformStaff()`, `abort_unless(...)`, SIN Policy de
 * modelo). Un admin de una organización cliente no gestiona el listado de
 * organizaciones -- solo el staff de la organización plataforma (EcoLink,
 * `organizations.is_platform_tenant=true`, D-CER-04).
 *
 * "Tipo de Organización" (Figma) = `business_roles` YA CONSTRUIDO
 * (`BusinessRole`/`organization_business_roles`/`OrganizationBusinessRole`
 * -- SIN SoftDeletes, revocación solo vía `is_active=false`, ver AVISO en
 * `OrganizationBusinessRole`). `assignBusinessRole()`/`revokeBusinessRole()`
 * calcan EXACTAMENTE el patrón `PermissionController::assignToRole()`/
 * `revokeFromRole()`.
 *
 * `Zona Horaria`/`Moneda`/`Tipo de Identificación`/`Tamaño Empresarial`/
 * `Nivel de Riesgo` son listas de validación FIJAS, SIN tabla en BD --
 * validadas con `Rule::in([...])` contra arrays fijos en este controller,
 * no catálogos nuevos.
 *
 * GAP de esquema, declarado explícitamente (no reinterpretado en silencio):
 * `organizations.tax_id` NO tiene ninguna restricción UNIQUE a nivel de base
 * de datos hoy -- ni simple ni compuesta con `tax_id_type` (confirmado
 * leyendo la migración `create_organizations_table` y el docblock de
 * {@see PlatformOrganizationSeeder}, que documenta el
 * mismo hueco). RN-002/T-04 documentan la intención de unicidad compuesta
 * `(tax_id, tax_id_type)`, pero solo como regla de negocio, nunca aplicada
 * como constraint real. `store()`/`update()` validan esa unicidad SOLO a
 * nivel de aplicación (`Rule::unique('organizations', 'tax_id')->where(...)`
 * acotado por `tax_id_type`) -- queda una ventana de condición de carrera
 * entre dos requests concurrentes que el código de aplicación no puede
 * cerrar sin una migración que agregue el índice único compuesto real
 * (fuera de alcance de este lote, señalado en el resumen entregado).
 *
 * GAP de negocio, declarado explícitamente: `organizations.risk_level` tiene
 * `DEFAULT 'BAJO'` (mayúscula) en la migración, pero el resto del sistema
 * (`RoleController::riskLevel()`) usa `bajo/medio/alto/critico` en
 * minúscula para el mismo concepto. `store()`/`update()` normalizan
 * explícitamente a minúscula y NUNCA dejan que el DEFAULT de la columna se
 * aplique sin pasar por esa normalización -- ver comentario en `store()`.
 */
class OrganizationController extends Controller
{
    use LogsSecurityEvents;

    private const TAX_ID_TYPES = ['NIT', 'CC', 'CE', 'Pasaporte', 'Tax ID'];

    private const COMPANY_SIZES = ['Micro', 'Pequeña', 'Mediana', 'Grande'];

    private const RISK_LEVELS = ['bajo', 'medio', 'alto', 'critico'];

    private const TIMEZONES = ['America/Bogota', 'America/Mexico_City', 'America/New_York', 'UTC'];

    private const CURRENCIES = ['COP', 'USD', 'EUR'];

    private const BUSINESS_ROLE_EVENTS = ['ORGANIZATION_CREATED', 'ORGANIZATION_UPDATED', 'ORGANIZATION_ACTIVATED', 'ORGANIZATION_DEACTIVATED', 'BUSINESS_ROLE_ASSIGNED', 'BUSINESS_ROLE_REVOKED'];

    /**
     * Filtros: `search` (ILIKE legal_name/trade_name/tax_id), `status`
     * (código de organization_statuses), `business_role` (código, vía
     * `whereHas` referenciando la columna del pivote ya unida -- NUNCA
     * `wherePivot()` dentro de `whereHas()`, ver AVISO ya documentado en
     * `RoleController::index()`/`PermissionController` sobre por qué
     * `wherePivot()` no existe ahí), `department`/`municipality` (vía
     * sedes activas), `sort`/`direction` con whitelist. `primary_branch`
     * se resuelve sin N+1 vía `Organization::primaryBranch()` (`hasOne`
     * `ofMany`), eager-cargada una sola vez para toda la página.
     */
    public function index(Request $request)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');

        $search = $request->input('search');
        $status = $request->input('status');
        $businessRole = $request->input('business_role');
        $department = $request->input('department');
        $municipality = $request->input('municipality');

        $sortableColumns = ['legal_name', 'tax_id', 'created_at', 'is_active'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'legal_name';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $organizations = Organization::query()
            ->with([
                'status',
                'businessRoles' => fn ($query) => $query->wherePivot('is_active', true),
                'primaryBranch.municipality',
                'primaryBranch.department',
            ])
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('legal_name', 'ILIKE', "%{$search}%")
                        ->orWhere('trade_name', 'ILIKE', "%{$search}%")
                        ->orWhere('tax_id', 'ILIKE', "%{$search}%");
                });
            })
            ->when($status, fn ($query) => $query->whereHas('status', fn ($query) => $query->where('code', $status)))
            ->when(
                $businessRole,
                fn ($query) => $query->whereHas(
                    'businessRoles',
                    fn ($query) => $query->where('code', $businessRole)->where('organization_business_roles.is_active', true),
                ),
            )
            ->when(
                $department,
                fn ($query) => $query->whereHas('branches', fn ($query) => $query->where('is_active', true)->where('department_id', $department)),
            )
            ->when(
                $municipality,
                fn ($query) => $query->whereHas('branches', fn ($query) => $query->where('is_active', true)->where('municipality_id', $municipality)),
            )
            ->orderBy($sort, $direction)
            ->paginate($request->integer('per_page', 15));

        $organizations->getCollection()->transform(fn (Organization $organization) => $this->transformOrganization($organization));

        return response()->json([
            ...$organizations->toArray(),
            'kpis' => $this->statusKpis(),
        ]);
    }

    public function show(Request $request, Organization $organization)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');

        $organization->load([
            'status',
            'businessRoles' => fn ($query) => $query->wherePivot('is_active', true),
            'createdBy:id,username',
            'primaryBranch.municipality',
            'primaryBranch.department',
        ]);

        $organization->loadCount([
            'branches' => fn ($query) => $query->where('is_active', true),
            // D-P02 / L-08: `people()` (HasMany sobre `people.organization_id`,
            // 1:1) se reemplazó por `contacts()` (BelongsToMany vía
            // `organization_contacts`) -- se cuenta por vínculo ACTIVO del
            // pivote, no por `Person.is_active` (ese booleano describe a la
            // persona, no la vigencia del vínculo).
            'contacts' => fn ($query) => $query->where('organization_contacts.is_active', true),
            // esquema-bd: users tiene tanto `is_active` (booleano) como
            // `user_status_id` -- para esta card se cuenta por ESTADO
            // (código ACTIVE), no por el booleano, a pedido explícito del
            // plan de este lote.
            'users' => fn ($query) => $query->whereHas('status', fn ($query) => $query->where('code', 'ACTIVE')),
        ]);

        // `createdBy` eager-cargada arriba -- $organization->toArray()
        // (dentro de transformOrganization()) ya sobreescribe la columna
        // cruda `created_by` (FK entera) con el objeto `{id, username}`,
        // porque `relationsToArray()` se mezcla DESPUÉS de
        // `attributesToArray()` en `Model::toArray()`.
        $data = $this->transformOrganization($organization);
        $data['branches_count'] = $organization->branches_count;
        $data['contacts_count'] = $organization->contacts_count;
        $data['users_count'] = $organization->users_count;

        return response()->json(['organization' => $data]);
    }

    public function store(Request $request)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');

        $data = $request->validate($this->validationRules($request));

        // GAP de negocio (ver docblock de clase): el DEFAULT real de
        // `organizations.risk_level` en la migración es 'BAJO' (mayúscula),
        // inconsistente con el resto del sistema. Se fija explícitamente en
        // minúscula aquí en vez de confiar en ese DEFAULT.
        $data['risk_level'] = strtolower($data['risk_level'] ?? 'bajo');
        $data['is_active'] = $data['is_active'] ?? true;
        // Mismo DEFAULT que la columna real (migración) y que el mock de
        // Figma (toggle "Campos Personalizados" encendido por defecto).
        $data['custom_fields_enabled'] = $data['custom_fields_enabled'] ?? true;

        $businessRoleIds = $data['business_role_ids'] ?? [];
        unset($data['business_role_ids']);

        // Hallazgo Bajo (especialista-seguridad, 2026-07-15): `Rule::unique()`
        // arriba cierra el caso normal con un 422 legible, pero deja la
        // ventana real de carrera (dos requests concurrentes pasan la
        // validación antes de que cualquiera haga INSERT) sin capturar --
        // sin este catch, la segunda request recibiría un 500 genérico de
        // violación del índice único parcial en vez de un 422 consistente
        // con el resto de la validación de este mismo campo.
        try {
            $organization = DB::transaction(function () use ($data, $businessRoleIds, $request) {
                $organization = Organization::query()->create([
                    ...$data,
                    'created_by' => $request->user()->id,
                    'updated_by' => $request->user()->id,
                ]);

                $this->syncBusinessRoles($organization, $businessRoleIds, $request->user());

                return $organization;
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages([
                'tax_id' => ['Ya existe una organización con este NIT/identificación tributaria.'],
            ]);
        }

        $this->logSecurityEvent(
            $request, 'ORGANIZATION_CREATED', 'SUCCESS',
            "Organización '{$organization->legal_name}' creada.", $request->user(),
            ['organization_id' => $organization->id],
        );

        $organization->load(['status', 'businessRoles' => fn ($query) => $query->wherePivot('is_active', true)]);

        return response()->json(['organization' => $this->transformOrganization($organization)], 201);
    }

    /**
     * Mismas reglas que `store()` MENOS `tax_id`/`tax_id_type` -- no
     * editables tras creación. Al no estar en `$rules`, `validate()` las
     * ignora en silencio si vienen en el payload (nunca falla por su
     * presencia, nunca las persiste).
     */
    public function update(Request $request, Organization $organization)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');

        $rules = $this->validationRules($request);
        unset($rules['tax_id'], $rules['tax_id_type']);
        $rules['parent_organization_id'][] = Rule::notIn([$organization->id]);

        $data = $request->validate($rules);

        // Hallazgo Medio (especialista-seguridad, 2026-07-15): la
        // autorreferencia directa ya la bloquea `Rule::notIn()` arriba,
        // pero un ciclo INDIRECTO (A es matriz de B, B es matriz de A; o
        // cadenas más largas) no estaba cubierto -- relevante porque RN-188
        // (visibilidad matriz→hijas, todavía sin implementar) recorrerá
        // esta cadena, y un ciclo la volvería infinita. Tope de 20 niveles:
        // suficiente para cualquier jerarquía real, evita que este propio
        // chequeo entre en bucle si ya existiera un ciclo previo a este fix.
        if (! empty($data['parent_organization_id'])) {
            $ancestorId = $data['parent_organization_id'];
            for ($depth = 0; $depth < 20 && $ancestorId !== null; $depth++) {
                if ($ancestorId === $organization->id) {
                    throw ValidationException::withMessages([
                        'parent_organization_id' => ['La organización matriz seleccionada crearía un ciclo de jerarquía.'],
                    ]);
                }

                $ancestorId = Organization::query()->whereKey($ancestorId)->value('parent_organization_id');
            }
        }

        if (array_key_exists('risk_level', $data) && $data['risk_level'] !== null) {
            $data['risk_level'] = strtolower($data['risk_level']);
        }

        $businessRoleIds = $data['business_role_ids'] ?? null;
        unset($data['business_role_ids']);

        DB::transaction(function () use ($organization, $data, $businessRoleIds, $request) {
            $organization->fill($data);
            $organization->updated_by = $request->user()->id;
            $organization->save();

            if ($businessRoleIds !== null) {
                $this->syncBusinessRoles($organization, $businessRoleIds, $request->user());
            }
        });

        $this->logSecurityEvent(
            $request, 'ORGANIZATION_UPDATED', 'SUCCESS',
            "Organización '{$organization->legal_name}' modificada.", $request->user(),
            ['organization_id' => $organization->id],
        );

        $organization->load(['status', 'businessRoles' => fn ($query) => $query->wherePivot('is_active', true)]);

        return response()->json(['organization' => $this->transformOrganization($organization)]);
    }

    /**
     * `is_active` es una columna booleana INDEPENDIENTE de
     * `organization_status_id` (esquema-bd: `organizations.is_active` no
     * deriva de la fila de `organization_statuses`) -- togglearla aquí no
     * cambia el estado del catálogo.
     */
    public function activate(Request $request, Organization $organization)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');

        $organization->forceFill(['is_active' => true, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'ORGANIZATION_ACTIVATED', 'SUCCESS',
            "Organización '{$organization->legal_name}' activada.", $request->user(),
            ['organization_id' => $organization->id],
        );

        return response()->json(['organization' => $organization->fresh()]);
    }

    public function deactivate(Request $request, Organization $organization)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');

        $organization->forceFill(['is_active' => false, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'ORGANIZATION_DEACTIVATED', 'SUCCESS',
            "Organización '{$organization->legal_name}' desactivada.", $request->user(),
            ['organization_id' => $organization->id],
        );

        return response()->json(['organization' => $organization->fresh()]);
    }

    /**
     * Tab "Sedes" -- solo lectura, ya gateada a platform staff arriba. Sin
     * filtro adicional (pedido explícito del plan).
     */
    public function branches(Request $request, Organization $organization)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');

        $branches = $organization->branches()->with('branchType')->paginate($request->integer('per_page', 15));

        return response()->json($branches);
    }

    /**
     * Tab "Contactos" (D-P02 / L-08). A DIFERENCIA del resto de este
     * controller, acceso DUAL -- platform staff ve los contactos de
     * CUALQUIER organización, un admin de tenant solo los de la SUYA
     * (`$actor->tenant_organization_id`). `has_user_account` se deriva de
     * `Person::user()` (HasOne) precargada con `with('user:id,person_id')`
     * -- evita una query `exists()` por fila (N+1). Expone también los
     * atributos del vínculo (`organization_contact_id`, `branch_id`,
     * `position_title`, `relationship_type`, `is_primary`) desde el pivote.
     */
    public function contacts(Request $request, Organization $organization)
    {
        $actor = $request->user();
        // Hallazgo Alto (especialista-seguridad, 2026-07-15): faltaba el
        // chequeo de permiso RBAC -- BranchController::contacts() y
        // searchContacts() sí lo tienen, este método quedaba abierto a
        // cualquier usuario autenticado del tenant sin importar sus
        // permisos asignados.
        Gate::authorize('viewAny', OrganizationContact::class);
        abort_unless(
            $actor->isPlatformStaff() || $organization->id === $actor->tenant_organization_id,
            403,
            'No tiene acceso a los contactos de esta organización.',
        );

        $contacts = $organization->contacts()->with('user:id,person_id')->paginate($request->integer('per_page', 15));

        $contacts->getCollection()->transform(function (Person $person) {
            $data = $person->toArray();
            $data['has_user_account'] = $person->user !== null;
            $data['organization_contact_id'] = $person->pivot->id;
            $data['branch_id'] = $person->pivot->branch_id;
            $data['position_title'] = $person->pivot->position_title;
            $data['relationship_type'] = $person->pivot->relationship_type;
            $data['is_primary'] = $person->pivot->is_primary;
            $data['start_date'] = $person->pivot->start_date;
            $data['link_is_active'] = $person->pivot->is_active;
            unset($data['user'], $data['pivot']);

            return $data;
        });

        return response()->json($contacts);
    }

    /**
     * Vincula un contacto NUEVO o EXISTENTE a la organización -- CU-003.5 /
     * D-P02. `existing_contact_id` reutiliza una `Person` ya registrada
     * (permite que la MISMA persona sea contacto de varias organizaciones a
     * la vez, cada vínculo con su propio cargo/sede); si no viene, crea una
     * `Person` nueva dentro de la misma transacción. `branch_id`, si viene,
     * DEBE pertenecer a esta organización -- se valida explícitamente
     * (rechaza con 422 si no) porque `exists:branches,id` por sí solo no
     * puede expresar esa restricción compuesta.
     */
    public function storeContact(Request $request, Organization $organization)
    {
        $actor = $request->user();
        Gate::authorize('create', OrganizationContact::class);
        abort_unless(
            $actor->isPlatformStaff() || $organization->id === $actor->tenant_organization_id,
            403,
            'No tiene acceso a los contactos de esta organización.',
        );

        $data = $request->validate([
            'existing_contact_id' => ['nullable', 'integer', 'exists:people,id'],
            'document_type' => ['required_without:existing_contact_id', 'string', 'max:20'],
            'document_number' => ['required_without:existing_contact_id', 'string', 'max:50'],
            'first_name' => ['required_without:existing_contact_id', 'string', 'max:100'],
            'last_name' => ['required_without:existing_contact_id', 'string', 'max:100'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'position_title' => ['nullable', 'string', 'max:150'],
            'relationship_type' => ['nullable', 'string', Rule::in(['Empleado', 'Consultor', 'Externo'])],
            'is_primary' => ['sometimes', 'boolean'],
        ]);

        $this->assertBranchBelongsToOrganization($data['branch_id'] ?? null, $organization);

        // Hallazgo Crítico (especialista-seguridad, 2026-07-15): `exists:people,id`
        // solo confirma que la Person existe en TODO el sistema, no que el
        // actor tenga algún derecho sobre ella -- un admin de tenant podía
        // iterar ids secuenciales y vincular (y luego leer la PII completa
        // de) cualquier persona, incluida una vinculada exclusivamente a
        // OTRO tenant. Mismo criterio de "conocida" que ya usa
        // `searchContacts()`: solo se puede reutilizar una persona que YA
        // tiene al menos un vínculo con una organización del tenant del
        // actor (o cualquiera, si es platform staff).
        if (! empty($data['existing_contact_id']) && ! $actor->isPlatformStaff()) {
            $isKnownContact = Person::query()
                ->whereKey($data['existing_contact_id'])
                ->whereHas('organizationLinks', fn ($query) => $query->where('organization_id', $actor->tenant_organization_id))
                ->exists();

            if (! $isKnownContact) {
                throw ValidationException::withMessages([
                    'existing_contact_id' => ['La persona indicada no pertenece a su organización.'],
                ]);
            }
        }

        try {
            $organizationContact = DB::transaction(function () use ($data, $organization, $actor) {
                if (! empty($data['existing_contact_id'])) {
                    $person = Person::query()->findOrFail($data['existing_contact_id']);
                } else {
                    $person = new Person([
                        'document_type' => $data['document_type'],
                        'document_number' => $data['document_number'],
                        'first_name' => $data['first_name'],
                        'last_name' => $data['last_name'],
                        'email' => $data['email'] ?? null,
                        'phone' => $data['phone'] ?? null,
                    ]);
                    $person->created_by = $actor->id;
                    $person->updated_by = $actor->id;
                    $person->save();
                }

                // Hallazgo Medio (especialista-seguridad, 2026-07-15): los
                // índices únicos parciales de `organization_contacts` no
                // filtran por `is_active` -- revocar un vínculo y luego
                // volver a vincular a la misma persona con la misma
                // organización/sede (escenario normal de negocio: un
                // consultor que vuelve) violaba la constraint con un
                // `create()` ciego. Se reactiva la fila existente
                // (activa o inactiva) en vez de crear una nueva.
                $existingLink = OrganizationContact::query()
                    ->where('contact_id', $person->id)
                    ->where('organization_id', $organization->id)
                    ->where('branch_id', $data['branch_id'] ?? null)
                    ->first();

                $attributes = [
                    'tenant_organization_id' => $organization->id,
                    'position_title' => $data['position_title'] ?? null,
                    'relationship_type' => $data['relationship_type'] ?? null,
                    'is_primary' => $data['is_primary'] ?? false,
                    'start_date' => now()->toDateString(),
                    'is_active' => true,
                    'updated_by' => $actor->id,
                ];

                if ($existingLink) {
                    $existingLink->fill($attributes)->save();

                    return $existingLink;
                }

                return OrganizationContact::query()->create([
                    ...$attributes,
                    'contact_id' => $person->id,
                    'organization_id' => $organization->id,
                    'branch_id' => $data['branch_id'] ?? null,
                    'created_by' => $actor->id,
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            // Hallazgo Medio (especialista-seguridad, 2026-07-15): ventana
            // residual de carrera (dos requests concurrentes) -- mismo
            // patrón ya establecido en OrganizationController::store().
            throw ValidationException::withMessages([
                'existing_contact_id' => ['Ya existe un vínculo activo para esta persona, organización y sucursal.'],
            ]);
        }

        $this->logSecurityEvent(
            $request, 'CONTACT_LINKED', 'SUCCESS',
            "Contacto vinculado a la organización '{$organization->legal_name}'.", $actor,
            ['organization_id' => $organization->id, 'contact_id' => $organizationContact->contact_id, 'organization_contact_id' => $organizationContact->id, 'branch_id' => $organizationContact->branch_id],
        );

        return response()->json(['organization_contact' => $organizationContact], 201);
    }

    /**
     * Edita SOLO campos del vínculo (`branch_id`/`position_title`/
     * `relationship_type`/`is_primary`), NUNCA datos de `Person` -- esos se
     * editan en su propio CRUD (fuera de alcance de este lote).
     */
    public function updateContact(Request $request, Organization $organization, OrganizationContact $organizationContact)
    {
        Gate::authorize('update', $organizationContact);

        if ($organizationContact->organization_id !== $organization->id) {
            throw ValidationException::withMessages([
                'organization_contact' => ['El vínculo indicado no pertenece a esta organización.'],
            ]);
        }

        $data = $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'position_title' => ['nullable', 'string', 'max:150'],
            'relationship_type' => ['nullable', 'string', Rule::in(['Empleado', 'Consultor', 'Externo'])],
            'is_primary' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('branch_id', $data)) {
            $this->assertBranchBelongsToOrganization($data['branch_id'], $organization);
        }

        $organizationContact->fill($data);
        $organizationContact->updated_by = $request->user()->id;
        $organizationContact->save();

        $this->logSecurityEvent(
            $request, 'CONTACT_LINK_UPDATED', 'SUCCESS',
            "Vínculo de contacto modificado en la organización '{$organization->legal_name}'.", $request->user(),
            ['organization_id' => $organization->id, 'contact_id' => $organizationContact->contact_id, 'organization_contact_id' => $organizationContact->id, 'branch_id' => $organizationContact->branch_id],
        );

        return response()->json(['organization_contact' => $organizationContact->fresh()]);
    }

    /**
     * Revoca el vínculo (`is_active=false`) -- NUNCA borra la fila
     * `organization_contacts` ni la `Person` ni la organización. Idempotente
     * (revocar un vínculo ya inactivo sigue siendo éxito).
     */
    public function revokeContact(Request $request, Organization $organization, OrganizationContact $organizationContact)
    {
        Gate::authorize('update', $organizationContact);

        if ($organizationContact->organization_id !== $organization->id) {
            throw ValidationException::withMessages([
                'organization_contact' => ['El vínculo indicado no pertenece a esta organización.'],
            ]);
        }

        $organizationContact->forceFill(['is_active' => false, 'updated_by' => $request->user()->id])->save();

        $this->logSecurityEvent(
            $request, 'CONTACT_UNLINKED', 'SUCCESS',
            "Vínculo de contacto revocado en la organización '{$organization->legal_name}'.", $request->user(),
            ['organization_id' => $organization->id, 'contact_id' => $organizationContact->contact_id, 'organization_contact_id' => $organizationContact->id, 'branch_id' => $organizationContact->branch_id],
        );

        return response()->json(['organization_contact' => $organizationContact->fresh()]);
    }

    /**
     * Selector "Contacto Existente" del formulario de vinculación
     * (`existing_contact_id`). Acotado a personas que YA tienen al menos un
     * vínculo `organization_contacts` con una organización accesible por el
     * actor (si no es platform staff) -- evita que un admin de tenant
     * descubra PII de personas sin ninguna relación con su organización. Sin
     * acotar si es platform staff.
     *
     * Incluye `position_title`, el cargo (texto libre) que la persona tiene
     * en su vínculo `organization_contacts` -- necesario para que
     * consumidores como el alta de Conductores (Programación/Dispatch)
     * puedan distinguir el cargo de cada contacto. Una misma `Person` puede
     * tener varios vínculos (N:N, distintas organizaciones/sedes, cada uno
     * con su propio `position_title`), así que el valor mostrado es
     * SIEMPRE el del vínculo específico resuelto así:
     * - Actor NO platform staff: el vínculo con la organización del actor
     *   (única organización visible para él, ya acotada arriba).
     * - Platform staff (sin organización de referencia): el vínculo activo
     *   más reciente entre todas las organizaciones de la persona
     *   (`is_active` desc, `is_primary` desc, `created_at` desc) -- criterio
     *   razonable sin sobre-ingeniería, ya soportado por el modelo.
     */
    public function searchContacts(Request $request)
    {
        $actor = $request->user();
        abort_unless($actor->hasPermission('contacts.read'), 403, 'No tiene permiso para buscar contactos.');

        $data = $request->validate([
            'q' => ['nullable', 'string'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:20'],
        ]);

        $positionTitleSubquery = OrganizationContact::query()
            ->select('position_title')
            ->whereColumn('organization_contacts.contact_id', 'people.id')
            ->when(
                ! $actor->isPlatformStaff(),
                fn ($query) => $query->where('organization_id', $actor->tenant_organization_id),
            )
            ->orderByDesc('is_active')
            ->orderByDesc('is_primary')
            ->orderByDesc('created_at')
            ->limit(1);

        $people = Person::query()
            ->select(['id', 'first_name', 'last_name', 'document_number', 'email'])
            ->addSelect(['position_title' => $positionTitleSubquery])
            ->when(
                ! $actor->isPlatformStaff(),
                fn ($query) => $query->whereHas(
                    'organizationLinks',
                    fn ($query) => $query->where('organization_id', $actor->tenant_organization_id),
                ),
            )
            ->when($data['q'] ?? null, function ($query) use ($data) {
                $query->where(function ($query) use ($data) {
                    $query->where('first_name', 'ILIKE', "%{$data['q']}%")
                        ->orWhere('last_name', 'ILIKE', "%{$data['q']}%")
                        ->orWhere('document_number', 'ILIKE', "%{$data['q']}%")
                        ->orWhere('email', 'ILIKE', "%{$data['q']}%");
                });
            })
            ->orderBy('first_name')
            ->paginate($data['per_page'] ?? 20);

        return response()->json($people);
    }

    /**
     * `branch_id` de un vínculo/sede DEBE pertenecer a la organización dada
     * -- `exists:branches,id` por sí solo no puede expresar esa restricción
     * compuesta. `null`/`0` (branch_id ausente) no dispara la validación.
     */
    private function assertBranchBelongsToOrganization(?int $branchId, Organization $organization): void
    {
        if ($branchId === null) {
            return;
        }

        $belongsToOrganization = Branch::query()
            ->whereKey($branchId)
            ->where('organization_id', $organization->id)
            ->exists();

        if (! $belongsToOrganization) {
            throw ValidationException::withMessages([
                'branch_id' => ['La sucursal indicada no pertenece a esta organización.'],
            ]);
        }
    }

    /**
     * Tab "Usuarios" -- mismo shape que `UserManagementController::index()`.
     */
    public function users(Request $request, Organization $organization)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');

        $users = User::query()
            ->where('tenant_organization_id', $organization->id)
            ->with(['person', 'status', 'roles'])
            ->paginate($request->integer('per_page', 15));

        return response()->json($users);
    }

    /**
     * Tab "Actividad" -- exige AMBOS: el gate de plataforma (ya aplicado
     * arriba) Y el permiso RBAC `audit.read` (dos chequeos distintos, no se
     * fusionan). Sin filtro de tenant adicional -- ya gateado a platform
     * staff arriba, mismo criterio que `RoleController::activity()` para
     * un rol GLOBAL visto por platform staff.
     */
    public function activity(Request $request, Organization $organization)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');
        abort_unless($request->user()->hasPermission('audit.read'), 403, 'No tiene permiso para consultar la auditoría de organizaciones.');

        $logs = SecurityLog::query()
            ->whereIn('event_type', self::BUSINESS_ROLE_EVENTS)
            ->where('metadata->organization_id', $organization->id)
            ->with('user:id,username')
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 15));

        $logs->getCollection()->transform(fn ($log) => [
            'event_type' => $log->event_type,
            'description' => $log->description,
            'actor' => $log->user,
            'created_at' => $log->occurred_at,
        ]);

        return response()->json($logs);
    }

    /**
     * Calca EXACTAMENTE `PermissionController::assignToRole()` -- pivote
     * idempotente vía `updateOrCreate`, nunca borra la fila.
     */
    public function assignBusinessRole(Request $request, Organization $organization, BusinessRole $businessRole)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');

        OrganizationBusinessRole::query()->updateOrCreate(
            ['organization_id' => $organization->id, 'business_role_id' => $businessRole->id],
            ['assigned_by' => $request->user()->id, 'assigned_at' => now(), 'is_active' => true],
        );

        $this->logSecurityEvent(
            $request, 'BUSINESS_ROLE_ASSIGNED', 'SUCCESS',
            "Tipo de organización '{$businessRole->name}' asignado a '{$organization->legal_name}'.", $request->user(),
            ['organization_id' => $organization->id, 'business_role_id' => $businessRole->id],
        );

        return response()->json(['message' => 'Tipo de organización asignado.']);
    }

    /**
     * Calca EXACTAMENTE `PermissionController::revokeFromRole()` -- pone
     * `is_active=false`, idempotente (revocar algo ya inactivo o nunca
     * asignado sigue siendo éxito).
     */
    public function revokeBusinessRole(Request $request, Organization $organization, BusinessRole $businessRole)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');

        OrganizationBusinessRole::query()
            ->where('organization_id', $organization->id)
            ->where('business_role_id', $businessRole->id)
            ->update(['is_active' => false]);

        $this->logSecurityEvent(
            $request, 'BUSINESS_ROLE_REVOKED', 'SUCCESS',
            "Tipo de organización '{$businessRole->name}' revocado de '{$organization->legal_name}'.", $request->user(),
            ['organization_id' => $organization->id, 'business_role_id' => $businessRole->id],
        );

        return response()->json(['message' => 'Tipo de organización revocado.']);
    }

    /**
     * Selector "Organización Matriz" (`parent_organization_id`).
     * `exclude_id` evita que el formulario de edición se ofrezca a sí mismo
     * como su propia matriz.
     */
    public function search(Request $request)
    {
        abort_unless($request->user()->isPlatformStaff(), 403, 'Solo el staff de la plataforma puede gestionar organizaciones.');

        $data = $request->validate([
            'q' => ['nullable', 'string'],
            'exclude_id' => ['nullable', 'integer', 'exists:organizations,id'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
            // Filtra por capacidad de negocio (ej. 'can_treat_waste' para el
            // selector de organizaciones Gestor en Tratamiento de Sucursal) --
            // mismo mecanismo que Organization::hasCapability(), vía scope.
            'capability' => ['nullable', 'string', 'in:can_generate_waste,can_transport_waste,can_treat_waste,can_approve_treatments,can_issue_manifests,can_issue_disposal_certificates,requires_environmental_license,requires_transport_authorization'],
        ]);

        $organizations = Organization::query()
            ->select(['id', 'legal_name', 'tax_id'])
            ->when($data['q'] ?? null, function ($query) use ($data) {
                $query->where(function ($query) use ($data) {
                    $query->where('legal_name', 'ILIKE', "%{$data['q']}%")
                        ->orWhere('trade_name', 'ILIKE', "%{$data['q']}%");
                });
            })
            ->when($data['exclude_id'] ?? null, fn ($query) => $query->where('id', '!=', $data['exclude_id']))
            ->when($data['capability'] ?? null, fn ($query, $flag) => $query->withCapability($flag))
            ->orderBy('legal_name')
            ->paginate($data['per_page'] ?? 10);

        return response()->json($organizations);
    }

    /**
     * `business_role_ids`/`tax_id`/`tax_id_type` se manejan aparte
     * (`store()`/`update()`) -- este set cubre el resto del formulario,
     * compartido entre ambos.
     */
    private function validationRules(Request $request): array
    {
        return [
            'legal_name' => ['required', 'string', 'max:255'],
            'trade_name' => ['nullable', 'string', 'max:255'],
            'tax_id' => [
                'required', 'string', 'max:30',
                // Hallazgo Medio (especialista-seguridad, 2026-07-15): sin
                // `whereNull('deleted_at')`, `Rule::unique()` NO excluye
                // filas soft-eliminadas por defecto -- contradiría la
                // intención del índice único parcial de la migración
                // `add_unique_tax_id_index_to_organizations_table`
                // (`WHERE deleted_at IS NULL`), que sí permite reutilizar
                // un tax_id de una organización eliminada.
                Rule::unique('organizations', 'tax_id')
                    ->where(fn ($query) => $query->where('tax_id_type', $request->input('tax_id_type')))
                    ->whereNull('deleted_at'),
            ],
            'tax_id_type' => ['required', 'string', Rule::in(self::TAX_ID_TYPES)],
            'company_size' => ['nullable', 'string', Rule::in(self::COMPANY_SIZES)],
            'employee_count' => ['nullable', 'integer', 'min:0'],
            'parent_organization_id' => ['nullable', 'integer', 'exists:organizations,id'],
            'customer_since' => ['nullable', 'date'],
            'economic_activity_code' => ['nullable', 'string', 'max:20'],
            'economic_activity_name' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'billing_email' => ['nullable', 'email', 'max:255'],
            'support_email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'website' => ['nullable', 'string', 'max:255'],
            'environmental_authority' => ['nullable', 'string', 'max:255'],
            'environmental_registration' => ['nullable', 'string', 'max:100'],
            'risk_level' => ['sometimes', 'nullable', 'string', Rule::in(self::RISK_LEVELS)],
            'contract_expiration_date' => ['nullable', 'date'],
            'organization_status_id' => ['required', 'integer', 'exists:organization_statuses,id'],
            'timezone' => ['required', 'string', Rule::in(self::TIMEZONES)],
            'country_code' => ['required', 'string', 'exists:countries,iso_code'],
            'currency_code' => ['required', 'string', Rule::in(self::CURRENCIES)],
            'storage_quota_gb' => ['nullable', 'numeric', 'min:0'],
            'is_active' => ['sometimes', 'boolean'],
            'custom_fields_enabled' => ['sometimes', 'boolean'],
            'observations' => ['nullable', 'string'],
            'business_role_ids' => ['nullable', 'array'],
            'business_role_ids.*' => ['integer', 'exists:business_roles,id'],
        ];
    }

    /**
     * @param  list<int>  $businessRoleIds
     */
    private function syncBusinessRoles(Organization $organization, array $businessRoleIds, User $actor): void
    {
        foreach ($businessRoleIds as $businessRoleId) {
            OrganizationBusinessRole::query()->updateOrCreate(
                ['organization_id' => $organization->id, 'business_role_id' => $businessRoleId],
                ['assigned_by' => $actor->id, 'assigned_at' => now(), 'is_active' => true],
            );
        }
    }

    /**
     * `type` (nombres de business_roles activos) y `primary_branch`
     * (`{municipality, department}` o `null`) -- forma compartida entre
     * `index()` y `show()`. Requiere que `businessRoles`/`primaryBranch`
     * ya vengan eager-cargadas en `$organization` (no dispara queries
     * nuevas aquí).
     */
    private function transformOrganization(Organization $organization): array
    {
        $data = $organization->toArray();
        unset($data['business_roles'], $data['primary_branch']);

        $data['type'] = $organization->businessRoles->pluck('name')->values()->all();
        $data['primary_branch'] = $organization->primaryBranch
            ? [
                'municipality' => $organization->primaryBranch->municipality,
                'department' => $organization->primaryBranch->department,
            ]
            : null;

        return $data;
    }

    /**
     * KPIs del listado: un conteo por cada una de las 5 filas REALES de
     * `organization_statuses` (no 4 agrupados) -- una sola query de
     * agregación (`GROUP BY organization_status_id`) para los conteos, más
     * una query para las 5 filas del catálogo (nunca una query por
     * estado).
     */
    private function statusKpis(): array
    {
        $counts = Organization::query()
            ->selectRaw('organization_status_id, count(*) as aggregate')
            ->groupBy('organization_status_id')
            ->pluck('aggregate', 'organization_status_id');

        return OrganizationStatus::query()
            ->orderBy('sort_order')
            ->get(['id', 'code', 'name', 'color_hex'])
            ->map(fn (OrganizationStatus $status) => [
                'code' => $status->code,
                'name' => $status->name,
                'color_hex' => $status->color_hex,
                'count' => (int) ($counts->get($status->id) ?? 0),
            ])
            ->values()
            ->all();
    }
}
