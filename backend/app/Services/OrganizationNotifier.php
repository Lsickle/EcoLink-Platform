<?php

namespace App\Services;

use App\Models\Organization;
use App\Models\User;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Notification as NotificationFacade;

/**
 * Avisar a una ORGANIZACIÓN, no a un usuario concreto: resuelve los usuarios
 * activos con el permiso indicado y, si ninguno tiene un correo alcanzable,
 * cae al correo de la organización.
 *
 * El respaldo existe porque un Generador recién autoprovisionado por Carga
 * Masiva nace con un correo placeholder sintético
 * (`{username}@sin-correo.invalid`, ver
 * `UserProvisioningService::createActiveAdminForOrganization()`) que siempre
 * rebota. El `email` de la organización es obligatorio al crearla justamente
 * para poder servir de respaldo.
 *
 * AVISO: `GeneratorGestorRelationshipController`/
 * `GeneratorSubgestorRelationshipController` tienen su PROPIA copia de esta
 * lógica, anterior (2026-08-13) y con un respaldo más estrecho: solo caen al
 * correo de la organización si había usuarios y TODOS eran inalcanzables --
 * si no hay ninguno, no envían nada. Aquí el respaldo cubre también ese caso,
 * que es el que importa cuando el destinatario no tiene todavía usuarios con
 * el permiso. No se retrofitan esos dos controllers desde aquí para no
 * cambiarles el comportamiento de forma silenciosa; unificarlos es un cambio
 * aparte.
 */
class OrganizationNotifier
{
    public static function notify(int $organizationId, string $permissionCode, Notification $notification): void
    {
        $recipients = User::activeUsersInOrganizationWithPermission($organizationId, $permissionCode)
            ->reject(fn (User $user) => UserProvisioningService::hasPlaceholderEmail($user));

        if ($recipients->isNotEmpty()) {
            NotificationFacade::send($recipients, $notification);

            return;
        }

        $organization = Organization::query()->find($organizationId);

        // Sin correo de organización (dato legado, anterior a que fuera
        // obligatorio) no se envía nada: no hay a dónde.
        if ($organization?->email !== null) {
            NotificationFacade::route('mail', $organization->email)->notify($notification);
        }
    }
}
