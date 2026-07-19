<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\Workflow;
use App\Models\WorkflowServiceBinding;
use App\Models\WorkflowTransition;
use App\Models\WorkflowTransitionRole;
use App\Models\WorkflowTransitionRule;
use App\Models\WorkflowVersion;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * CU-021 "Configurar Workflow" -- administración del motor de Workflow
 * genérico (item 17/D-WF-01, ya consumido en producción por
 * `WasteTreatmentApprovalController` para `entity_type=TREATMENT`). Un
 * platform staff administra el workflow BASE (`tenant_organization_id IS
 * NULL`, `is_system=true`) de cualquier `entity_type`; un admin de
 * organización Gestor (`can_treat_waste=true`) puede CLONAR el base hacia un
 * workflow PROPIO y editarlo -- nunca el base ni el de otra organización (ver
 * `WorkflowPolicy`).
 *
 * Invariantes de seguridad (hallazgo `especialista-seguridad`, revisión del
 * refactor de `WasteTreatmentApprovalController` -- bloqueantes para este
 * controller, no opcionales):
 *   1. Integridad del binding: `workflow_service_bindings.workflow_id` con
 *      `scope_type=organization` SIEMPRE pertenece a `scope_id` -- ver
 *      `WorkflowServiceBinding::assertBindingIntegrity()`.
 *   2. Permiso dedicado `workflows.manage` + auditoría de TODO cambio de
 *      DEFINICIÓN (crear/clonar/editar transición/publicar versión/crear
 *      binding) vía `security_logs` (`LogsSecurityEvents`) -- NUNCA
 *      `WorkflowLog` (esa tabla es para EJECUCIÓN de transiciones sobre una
 *      entidad real, no para cambios de configuración del propio workflow).
 *   3. Unicidad de binding activo: UNIQUE de BD
 *      `(scope_type, scope_id, entity_type)` en `workflow_service_bindings`
 *      (ver migración `add_entity_type_and_unique_index_...`) -- garantiza
 *      que `Workflow::resolveFor()` sea siempre determinista.
 *   4. `current_version_id` SOLO apunta a versiones PUBLISHED: publicar una
 *      versión es atómico (`publishVersion()`, `DB::transaction`) y
 *      `Workflow::current_version_id` se retiró de `$fillable` -- solo se
 *      asigna vía `forceFill()` dentro de esa transacción (o del seeder).
 *
 * Diseño de versión en edición (CU-021_12/_13/_15, no completamente
 * especificado por el enunciado -- documentado aquí en vez de asumido en
 * silencio): las transiciones SOLO se editan sobre la versión DRAFT más
 * reciente del workflow (`resolveDraftVersion()`), NUNCA sobre
 * `currentVersion` (que siempre es PUBLISHED e inmutable). `clone()` crea la
 * primera versión DRAFT (version_number=1) y el binding hacia el workflow
 * nuevo EN EL MISMO PASO -- esto significa que, entre el clon y la primera
 * publicación, el `entity_type` de esa organización queda TEMPORALMENTE sin
 * ninguna transición resoluble (`current_version_id` es NULL hasta
 * publicar), replicando fielmente el requisito 4 de arriba. Se señala
 * explícitamente al hilo principal como un posible gap de continuidad
 * operativa (una evaluación de tratamiento en curso de esa organización no
 * podría transicionar durante la edición) -- no resuelto aquí por no haber
 * un CU/RN que indique qué debe pasar en ese intervalo (p. ej. "publicar
 * automáticamente una copia idéntica al clonar" sería una alternativa, pero
 * cambiaría el comportamiento pedido literalmente en el enunciado: "clona la
 * versión actual del base a una versión DRAFT propia").
 */
class WorkflowController extends Controller
{
    use LogsSecurityEvents;

    /**
     * `organization_id`: filtro OPCIONAL para platform staff (sin filtro ve
     * TODOS los workflows, base + de cualquier organización). Un admin de
     * organización Gestor SIEMPRE ve el BASE (solo lectura) + el suyo propio
     * si existe (editable) -- nunca el de otra organización.
     */
    public function index(Request $request)
    {
        Gate::authorize('viewAny', Workflow::class);

        $actor = $request->user();

        // Gap real (agente frontend, CU-021): a diferencia de show(), index()
        // no traía tenantOrganization -- el listado de workflows
        // personalizados solo podía mostrar "Organización #<id>", nunca la
        // razón social. Mismo patrón que BranchController::index().
        $query = Workflow::query()->with(['currentVersion', 'tenantOrganization:id,legal_name']);

        if ($actor->isPlatformStaff()) {
            $data = $request->validate([
                'organization_id' => ['nullable', 'integer', 'exists:organizations,id'],
                'entity_type' => ['nullable', 'string', Rule::in(Workflow::ENTITY_TYPES)],
            ]);

            $query->when(
                array_key_exists('organization_id', $data) && $data['organization_id'] !== null,
                fn ($q) => $q->where('tenant_organization_id', $data['organization_id']),
            )->when(
                $data['entity_type'] ?? null,
                fn ($q, $entityType) => $q->where('entity_type', $entityType),
            );
        } else {
            $query->where(function ($q) use ($actor) {
                $q->whereNull('tenant_organization_id')->orWhere('tenant_organization_id', $actor->tenant_organization_id);
            });
        }

        $workflows = $query->orderBy('entity_type')->orderByRaw('tenant_organization_id IS NULL DESC')->paginate($request->integer('per_page', 15));

        return response()->json($workflows);
    }

    /**
     * Gap real (agente frontend, CU-021): antes solo se eager-cargaba el
     * detalle de `currentVersion.transitions` -- una versión DRAFT recién
     * creada (`versions[].transitions`) llegaba SIN sus roles/reglas/
     * estados resueltos, obligando al frontend a un workaround frágil de
     * caché en `sessionStorage` (se pierde en una recarga de página). Se
     * carga el mismo detalle completo para TODAS las versiones, no solo la
     * actual -- así el frontend puede mostrar cualquier versión sin
     * depender de una respuesta anterior en caché.
     */
    public function show(Workflow $workflow)
    {
        Gate::authorize('view', $workflow);

        $workflow->load([
            'currentVersion.transitions.roles.role:id,code,name',
            'currentVersion.transitions.roles.businessRole:id,code,name',
            'currentVersion.transitions.rules',
            'currentVersion.transitions.fromStatus',
            'currentVersion.transitions.toStatus',
            'versions' => fn ($query) => $query->orderByDesc('version_number'),
            'versions.transitions.roles.role:id,code,name',
            'versions.transitions.roles.businessRole:id,code,name',
            'versions.transitions.rules',
            'versions.transitions.fromStatus',
            'versions.transitions.toStatus',
            'tenantOrganization:id,legal_name',
        ]);

        return response()->json(['workflow' => $workflow]);
    }

    /**
     * POST /admin/workflows/{workflow}/clone (CU-021_13) -- solo sobre el
     * workflow BASE, solo un admin de organización Gestor SIN workflow
     * propio todavía de ese `entity_type` (ver `WorkflowPolicy::clone()`).
     */
    public function clone(Request $request, Workflow $workflow)
    {
        Gate::authorize('clone', $workflow);

        $actor = $request->user();
        $organizationId = $actor->tenant_organization_id;

        if ($organizationId === null) {
            throw ValidationException::withMessages([
                'organization_id' => ['No fue posible determinar la organización del actor.'],
            ]);
        }

        if (Workflow::query()->where('tenant_organization_id', $organizationId)->where('entity_type', $workflow->entity_type)->exists()) {
            throw ValidationException::withMessages([
                'workflow' => ['Su organización ya tiene un workflow propio para este tipo de entidad.'],
            ]);
        }

        $baseVersion = $workflow->currentVersion;

        if ($baseVersion === null) {
            throw ValidationException::withMessages([
                'workflow' => ['El workflow base no tiene una versión publicada para clonar.'],
            ]);
        }

        $customWorkflow = DB::transaction(function () use ($workflow, $baseVersion, $organizationId, $actor) {
            $customWorkflow = Workflow::query()->create([
                'tenant_organization_id' => $organizationId,
                'code' => $workflow->code,
                'name' => "{$workflow->name} (personalizado)",
                'description' => $workflow->description,
                'entity_type' => $workflow->entity_type,
                'is_system' => false,
                'is_active' => true,
                'created_by' => $actor->id,
                'updated_by' => $actor->id,
            ]);

            $customVersion = WorkflowVersion::query()->create([
                'workflow_id' => $customWorkflow->id,
                'version_number' => 1,
                'status' => 'DRAFT',
                'created_by' => $actor->id,
            ]);

            foreach ($baseVersion->transitions()->with('roles')->get() as $sourceTransition) {
                $newTransition = WorkflowTransition::query()->create([
                    'workflow_version_id' => $customVersion->id,
                    'from_status_code' => $sourceTransition->from_status_code,
                    'to_status_code' => $sourceTransition->to_status_code,
                    'is_automatic' => $sourceTransition->is_automatic,
                    'requires_approval' => $sourceTransition->requires_approval,
                ]);

                foreach ($sourceTransition->roles as $sourceRole) {
                    WorkflowTransitionRole::query()->create([
                        'workflow_transition_id' => $newTransition->id,
                        'role_id' => $sourceRole->role_id,
                        'business_role_id' => $sourceRole->business_role_id,
                    ]);
                }
            }

            // Requisito 1 (integridad del binding): el workflow_id
            // referenciado SIEMPRE pertenece a la organización del scope --
            // por construcción aquí (tenant_organization_id acaba de fijarse
            // a $organizationId), pero se valida explícitamente en vez de
            // confiar silenciosamente en ese orden de asignación.
            WorkflowServiceBinding::assertBindingIntegrity($customWorkflow, 'organization', $organizationId);

            // Requisito 3 (unicidad de binding activo): defensa en
            // profundidad antes del INSERT -- el UNIQUE de BD
            // (scope_type, scope_id, entity_type) es el backstop real.
            if (WorkflowServiceBinding::query()
                ->where('scope_type', 'organization')
                ->where('scope_id', $organizationId)
                ->where('entity_type', $customWorkflow->entity_type)
                ->exists()) {
                throw ValidationException::withMessages([
                    'workflow' => ['Ya existe un binding activo de workflow para esta organización y tipo de entidad.'],
                ]);
            }

            WorkflowServiceBinding::query()->create([
                'workflow_id' => $customWorkflow->id,
                'scope_type' => 'organization',
                'scope_id' => $organizationId,
            ]);

            return $customWorkflow;
        });

        $this->logSecurityEvent(
            $request, 'WORKFLOW_CLONED', 'SUCCESS',
            "Workflow '{$workflow->code}' clonado hacia la organización '{$organizationId}' (nuevo workflow '{$customWorkflow->id}').",
            $actor, ['workflow_id' => $customWorkflow->id, 'source_workflow_id' => $workflow->id, 'organization_id' => $organizationId],
        );

        $customWorkflow->load([
            'currentVersion',
            'versions.transitions.roles',
            'versions.transitions.fromStatus',
            'versions.transitions.toStatus',
        ]);

        return response()->json(['workflow' => $customWorkflow], 201);
    }

    /**
     * POST /admin/workflows/{workflow}/versions (CU-021_12 "Versionar
     * Workflow") -- crea una nueva versión DRAFT a partir de la PUBLICADA
     * vigente, para editar sin afectar lo publicado. Rechaza si ya existe
     * una versión DRAFT sin publicar (una a la vez, evita ediciones
     * concurrentes divergentes).
     */
    public function storeVersion(Request $request, Workflow $workflow)
    {
        Gate::authorize('update', $workflow);

        $actor = $request->user();

        if ($workflow->versions()->where('status', 'DRAFT')->exists()) {
            throw ValidationException::withMessages([
                'workflow' => ['Ya existe una versión en borrador; publíquela o continúe editándola antes de crear una nueva.'],
            ]);
        }

        $sourceVersion = $workflow->currentVersion;

        if ($sourceVersion === null) {
            throw ValidationException::withMessages([
                'workflow' => ['El workflow no tiene una versión publicada de la cual partir.'],
            ]);
        }

        $newVersion = DB::transaction(function () use ($workflow, $sourceVersion, $actor) {
            $nextVersionNumber = ((int) $workflow->versions()->max('version_number')) + 1;

            $newVersion = WorkflowVersion::query()->create([
                'workflow_id' => $workflow->id,
                'version_number' => $nextVersionNumber,
                'status' => 'DRAFT',
                'created_by' => $actor->id,
            ]);

            foreach ($sourceVersion->transitions()->with('roles', 'rules')->get() as $sourceTransition) {
                $newTransition = WorkflowTransition::query()->create([
                    'workflow_version_id' => $newVersion->id,
                    'from_status_code' => $sourceTransition->from_status_code,
                    'to_status_code' => $sourceTransition->to_status_code,
                    'is_automatic' => $sourceTransition->is_automatic,
                    'requires_approval' => $sourceTransition->requires_approval,
                ]);

                foreach ($sourceTransition->roles as $sourceRole) {
                    WorkflowTransitionRole::query()->create([
                        'workflow_transition_id' => $newTransition->id,
                        'role_id' => $sourceRole->role_id,
                        'business_role_id' => $sourceRole->business_role_id,
                    ]);
                }

                foreach ($sourceTransition->rules as $sourceRule) {
                    WorkflowTransitionRule::query()->create([
                        'workflow_transition_id' => $newTransition->id,
                        'rule_type' => $sourceRule->rule_type,
                        'rule_definition' => $sourceRule->rule_definition,
                        'error_message' => $sourceRule->error_message,
                    ]);
                }
            }

            return $newVersion;
        });

        $this->logSecurityEvent(
            $request, 'WORKFLOW_VERSION_CREATED', 'SUCCESS',
            "Nueva versión DRAFT '{$newVersion->version_number}' creada para el workflow '{$workflow->id}'.",
            $actor, ['workflow_id' => $workflow->id, 'workflow_version_id' => $newVersion->id],
        );

        return response()->json(['workflow_version' => $newVersion->load(['transitions.roles', 'transitions.fromStatus', 'transitions.toStatus'])], 201);
    }

    /**
     * POST /admin/workflows/{workflow}/versions/{version}/publish (CU-021_15)
     * -- requisito 4: atómico, publica la versión Y actualiza
     * `workflows.current_version_id` en la misma transacción.
     */
    public function publishVersion(Request $request, Workflow $workflow, WorkflowVersion $version)
    {
        Gate::authorize('update', $workflow);

        if ($version->workflow_id !== $workflow->id) {
            throw ValidationException::withMessages([
                'workflow_version' => ['La versión indicada no pertenece a este workflow.'],
            ]);
        }

        if ($version->status !== 'DRAFT') {
            throw ValidationException::withMessages([
                'workflow_version' => ['Solo se puede publicar una versión en estado Borrador.'],
            ]);
        }

        $actor = $request->user();

        DB::transaction(function () use ($workflow, $version, $actor) {
            $version->forceFill([
                'status' => 'PUBLISHED',
                'published_at' => now(),
                'published_by' => $actor->id,
            ])->save();

            $workflow->forceFill(['current_version_id' => $version->id])->save();
        });

        $this->logSecurityEvent(
            $request, 'WORKFLOW_VERSION_PUBLISHED', 'SUCCESS',
            "Versión '{$version->version_number}' publicada para el workflow '{$workflow->id}'.",
            $actor, ['workflow_id' => $workflow->id, 'workflow_version_id' => $version->id],
        );

        return response()->json(['workflow' => $workflow->fresh(['currentVersion'])]);
    }

    /**
     * POST /admin/workflows/{workflow}/transitions -- crea una transición
     * nueva SOLO sobre la versión DRAFT vigente (ver docblock de la clase).
     */
    public function storeTransition(Request $request, Workflow $workflow)
    {
        Gate::authorize('update', $workflow);

        $draftVersion = $this->resolveDraftVersion($workflow);
        $data = $this->validateTransitionPayload($request);

        if ($draftVersion->transitions()->where('from_status_code', $data['from_status_code'])->where('to_status_code', $data['to_status_code'])->exists()) {
            throw ValidationException::withMessages([
                'to_status_code' => ['Ya existe una transición con este origen y destino en la versión en borrador.'],
            ]);
        }

        $transition = DB::transaction(function () use ($draftVersion, $data) {
            $transition = WorkflowTransition::query()->create([
                'workflow_version_id' => $draftVersion->id,
                'from_status_code' => $data['from_status_code'],
                'to_status_code' => $data['to_status_code'],
                'is_automatic' => $data['is_automatic'] ?? false,
                'requires_approval' => $data['requires_approval'] ?? false,
            ]);

            $this->syncTransitionRoles($transition, $data['roles'] ?? []);

            return $transition;
        });

        $this->logSecurityEvent(
            $request, 'WORKFLOW_TRANSITION_CREATED', 'SUCCESS',
            "Transición '{$data['from_status_code']}' -> '{$data['to_status_code']}' creada en el workflow '{$workflow->id}'.",
            $request->user(), ['workflow_id' => $workflow->id, 'workflow_transition_id' => $transition->id],
        );

        return response()->json(['workflow_transition' => $transition->fresh(['roles', 'fromStatus', 'toStatus'])], 201);
    }

    /**
     * PUT /admin/workflows/{workflow}/transitions/{transition} -- edita una
     * transición existente. SOLO si pertenece a una versión DRAFT -- las
     * versiones PUBLISHED son inmutables (CU-021_12).
     */
    public function updateTransition(Request $request, Workflow $workflow, WorkflowTransition $transition)
    {
        Gate::authorize('update', $workflow);

        $this->assertTransitionBelongsToDraftOf($workflow, $transition);

        $data = $request->validate([
            'is_automatic' => ['sometimes', 'boolean'],
            'requires_approval' => ['sometimes', 'boolean'],
            'roles' => ['sometimes', 'array'],
            'roles.*.role_id' => ['nullable', 'integer', 'exists:roles,id'],
            'roles.*.business_role_id' => ['nullable', 'integer', 'exists:business_roles,id'],
        ]);

        $this->assertExactlyOneRoleField($data['roles'] ?? null);

        DB::transaction(function () use ($transition, $data) {
            $transition->fill([
                'is_automatic' => $data['is_automatic'] ?? $transition->is_automatic,
                'requires_approval' => $data['requires_approval'] ?? $transition->requires_approval,
            ])->save();

            if (array_key_exists('roles', $data)) {
                $transition->roles()->delete();
                $this->syncTransitionRoles($transition, $data['roles']);
            }
        });

        $this->logSecurityEvent(
            $request, 'WORKFLOW_TRANSITION_UPDATED', 'SUCCESS',
            "Transición '{$transition->id}' modificada en el workflow '{$workflow->id}'.",
            $request->user(), ['workflow_id' => $workflow->id, 'workflow_transition_id' => $transition->id],
        );

        return response()->json(['workflow_transition' => $transition->fresh(['roles', 'fromStatus', 'toStatus'])]);
    }

    /**
     * DELETE /admin/workflows/{workflow}/transitions/{transition} -- mismo
     * guard DRAFT-only que `updateTransition()`.
     */
    public function destroyTransition(Request $request, Workflow $workflow, WorkflowTransition $transition)
    {
        Gate::authorize('update', $workflow);

        $this->assertTransitionBelongsToDraftOf($workflow, $transition);

        $transitionId = $transition->id;
        $transition->delete();

        $this->logSecurityEvent(
            $request, 'WORKFLOW_TRANSITION_DELETED', 'SUCCESS',
            "Transición '{$transitionId}' eliminada del workflow '{$workflow->id}'.",
            $request->user(), ['workflow_id' => $workflow->id, 'workflow_transition_id' => $transitionId],
        );

        return response()->json(status: 204);
    }

    private function resolveDraftVersion(Workflow $workflow): WorkflowVersion
    {
        $draftVersion = $workflow->versions()->where('status', 'DRAFT')->orderByDesc('version_number')->first();

        if ($draftVersion === null) {
            throw ValidationException::withMessages([
                'workflow_version' => ['No hay una versión en borrador para editar; cree una nueva versión primero (CU-021_12).'],
            ]);
        }

        return $draftVersion;
    }

    private function assertTransitionBelongsToDraftOf(Workflow $workflow, WorkflowTransition $transition): void
    {
        $transition->loadMissing('workflowVersion');

        if ($transition->workflowVersion->workflow_id !== $workflow->id) {
            throw ValidationException::withMessages([
                'workflow_transition' => ['La transición indicada no pertenece a este workflow.'],
            ]);
        }

        if ($transition->workflowVersion->status !== 'DRAFT') {
            throw ValidationException::withMessages([
                'workflow_transition' => ['Las versiones publicadas son inmutables; cree una nueva versión primero (CU-021_12).'],
            ]);
        }
    }

    /**
     * @return array{from_status_code: string, to_status_code: string, is_automatic?: bool, requires_approval?: bool, roles?: array}
     */
    private function validateTransitionPayload(Request $request): array
    {
        $data = $request->validate([
            'from_status_code' => ['required', 'string', 'max:50', Rule::exists('respel_statuses', 'code')],
            'to_status_code' => ['required', 'string', 'max:50', Rule::exists('respel_statuses', 'code')],
            'is_automatic' => ['sometimes', 'boolean'],
            'requires_approval' => ['sometimes', 'boolean'],
            'roles' => ['sometimes', 'array'],
            'roles.*.role_id' => ['nullable', 'integer', 'exists:roles,id'],
            'roles.*.business_role_id' => ['nullable', 'integer', 'exists:business_roles,id'],
        ]);

        $this->assertExactlyOneRoleField($data['roles'] ?? null);

        return $data;
    }

    /**
     * `workflow_transition_roles`: exactamente uno de `role_id`/
     * `business_role_id` debe ser no-nulo por fila (mismo CHECK de BD ya
     * existente, ver migración `create_workflow_transition_roles_table`) --
     * se valida también a nivel de aplicación para devolver un 422 legible
     * en vez de una excepción de BD cruda.
     */
    private function assertExactlyOneRoleField(?array $roles): void
    {
        if ($roles === null) {
            return;
        }

        foreach ($roles as $index => $role) {
            $hasRole = ! empty($role['role_id'] ?? null);
            $hasBusinessRole = ! empty($role['business_role_id'] ?? null);

            if ($hasRole === $hasBusinessRole) {
                throw ValidationException::withMessages([
                    "roles.{$index}" => ['Cada rol de transición debe indicar exactamente uno de role_id o business_role_id.'],
                ]);
            }
        }
    }

    private function syncTransitionRoles(WorkflowTransition $transition, array $roles): void
    {
        foreach ($roles as $role) {
            WorkflowTransitionRole::query()->create([
                'workflow_transition_id' => $transition->id,
                'role_id' => $role['role_id'] ?? null,
                'business_role_id' => $role['business_role_id'] ?? null,
            ]);
        }
    }
}
