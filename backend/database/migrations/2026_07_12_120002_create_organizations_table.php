<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// esquema-bd: organizations. created_by/updated_by -> users.id se agregan
// como columna simple aquí (users todavía no existe en este punto de la
// cadena de migraciones) y su FK se añade en
// add_audit_foreign_keys_to_organizations_and_people_tables una vez que
// `users` ya existe. logo_file_id se deja sin FK: la tabla `files` no
// entra en el alcance de este lote de migraciones (auth/org/people).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('organizations', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->string('legal_name');
            $table->string('trade_name')->nullable();
            $table->string('tax_id', 30); // unicidad compuesta con tax_id_type (RN-002 / T-04), no global
            $table->string('tax_id_type', 30)->default('NIT');
            $table->string('email')->nullable();
            $table->string('phone', 30)->nullable();
            $table->string('website')->nullable();
            $table->unsignedBigInteger('logo_file_id')->nullable(); // FK -> files.id, pendiente (files fuera de alcance)
            $table->foreignId('organization_status_id')->constrained('organization_statuses')->restrictOnDelete();
            $table->date('registration_date')->default(DB::raw('CURRENT_DATE'));
            $table->boolean('is_active')->default(true);
            // D-CER-04: exactamente una fila TRUE (EcoLink) en todo el sistema.
            $table->boolean('is_platform_tenant')->default(false);
            $table->text('observations')->nullable();
            $table->uuid('traceability_uuid')->unique()->default(DB::raw('gen_random_uuid()'));
            $table->timestampTz('created_at')->useCurrent();
            $table->unsignedBigInteger('created_by')->nullable(); // FK -> users.id, ver migración de FKs de auditoría
            $table->timestampTz('updated_at')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable(); // FK -> users.id, ver migración de FKs de auditoría
            $table->string('economic_activity_code', 20)->nullable();
            $table->string('economic_activity_name')->nullable();
            $table->string('environmental_authority')->nullable();
            $table->string('environmental_registration', 100)->nullable();
            $table->string('billing_email')->nullable();
            $table->string('support_email')->nullable();
            $table->string('timezone', 50)->default('America/Bogota');
            $table->string('country_code', 5)->default('CO');
            $table->string('currency_code', 5)->default('COP');
            $table->string('company_size', 30)->nullable();
            $table->integer('employee_count')->nullable();
            $table->date('customer_since')->nullable();
            $table->string('risk_level', 20)->nullable()->default('BAJO');
            $table->jsonb('metadata_json')->nullable()->default(DB::raw("'{}'::jsonb"));
            $table->boolean('custom_fields_enabled')->default(true);
            $table->decimal('storage_quota_gb', 10, 2)->nullable()->default(10.00);
            $table->decimal('storage_used_gb', 10, 2)->nullable()->default(0.00);
            $table->timestampTz('last_activity_at')->nullable();
            $table->date('contract_expiration_date')->nullable();
            $table->foreignId('parent_organization_id')->nullable()->constrained('organizations')->restrictOnDelete();
            // Soft-delete (D-P05 / L-04): sin borrado físico desde la app (RN-ORG-019).
            $table->timestampTz('deleted_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organizations');
    }
};
