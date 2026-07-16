<?php

namespace Database\Factories;

use App\Models\InvitationRequest;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<InvitationRequest>
 */
class InvitationRequestFactory extends Factory
{
    protected $model = InvitationRequest::class;

    public function definition(): array
    {
        return [
            'document_type' => 'CC',
            'document_number' => fake()->unique()->numerify('##########'),
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->safeEmail(),
            'phone' => fake()->numerify('3##########'),
            'status' => 'PENDING',
        ];
    }
}
