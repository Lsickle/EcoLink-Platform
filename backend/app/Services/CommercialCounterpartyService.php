<?php

namespace App\Services;

use App\Models\GeneratorGestorRelationship;
use App\Models\GeneratorSubgestorRelationship;
use App\Models\Organization;
use App\Models\WasteTreatmentApproval;
use Illuminate\Support\Collection;

/**
 * Quién es la CONTRAPARTE COMERCIAL de un Generador, y a quién le pertenece una
 * evaluación de tratamiento ya registrada.
 *
 * Nace con las Solicitudes de Servicio (2026-08-18), donde una solicitud pasa a
 * tener UN SOLO destinatario y hay que decidir quién es. Hasta ahora la
 * pregunta "¿qué Gestores/Subgestores están vinculados a esta organización?"
 * vivía duplicada inline en más de una docena de sitios
 * (`Waste::isForwardableBySubgestor()`/`ByGestor()`,
 * `WasteController::applyOrganizationVisibility()`,
 * `User::hasActiveGeneratorRelationshipWith()`, `BranchTreatmentController`,
 * `WasteTreatmentApprovalController`…). Este servicio NO los refactoriza -- eso
 * sería un cambio transversal de riesgo innecesario aquí -- pero es el punto
 * único al que deberían converger.
 */
class CommercialCounterpartyService
{
    /**
     * Las organizaciones con vínculo comercial ACTIVO hacia este Generador, de
     * cualquiera de las dos tablas de relación, cada una con el papel por el
     * que aparece.
     *
     * Una misma organización puede figurar en las dos (Gestor con el que
     * además se tiene relación como Subgestor); se devuelve una sola vez,
     * conservando el papel de Gestor, que es el más específico.
     *
     * @return Collection<int, array{organization: Organization, role: 'GESTOR'|'SUBGESTOR'}>
     */
    public function counterpartiesFor(Organization $generator): Collection
    {
        $gestorIds = GeneratorGestorRelationship::query()
            ->where('generator_organization_id', $generator->id)
            ->where('is_active', true)
            ->pluck('gestor_organization_id');

        $subgestorIds = GeneratorSubgestorRelationship::query()
            ->where('generator_organization_id', $generator->id)
            ->where('is_active', true)
            ->pluck('subgestor_organization_id');

        $organizations = Organization::query()
            ->whereIn('id', $gestorIds->merge($subgestorIds)->unique())
            ->get()
            ->keyBy('id');

        return $organizations->map(fn (Organization $organization) => [
            'organization' => $organization,
            'role' => $gestorIds->contains($organization->id) ? 'GESTOR' : 'SUBGESTOR',
        ])->values();
    }

    /**
     * A quién le pertenece comercialmente una evaluación ya registrada.
     *
     * REGLA: si hubo intermediario, GANA EL INTERMEDIARIO. Un residuo evaluado
     * a través de un Subgestor solo se le puede solicitar a ese Subgestor,
     * aunque el Generador tuviera además relación directa con el Gestor que lo
     * evaluó -- la relación comercial de ESE residuo pasó por el Subgestor.
     *
     * | Caso                                   | Columnas de la evaluación         | Contraparte  | Gestor detrás     |
     * |----------------------------------------|-----------------------------------|--------------|-------------------|
     * | Directo a Gestor                       | ambas intermediarias en `null`    | organization | el mismo          |
     * | Subgestor con Gestor DE REFERENCIA     | `delegated_by_organization_id`    | el Subgestor | organization      |
     * | Subgestor que REENVIÓ a Gestor operativo | `forwarded_by_organization_id`  | el Subgestor | organization      |
     *
     * Las dos vías con intermediario se tratan igual por simetría: el usuario
     * describió el caso DELEGADO, y el reenviado comparte exactamente la misma
     * lógica comercial (el Generador nunca tuvo trato con el Gestor final).
     * `delegated_by` tiene prioridad sobre `forwarded_by` por si alguna fila
     * llegara a traer ambas.
     *
     * @return array{counterparty_organization_id: int, gestor_organization_id: int}
     */
    public function resolveForApproval(WasteTreatmentApproval $approval): array
    {
        $intermediaryId = $approval->delegated_by_organization_id ?? $approval->forwarded_by_organization_id;

        return [
            'counterparty_organization_id' => (int) ($intermediaryId ?? $approval->organization_id),
            'gestor_organization_id' => (int) $approval->organization_id,
        ];
    }
}
