<?php

namespace Database\Factories;

use App\Models\File;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<File>
 */
class FileFactory extends Factory
{
    protected $model = File::class;

    public function definition(): array
    {
        $storedFilename = Str::uuid()->toString().'.jpg';

        return [
            'entity_type' => 'WASTE',
            'entity_id' => \App\Models\Waste::factory(),
            'file_category' => 'WASTE_PHOTO',
            'original_filename' => fake()->word().'.jpg',
            'stored_filename' => $storedFilename,
            'file_extension' => 'jpg',
            'mime_type' => 'image/jpeg',
            'file_size_bytes' => fake()->numberBetween(1000, 500000),
            'file_hash_sha256' => hash('sha256', $storedFilename),
            'storage_provider' => 'local',
            'storage_path' => "files/waste/1/WASTE_PHOTO/{$storedFilename}",
            'visibility_level' => 'INTERNAL',
            'is_active' => true,
            'uploaded_at' => now(),
        ];
    }
}
