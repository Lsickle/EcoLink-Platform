<?php

use App\Http\Controllers\Api\Admin\BranchController;
use App\Http\Controllers\Api\Admin\BranchLocationController;
use App\Http\Controllers\Api\Admin\BranchTreatmentController;
use App\Http\Controllers\Api\Admin\BranchTypeController;
use App\Http\Controllers\Api\Admin\BusinessRoleController;
use App\Http\Controllers\Api\Admin\CancellationReasonController;
use App\Http\Controllers\Api\Admin\ContactController;
use App\Http\Controllers\Api\Admin\CountryController;
use App\Http\Controllers\Api\Admin\DepartmentController;
use App\Http\Controllers\Api\Admin\FileController;
use App\Http\Controllers\Api\Admin\GenerationFrequencyController;
use App\Http\Controllers\Api\Admin\GestorCarrierAuthorizationController;
use App\Http\Controllers\Api\Admin\HazardCharacteristicController;
use App\Http\Controllers\Api\Admin\LocalityController;
use App\Http\Controllers\Api\Admin\ManifestLoadController;
use App\Http\Controllers\Api\Admin\MeasurementUnitController;
use App\Http\Controllers\Api\Admin\MunicipalityController;
use App\Http\Controllers\Api\Admin\OrganizationalAreaController;
use App\Http\Controllers\Api\Admin\OrganizationController;
use App\Http\Controllers\Api\Admin\OrganizationStatusController;
use App\Http\Controllers\Api\Admin\PackagingConditionController;
use App\Http\Controllers\Api\Admin\PackagingTypeController;
use App\Http\Controllers\Api\Admin\PermissionController;
use App\Http\Controllers\Api\Admin\PhysicalStateController;
use App\Http\Controllers\Api\Admin\PlantReceptionScheduleController;
use App\Http\Controllers\Api\Admin\PreapprovedWasteController;
use App\Http\Controllers\Api\Admin\RespelStatusController;
use App\Http\Controllers\Api\Admin\RoleController;
use App\Http\Controllers\Api\Admin\ServiceRequestController;
use App\Http\Controllers\Api\Admin\TransportPersonnelController;
use App\Http\Controllers\Api\Admin\TransportRouteController;
use App\Http\Controllers\Api\Admin\TransportScheduleController;
use App\Http\Controllers\Api\Admin\TreatmentController;
use App\Http\Controllers\Api\Admin\UnCodeController;
use App\Http\Controllers\Api\Admin\UnloadRequestController;
use App\Http\Controllers\Api\Admin\UserManagementController;
use App\Http\Controllers\Api\Admin\VehicleController;
use App\Http\Controllers\Api\Admin\VehicleTypeController;
use App\Http\Controllers\Api\Admin\WasteCategoryController;
use App\Http\Controllers\Api\Admin\WasteController;
use App\Http\Controllers\Api\Admin\WasteOperationalStatusController;
use App\Http\Controllers\Api\Admin\WasteStreamController;
use App\Http\Controllers\Api\Admin\WasteTreatmentApprovalController;
use App\Http\Controllers\Api\Admin\WasteTypeController;
use App\Http\Controllers\Api\Admin\WorkflowController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\InvitationController;
use App\Http\Controllers\Api\InvitationRequestController;
use App\Http\Controllers\Api\PasswordRecoveryController;
use Illuminate\Support\Facades\Route;

// RN-181: login y aceptación de invitación son públicos; el resto exige
// sesión Sanctum (cookie web o token Bearer móvil, según cómo se autenticó
// el cliente).
//
// Mecanismo de invitación (reemplaza el registro público): `POST /register`
// se ELIMINÓ -- ya no existe alta pública de usuarios. `POST
// /invitations/accept` es el nuevo punto de entrada público, pero requiere
// una invitación previa emitida por un admin (o el comando de consola
// `user:create-admin` para el primer usuario) -- no es alta libre.
//
// Hallazgo CRÍTICO (especialista-seguridad, 2026-07-13): /login lleva rate
// limiting dedicado (ver AppServiceProvider::configureRateLimiting()) -- sin
// él, quedaba abierto a fuerza bruta distribuida y DoS por costo de bcrypt.
// Mismo criterio aplicado a `invitation-accept` desde su creación.
Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::post('/invitations/accept', [InvitationController::class, 'accept'])->middleware('throttle:invitation-accept');

// Solicitud de invitación (tarea 2 del mecanismo de invitación, reemplaza el
// registro público): formulario público donde alguien pide acceso, revisado
// después por un ADMINISTRADOR vía admin/invitation-requests/*.
Route::post('/invitation-requests', [InvitationRequestController::class, 'store'])->middleware('throttle:invitation-request');

// CU-009 (recorte MVP): recuperación de contraseña por autoservicio, sin
// sesión -- los 3 pasos comparten el limiter `password-recovery` a
// propósito (se tratan como un solo presupuesto de intentos por IP+correo,
// ver AppServiceProvider::configureRateLimiting()).
Route::post('/password/forgot', [PasswordRecoveryController::class, 'forgot'])->middleware('throttle:password-recovery');
Route::post('/password/verify-code', [PasswordRecoveryController::class, 'verifyCode'])->middleware('throttle:password-recovery');
Route::post('/password/reset', [PasswordRecoveryController::class, 'reset'])->middleware('throttle:password-recovery');

// Hallazgo Alto (especialista-seguridad, 2026-07-13): `active` corta con
// 403 si la sesión pertenece a una cuenta bloqueada/inactiva -- ver
// EnsureUserIsActive. Corre para TODO el grupo (incluye logout/me/password),
// no solo Admin/*.
Route::middleware(['auth:sanctum', 'active'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/user', [AuthController::class, 'me']);
    Route::put('/password', [AuthController::class, 'changePassword']);

    // CU-006/007/008 (Gestionar Usuarios/Roles/Permisos) -- gateadas por
    // Policy (App\Policies), que a su vez delega en User::hasPermission().
    // AVISO: sin prefijo `/api/v1/` -- las specs fuente lo usan, pero el
    // resto de la app (rutas de arriba) no versiona todavía; se sigue la
    // convención ya establecida en vez de introducir una inconsistencia.
    Route::prefix('admin')->name('admin.')->group(function () {
        Route::get('users', [UserManagementController::class, 'index'])->name('users.index');
        Route::post('users', [UserManagementController::class, 'store'])->name('users.store');
        Route::get('users/{user}', [UserManagementController::class, 'show'])->name('users.show');
        Route::put('users/{user}', [UserManagementController::class, 'update'])->name('users.update');
        Route::post('users/{user}/activate', [UserManagementController::class, 'activate'])->name('users.activate');
        Route::post('users/{user}/deactivate', [UserManagementController::class, 'deactivate'])->name('users.deactivate');
        Route::post('users/{user}/resend-invitation', [UserManagementController::class, 'resendInvitation'])->name('users.resend-invitation');
        // Hallazgo Medio (especialista-seguridad, 2026-07-14): sin
        // throttle, un admin podía spamear el correo OTP del usuario
        // objetivo o invalidar repetidamente un reset de autoservicio en
        // curso -- ver AppServiceProvider::configureRateLimiting().
        Route::post('users/{user}/reset-password', [UserManagementController::class, 'resetPassword'])->name('users.reset-password')->middleware('throttle:admin-password-reset');
        Route::get('users/{user}/activity', [UserManagementController::class, 'activity'])->name('users.activity');
        Route::post('users/{user}/roles/{role}/revoke', [UserManagementController::class, 'revokeRole'])->name('users.roles.revoke');

        Route::get('invitation-requests', [InvitationRequestController::class, 'index'])->name('invitation-requests.index');
        Route::post('invitation-requests/{invitationRequest}/approve', [InvitationRequestController::class, 'approve'])->name('invitation-requests.approve');
        Route::post('invitation-requests/{invitationRequest}/reject', [InvitationRequestController::class, 'reject'])->name('invitation-requests.reject');

        Route::get('roles', [RoleController::class, 'index'])->name('roles.index');
        Route::post('roles', [RoleController::class, 'store'])->name('roles.store');
        Route::get('roles/{role}', [RoleController::class, 'show'])->name('roles.show');
        Route::put('roles/{role}', [RoleController::class, 'update'])->name('roles.update');
        Route::delete('roles/{role}', [RoleController::class, 'destroy'])->name('roles.destroy');
        Route::post('roles/{role}/activate', [RoleController::class, 'activate'])->name('roles.activate');
        Route::post('roles/{role}/deactivate', [RoleController::class, 'deactivate'])->name('roles.deactivate');
        Route::post('roles/{role}/assign', [RoleController::class, 'assignToUser'])->name('roles.assign');
        Route::get('roles/{role}/users', [RoleController::class, 'users'])->name('roles.users');
        Route::get('roles/{role}/activity', [RoleController::class, 'activity'])->name('roles.activity');

        Route::get('permissions', [PermissionController::class, 'index'])->name('permissions.index');
        // `matrix-by-module` debe ir ANTES de `{permission}` -- si no, Laravel
        // intenta resolver "matrix-by-module" como route-model-binding de un
        // id de permiso y la ruta nunca hace match.
        Route::get('permissions/matrix-by-module', [PermissionController::class, 'matrixByModule'])->name('permissions.matrix-by-module');
        Route::get('permissions/{permission}', [PermissionController::class, 'show'])->name('permissions.show');
        Route::get('permissions/{permission}/roles', [PermissionController::class, 'roles'])->name('permissions.roles');
        Route::get('permissions/{permission}/users', [PermissionController::class, 'users'])->name('permissions.users');
        Route::get('permissions/{permission}/activity', [PermissionController::class, 'activity'])->name('permissions.activity');
        Route::post('permissions/{permission}/assign', [PermissionController::class, 'assignToRole'])->name('permissions.assign');
        Route::post('permissions/{permission}/revoke', [PermissionController::class, 'revokeFromRole'])->name('permissions.revoke');

        // Primer módulo real del dominio Residuos: catálogos "Corrientes de
        // Residuos" (Y/A) y "Códigos UN" -- independientes entre sí (ver
        // WasteStreamController/UnCodeController). `import` va ANTES de
        // `{wasteStream}`/`{unCode}` -- mismo criterio ya aplicado con
        // `permissions/matrix-by-module` (evita colisión de route-model-binding).
        Route::post('waste-streams/import', [WasteStreamController::class, 'import'])->name('waste-streams.import');
        Route::get('waste-streams', [WasteStreamController::class, 'index'])->name('waste-streams.index');
        Route::post('waste-streams', [WasteStreamController::class, 'store'])->name('waste-streams.store');
        Route::get('waste-streams/{wasteStream}', [WasteStreamController::class, 'show'])->name('waste-streams.show');
        Route::put('waste-streams/{wasteStream}', [WasteStreamController::class, 'update'])->name('waste-streams.update');
        Route::post('waste-streams/{wasteStream}/activate', [WasteStreamController::class, 'activate'])->name('waste-streams.activate');
        Route::post('waste-streams/{wasteStream}/deactivate', [WasteStreamController::class, 'deactivate'])->name('waste-streams.deactivate');

        Route::post('un-codes/import', [UnCodeController::class, 'import'])->name('un-codes.import');
        Route::get('un-codes', [UnCodeController::class, 'index'])->name('un-codes.index');
        Route::post('un-codes', [UnCodeController::class, 'store'])->name('un-codes.store');
        Route::get('un-codes/{unCode}', [UnCodeController::class, 'show'])->name('un-codes.show');
        Route::put('un-codes/{unCode}', [UnCodeController::class, 'update'])->name('un-codes.update');
        Route::post('un-codes/{unCode}/activate', [UnCodeController::class, 'activate'])->name('un-codes.activate');
        Route::post('un-codes/{unCode}/deactivate', [UnCodeController::class, 'deactivate'])->name('un-codes.deactivate');

        // Batch 1/3 de Catálogos Maestros: geografía en cascada (D-P01) +
        // Tipos de Sede + Áreas Organizacionales. Los 4 catálogos geográficos
        // (`countries`/`departments`/`municipalities`/`localities`) son de
        // solo lectura (sin store/update, ver docblock de cada controller) --
        // `branch-types` y `organizational-areas` sí tienen CRUD completo.
        Route::get('countries', [CountryController::class, 'index'])->name('countries.index');
        Route::get('countries/{country}', [CountryController::class, 'show'])->name('countries.show');
        Route::post('countries/{country}/activate', [CountryController::class, 'activate'])->name('countries.activate');
        Route::post('countries/{country}/deactivate', [CountryController::class, 'deactivate'])->name('countries.deactivate');

        Route::get('departments', [DepartmentController::class, 'index'])->name('departments.index');
        Route::get('departments/{department}', [DepartmentController::class, 'show'])->name('departments.show');
        Route::post('departments/{department}/activate', [DepartmentController::class, 'activate'])->name('departments.activate');
        Route::post('departments/{department}/deactivate', [DepartmentController::class, 'deactivate'])->name('departments.deactivate');

        Route::get('municipalities', [MunicipalityController::class, 'index'])->name('municipalities.index');
        Route::get('municipalities/{municipality}', [MunicipalityController::class, 'show'])->name('municipalities.show');
        Route::post('municipalities/{municipality}/activate', [MunicipalityController::class, 'activate'])->name('municipalities.activate');
        Route::post('municipalities/{municipality}/deactivate', [MunicipalityController::class, 'deactivate'])->name('municipalities.deactivate');

        Route::get('localities', [LocalityController::class, 'index'])->name('localities.index');
        Route::get('localities/{locality}', [LocalityController::class, 'show'])->name('localities.show');
        Route::post('localities/{locality}/activate', [LocalityController::class, 'activate'])->name('localities.activate');
        Route::post('localities/{locality}/deactivate', [LocalityController::class, 'deactivate'])->name('localities.deactivate');

        Route::get('branch-types', [BranchTypeController::class, 'index'])->name('branch-types.index');
        Route::post('branch-types', [BranchTypeController::class, 'store'])->name('branch-types.store');
        Route::get('branch-types/{branchType}', [BranchTypeController::class, 'show'])->name('branch-types.show');
        Route::put('branch-types/{branchType}', [BranchTypeController::class, 'update'])->name('branch-types.update');
        Route::post('branch-types/{branchType}/activate', [BranchTypeController::class, 'activate'])->name('branch-types.activate');
        Route::post('branch-types/{branchType}/deactivate', [BranchTypeController::class, 'deactivate'])->name('branch-types.deactivate');

        Route::get('organizational-areas', [OrganizationalAreaController::class, 'index'])->name('organizational-areas.index');
        Route::post('organizational-areas', [OrganizationalAreaController::class, 'store'])->name('organizational-areas.store');
        Route::get('organizational-areas/{organizationalArea}', [OrganizationalAreaController::class, 'show'])->name('organizational-areas.show');
        Route::put('organizational-areas/{organizationalArea}', [OrganizationalAreaController::class, 'update'])->name('organizational-areas.update');
        Route::post('organizational-areas/{organizationalArea}/activate', [OrganizationalAreaController::class, 'activate'])->name('organizational-areas.activate');
        Route::post('organizational-areas/{organizationalArea}/deactivate', [OrganizationalAreaController::class, 'deactivate'])->name('organizational-areas.deactivate');

        // Batch 2/3 de Catálogos Maestros (RESPEL): 3 catálogos globales
        // nuevos relacionados con residuos peligrosos -- CRUD completo,
        // mismo patrón exacto que branch-types/organizational-areas (sin
        // tenant scoping, sin import CSV).
        Route::get('hazard-characteristics', [HazardCharacteristicController::class, 'index'])->name('hazard-characteristics.index');
        Route::post('hazard-characteristics', [HazardCharacteristicController::class, 'store'])->name('hazard-characteristics.store');
        Route::get('hazard-characteristics/{hazardCharacteristic}', [HazardCharacteristicController::class, 'show'])->name('hazard-characteristics.show');
        Route::put('hazard-characteristics/{hazardCharacteristic}', [HazardCharacteristicController::class, 'update'])->name('hazard-characteristics.update');
        Route::post('hazard-characteristics/{hazardCharacteristic}/activate', [HazardCharacteristicController::class, 'activate'])->name('hazard-characteristics.activate');
        Route::post('hazard-characteristics/{hazardCharacteristic}/deactivate', [HazardCharacteristicController::class, 'deactivate'])->name('hazard-characteristics.deactivate');

        Route::get('waste-categories', [WasteCategoryController::class, 'index'])->name('waste-categories.index');
        Route::post('waste-categories', [WasteCategoryController::class, 'store'])->name('waste-categories.store');
        Route::get('waste-categories/{wasteCategory}', [WasteCategoryController::class, 'show'])->name('waste-categories.show');
        Route::put('waste-categories/{wasteCategory}', [WasteCategoryController::class, 'update'])->name('waste-categories.update');
        Route::post('waste-categories/{wasteCategory}/activate', [WasteCategoryController::class, 'activate'])->name('waste-categories.activate');
        Route::post('waste-categories/{wasteCategory}/deactivate', [WasteCategoryController::class, 'deactivate'])->name('waste-categories.deactivate');

        Route::get('physical-states', [PhysicalStateController::class, 'index'])->name('physical-states.index');
        Route::post('physical-states', [PhysicalStateController::class, 'store'])->name('physical-states.store');
        Route::get('physical-states/{physicalState}', [PhysicalStateController::class, 'show'])->name('physical-states.show');
        Route::put('physical-states/{physicalState}', [PhysicalStateController::class, 'update'])->name('physical-states.update');
        Route::post('physical-states/{physicalState}/activate', [PhysicalStateController::class, 'activate'])->name('physical-states.activate');
        Route::post('physical-states/{physicalState}/deactivate', [PhysicalStateController::class, 'deactivate'])->name('physical-states.deactivate');

        // Batch 3/3 (último) de Catálogos Maestros: `packaging-types` tiene
        // datos REALES confirmados (29 valores); `packaging-conditions` y
        // `vehicle-types` son PROVISIONALES, sin fuente de negocio
        // confirmada (ver AVISO en sus seeders/migraciones). CRUD completo,
        // mismo patrón exacto que hazard-characteristics/waste-categories.
        Route::get('packaging-types', [PackagingTypeController::class, 'index'])->name('packaging-types.index');
        Route::post('packaging-types', [PackagingTypeController::class, 'store'])->name('packaging-types.store');
        Route::get('packaging-types/{packagingType}', [PackagingTypeController::class, 'show'])->name('packaging-types.show');
        Route::put('packaging-types/{packagingType}', [PackagingTypeController::class, 'update'])->name('packaging-types.update');
        Route::post('packaging-types/{packagingType}/activate', [PackagingTypeController::class, 'activate'])->name('packaging-types.activate');
        Route::post('packaging-types/{packagingType}/deactivate', [PackagingTypeController::class, 'deactivate'])->name('packaging-types.deactivate');

        Route::get('packaging-conditions', [PackagingConditionController::class, 'index'])->name('packaging-conditions.index');
        Route::post('packaging-conditions', [PackagingConditionController::class, 'store'])->name('packaging-conditions.store');
        Route::get('packaging-conditions/{packagingCondition}', [PackagingConditionController::class, 'show'])->name('packaging-conditions.show');
        Route::put('packaging-conditions/{packagingCondition}', [PackagingConditionController::class, 'update'])->name('packaging-conditions.update');
        Route::post('packaging-conditions/{packagingCondition}/activate', [PackagingConditionController::class, 'activate'])->name('packaging-conditions.activate');
        Route::post('packaging-conditions/{packagingCondition}/deactivate', [PackagingConditionController::class, 'deactivate'])->name('packaging-conditions.deactivate');

        Route::get('vehicle-types', [VehicleTypeController::class, 'index'])->name('vehicle-types.index');
        Route::post('vehicle-types', [VehicleTypeController::class, 'store'])->name('vehicle-types.store');
        Route::get('vehicle-types/{vehicleType}', [VehicleTypeController::class, 'show'])->name('vehicle-types.show');
        Route::put('vehicle-types/{vehicleType}', [VehicleTypeController::class, 'update'])->name('vehicle-types.update');
        Route::post('vehicle-types/{vehicleType}/activate', [VehicleTypeController::class, 'activate'])->name('vehicle-types.activate');
        Route::post('vehicle-types/{vehicleType}/deactivate', [VehicleTypeController::class, 'deactivate'])->name('vehicle-types.deactivate');

        // CRUD de Organizaciones vs. Figma -- exclusivo de platform staff
        // (OrganizationController::isPlatformStaff(), sin Policy de modelo).
        // `organizations/search` y `organizations/contacts/search` van ANTES
        // de `organizations/{organization}` -- mismo criterio que
        // `permissions/matrix-by-module` (evita colisión de
        // route-model-binding).
        Route::get('organizations/search', [OrganizationController::class, 'search'])->name('organizations.search');
        Route::get('organizations/contacts/search', [OrganizationController::class, 'searchContacts'])->name('organizations.contacts.search');
        Route::get('organizations', [OrganizationController::class, 'index'])->name('organizations.index');
        Route::post('organizations', [OrganizationController::class, 'store'])->name('organizations.store');
        Route::get('organizations/{organization}', [OrganizationController::class, 'show'])->name('organizations.show');
        Route::put('organizations/{organization}', [OrganizationController::class, 'update'])->name('organizations.update');
        Route::post('organizations/{organization}/activate', [OrganizationController::class, 'activate'])->name('organizations.activate');
        Route::post('organizations/{organization}/deactivate', [OrganizationController::class, 'deactivate'])->name('organizations.deactivate');
        Route::get('organizations/{organization}/branches', [OrganizationController::class, 'branches'])->name('organizations.branches');
        // D-P02 / L-08: reemplaza la ruta vieja `organizations/{organization}/people`
        // (apuntaba a OrganizationController::people(), basado en la FK 1:1
        // `people.organization_id`) -- ahora apunta a contacts(), basado en
        // el pivote N:N `organization_contacts`.
        Route::get('organizations/{organization}/contacts', [OrganizationController::class, 'contacts'])->name('organizations.contacts');
        Route::post('organizations/{organization}/contacts', [OrganizationController::class, 'storeContact'])->name('organizations.contacts.store');
        Route::put('organizations/{organization}/contacts/{organizationContact}', [OrganizationController::class, 'updateContact'])->name('organizations.contacts.update');
        Route::post('organizations/{organization}/contacts/{organizationContact}/revoke', [OrganizationController::class, 'revokeContact'])->name('organizations.contacts.revoke');
        Route::get('organizations/{organization}/users', [OrganizationController::class, 'users'])->name('organizations.users');
        Route::get('organizations/{organization}/activity', [OrganizationController::class, 'activity'])->name('organizations.activity');
        Route::post('organizations/{organization}/business-roles/{businessRole}/assign', [OrganizationController::class, 'assignBusinessRole'])->name('organizations.business-roles.assign');
        Route::post('organizations/{organization}/business-roles/{businessRole}/revoke', [OrganizationController::class, 'revokeBusinessRole'])->name('organizations.business-roles.revoke');

        // Catálogos de solo lectura consumidos por el formulario de
        // Organizaciones (ids reales, no asumidos) -- ver docblock de
        // BusinessRoleController/OrganizationStatusController.
        Route::get('business-roles', [BusinessRoleController::class, 'index'])->name('business-roles.index');
        Route::get('organization-statuses', [OrganizationStatusController::class, 'index'])->name('organization-statuses.index');

        // Módulo standalone "Contactos" -- distinto de
        // `organizations/{organization}/contacts*` (ese sigue gestionando
        // vínculos DENTRO del contexto de una organización, sin colisión de
        // path: `admin/contacts` vs `admin/organizations/{organization}/
        // contacts`). Único lugar donde se editan los datos propios de
        // `Person` (ver ContactController::update()).
        Route::get('contacts', [ContactController::class, 'index'])->name('contacts.index');
        Route::get('contacts/{person}', [ContactController::class, 'show'])->name('contacts.show');
        Route::patch('contacts/{person}', [ContactController::class, 'update'])->name('contacts.update');

        // CRUD de Sedes (Branches) vs. Figma -- acceso DUAL (platform staff
        // gestiona todas, un admin de tenant solo las de su organización,
        // ver BranchPolicy/Branch::isAccessibleBy()).
        Route::get('branches', [BranchController::class, 'index'])->name('branches.index');
        Route::post('branches', [BranchController::class, 'store'])->name('branches.store');
        Route::get('branches/{branch}', [BranchController::class, 'show'])->name('branches.show');
        Route::put('branches/{branch}', [BranchController::class, 'update'])->name('branches.update');
        Route::post('branches/{branch}/activate', [BranchController::class, 'activate'])->name('branches.activate');
        Route::post('branches/{branch}/deactivate', [BranchController::class, 'deactivate'])->name('branches.deactivate');
        Route::get('branches/{branch}/users', [BranchController::class, 'users'])->name('branches.users');
        Route::get('branches/{branch}/contacts', [BranchController::class, 'contacts'])->name('branches.contacts');
        Route::get('branches/{branch}/activity', [BranchController::class, 'activity'])->name('branches.activity');

        // CRUD de Vehículos vs. CU-051.1/.2/.3/.4 -- acceso DUAL, mismo
        // patrón exacto que Sedes (platform staff gestiona todos, un admin
        // de tenant o LOGÍSTICA (solo lectura) solo los de su organización,
        // ver VehiclePolicy/Vehicle::isAccessibleBy()).
        Route::get('vehicles', [VehicleController::class, 'index'])->name('vehicles.index');
        Route::post('vehicles', [VehicleController::class, 'store'])->name('vehicles.store');
        Route::get('vehicles/{vehicle}', [VehicleController::class, 'show'])->name('vehicles.show');
        Route::put('vehicles/{vehicle}', [VehicleController::class, 'update'])->name('vehicles.update');
        Route::post('vehicles/{vehicle}/activate', [VehicleController::class, 'activate'])->name('vehicles.activate');
        Route::post('vehicles/{vehicle}/deactivate', [VehicleController::class, 'deactivate'])->name('vehicles.deactivate');
        Route::get('vehicles/{vehicle}/activity', [VehicleController::class, 'activity'])->name('vehicles.activity');

        // Módulo Tratamiento: catálogo GLOBAL "Tratamientos" -- gestionado
        // EXCLUSIVAMENTE por platform staff (TreatmentPolicy), lectura
        // disponible para cualquier actor con `treatments.read`.
        Route::get('treatments', [TreatmentController::class, 'index'])->name('treatments.index');
        Route::post('treatments', [TreatmentController::class, 'store'])->name('treatments.store');
        Route::get('treatments/{treatment}', [TreatmentController::class, 'show'])->name('treatments.show');
        Route::put('treatments/{treatment}', [TreatmentController::class, 'update'])->name('treatments.update');
        Route::post('treatments/{treatment}/activate', [TreatmentController::class, 'activate'])->name('treatments.activate');
        Route::post('treatments/{treatment}/deactivate', [TreatmentController::class, 'deactivate'])->name('treatments.deactivate');

        // Habilitación de Tratamientos por Sede -- acceso DUAL, mismo patrón
        // que Sedes/Vehículos (ver BranchTreatmentPolicy/
        // BranchTreatment::isAccessibleBy()). Restricción de negocio:
        // SOLO organizaciones GESTOR (can_treat_waste=true) pueden tener
        // branch_treatments, validado en BranchTreatmentController::store().
        Route::get('branch-treatments', [BranchTreatmentController::class, 'index'])->name('branch-treatments.index');
        Route::post('branch-treatments', [BranchTreatmentController::class, 'store'])->name('branch-treatments.store');
        // Debe declararse ANTES de la ruta con {branchTreatment} -- de lo
        // contrario "available" se interpretaría como un id.
        Route::get('branch-treatments/available', [BranchTreatmentController::class, 'available'])->name('branch-treatments.available');
        Route::get('branch-treatments/{branchTreatment}', [BranchTreatmentController::class, 'show'])->name('branch-treatments.show');
        Route::put('branch-treatments/{branchTreatment}', [BranchTreatmentController::class, 'update'])->name('branch-treatments.update');
        Route::post('branch-treatments/{branchTreatment}/activate', [BranchTreatmentController::class, 'activate'])->name('branch-treatments.activate');
        Route::post('branch-treatments/{branchTreatment}/deactivate', [BranchTreatmentController::class, 'deactivate'])->name('branch-treatments.deactivate');
        Route::get('branch-treatments/{branchTreatment}/activity', [BranchTreatmentController::class, 'activity'])->name('branch-treatments.activity');
        Route::put('branch-treatments/{branchTreatment}/allowed-waste-streams', [BranchTreatmentController::class, 'syncAllowedWasteStreams'])->name('branch-treatments.allowed-waste-streams.sync');
        Route::put('branch-treatments/{branchTreatment}/allowed-un-codes', [BranchTreatmentController::class, 'syncAllowedUnCodes'])->name('branch-treatments.allowed-un-codes.sync');

        // Núcleo del Módulo Residuos (declaración + clasificación): 4
        // catálogos globales nuevos, mismo patrón exacto que
        // hazard-characteristics/waste-categories/physical-states.
        Route::get('waste-types', [WasteTypeController::class, 'index'])->name('waste-types.index');
        Route::post('waste-types', [WasteTypeController::class, 'store'])->name('waste-types.store');
        Route::get('waste-types/{wasteType}', [WasteTypeController::class, 'show'])->name('waste-types.show');
        Route::put('waste-types/{wasteType}', [WasteTypeController::class, 'update'])->name('waste-types.update');
        Route::post('waste-types/{wasteType}/activate', [WasteTypeController::class, 'activate'])->name('waste-types.activate');
        Route::post('waste-types/{wasteType}/deactivate', [WasteTypeController::class, 'deactivate'])->name('waste-types.deactivate');

        Route::get('measurement-units', [MeasurementUnitController::class, 'index'])->name('measurement-units.index');
        Route::post('measurement-units', [MeasurementUnitController::class, 'store'])->name('measurement-units.store');
        Route::get('measurement-units/{measurementUnit}', [MeasurementUnitController::class, 'show'])->name('measurement-units.show');
        Route::put('measurement-units/{measurementUnit}', [MeasurementUnitController::class, 'update'])->name('measurement-units.update');
        Route::post('measurement-units/{measurementUnit}/activate', [MeasurementUnitController::class, 'activate'])->name('measurement-units.activate');
        Route::post('measurement-units/{measurementUnit}/deactivate', [MeasurementUnitController::class, 'deactivate'])->name('measurement-units.deactivate');

        Route::get('generation-frequencies', [GenerationFrequencyController::class, 'index'])->name('generation-frequencies.index');
        Route::post('generation-frequencies', [GenerationFrequencyController::class, 'store'])->name('generation-frequencies.store');
        Route::get('generation-frequencies/{generationFrequency}', [GenerationFrequencyController::class, 'show'])->name('generation-frequencies.show');
        Route::put('generation-frequencies/{generationFrequency}', [GenerationFrequencyController::class, 'update'])->name('generation-frequencies.update');
        Route::post('generation-frequencies/{generationFrequency}/activate', [GenerationFrequencyController::class, 'activate'])->name('generation-frequencies.activate');
        Route::post('generation-frequencies/{generationFrequency}/deactivate', [GenerationFrequencyController::class, 'deactivate'])->name('generation-frequencies.deactivate');

        Route::get('waste-operational-statuses', [WasteOperationalStatusController::class, 'index'])->name('waste-operational-statuses.index');
        Route::post('waste-operational-statuses', [WasteOperationalStatusController::class, 'store'])->name('waste-operational-statuses.store');
        Route::get('waste-operational-statuses/{wasteOperationalStatus}', [WasteOperationalStatusController::class, 'show'])->name('waste-operational-statuses.show');
        Route::put('waste-operational-statuses/{wasteOperationalStatus}', [WasteOperationalStatusController::class, 'update'])->name('waste-operational-statuses.update');
        Route::post('waste-operational-statuses/{wasteOperationalStatus}/activate', [WasteOperationalStatusController::class, 'activate'])->name('waste-operational-statuses.activate');
        Route::post('waste-operational-statuses/{wasteOperationalStatus}/deactivate', [WasteOperationalStatusController::class, 'deactivate'])->name('waste-operational-statuses.deactivate');

        // Núcleo del Módulo Residuos: CRUD de `wastes` + workflow de
        // declaración (BR/DEC/REV/CLS/RCH) + clasificación N:M (corrientes
        // Y/A, códigos UN, características de peligrosidad). Acceso DUAL,
        // mismo patrón exacto que Sedes/Vehículos/Tratamientos por Sede.
        Route::get('wastes', [WasteController::class, 'index'])->name('wastes.index');
        Route::post('wastes', [WasteController::class, 'store'])->name('wastes.store');
        Route::get('wastes/{waste}', [WasteController::class, 'show'])->name('wastes.show');
        Route::put('wastes/{waste}', [WasteController::class, 'update'])->name('wastes.update');
        Route::post('wastes/{waste}/activate', [WasteController::class, 'activate'])->name('wastes.activate');
        Route::post('wastes/{waste}/deactivate', [WasteController::class, 'deactivate'])->name('wastes.deactivate');
        Route::get('wastes/{waste}/activity', [WasteController::class, 'activity'])->name('wastes.activity');
        Route::post('wastes/{waste}/submit', [WasteController::class, 'submit'])->name('wastes.submit');
        Route::post('wastes/{waste}/start-review', [WasteController::class, 'startReview'])->name('wastes.start-review');
        Route::post('wastes/{waste}/classify', [WasteController::class, 'classify'])->name('wastes.classify');
        Route::post('wastes/{waste}/reject', [WasteController::class, 'reject'])->name('wastes.reject');
        Route::put('wastes/{waste}/waste-streams', [WasteController::class, 'syncWasteStreams'])->name('wastes.waste-streams.sync');
        Route::put('wastes/{waste}/un-codes', [WasteController::class, 'syncUnCodes'])->name('wastes.un-codes.sync');
        Route::put('wastes/{waste}/hazard-characteristics', [WasteController::class, 'syncHazardCharacteristics'])->name('wastes.hazard-characteristics.sync');
        Route::get('wastes/{waste}/files', [WasteController::class, 'files'])->name('wastes.files');

        // "Evaluación del Gestor" (waste_treatment_approvals) -- mecanismo
        // de invitación simple: el Generador elige un branch_treatment_id
        // de un Gestor y crea la solicitud, esa elección ES la invitación.
        // Acceso CRUZADO controlado (distinto del dual platform-staff-vs-
        // tenant del resto del proyecto) -- ver
        // WasteTreatmentApproval::isAccessibleBy()/isEditableBy() y
        // WasteTreatmentApprovalPolicy.
        Route::get('wastes/{waste}/treatment-approvals', [WasteTreatmentApprovalController::class, 'indexForWaste'])->name('wastes.treatment-approvals.index');
        Route::post('wastes/{waste}/treatment-approvals', [WasteTreatmentApprovalController::class, 'storeForWaste'])->name('wastes.treatment-approvals.store')->middleware('throttle:treatment-approval-request');

        // Preaprobación automática ("Tratamiento Preaprobado Detectado").
        Route::get('wastes/{waste}/preapproved-matches', [WasteTreatmentApprovalController::class, 'preapprovedMatches'])->name('wastes.preapproved-matches.index');
        Route::post('wastes/{waste}/preapproved-matches/{treatmentApproval}/use', [WasteTreatmentApprovalController::class, 'usePreapprovedMatch'])->name('wastes.preapproved-matches.use');

        Route::get('treatment-approvals', [WasteTreatmentApprovalController::class, 'index'])->name('treatment-approvals.index');
        Route::get('treatment-approvals/{treatmentApproval}', [WasteTreatmentApprovalController::class, 'show'])->name('treatment-approvals.show');
        Route::put('treatment-approvals/{treatmentApproval}', [WasteTreatmentApprovalController::class, 'update'])->name('treatment-approvals.update');
        Route::post('treatment-approvals/{treatmentApproval}/approve-technical', [WasteTreatmentApprovalController::class, 'approveTechnical'])->name('treatment-approvals.approve-technical');
        Route::post('treatment-approvals/{treatmentApproval}/reject-technical', [WasteTreatmentApprovalController::class, 'rejectTechnical'])->name('treatment-approvals.reject-technical');
        Route::post('treatment-approvals/{treatmentApproval}/approve-commercial', [WasteTreatmentApprovalController::class, 'approveCommercial'])->name('treatment-approvals.approve-commercial');
        Route::post('treatment-approvals/{treatmentApproval}/reject-commercial', [WasteTreatmentApprovalController::class, 'rejectCommercial'])->name('treatment-approvals.reject-commercial');
        Route::post('treatment-approvals/{treatmentApproval}/quote', [WasteTreatmentApprovalController::class, 'quote'])->name('treatment-approvals.quote');
        Route::post('treatment-approvals/{treatmentApproval}/negotiate', [WasteTreatmentApprovalController::class, 'negotiate'])->name('treatment-approvals.negotiate');
        Route::post('treatment-approvals/{treatmentApproval}/cancel', [WasteTreatmentApprovalController::class, 'cancel'])->name('treatment-approvals.cancel');

        // "Residuos Preaprobados" -- residuos de referencia
        // (waste_type_id=PREAPPROVED) de una organización Gestor, con una
        // WasteTreatmentApproval auto-aprobada desde su creación. Alimenta
        // el mecanismo de "Tratamiento Preaprobado Detectado" ya existente
        // arriba (preapprovedMatches()/usePreapprovedMatch()). Mismo
        // parámetro {waste} que las rutas `wastes/*` -- sin colisión real
        // (cada definición de ruta resuelve su propio binding), ambas
        // referencian el mismo modelo Waste.
        Route::get('preapproved-wastes', [PreapprovedWasteController::class, 'index'])->name('preapproved-wastes.index');
        Route::post('preapproved-wastes', [PreapprovedWasteController::class, 'store'])->name('preapproved-wastes.store');
        Route::get('preapproved-wastes/{waste}', [PreapprovedWasteController::class, 'show'])->name('preapproved-wastes.show');
        Route::put('preapproved-wastes/{waste}', [PreapprovedWasteController::class, 'update'])->name('preapproved-wastes.update');
        Route::post('preapproved-wastes/{waste}/activate', [PreapprovedWasteController::class, 'activate'])->name('preapproved-wastes.activate');
        Route::post('preapproved-wastes/{waste}/deactivate', [PreapprovedWasteController::class, 'deactivate'])->name('preapproved-wastes.deactivate');

        // CU-021 "Configurar Workflow" -- administración del motor de
        // Workflow genérico (item 17/D-WF-01). `import`/`export` no
        // aplican aquí (a diferencia de los catálogos maestros) -- ver
        // docblock de WorkflowController/WorkflowPolicy para el criterio de
        // autorización (platform staff sobre el BASE de cualquier
        // entity_type; un admin de organización Gestor solo sobre EL SUYO,
        // vía clone()).
        // Catálogo de solo lectura consumido por el formulario de
        // transiciones de Workflow (from_status_code/to_status_code) --
        // ver docblock de RespelStatusController.
        Route::get('respel-statuses', [RespelStatusController::class, 'index'])->name('respel-statuses.index');

        Route::get('workflows', [WorkflowController::class, 'index'])->name('workflows.index');
        Route::get('workflows/{workflow}', [WorkflowController::class, 'show'])->name('workflows.show');
        Route::post('workflows/{workflow}/clone', [WorkflowController::class, 'clone'])->name('workflows.clone');
        Route::post('workflows/{workflow}/versions', [WorkflowController::class, 'storeVersion'])->name('workflows.versions.store');
        Route::post('workflows/{workflow}/versions/{version}/publish', [WorkflowController::class, 'publishVersion'])->name('workflows.versions.publish');
        Route::post('workflows/{workflow}/transitions', [WorkflowController::class, 'storeTransition'])->name('workflows.transitions.store');
        Route::put('workflows/{workflow}/transitions/{transition}', [WorkflowController::class, 'updateTransition'])->name('workflows.transitions.update');
        Route::delete('workflows/{workflow}/transitions/{transition}', [WorkflowController::class, 'destroyTransition'])->name('workflows.transitions.destroy');

        // Módulo Solicitudes de Servicio, Fase 1b (D-S01/D-S02/D-S04/D-S06/
        // D-S09/D-S12/D-S25/D-S27) -- CRUD + ciclo de vida temprano
        // (DRAFT->SUBMITTED->UNDER_REVIEW->APPROVED/REJECTED, CANCELLED) +
        // aprobación/rechazo por ítem. Las transiciones
        // APPROVED->SCHEDULED->IN_EXECUTION->COMPLETED pertenecen al futuro
        // módulo de Programación/Dispatch (Fase 2), sin endpoint todavía --
        // ver docblock de ServiceRequestController.
        Route::get('service-requests', [ServiceRequestController::class, 'index'])->name('service-requests.index');
        Route::post('service-requests', [ServiceRequestController::class, 'store'])->name('service-requests.store');
        Route::get('service-requests/{serviceRequest}', [ServiceRequestController::class, 'show'])->name('service-requests.show');
        Route::put('service-requests/{serviceRequest}', [ServiceRequestController::class, 'update'])->name('service-requests.update');
        Route::post('service-requests/{serviceRequest}/submit', [ServiceRequestController::class, 'submit'])->name('service-requests.submit');
        Route::post('service-requests/{serviceRequest}/cancel', [ServiceRequestController::class, 'cancel'])->name('service-requests.cancel');
        Route::post('service-requests/items/{item}/approve', [ServiceRequestController::class, 'approveItem'])->name('service-requests.items.approve');
        Route::post('service-requests/items/{item}/reject', [ServiceRequestController::class, 'rejectItem'])->name('service-requests.items.reject');

        // Catálogo de solo lectura de motivos de cancelación (D-S09) -- ver
        // docblock de CancellationReasonController.
        Route::get('cancellation-reasons', [CancellationReasonController::class, 'index'])->name('cancellation-reasons.index');

        // Módulo Programación Logística, Fase 2a (D-PRG-01 a D-PRG-14) --
        // CRUD + ciclo de vida temprano (BOR->PEND->PROG->CONF, CANC) +
        // agrupación simple en ruta. Las transiciones CONF->EJEC->FIN
        // pertenecen al futuro módulo de Transporte/Ejecución (CU-035-037),
        // sin endpoint todavía -- ver docblock de TransportScheduleController.
        Route::get('transport-schedules', [TransportScheduleController::class, 'index'])->name('transport-schedules.index');
        Route::post('transport-schedules', [TransportScheduleController::class, 'store'])->name('transport-schedules.store');
        Route::get('transport-schedules/{schedule}', [TransportScheduleController::class, 'show'])->name('transport-schedules.show');
        Route::put('transport-schedules/{schedule}', [TransportScheduleController::class, 'update'])->name('transport-schedules.update');
        Route::post('transport-schedules/{schedule}/submit', [TransportScheduleController::class, 'submit'])->name('transport-schedules.submit');
        Route::post('transport-schedules/{schedule}/confirm', [TransportScheduleController::class, 'confirm'])->name('transport-schedules.confirm');
        Route::post('transport-schedules/{schedule}/cancel', [TransportScheduleController::class, 'cancel'])->name('transport-schedules.cancel');
        Route::post('transport-schedules/{schedule}/route', [TransportScheduleController::class, 'assignToRoute'])->name('transport-schedules.assign-route');

        // "Modalidad 3" (revisión especialista-seguridad, Fase 4) --
        // `gestor_carrier_authorizations`: un Gestor autoriza explícitamente
        // a una organización Transportadora INDEPENDIENTE. Ver docblock de
        // GestorCarrierAuthorizationController.
        Route::get('gestor-carrier-authorizations', [GestorCarrierAuthorizationController::class, 'index'])->name('gestor-carrier-authorizations.index');
        Route::post('gestor-carrier-authorizations', [GestorCarrierAuthorizationController::class, 'store'])->name('gestor-carrier-authorizations.store');
        Route::get('gestor-carrier-authorizations/{authorization}', [GestorCarrierAuthorizationController::class, 'show'])->name('gestor-carrier-authorizations.show');
        Route::post('gestor-carrier-authorizations/{authorization}/revoke', [GestorCarrierAuthorizationController::class, 'revoke'])->name('gestor-carrier-authorizations.revoke');

        // CRUD de Conductores (`transport_personnel`, CU-030/D-PRG-03/D-PRG-04)
        // -- gap real: `TransportScheduleController` ya exigía
        // `transport_personnel_id` desde Fase 2a sin ningún endpoint para
        // darlos de alta. Ver docblock de TransportPersonnelController.
        Route::get('transport-personnel', [TransportPersonnelController::class, 'index'])->name('transport-personnel.index');
        Route::post('transport-personnel', [TransportPersonnelController::class, 'store'])->name('transport-personnel.store');
        Route::get('transport-personnel/{transportPersonnel}', [TransportPersonnelController::class, 'show'])->name('transport-personnel.show');
        Route::put('transport-personnel/{transportPersonnel}', [TransportPersonnelController::class, 'update'])->name('transport-personnel.update');

        // CRUD MÍNIMO de Rutas (`transport_routes`, CU-059) -- gap real:
        // `TransportScheduleController::assignToRoute()` ya exigía
        // `transport_route_id` sin ningún endpoint para crear/listar rutas.
        // Sin update()/cancel() en este lote -- ver docblock de
        // TransportRouteController.
        Route::get('transport-routes', [TransportRouteController::class, 'index'])->name('transport-routes.index');
        Route::post('transport-routes', [TransportRouteController::class, 'store'])->name('transport-routes.store');
        Route::get('transport-routes/{route}', [TransportRouteController::class, 'show'])->name('transport-routes.show');

        // Módulo Manifiesto de Cargue, Fase 3 -- documento/registro firmado en
        // la planta del Generador ANTES de que el vehículo transporte los
        // residuos hacia el Gestor. Ciclo cubierto: Draft->Generated
        // (generate)->PartiallySigned/Signed (sign, automático)->InTransit
        // (startTransit). Cancelled alcanzable solo desde Generated/
        // PartiallySigned. Ver docblock de ManifestLoadController.
        Route::get('manifest-loads', [ManifestLoadController::class, 'index'])->name('manifest-loads.index');
        Route::post('manifest-loads', [ManifestLoadController::class, 'store'])->name('manifest-loads.store');
        Route::get('manifest-loads/{manifestLoad}', [ManifestLoadController::class, 'show'])->name('manifest-loads.show');
        Route::post('manifest-loads/{manifestLoad}/generate', [ManifestLoadController::class, 'generate'])->name('manifest-loads.generate');
        Route::post('manifest-loads/{manifestLoad}/sign', [ManifestLoadController::class, 'sign'])->name('manifest-loads.sign');
        Route::post('manifest-loads/{manifestLoad}/start-transit', [ManifestLoadController::class, 'startTransit'])->name('manifest-loads.start-transit');
        Route::post('manifest-loads/{manifestLoad}/cancel', [ManifestLoadController::class, 'cancel'])->name('manifest-loads.cancel');

        // Fase 4 "Cita de Recepción en Planta (bilateral)" -- CRUD mínimo de
        // Muelles (`branch_locations`), ver docblock de BranchLocationController.
        Route::get('branch-locations', [BranchLocationController::class, 'index'])->name('branch-locations.index');
        Route::post('branch-locations', [BranchLocationController::class, 'store'])->name('branch-locations.store');
        Route::get('branch-locations/{branchLocation}', [BranchLocationController::class, 'show'])->name('branch-locations.show');
        Route::put('branch-locations/{branchLocation}', [BranchLocationController::class, 'update'])->name('branch-locations.update');

        // Fase 4 -- `unload_requests` (Draft->Submitted->Approved/Rejected).
        // La mayoría nace automáticamente al confirmar una transport_schedule
        // (D-PRG-13, ver TransportScheduleController::confirm()); store() cubre
        // el caso "anticipada" (D-RCP). Ver docblock de UnloadRequestController.
        Route::get('unload-requests', [UnloadRequestController::class, 'index'])->name('unload-requests.index');
        Route::post('unload-requests', [UnloadRequestController::class, 'store'])->name('unload-requests.store');
        Route::get('unload-requests/{unloadRequest}', [UnloadRequestController::class, 'show'])->name('unload-requests.show');
        Route::post('unload-requests/{unloadRequest}/submit', [UnloadRequestController::class, 'submit'])->name('unload-requests.submit');
        Route::post('unload-requests/{unloadRequest}/approve', [UnloadRequestController::class, 'approve'])->name('unload-requests.approve');
        Route::post('unload-requests/{unloadRequest}/reject', [UnloadRequestController::class, 'reject'])->name('unload-requests.reject');

        // Fase 4 -- `plant_reception_schedules` (propose/counterPropose/
        // confirm/reschedule), expuesta sobre un unload_request ya Aprobado.
        // Capa de servicio propia (PlantReceptionScheduleService), NO el motor
        // de Workflow genérico -- ver docblock de PlantReceptionScheduleController.
        // Índice GENERAL (agenda por sede receptora, PlantReceptionAgendaScreen
        // del frontend) -- declarado ANTES de la ruta anidada de abajo para no
        // competir con ella (prefijos de URL distintos, sin riesgo real de
        // colisión, pero se mantiene el orden por legibilidad).
        Route::get('plant-reception-schedules', [PlantReceptionScheduleController::class, 'index'])->name('plant-reception-schedules.index');
        Route::get('unload-requests/{unloadRequest}/reception-schedule', [PlantReceptionScheduleController::class, 'show'])->name('unload-requests.reception-schedule.show');
        Route::post('unload-requests/{unloadRequest}/reception-schedule', [PlantReceptionScheduleController::class, 'propose'])->name('unload-requests.reception-schedule.propose');
        Route::post('plant-reception-schedules/{schedule}/counter-propose', [PlantReceptionScheduleController::class, 'counterPropose'])->name('plant-reception-schedules.counter-propose');
        Route::post('plant-reception-schedules/{schedule}/confirm', [PlantReceptionScheduleController::class, 'confirm'])->name('plant-reception-schedules.confirm');
        Route::post('plant-reception-schedules/{schedule}/reschedule', [PlantReceptionScheduleController::class, 'reschedule'])->name('plant-reception-schedules.reschedule');

        // Subsistema TRANSVERSAL de archivos (esquema-bd: `files`). La
        // autorización real vive SIEMPRE en la entidad dueña (Policy
        // resuelta por FileController vía `File::resolveEntity()`) -- NO
        // hay permiso `files.*` propio, ver docblock de FileController.
        Route::post('files', [FileController::class, 'store'])->name('files.store')->middleware('throttle:files-upload');
        Route::get('files/{file}', [FileController::class, 'show'])->name('files.show');
        Route::get('files/{file}/download', [FileController::class, 'download'])->name('files.download');
        Route::delete('files/{file}', [FileController::class, 'destroy'])->name('files.destroy');
    });
});
