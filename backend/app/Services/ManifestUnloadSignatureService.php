<?php

namespace App\Services;

use App\Models\ManifestUnload;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Módulo Manifiesto de Descargue, Fase 5 -- firma bilateral
 * (`receiver_person_id`/`driver_signer_person_id`), MISMO patrón EXACTO que
 * `ManifestLoadSignatureService` (Fase 3), con los lados renombrados:
 * "generador" -> "receptor" (organización RECEPTORA en planta del Gestor).
 *
 * "Firmar" en este sistema: un usuario autenticado AUTORIZADO de la
 * organización correspondiente marca la firma en nombre del firmante
 * registrado -- NO se exige que el `User` autenticado sea literalmente la
 * misma `Person` (mismo criterio que Fase 3).
 */
class ManifestUnloadSignatureService
{
    public const SIGNER_RECEIVER = 'RECEIVER';

    public const SIGNER_DRIVER = 'DRIVER';

    private const SIGNABLE_STATUSES = ['GENERATED', 'PARTIALLY_SIGNED'];

    /**
     * @param  string  $signerType  self::SIGNER_RECEIVER | self::SIGNER_DRIVER
     */
    public static function sign(ManifestUnload $manifestUnload, User $actor, string $signerType): ManifestUnload
    {
        if (! in_array($signerType, [self::SIGNER_RECEIVER, self::SIGNER_DRIVER], true)) {
            throw new \InvalidArgumentException("Tipo de firmante inválido: '{$signerType}'.");
        }

        self::assertActorCanSign($manifestUnload, $actor, $signerType);

        $manifestUnload->loadMissing('manifestStatus');
        $currentCode = $manifestUnload->manifestStatus?->code;

        if (! in_array($currentCode, self::SIGNABLE_STATUSES, true)) {
            throw ValidationException::withMessages([
                'manifest_status' => ['Solo se puede firmar un manifiesto en estado Generado o Parcialmente Firmado.'],
            ]);
        }

        $signedAtColumn = $signerType === self::SIGNER_RECEIVER ? 'receiver_signed_at' : 'driver_signed_at';

        if ($manifestUnload->{$signedAtColumn} !== null) {
            throw ValidationException::withMessages([
                'signer_type' => ['Este manifiesto ya fue firmado por '.($signerType === self::SIGNER_RECEIVER ? 'el receptor' : 'el conductor').'.'],
            ]);
        }

        return DB::transaction(function () use ($manifestUnload, $actor, $signedAtColumn) {
            $manifestUnload->forceFill([$signedAtColumn => now()])->save();
            $manifestUnload->refresh();

            $bothSigned = $manifestUnload->receiver_signed_at !== null && $manifestUnload->driver_signed_at !== null;
            $targetCode = $bothSigned ? 'SIGNED' : 'PARTIALLY_SIGNED';

            return ManifestUnloadWorkflowService::transition($manifestUnload, $actor, $targetCode);
        });
    }

    /**
     * Anti-IDOR: firmar como RECEPTOR exige pertenecer a la organización
     * RECEPTORA (`receiving_organization_id`); firmar como CONDUCTOR exige
     * pertenecer a la organización del lado transportador
     * (`ManifestUnload::carrierOrganizationId()`, derivada de la
     * `unload_request` asociada -- ya cubre autotransporte, ver su
     * docblock). platform staff siempre pasa.
     */
    private static function assertActorCanSign(ManifestUnload $manifestUnload, User $actor, string $signerType): void
    {
        if ($actor->isPlatformStaff()) {
            return;
        }

        $expectedOrganizationId = $signerType === self::SIGNER_RECEIVER
            ? $manifestUnload->receiving_organization_id
            : $manifestUnload->carrierOrganizationId();

        if ($expectedOrganizationId === null || $expectedOrganizationId !== $actor->tenant_organization_id) {
            $signerLabel = $signerType === self::SIGNER_RECEIVER ? 'del receptor' : 'del conductor';

            abort(403, "No tiene acceso para firmar este manifiesto en representación {$signerLabel}.");
        }
    }
}
