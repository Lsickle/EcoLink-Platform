<?php

use App\Http\Controllers\Api\Admin\BranchController;
use App\Http\Controllers\Api\Admin\BranchTypeController;
use App\Http\Controllers\Api\Admin\BusinessRoleController;
use App\Http\Controllers\Api\Admin\ContactController;
use App\Http\Controllers\Api\Admin\CountryController;
use App\Http\Controllers\Api\Admin\DepartmentController;
use App\Http\Controllers\Api\Admin\HazardCharacteristicController;
use App\Http\Controllers\Api\Admin\LocalityController;
use App\Http\Controllers\Api\Admin\MunicipalityController;
use App\Http\Controllers\Api\Admin\OrganizationalAreaController;
use App\Http\Controllers\Api\Admin\OrganizationController;
use App\Http\Controllers\Api\Admin\OrganizationStatusController;
use App\Http\Controllers\Api\Admin\PackagingConditionController;
use App\Http\Controllers\Api\Admin\PackagingTypeController;
use App\Http\Controllers\Api\Admin\PermissionController;
use App\Http\Controllers\Api\Admin\PhysicalStateController;
use App\Http\Controllers\Api\Admin\RoleController;
use App\Http\Controllers\Api\Admin\UnCodeController;
use App\Http\Controllers\Api\Admin\UserManagementController;
use App\Http\Controllers\Api\Admin\VehicleController;
use App\Http\Controllers\Api\Admin\VehicleTypeController;
use App\Http\Controllers\Api\Admin\WasteCategoryController;
use App\Http\Controllers\Api\Admin\WasteStreamController;
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
    });
});
