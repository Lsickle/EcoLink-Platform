<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Concerns\LogsSecurityEvents;
use App\Http\Controllers\Controller;
use App\Models\TransportRoute;
use App\Policies\TransportRoutePolicy;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * CRUD MÍNIMO de Rutas (`transport_routes`, CU-059 "Agrupar por Zona/Ruta").
 * Gap real señalado por el agente de frontend:
 * `TransportScheduleController::assignToRoute()` ya EXIGE un
 * `transport_route_id` válido desde Fase 2a, pero no existía ningún
 * endpoint para crear/listar rutas.
 *
 * ALCANCE de este lote (decisión explícita, ver resumen entregado al hilo
 * principal): solo `index()`/`show()`/`store()` -- SIN `update()`/
 * `cancel()`. `transport_routes` es hoy un contenedor simple sin workflow
 * propio (`is_active` es el único estado, sin catálogo de estados ni
 * transiciones -- ver docblock de la migración `create_transport_routes_table`,
 * "agrupación simple... SIN motor de optimización real"); el frontend solo
 * necesita crear/listar rutas para alimentar el selector de
 * `assignToRoute()`. Editar (`name`/`route_date`/`observations`) o
 * archivar una ruta queda diferido hasta que el negocio confirme que se
 * necesita -- agregar esos endpoints después es un cambio aditivo, no una
 * migración de datos.
 *
 * Acceso DUAL + anti-role-smuggling de `organization_id`, mismo patrón
 * EXACTO que `TransportPersonnelController`/`TransportScheduleController`.
 */
class TransportRouteController extends Controller
{
    use LogsSecurityEvents;

    public function index(Request $request)
    {
        $actor = $request->user();
        abort_unless((new TransportRoutePolicy)->viewAny($actor), 403, 'No tiene permiso para consultar rutas de transporte.');

        $organizationId = $request->input('organization_id');
        $search = $request->input('search');

        $routes = TransportRoute::query()
            ->when(! $actor->isPlatformStaff(), fn ($query) => $query->where('organization_id', $actor->tenant_organization_id))
            ->when($actor->isPlatformStaff() && $organizationId, fn ($query) => $query->where('organization_id', $organizationId))
            ->when($search, function ($query) use ($search) {
                $query->where(function ($query) use ($search) {
                    $query->where('route_code', 'ILIKE', "%{$search}%")
                        ->orWhere('name', 'ILIKE', "%{$search}%");
                });
            })
            ->when($request->has('is_active'), fn ($query) => $query->where('is_active', $request->boolean('is_active')))
            ->withCount('stops')
            ->with('organization:id,legal_name')
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return response()->json($routes);
    }

    public function show(Request $request, TransportRoute $route)
    {
        abort_unless((new TransportRoutePolicy)->view($request->user(), $route), 403, 'No tiene acceso a esta ruta de transporte.');

        $route->load([
            'organization:id,legal_name',
            'stops.transportSchedule:id,schedule_number,organization_id',
        ]);

        return response()->json(['transport_route' => $route]);
    }

    /**
     * `route_code` se genera server-side (mismo criterio que
     * `TransportScheduleController::generateScheduleNumber()`) -- la
     * columna es UNIQUE global en la migración, nunca se acepta del
     * cliente.
     */
    public function store(Request $request)
    {
        $actor = $request->user();

        $organizationId = $actor->isPlatformStaff()
            ? $request->integer('organization_id')
            : $actor->tenant_organization_id;

        abort_unless((new TransportRoutePolicy)->create($actor, $organizationId), 403, 'No tiene permiso para crear rutas de transporte.');

        $rules = [
            'name' => ['required', 'string', 'max:150'],
            'route_date' => ['sometimes', 'nullable', 'date'],
            'observations' => ['sometimes', 'nullable', 'string'],
            'metadata' => ['sometimes', 'nullable', 'array'],
        ];

        if ($actor->isPlatformStaff()) {
            $rules['organization_id'] = ['required', 'integer', 'exists:organizations,id'];
        }

        $data = $request->validate($rules);
        $data['organization_id'] = $organizationId;
        $data['route_code'] = $this->generateRouteCode($organizationId);
        $data['is_active'] = true;
        $data['created_by'] = $actor->id;
        $data['updated_by'] = $actor->id;

        $route = TransportRoute::query()->create($data);

        $this->logSecurityEvent(
            $request, 'TRANSPORT_ROUTE_CREATED', 'SUCCESS',
            "Ruta de transporte '{$route->route_code}' creada.", $actor,
            ['transport_route_id' => $route->id, 'organization_id' => $route->organization_id],
        );

        return response()->json(['transport_route' => $route->fresh(['organization:id,legal_name'])], 201);
    }

    private function generateRouteCode(?int $organizationId): string
    {
        do {
            $code = sprintf('RUTA-%d-%s', $organizationId, Str::upper(Str::random(8)));
        } while (TransportRoute::withTrashed()->where('route_code', $code)->exists());

        return $code;
    }
}
