<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\OrganizationContact;
use App\Models\Person;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Módulo standalone "Contactos" (nuevo, `admin/contacts*`) -- distinto de
 * `OrganizationController::contacts()/storeContact()/updateContact()/
 * revokeContact()` (esos siguen gestionando contactos DENTRO del contexto de
 * una organización/sede, sin tocar). Este controller ofrece una vista propia
 * de la `Person` con TODOS sus vínculos, y es el ÚNICO lugar donde se editan
 * los datos propios de `Person` (RN-189/D-P02: los datos de una persona son
 * compartidos entre organizaciones si está vinculada a varias -- un admin de
 * tenant NUNCA los edita, solo platform staff).
 *
 * Acceso DUAL, mismo criterio que `OrganizationContactPolicy`/
 * `OrganizationController::contacts()`: platform staff ve/gestiona TODOS los
 * contactos; un admin de tenant solo los que tengan AL MENOS UN vínculo
 * ACTIVO con SU organización (`tenant_organization_id`).
 *
 * Sin Policy nueva -- reutiliza `Gate::authorize('viewAny',
 * OrganizationContact::class)` (permiso `contacts.read`) para `index()`, y
 * chequeos explícitos `abort_unless()` para `show()`/`update()`, mismo
 * patrón ya usado en `BranchController::activity()`.
 */
class ContactController extends Controller
{
    use LogsSecurityEvents;

    /**
     * Filtros: `search` (ILIKE nombre/apellido/nombre completo/documento/
     * correo), `sort`/`direction` (whitelist, default por nombre),
     * paginado. `organizations_count` se cuenta con la MISMA visibilidad que
     * el listado (para un tenant admin, solo cuenta los vínculos activos de
     * SU organización -- no el total real de vínculos de la persona, que
     * podría incluir organizaciones que no puede ver).
     */
    public function index(Request $request)
    {
        $actor = $request->user();
        Gate::authorize('viewAny', OrganizationContact::class);

        $search = $request->input('search');
        $sortableColumns = ['first_name', 'last_name', 'document_number', 'email'];
        $sort = in_array($request->input('sort'), $sortableColumns, true) ? $request->input('sort') : 'first_name';
        $direction = strtolower((string) $request->input('direction')) === 'desc' ? 'desc' : 'asc';

        $visibleLinksScope = function ($query) use ($actor) {
            $query->where('is_active', true);

            if (! $actor->isPlatformStaff()) {
                $query->where('organization_id', $actor->tenant_organization_id);
            }
        };

        $people = Person::query()
            ->whereHas('organizationLinks', $visibleLinksScope)
            ->withCount(['organizationLinks as organizations_count' => $visibleLinksScope])
            ->with('user:id,person_id')
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('first_name', 'ILIKE', "%{$search}%")
                        ->orWhere('last_name', 'ILIKE', "%{$search}%")
                        ->orWhere('full_name', 'ILIKE', "%{$search}%")
                        ->orWhere('document_number', 'ILIKE', "%{$search}%")
                        ->orWhere('email', 'ILIKE', "%{$search}%");
                });
            })
            ->orderBy($sort, $direction)
            ->paginate(min($request->integer('per_page', 15), 100));

        $people->getCollection()->transform(function (Person $person) {
            $data = $person->only(['id', 'document_type', 'document_number', 'first_name', 'last_name', 'email', 'phone']);
            $data['has_user_account'] = $person->user !== null;
            $data['organizations_count'] = $person->organizations_count;

            return $data;
        });

        return response()->json($people);
    }

    /**
     * Datos completos de la Persona + `organization_links`. Exige el mismo
     * permiso `contacts.read` que `index()` -- hallazgo Crítico de
     * `especialista-seguridad` (2026-07-16): antes solo chequeaba
     * pertenencia (`abort_unless`), sin RBAC, permitiendo a cualquier
     * usuario autenticado del tenant enumerar `/admin/contacts/{id}` sin
     * tener el permiso asignado.
     *
     * CRÍTICO (hallazgo de privacidad, ya cerrado): si el actor NO es
     * platform staff, `organization_links` se acota SOLO a vínculos con SU
     * organización (nunca vínculos con otras organizaciones, activos o no)
     * -- evita fuga de información competitiva. Platform staff ve TODOS los
     * vínculos (activos e inactivos, historial completo).
     *
     * La respuesta usa el mismo *allowlist* `->only([...])` que `index()`
     * (hallazgo Alto de `especialista-seguridad`, 2026-07-16): `toArray()`
     * exponía `organization_id`/`tenant_organization_id` propios de la
     * `Person` -- columnas distintas de `organization_links` (ya filtrado
     * por tenant) que pueden apuntar a una organización DIFERENTE a la del
     * actor cuando el contacto es compartido entre organizaciones, filtrando
     * el mismo tipo de dato competitivo que `organization_links` ya evita.
     */
    public function show(Request $request, Person $person)
    {
        $actor = $request->user();

        Gate::authorize('viewAny', OrganizationContact::class);

        abort_unless(
            $actor->isPlatformStaff()
                || $person->organizationLinks()->where('organization_id', $actor->tenant_organization_id)->where('is_active', true)->exists(),
            403,
            'No tiene acceso a este contacto.',
        );

        $linksQuery = $person->organizationLinks()->with(['organization:id,legal_name', 'branch:id,name']);

        if (! $actor->isPlatformStaff()) {
            $linksQuery->where('organization_id', $actor->tenant_organization_id);
        }

        $links = $linksQuery->orderByDesc('is_active')->orderByDesc('created_at')->get();

        $data = $person->only(['id', 'document_type', 'document_number', 'first_name', 'last_name', 'email', 'phone']);
        $data['has_user_account'] = $person->user !== null;
        $data['organization_links'] = $links->map(fn (OrganizationContact $link) => [
            'organization_contact_id' => $link->id,
            'organization_id' => $link->organization_id,
            'organization_name' => $link->organization?->legal_name,
            'branch_id' => $link->branch_id,
            'branch_name' => $link->branch?->name,
            'position_title' => $link->position_title,
            'relationship_type' => $link->relationship_type,
            'is_primary' => $link->is_primary,
            'is_active' => $link->is_active,
            'start_date' => $link->start_date,
            'created_at' => $link->created_at,
        ])->values();

        return response()->json(['person' => $data]);
    }

    /**
     * Edita SOLO los campos propios de `Person` -- NUNCA el vínculo
     * (cargo/sede/tipo de relación se editan vía
     * `OrganizationController::updateContact()`, sin tocar). Exige AMBOS:
     * permiso `contacts.update` Y `isPlatformStaff()` -- un admin de tenant
     * con el permiso pero sin ser platform staff sigue siendo 403 (RN-189/
     * D-P02: los datos de Persona son compartidos entre organizaciones).
     *
     * GAP de esquema declarado explícitamente: `people` NO tiene una
     * constraint UNIQUE compuesta `(document_type, document_number)` --
     * solo `document_number` es UNIQUE global (ver migración
     * `create_people_table`). Se valida unicidad solo sobre
     * `document_number` (ignorando la propia fila), consistente con la
     * constraint real de la base de datos, no con la intención de negocio
     * documentada en esquema-bd (que sí describe unicidad compuesta) --
     * señalado en el resumen entregado al hilo principal.
     */
    public function update(Request $request, Person $person)
    {
        $actor = $request->user();

        abort_unless(
            $actor->hasPermission('contacts.update') && $actor->isPlatformStaff(),
            403,
            'Solo el personal de la plataforma puede editar los datos del contacto.',
        );

        $data = $request->validate([
            'document_type' => ['sometimes', 'string', 'max:20'],
            'document_number' => [
                'sometimes', 'string', 'max:50',
                Rule::unique('people', 'document_number')->ignore($person->id)->whereNull('deleted_at'),
            ],
            'first_name' => ['sometimes', 'string', 'max:100'],
            'last_name' => ['sometimes', 'string', 'max:100'],
            'email' => [
                'sometimes', 'nullable', 'email', 'max:255',
                Rule::unique('people', 'email')->ignore($person->id)->whereNull('deleted_at'),
            ],
            'phone' => ['sometimes', 'nullable', 'string', 'max:50'],
        ]);

        $person->fill($data);
        $person->updated_by = $actor->id;
        $person->save();

        $this->logSecurityEvent(
            $request, 'CONTACT_UPDATED', 'SUCCESS',
            "Datos del contacto '{$person->full_name}' modificados.", $actor,
            ['person_id' => $person->id],
        );

        return response()->json(['person' => $person->fresh()]);
    }
}
