<?php

namespace App\Services;

use App\Models\ManifestLoad;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Módulo Manifiesto de Cargue, Fase 3 -- RN-193 ("no puede iniciarse
 * transporte sin firma completa"). Capa de servicio PROPIA (no en el motor
 * de Workflow genérico), mismo patrón exacto que
 * `ServiceRequestApprovalService`/D-S27: decide CUÁNDO recalcular el
 * agregado de cabecera (`manifest_status_id`) evaluando las 2 firmas, pero
 * reutiliza `ManifestLoadWorkflowService::transition()` para la MECÁNICA de
 * mover el estado (transición real del motor + `WorkflowLog`).
 *
 * "Firmar" en este sistema (decisión de diseño de esta tarea, punto 8 del
 * enunciado): un usuario autenticado AUTORIZADO de la organización
 * correspondiente marca la firma en nombre del firmante registrado -- NO se
 * exige que el `User` autenticado sea literalmente la misma `Person`
 * (`generator_signer_person_id`/`driver_signer_person_id` son solo el
 * REGISTRO de quién firmó, no una identidad que deba coincidir con el
 * actor). Mismo criterio de simplicidad ya usado en el resto del proyecto
 * (p. ej. `responsible_user_id` en `TransportSchedule`, un campo puramente
 * informativo sin requerir que el actor SEA esa persona).
 */
class ManifestLoadSignatureService
{
    public const SIGNER_GENERATOR = 'GENERATOR';

    public const SIGNER_DRIVER = 'DRIVER';

    private const SIGNABLE_STATUSES = ['GENERATED', 'PARTIALLY_SIGNED'];

    /**
     * @param  string  $signerType  self::SIGNER_GENERATOR | self::SIGNER_DRIVER
     */
    public static function sign(ManifestLoad $manifestLoad, User $actor, string $signerType): ManifestLoad
    {
        if (! in_array($signerType, [self::SIGNER_GENERATOR, self::SIGNER_DRIVER], true)) {
            throw new \InvalidArgumentException("Tipo de firmante inválido: '{$signerType}'.");
        }

        self::assertActorCanSign($manifestLoad, $actor, $signerType);

        $manifestLoad->loadMissing('manifestStatus');
        $currentCode = $manifestLoad->manifestStatus?->code;

        if (! in_array($currentCode, self::SIGNABLE_STATUSES, true)) {
            throw ValidationException::withMessages([
                'manifest_status' => ['Solo se puede firmar un manifiesto en estado Generado o Parcialmente Firmado.'],
            ]);
        }

        $signedAtColumn = $signerType === self::SIGNER_GENERATOR ? 'generator_signed_at' : 'driver_signed_at';

        if ($manifestLoad->{$signedAtColumn} !== null) {
            throw ValidationException::withMessages([
                'signer_type' => ['Este manifiesto ya fue firmado por '.($signerType === self::SIGNER_GENERATOR ? 'el generador' : 'el conductor').'.'],
            ]);
        }

        return DB::transaction(function () use ($manifestLoad, $actor, $signedAtColumn) {
            $manifestLoad->forceFill([$signedAtColumn => now()])->save();
            $manifestLoad->refresh();

            $bothSigned = $manifestLoad->generator_signed_at !== null && $manifestLoad->driver_signed_at !== null;
            $targetCode = $bothSigned ? 'SIGNED' : 'PARTIALLY_SIGNED';

            return ManifestLoadWorkflowService::transition($manifestLoad, $actor, $targetCode);
        });
    }

    /**
     * Anti-IDOR (decisión de diseño de esta tarea, punto 8): firmar como
     * GENERADOR exige pertenecer a la organización Generadora dueña de la
     * sede de cargue (`ManifestLoad::generatorOrganizationId()`); firmar
     * como CONDUCTOR exige pertenecer a la organización Transportadora
     * (`carrier_organization_id`, la misma que programó el transporte).
     * platform staff siempre pasa.
     */
    private static function assertActorCanSign(ManifestLoad $manifestLoad, User $actor, string $signerType): void
    {
        if ($actor->isPlatformStaff()) {
            return;
        }

        $expectedOrganizationId = $signerType === self::SIGNER_GENERATOR
            ? $manifestLoad->generatorOrganizationId()
            : $manifestLoad->carrier_organization_id;

        if ($expectedOrganizationId === null || $expectedOrganizationId !== $actor->tenant_organization_id) {
            $signerLabel = $signerType === self::SIGNER_GENERATOR ? 'del generador' : 'del conductor';

            abort(403, "No tiene acceso para firmar este manifiesto en representación {$signerLabel}.");
        }
    }
}
