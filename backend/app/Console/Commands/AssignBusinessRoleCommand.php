<?php

namespace App\Console\Commands;

use App\Models\BusinessRole;
use App\Models\Organization;
use App\Models\OrganizationBusinessRole;
use App\Models\SecurityLog;
use Illuminate\Console\Command;

/**
 * Eje 2 de autorización: no hay todavía ningún endpoint HTTP de
 * Organizaciones/business_roles (fuera de alcance de este lote, sin módulo
 * operativo que lo consuma) -- este comando es la única forma de asignar un
 * business_role a una organización por ahora, mismo patrón operativo que
 * AssignRoleCommand (eje 1).
 */
class AssignBusinessRoleCommand extends Command
{
    protected $signature = 'organization:assign-business-role
        {organization_id : ID de la organización a la que se le asignará el business_role}
        {code : Código del business_role a asignar (p. ej. GESTOR)}
        {--force : Omite la confirmación interactiva (uso en scripts/no interactivo).}';

    protected $description = 'Asigna un business_role (p. ej. GESTOR) a una organización existente por id -- uso: php artisan organization:assign-business-role 1 GESTOR';

    public function handle(): int
    {
        $organizationId = $this->argument('organization_id');
        $code = strtoupper((string) $this->argument('code'));

        $organization = Organization::query()->find($organizationId);

        if (! $organization) {
            $this->error("No se encontró ninguna organización con id '{$organizationId}'.");

            return self::FAILURE;
        }

        $businessRole = BusinessRole::query()->where('code', $code)->first();

        if (! $businessRole) {
            $this->error("No se encontró ningún business_role con código '{$code}'. Códigos disponibles: "
                .BusinessRole::query()->pluck('code')->implode(', '));

            return self::FAILURE;
        }

        $alreadyAssigned = OrganizationBusinessRole::query()
            ->where('organization_id', $organization->id)
            ->where('business_role_id', $businessRole->id)
            ->where('is_active', true)
            ->exists();

        if ($alreadyAssigned) {
            $this->info("La organización '{$organizationId}' ya tiene asignado el business_role '{$code}' -- nada que hacer.");

            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm("¿Confirmas asignar el business_role '{$code}' a la organización '{$organization->legal_name}' (id {$organizationId})?")) {
            $this->warn('Operación cancelada -- no se asignó ningún business_role.');

            return self::FAILURE;
        }

        OrganizationBusinessRole::query()->updateOrCreate(
            ['organization_id' => $organization->id, 'business_role_id' => $businessRole->id],
            ['assigned_at' => now(), 'is_active' => true],
        );

        // Mismo criterio que AssignRoleCommand (RN-038): toda asignación de
        // business_role queda auditada, sin actor autenticado de la app
        // (acción de consola). risk_level es dinámico según las capacidades
        // regulatorias que habilita el business_role asignado (hallazgo
        // Medio, especialista-seguridad 2026-07-14) -- ver
        // riskLevelFor().
        SecurityLog::query()->create([
            'tenant_organization_id' => $organization->id,
            'event_type' => 'BUSINESS_ROLE_ASSIGNED_CONSOLE',
            'result' => 'SUCCESS',
            'description' => "Business_role '{$code}' asignado manualmente a la organización '{$organization->legal_name}' (id {$organizationId}) vía comando Artisan organization:assign-business-role.",
            'risk_level' => $this->riskLevelFor($businessRole),
        ]);

        $this->info("Business_role '{$code}' asignado correctamente a la organización '{$organization->legal_name}' (id {$organizationId}).");

        return self::SUCCESS;
    }

    /**
     * risk_level dinámico según los flags de capacidad del business_role
     * asignado (hallazgo Medio, especialista-seguridad 2026-07-14): las
     * capacidades regulatorias RESPEL (aprobación de tratamientos, emisión
     * de manifiestos/certificados de disposición) son HIGH; cualquier otro
     * flag de capacidad en true (generar/transportar/tratar residuos,
     * requerir licencia/autorización) es MEDIUM; un business_role sin
     * ningún flag en true (p. ej. COMERCIALIZADOR hoy) es LOW. Mismos
     * valores de risk_level que ya usa SecurityLog en el resto del código
     * (LOW/HIGH), sin introducir un valor nuevo.
     */
    private function riskLevelFor(BusinessRole $businessRole): string
    {
        $highRiskFlags = ['can_approve_treatments', 'can_issue_disposal_certificates', 'can_issue_manifests'];

        $otherCapabilityFlags = [
            'can_generate_waste', 'can_transport_waste', 'can_treat_waste',
            'requires_environmental_license', 'requires_transport_authorization',
        ];

        foreach ($highRiskFlags as $flag) {
            if ($businessRole->{$flag}) {
                return 'HIGH';
            }
        }

        foreach ($otherCapabilityFlags as $flag) {
            if ($businessRole->{$flag}) {
                return 'MEDIUM';
            }
        }

        return 'LOW';
    }
}
