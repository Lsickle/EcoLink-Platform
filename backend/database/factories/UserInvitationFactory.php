<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\UserInvitation;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<UserInvitation>
 */
class UserInvitationFactory extends Factory
{
    protected $model = UserInvitation::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'token_hash' => Hash::make(Str::random(40)),
            'invited_by' => null,
            'expires_at' => now()->addDays(UserInvitation::INVITATION_TTL_DAYS),
            'accepted_at' => null,
            'resend_count' => 0,
        ];
    }
}
