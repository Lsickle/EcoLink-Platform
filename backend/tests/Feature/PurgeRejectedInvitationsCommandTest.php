<?php

use App\Models\InvitationRequest;
use App\Models\SecurityLog;

// Retención de 90 días para invitation_requests REJECTED (decisión explícita
// del usuario del proyecto, revisión de seguridad del mecanismo de
// invitación, 2026-07-14). Hard delete real -- InvitationRequest no tiene
// SoftDeletes.

test('purga solo REJECTED con más de 90 días, deja intactas PENDING/APPROVED y REJECTED recientes', function () {
    $oldRejected = InvitationRequest::factory()->create([
        'status' => 'REJECTED',
        'reviewed_at' => now()->subDays(91),
    ]);
    $recentRejected = InvitationRequest::factory()->create([
        'status' => 'REJECTED',
        'reviewed_at' => now()->subDays(10),
    ]);
    $pending = InvitationRequest::factory()->create([
        'status' => 'PENDING',
        'reviewed_at' => null,
    ]);
    $approved = InvitationRequest::factory()->create([
        'status' => 'APPROVED',
        'reviewed_at' => now()->subDays(200),
    ]);

    $this->artisan('invitations:purge-rejected')->assertExitCode(0);

    expect(InvitationRequest::query()->whereKey($oldRejected->id)->exists())->toBeFalse()
        ->and(InvitationRequest::query()->whereKey($recentRejected->id)->exists())->toBeTrue()
        ->and(InvitationRequest::query()->whereKey($pending->id)->exists())->toBeTrue()
        ->and(InvitationRequest::query()->whereKey($approved->id)->exists())->toBeTrue();
});

test('registra un SecurityLog resumen con la cantidad purgada, incluso cuando purga 0', function () {
    $this->artisan('invitations:purge-rejected')->assertExitCode(0);

    $log = SecurityLog::query()->where('event_type', 'INVITATION_REQUESTS_PURGED')->firstOrFail();
    expect($log->result)->toBe('SUCCESS')
        ->and($log->metadata['purged_count'])->toBe(0);
});

test('el evento del SecurityLog refleja la cantidad real purgada cuando hay filas', function () {
    InvitationRequest::factory()->create(['status' => 'REJECTED', 'reviewed_at' => now()->subDays(91)]);
    InvitationRequest::factory()->create(['status' => 'REJECTED', 'reviewed_at' => now()->subDays(95)]);

    $this->artisan('invitations:purge-rejected')->assertExitCode(0);

    $log = SecurityLog::query()->where('event_type', 'INVITATION_REQUESTS_PURGED')->firstOrFail();
    expect($log->metadata['purged_count'])->toBe(2);
});
