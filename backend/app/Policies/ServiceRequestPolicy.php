<?php

namespace App\Policies;

use App\Models\Organization;
use App\Models\User;
use App\Models\WasteServiceRequest;
use App\Models\WasteServiceRequestItem;

/**
 * Fase 1b del Módulo Solicitudes de Servicio. Acceso NO simétrico entre los
 * dos lados de la relación (distinto del acceso dual platform-staff-vs-tenant
 * simple del resto del proyecto, y distinto también del acceso cruzado
 * simétrico de `WasteTreatmentApprovalPolicy`):
 * - El GENERADOR dueño (`WasteServiceRequest::isAccessibleBy()`) ve/edita/
 *   cancela SU PROPIA solicitud completa.
 * - Un GESTOR con AL MENOS UN ítem asignado (vía
 *   `waste_service_request_items.waste_treatment_approval.organization_id`)
 *   puede VER la solicitud completa (para dar contexto a su evaluación), pero
 *   SOLO puede EVALUAR (`evaluateItem`) el/los ítems que le pertenecen a ÉL
 *   -- nunca los de otro Gestor en la misma solicitud (D-S25).
 * - platform staff: acceso total, mismo criterio que el resto del proyecto.
 *
 * Invocación EXPLÍCITA (`new ServiceRequestPolicy`), NO `Gate::authorize()`
 * auto-descubierto -- mismo criterio ya establecido por `PreapprovedWastePolicy`:
 * esta clase cubre DOS modelos (`WasteServiceRequest` y
 * `WasteServiceRequestItem`), así que su nombre no sigue la convención
 * Modelo+"Policy" que Laravel resuelve automáticamente para ninguno de los
 * dos -- Laravel solo auto-descubre `WasteServiceRequestPolicy`/
 * `WasteServiceRequestItemPolicy`, no `ServiceRequestPolicy`.
 */
class ServiceRequestPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->hasPermission('service_requests.read');
    }

    public function view(User $actor, WasteServiceRequest $serviceRequest): bool
    {
        return $actor->hasPermission('service_requests.read')
            && ($serviceRequest->isAccessibleBy($actor) || $this->hasAnyItemAssignedTo($serviceRequest, $actor));
    }

    /**
     * D-S25/RN-191: además del permiso, la organización actora debe tener la
     * capacidad de negocio `can_generate_waste` (reutiliza
     * `Organization::hasCapability()`) -- solo un Generador puede crear
     * solicitudes de servicio. Se evalúa sobre `$organizationId` explícito
     * (no siempre `$actor->tenant_organization_id`: platform staff puede
     * crear en nombre de cualquier organización, ver
     * `ServiceRequestController::store()`).
     */
    public function create(User $actor, ?int $organizationId = null): bool
    {
        if (! $actor->hasPermission('service_requests.create')) {
            return false;
        }

        if ($actor->isPlatformStaff()) {
            return true;
        }

        $organizationId ??= $actor->tenant_organization_id;
        $organization = Organization::query()->find($organizationId);

        return $organization !== null && $organization->hasCapability('can_generate_waste');
    }

    /**
     * D-S15/D-S17: solo el Generador dueño (o platform staff) puede editar,
     * y solo mientras la solicitud NO esté en un estado final
     * (`service_statuses.is_terminal_status`).
     */
    public function update(User $actor, WasteServiceRequest $serviceRequest): bool
    {
        return $actor->hasPermission('service_requests.update')
            && $serviceRequest->isAccessibleBy($actor)
            && ! $serviceRequest->serviceStatus?->is_terminal_status;
    }

    /**
     * RN-SOL-009/CU-016: solo el Generador dueño (o platform staff) puede
     * cancelar, y solo mientras la solicitud NO esté ya en un estado final.
     */
    public function cancel(User $actor, WasteServiceRequest $serviceRequest): bool
    {
        return $actor->hasPermission('service_requests.cancel')
            && $serviceRequest->isAccessibleBy($actor)
            && ! $serviceRequest->serviceStatus?->is_terminal_status;
    }

    /**
     * D-S25: SOLO el Gestor dueño de ESTE ítem específico (o platform staff)
     * -- ver `WasteServiceRequestItem::isEvaluableBy()`.
     */
    public function evaluateItem(User $actor, WasteServiceRequestItem $item): bool
    {
        return $actor->hasPermission('service_requests.evaluate') && $item->isEvaluableBy($actor);
    }

    private function hasAnyItemAssignedTo(WasteServiceRequest $serviceRequest, User $actor): bool
    {
        if ($actor->tenant_organization_id === null) {
            return false;
        }

        return $serviceRequest->items()
            ->whereHas('wasteTreatmentApproval', fn ($query) => $query->where('organization_id', $actor->tenant_organization_id))
            ->exists();
    }
}
