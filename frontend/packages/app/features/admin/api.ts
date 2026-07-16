import { apiFetch } from '../../lib/api-client'
import type {
  AdminBranch,
  AdminBranchDetail,
  AdminBranchType,
  AdminBusinessRole,
  AdminContact,
  AdminContactDetail,
  AdminCountry,
  AdminDepartment,
  AdminHazardCharacteristic,
  AdminInvitationRequest,
  AdminLocality,
  AdminMunicipality,
  AdminOrganization,
  AdminOrganizationalArea,
  AdminOrganizationContact,
  AdminOrganizationDetail,
  AdminOrganizationStatusOption,
  AdminPackagingCondition,
  AdminPackagingType,
  AdminPermission,
  AdminPermissionDetail,
  AdminPhysicalState,
  AdminRole,
  AdminRoleDetail,
  AdminUnCode,
  AdminUnCodeDetail,
  AdminUser,
  AdminVehicleType,
  AdminWasteCategory,
  AdminWasteStream,
  AdminWasteStreamDetail,
  ApproveInvitationRequestPayload,
  AssignPermissionPayload,
  AssignRolePayload,
  BranchKpis,
  ContactSearchResult,
  CreateBranchPayload,
  CreateBranchTypePayload,
  CreateHazardCharacteristicPayload,
  CreateOrganizationalAreaPayload,
  CreateOrganizationContactPayload,
  CreateOrganizationPayload,
  CreatePackagingConditionPayload,
  CreatePackagingTypePayload,
  CreatePhysicalStatePayload,
  CreateRolePayload,
  CreateUnCodePayload,
  CreateUserPayload,
  CreateVehicleTypePayload,
  CreateWasteCategoryPayload,
  CreateWasteStreamPayload,
  ImportResult,
  OrganizationBranch,
  OrganizationContactLink,
  OrganizationKpi,
  OrganizationSearchResult,
  Paginated,
  PermissionActivityEvent,
  PermissionMatrixByModule,
  RejectInvitationRequestPayload,
  RoleActivityEvent,
  UpdateBranchPayload,
  UpdateBranchTypePayload,
  UpdateContactPayload,
  UpdateHazardCharacteristicPayload,
  UpdateOrganizationalAreaPayload,
  UpdateOrganizationContactPayload,
  UpdateOrganizationPayload,
  UpdatePackagingConditionPayload,
  UpdatePackagingTypePayload,
  UpdatePhysicalStatePayload,
  UpdateRolePayload,
  UpdateUnCodePayload,
  UpdateUserPayload,
  UpdateVehicleTypePayload,
  UpdateWasteCategoryPayload,
  UpdateWasteStreamPayload,
  UserActivityEvent,
} from './types'

export { ApiValidationError, RateLimitError } from '../../lib/api-client'

function buildQuery(params: Record<string, number | string | undefined>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      query.set(key, String(value))
    }
  }
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

// ---- Usuarios (/api/admin/users) ------------------------------------------
// El backend filtra automáticamente por tenant del actor -- nunca se manda
// ningún filtro de organización desde el cliente.

// Cierre de brecha con Figma (lote 2026-07-14): index() ahora acepta
// search (person.full_name/email/username), status (código de UserStatus),
// role (código de rol, solo asignaciones ACTIVAS) y sort/direction --
// mismo patrón EXACTO que fetchRoles() (ver UserManagementController::
// index()). `sort` whitelist real en el backend: created_at/last_login_at/
// email/username (columnas directas de `users`, nunca de `person`).
export async function fetchUsers(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: string
    role?: string
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminUser>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    role: params.role,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/users${query}`)
}

export async function createUser(payload: CreateUserPayload): Promise<{ user: AdminUser }> {
  return apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(payload) })
}

export async function fetchUser(id: number | string): Promise<{ user: AdminUser }> {
  return apiFetch(`/api/admin/users/${id}`)
}

export async function updateUser(id: number | string, payload: UpdateUserPayload): Promise<{ user: AdminUser }> {
  return apiFetch(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activateUser(id: number | string): Promise<{ user: AdminUser }> {
  return apiFetch(`/api/admin/users/${id}/activate`, { method: 'POST' })
}

// 422 con { message, errors: { user: [...] } } si desactivar dejaría a la
// organización sin ningún administrador activo -- es una guarda real de
// seguridad (no un bug), la UI la muestra tal cual llega.
export async function deactivateUser(id: number | string): Promise<{ user: AdminUser }> {
  return apiFetch(`/api/admin/users/${id}/deactivate`, { method: 'POST' })
}

// Mecanismo de invitación (CU-006.1 modificado): reenvía el correo de
// invitación a un usuario todavía PENDING_ACTIVATION. 422 si ya está ACTIVE
// (nada que reenviar) -- mismo tratamiento de ApiValidationError que el
// resto del cliente.
export async function resendInvitation(id: number | string): Promise<{ message: string }> {
  return apiFetch(`/api/admin/users/${id}/resend-invitation`, { method: 'POST' })
}

// Cierre de brecha con Figma (lote 2026-07-14) -- inverso de
// assignRoleToUser(): desactiva (nunca borra, RN-027 exige al menos un rol
// activo) una asignación user_roles. 422 (ApiValidationError, clave "role")
// si sería la última asignación activa del usuario o si el rol/usuario no
// pertenece al tenant del actor (ver UserManagementController::
// revokeRole()) -- la UI muestra el mensaje del backend tal cual.
export async function revokeRoleFromUser(
  userId: number | string,
  roleId: number | string
): Promise<{ message: string }> {
  return apiFetch(`/api/admin/users/${userId}/roles/${roleId}/revoke`, { method: 'POST' })
}

// CU-006.9 (sin spec fuente confirmada -- ver docblock de
// UserManagementController::resetPassword()): dispara el mismo mecanismo
// OTP del autoservicio de "Olvidé mi contraseña" pero dirigido SIEMPRE al
// correo del usuario objetivo, nunca al del admin que ejecuta la acción.
// Sin body -- mismo shape sin payload que activateUser/deactivateUser.
export async function resetUserPassword(id: number | string): Promise<{ message: string }> {
  return apiFetch(`/api/admin/users/${id}/reset-password`, { method: 'POST' })
}

// Figma "Detalle de Usuario" (lote 2026-07-14) -- tab "Actividad". Mismo
// patrón EXACTO que fetchRoleActivity() (paginado estándar, shape
// {event_type, description, actor, created_at}) -- gateado por
// `audit.read` en el backend, no por `users.read` (un 403 aquí es
// esperable para un actor sin ese permiso).
export async function fetchUserActivity(
  userId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<UserActivityEvent>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/users/${userId}/activity${query}`)
}

// ---- Roles (/api/admin/roles) ---------------------------------------------
// Figma "Roles Management" (lote 3): index() acepta search (name/
// description), status (active/inactive), type (system/custom) y sort/
// direction (whitelist en el backend -- ver RoleController::index()).

export async function fetchRoles(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    type?: 'system' | 'custom'
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminRole>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    type: params.type,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/roles${query}`)
}

export async function createRole(payload: CreateRolePayload): Promise<{ role: AdminRole }> {
  return apiFetch('/api/admin/roles', { method: 'POST', body: JSON.stringify(payload) })
}

export async function fetchRole(id: number | string): Promise<{ role: AdminRoleDetail }> {
  return apiFetch(`/api/admin/roles/${id}`)
}

export async function updateRole(id: number | string, payload: UpdateRolePayload): Promise<{ role: AdminRole }> {
  return apiFetch(`/api/admin/roles/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function deleteRole(id: number | string): Promise<void> {
  await apiFetch(`/api/admin/roles/${id}`, { method: 'DELETE' })
}

// Bloqueados con 422 (ApiValidationError, clave "role") si el rol no es
// editable (is_editable=false, p. ej. ADMINISTRADOR) -- ver
// RoleController::activate()/deactivate(). La respuesta es el modelo base
// (role->fresh()), sin users_count/permissions_count/risk_level -- el
// caller debe mergear con el registro ya cargado en pantalla.
export async function activateRole(id: number | string): Promise<{ role: AdminRole }> {
  return apiFetch(`/api/admin/roles/${id}/activate`, { method: 'POST' })
}

export async function deactivateRole(id: number | string): Promise<{ role: AdminRole }> {
  return apiFetch(`/api/admin/roles/${id}/deactivate`, { method: 'POST' })
}

export async function assignRoleToUser(
  roleId: number | string,
  payload: AssignRolePayload
): Promise<{ message?: string }> {
  return apiFetch(`/api/admin/roles/${roleId}/assign`, { method: 'POST', body: JSON.stringify(payload) })
}

// Figma "Detalle de Rol" (lote 4) -- tab "Usuarios con este rol". Mismo
// shape de AdminUser que fetchUsers() (ver RoleController::users()), solo
// asignaciones activas.
export async function fetchRoleUsers(
  roleId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<AdminUser>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/roles/${roleId}/users${query}`)
}

// Figma "Detalle de Rol" (lote 4) -- tab "Actividad". Gateado por
// `audit.read` en el backend (ver RoleController::activity()), no por
// `roles.read` -- un 403 aquí es esperable para un actor sin ese permiso.
export async function fetchRoleActivity(
  roleId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<RoleActivityEvent>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/roles/${roleId}/activity${query}`)
}

// ---- Permisos (/api/admin/permissions) -- catálogo de solo lectura --------
// Hoy son 16 permisos reales de exactamente 4 módulos (users/roles/
// permissions/audit) -- nunca hardcodear una lista de módulos más larga.

// Cierre de brecha con Figma (lote "Matriz de Permisos"/"Detalle de
// Permiso"): index() ahora acepta search/module/status/critical/sort/
// direction, mismo patrón EXACTO que fetchRoles()/fetchUsers() (ver
// PermissionController::index()).
export async function fetchPermissions(
  params: {
    page?: number
    perPage?: number
    search?: string
    module?: string
    status?: 'active' | 'inactive'
    critical?: boolean
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminPermission>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage ?? 50,
    search: params.search,
    module: params.module,
    status: params.status,
    critical: params.critical === undefined ? undefined : String(params.critical),
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/permissions${query}`)
}

// Figma "Detalle de Permiso" -- trae created_by/updated_by/roles_count/
// users_impacted_count además de todos los campos base (ver
// PermissionController::show()).
export async function fetchPermission(id: number | string): Promise<{ permission: AdminPermissionDetail }> {
  return apiFetch(`/api/admin/permissions/${id}`)
}

// Figma "Detalle de Permiso" -- tab "Roles". Mismo shape de AdminRole que
// fetchRoles(), tenant-scoped (ver PermissionController::roles()).
export async function fetchPermissionRoles(
  id: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<AdminRole>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/permissions/${id}/roles${query}`)
}

// Figma "Detalle de Permiso" -- tab "Usuarios". Mismo shape de AdminUser
// que fetchUsers()/fetchRoleUsers(), tenant-scoped.
export async function fetchPermissionUsers(
  id: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<AdminUser>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/permissions/${id}/users${query}`)
}

// Figma "Detalle de Permiso" -- tab "Auditoría". Gateado por `audit.read`
// además de `permissions.read` (ver PermissionController::activity()), no
// distinto del criterio ya usado por fetchRoleActivity()/fetchUserActivity().
export async function fetchPermissionActivity(
  id: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<PermissionActivityEvent>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/permissions/${id}/activity${query}`)
}

// Figma "Matriz de Permisos" -- sub-vista "Por Módulo".
export async function fetchPermissionMatrixByModule(module: string): Promise<PermissionMatrixByModule> {
  const query = buildQuery({ module })
  return apiFetch(`/api/admin/permissions/matrix-by-module${query}`)
}

// No hay endpoint de asignación masiva -- el caller hace un POST por cada
// permiso marcado (en paralelo con Promise.all, no secuencial).
export async function assignPermissionToRole(
  permissionId: number | string,
  payload: AssignPermissionPayload
): Promise<{ message?: string }> {
  return apiFetch(`/api/admin/permissions/${permissionId}/assign`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// Inverso de assignPermissionToRole() -- Figma "Matriz de Permisos"
// (toggle inmediato al desmarcar una celda) y RoleDetailScreen (desasignar
// un permiso individual). Mismo estilo sin payload extra que
// revokeRoleFromUser().
export async function revokePermissionFromRole(
  permissionId: number | string,
  roleId: number
): Promise<{ message?: string }> {
  return apiFetch(`/api/admin/permissions/${permissionId}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ role_id: roleId }),
  })
}

// ---- Solicitudes de invitación (/api/admin/invitation-requests) ----------
// Cola de solicitudes públicas (reemplaza el registro público eliminado,
// CU-006.1 modificado). index() está gateado por `users.read` (Gate::
// authorize('viewAny', User::class) en InvitationRequestController::
// index()) -- approve()/reject() exigen `users.create` (mismo permiso que
// Crear Usuario), el backend responde 403 si falta.

export async function fetchInvitationRequests(
  params: { status?: string; page?: number; perPage?: number } = {}
): Promise<Paginated<AdminInvitationRequest>> {
  const query = buildQuery({ status: params.status, page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/invitation-requests${query}`)
}

export async function approveInvitationRequest(
  id: number | string,
  payload: ApproveInvitationRequestPayload
): Promise<{ user: AdminUser; invitation_request: AdminInvitationRequest }> {
  return apiFetch(`/api/admin/invitation-requests/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function rejectInvitationRequest(
  id: number | string,
  payload: RejectInvitationRequestPayload = {}
): Promise<{ invitation_request: AdminInvitationRequest }> {
  return apiFetch(`/api/admin/invitation-requests/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// ---- Corrientes Y/A (/api/admin/waste-streams) ---------------------------
// Primer módulo real del dominio Residuos. Mismo patrón EXACTO que
// fetchRoles()/createRole()/etc. -- ver WasteStreamController.

export async function fetchWasteStreams(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    tipo?: 'Y' | 'A'
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminWasteStream>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    tipo: params.tipo,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/waste-streams${query}`)
}

export async function createWasteStream(
  payload: CreateWasteStreamPayload
): Promise<{ waste_stream: AdminWasteStream }> {
  return apiFetch('/api/admin/waste-streams', { method: 'POST', body: JSON.stringify(payload) })
}

export async function fetchWasteStream(id: number | string): Promise<{ waste_stream: AdminWasteStreamDetail }> {
  return apiFetch(`/api/admin/waste-streams/${id}`)
}

export async function updateWasteStream(
  id: number | string,
  payload: UpdateWasteStreamPayload
): Promise<{ waste_stream: AdminWasteStream }> {
  return apiFetch(`/api/admin/waste-streams/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activateWasteStream(id: number | string): Promise<{ waste_stream: AdminWasteStream }> {
  return apiFetch(`/api/admin/waste-streams/${id}/activate`, { method: 'POST' })
}

export async function deactivateWasteStream(id: number | string): Promise<{ waste_stream: AdminWasteStream }> {
  return apiFetch(`/api/admin/waste-streams/${id}/deactivate`, { method: 'POST' })
}

// Carga masiva CSV (encabezados `code,name,tipo` + columnas opcionales, ver
// WasteStreamController::import()) -- `apiFetch` detecta `FormData` y omite
// `Content-Type: application/json` para dejar que el navegador fije el
// boundary de multipart.
export async function importWasteStreams(file: File): Promise<ImportResult> {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch('/api/admin/waste-streams/import', { method: 'POST', body: formData })
}

// ---- Códigos UN (/api/admin/un-codes) ------------------------------------
// Mismo patrón EXACTO que WasteStream arriba -- ver UnCodeController.

export async function fetchUnCodes(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminUnCode>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/un-codes${query}`)
}

export async function createUnCode(payload: CreateUnCodePayload): Promise<{ un_code: AdminUnCode }> {
  return apiFetch('/api/admin/un-codes', { method: 'POST', body: JSON.stringify(payload) })
}

export async function fetchUnCode(id: number | string): Promise<{ un_code: AdminUnCodeDetail }> {
  return apiFetch(`/api/admin/un-codes/${id}`)
}

export async function updateUnCode(
  id: number | string,
  payload: UpdateUnCodePayload
): Promise<{ un_code: AdminUnCode }> {
  return apiFetch(`/api/admin/un-codes/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activateUnCode(id: number | string): Promise<{ un_code: AdminUnCode }> {
  return apiFetch(`/api/admin/un-codes/${id}/activate`, { method: 'POST' })
}

export async function deactivateUnCode(id: number | string): Promise<{ un_code: AdminUnCode }> {
  return apiFetch(`/api/admin/un-codes/${id}/deactivate`, { method: 'POST' })
}

// Carga masiva CSV (encabezados `code,name` + columnas opcionales, ver
// UnCodeController::import()).
export async function importUnCodes(file: File): Promise<ImportResult> {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch('/api/admin/un-codes/import', { method: 'POST', body: formData })
}

// ---- Catálogos Maestros: geografía en cascada (D-P01) ---------------------
// Batch 1/3 de Catálogos Maestros. Los 4 catálogos son de SOLO LECTURA --
// sin create/update, solo fetch + activate/deactivate (ver
// CountryController/DepartmentController/MunicipalityController/
// LocalityController). Cada `index` filtra en cascada por el id del padre
// inmediato en la jerarquía (D-P01): countries -> departments (country_id)
// -> municipalities (department_id) -> localities (municipality_id).

export async function fetchCountries(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminCountry>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/countries${query}`)
}

export async function activateCountry(id: number | string): Promise<{ country: AdminCountry }> {
  return apiFetch(`/api/admin/countries/${id}/activate`, { method: 'POST' })
}

export async function deactivateCountry(id: number | string): Promise<{ country: AdminCountry }> {
  return apiFetch(`/api/admin/countries/${id}/deactivate`, { method: 'POST' })
}

export async function fetchDepartments(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    countryId?: number | string
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminDepartment>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    country_id: params.countryId,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/departments${query}`)
}

export async function activateDepartment(id: number | string): Promise<{ department: AdminDepartment }> {
  return apiFetch(`/api/admin/departments/${id}/activate`, { method: 'POST' })
}

export async function deactivateDepartment(id: number | string): Promise<{ department: AdminDepartment }> {
  return apiFetch(`/api/admin/departments/${id}/deactivate`, { method: 'POST' })
}

export async function fetchMunicipalities(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    departmentId?: number | string
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminMunicipality>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    department_id: params.departmentId,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/municipalities${query}`)
}

export async function activateMunicipality(id: number | string): Promise<{ municipality: AdminMunicipality }> {
  return apiFetch(`/api/admin/municipalities/${id}/activate`, { method: 'POST' })
}

export async function deactivateMunicipality(id: number | string): Promise<{ municipality: AdminMunicipality }> {
  return apiFetch(`/api/admin/municipalities/${id}/deactivate`, { method: 'POST' })
}

export async function fetchLocalities(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    municipalityId?: number | string
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminLocality>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    municipality_id: params.municipalityId,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/localities${query}`)
}

export async function activateLocality(id: number | string): Promise<{ locality: AdminLocality }> {
  return apiFetch(`/api/admin/localities/${id}/activate`, { method: 'POST' })
}

export async function deactivateLocality(id: number | string): Promise<{ locality: AdminLocality }> {
  return apiFetch(`/api/admin/localities/${id}/deactivate`, { method: 'POST' })
}

// ---- Tipos de Sede (/api/admin/branch-types) -------------------------------
// A diferencia de los 4 catálogos geográficos de arriba, CRUD completo --
// mismo patrón EXACTO que fetchWasteStreams()/createWasteStream()/etc. (ver
// BranchTypeController). Sin `tipo`/`import` -- branch_types no tiene esos
// conceptos.

export async function fetchBranchTypes(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminBranchType>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/branch-types${query}`)
}

export async function createBranchType(payload: CreateBranchTypePayload): Promise<{ branch_type: AdminBranchType }> {
  return apiFetch('/api/admin/branch-types', { method: 'POST', body: JSON.stringify(payload) })
}

export async function fetchBranchType(id: number | string): Promise<{ branch_type: AdminBranchType }> {
  return apiFetch(`/api/admin/branch-types/${id}`)
}

export async function updateBranchType(
  id: number | string,
  payload: UpdateBranchTypePayload
): Promise<{ branch_type: AdminBranchType }> {
  return apiFetch(`/api/admin/branch-types/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activateBranchType(id: number | string): Promise<{ branch_type: AdminBranchType }> {
  return apiFetch(`/api/admin/branch-types/${id}/activate`, { method: 'POST' })
}

export async function deactivateBranchType(id: number | string): Promise<{ branch_type: AdminBranchType }> {
  return apiFetch(`/api/admin/branch-types/${id}/deactivate`, { method: 'POST' })
}

// ---- Áreas Organizacionales (/api/admin/organizational-areas) -------------
// Batch 1/3 de Catálogos Maestros -- a diferencia de los 5 catálogos
// hermanos, NO es global (ver docblock de OrganizationalAreaController y de
// AdminOrganizationalArea en types.ts). `organizationId`: obligatorio en el
// query SOLO para un actor `isPlatformStaff()` -- el backend lo exige con
// 422 si falta para ese actor, y lo IGNORA (fuerza tenant propio) para
// cualquier otro. El caller (OrganizationalAreasListScreen) decide si lo
// manda según `useAuth().user?.is_platform_staff`, nunca lo asume aquí.
export async function fetchOrganizationalAreas(
  params: {
    organizationId?: number | string
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    parentAreaId?: number | string
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminOrganizationalArea>> {
  const query = buildQuery({
    organization_id: params.organizationId,
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    parent_area_id: params.parentAreaId,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/organizational-areas${query}`)
}

export async function createOrganizationalArea(
  payload: CreateOrganizationalAreaPayload
): Promise<{ organizational_area: AdminOrganizationalArea }> {
  return apiFetch('/api/admin/organizational-areas', { method: 'POST', body: JSON.stringify(payload) })
}

export async function fetchOrganizationalArea(
  id: number | string
): Promise<{ organizational_area: AdminOrganizationalArea }> {
  return apiFetch(`/api/admin/organizational-areas/${id}`)
}

export async function updateOrganizationalArea(
  id: number | string,
  payload: UpdateOrganizationalAreaPayload
): Promise<{ organizational_area: AdminOrganizationalArea }> {
  return apiFetch(`/api/admin/organizational-areas/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activateOrganizationalArea(
  id: number | string
): Promise<{ organizational_area: AdminOrganizationalArea }> {
  return apiFetch(`/api/admin/organizational-areas/${id}/activate`, { method: 'POST' })
}

export async function deactivateOrganizationalArea(
  id: number | string
): Promise<{ organizational_area: AdminOrganizationalArea }> {
  return apiFetch(`/api/admin/organizational-areas/${id}/deactivate`, { method: 'POST' })
}

// ---- Características de Peligrosidad (/api/admin/hazard-characteristics) --
// Batch 2/3 de Catálogos Maestros (RESPEL) -- CRUD completo, mismo patrón
// EXACTO que fetchBranchTypes()/createBranchType()/etc. (ver
// HazardCharacteristicController). `sort=risk_level&direction=desc` es el
// orden por defecto que pide la UI (mayor riesgo primero) -- el backend
// whitelist ya lo soporta (ver docblock del controller).

export async function fetchHazardCharacteristics(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminHazardCharacteristic>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/hazard-characteristics${query}`)
}

export async function createHazardCharacteristic(
  payload: CreateHazardCharacteristicPayload
): Promise<{ hazard_characteristic: AdminHazardCharacteristic }> {
  return apiFetch('/api/admin/hazard-characteristics', { method: 'POST', body: JSON.stringify(payload) })
}

export async function fetchHazardCharacteristic(
  id: number | string
): Promise<{ hazard_characteristic: AdminHazardCharacteristic }> {
  return apiFetch(`/api/admin/hazard-characteristics/${id}`)
}

export async function updateHazardCharacteristic(
  id: number | string,
  payload: UpdateHazardCharacteristicPayload
): Promise<{ hazard_characteristic: AdminHazardCharacteristic }> {
  return apiFetch(`/api/admin/hazard-characteristics/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activateHazardCharacteristic(
  id: number | string
): Promise<{ hazard_characteristic: AdminHazardCharacteristic }> {
  return apiFetch(`/api/admin/hazard-characteristics/${id}/activate`, { method: 'POST' })
}

export async function deactivateHazardCharacteristic(
  id: number | string
): Promise<{ hazard_characteristic: AdminHazardCharacteristic }> {
  return apiFetch(`/api/admin/hazard-characteristics/${id}/deactivate`, { method: 'POST' })
}

// ---- Categoría de Residuo (/api/admin/waste-categories) -------------------
// Batch 2/3 de Catálogos Maestros (RESPEL) -- mismo patrón EXACTO que arriba
// (ver WasteCategoryController). Sin particularidades de orden/filtro.

export async function fetchWasteCategories(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminWasteCategory>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/waste-categories${query}`)
}

export async function createWasteCategory(
  payload: CreateWasteCategoryPayload
): Promise<{ waste_category: AdminWasteCategory }> {
  return apiFetch('/api/admin/waste-categories', { method: 'POST', body: JSON.stringify(payload) })
}

export async function fetchWasteCategory(id: number | string): Promise<{ waste_category: AdminWasteCategory }> {
  return apiFetch(`/api/admin/waste-categories/${id}`)
}

export async function updateWasteCategory(
  id: number | string,
  payload: UpdateWasteCategoryPayload
): Promise<{ waste_category: AdminWasteCategory }> {
  return apiFetch(`/api/admin/waste-categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activateWasteCategory(id: number | string): Promise<{ waste_category: AdminWasteCategory }> {
  return apiFetch(`/api/admin/waste-categories/${id}/activate`, { method: 'POST' })
}

export async function deactivateWasteCategory(id: number | string): Promise<{ waste_category: AdminWasteCategory }> {
  return apiFetch(`/api/admin/waste-categories/${id}/deactivate`, { method: 'POST' })
}

// ---- Estado Físico (/api/admin/physical-states) ----------------------------
// Batch 2/3 de Catálogos Maestros (RESPEL) -- mismo patrón EXACTO que arriba
// (ver PhysicalStateController). El más simple de los 3 (sin `description`).

export async function fetchPhysicalStates(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminPhysicalState>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/physical-states${query}`)
}

export async function createPhysicalState(
  payload: CreatePhysicalStatePayload
): Promise<{ physical_state: AdminPhysicalState }> {
  return apiFetch('/api/admin/physical-states', { method: 'POST', body: JSON.stringify(payload) })
}

export async function fetchPhysicalState(id: number | string): Promise<{ physical_state: AdminPhysicalState }> {
  return apiFetch(`/api/admin/physical-states/${id}`)
}

export async function updatePhysicalState(
  id: number | string,
  payload: UpdatePhysicalStatePayload
): Promise<{ physical_state: AdminPhysicalState }> {
  return apiFetch(`/api/admin/physical-states/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activatePhysicalState(id: number | string): Promise<{ physical_state: AdminPhysicalState }> {
  return apiFetch(`/api/admin/physical-states/${id}/activate`, { method: 'POST' })
}

export async function deactivatePhysicalState(id: number | string): Promise<{ physical_state: AdminPhysicalState }> {
  return apiFetch(`/api/admin/physical-states/${id}/deactivate`, { method: 'POST' })
}

// ---- Tipos de Embalaje (/api/admin/packaging-types) -----------------------
// Batch 3/3 (último) de Catálogos Maestros -- mismo patrón EXACTO que
// fetchPhysicalStates()/createPhysicalState()/etc. (ver
// PackagingTypeController). El más simple de los 3 (solo code/name).

export async function fetchPackagingTypes(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminPackagingType>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/packaging-types${query}`)
}

export async function createPackagingType(
  payload: CreatePackagingTypePayload
): Promise<{ packaging_type: AdminPackagingType }> {
  return apiFetch('/api/admin/packaging-types', { method: 'POST', body: JSON.stringify(payload) })
}

export async function fetchPackagingType(id: number | string): Promise<{ packaging_type: AdminPackagingType }> {
  return apiFetch(`/api/admin/packaging-types/${id}`)
}

export async function updatePackagingType(
  id: number | string,
  payload: UpdatePackagingTypePayload
): Promise<{ packaging_type: AdminPackagingType }> {
  return apiFetch(`/api/admin/packaging-types/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activatePackagingType(id: number | string): Promise<{ packaging_type: AdminPackagingType }> {
  return apiFetch(`/api/admin/packaging-types/${id}/activate`, { method: 'POST' })
}

export async function deactivatePackagingType(id: number | string): Promise<{ packaging_type: AdminPackagingType }> {
  return apiFetch(`/api/admin/packaging-types/${id}/deactivate`, { method: 'POST' })
}

// ---- Estados del Embalaje (/api/admin/packaging-conditions) ---------------
// Batch 3/3 (último) de Catálogos Maestros -- mismo patrón EXACTO que arriba
// (ver PackagingConditionController). AVISO -- PROVISIONAL, ver
// AdminPackagingCondition en types.ts. `sort=risk_level` soportado por el
// backend igual que hazard-characteristics, pero esta pantalla NO lo usa
// como orden por defecto (a diferencia de hazard-characteristics) -- el
// riesgo aquí es NULLABLE, un orden por defecto por ese campo dejaría filas
// con `null` en posiciones inconsistentes.

export async function fetchPackagingConditions(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminPackagingCondition>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/packaging-conditions${query}`)
}

export async function createPackagingCondition(
  payload: CreatePackagingConditionPayload
): Promise<{ packaging_condition: AdminPackagingCondition }> {
  return apiFetch('/api/admin/packaging-conditions', { method: 'POST', body: JSON.stringify(payload) })
}

export async function fetchPackagingCondition(
  id: number | string
): Promise<{ packaging_condition: AdminPackagingCondition }> {
  return apiFetch(`/api/admin/packaging-conditions/${id}`)
}

export async function updatePackagingCondition(
  id: number | string,
  payload: UpdatePackagingConditionPayload
): Promise<{ packaging_condition: AdminPackagingCondition }> {
  return apiFetch(`/api/admin/packaging-conditions/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activatePackagingCondition(
  id: number | string
): Promise<{ packaging_condition: AdminPackagingCondition }> {
  return apiFetch(`/api/admin/packaging-conditions/${id}/activate`, { method: 'POST' })
}

export async function deactivatePackagingCondition(
  id: number | string
): Promise<{ packaging_condition: AdminPackagingCondition }> {
  return apiFetch(`/api/admin/packaging-conditions/${id}/deactivate`, { method: 'POST' })
}

// ---- Tipos de Vehículo (/api/admin/vehicle-types) --------------------------
// Batch 3/3 (último) de Catálogos Maestros -- mismo patrón EXACTO que arriba
// (ver VehicleTypeController). AVISO -- PROVISIONAL, ver AdminVehicleType en
// types.ts.

export async function fetchVehicleTypes(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminVehicleType>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/vehicle-types${query}`)
}

export async function createVehicleType(
  payload: CreateVehicleTypePayload
): Promise<{ vehicle_type: AdminVehicleType }> {
  return apiFetch('/api/admin/vehicle-types', { method: 'POST', body: JSON.stringify(payload) })
}

export async function fetchVehicleType(id: number | string): Promise<{ vehicle_type: AdminVehicleType }> {
  return apiFetch(`/api/admin/vehicle-types/${id}`)
}

export async function updateVehicleType(
  id: number | string,
  payload: UpdateVehicleTypePayload
): Promise<{ vehicle_type: AdminVehicleType }> {
  return apiFetch(`/api/admin/vehicle-types/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activateVehicleType(id: number | string): Promise<{ vehicle_type: AdminVehicleType }> {
  return apiFetch(`/api/admin/vehicle-types/${id}/activate`, { method: 'POST' })
}

export async function deactivateVehicleType(id: number | string): Promise<{ vehicle_type: AdminVehicleType }> {
  return apiFetch(`/api/admin/vehicle-types/${id}/deactivate`, { method: 'POST' })
}

// ---- Organizaciones (/api/admin/organizations) -----------------------------
// Plan "CRUD de Organizaciones vs. Figma (solo Organizaciones)" -- pantalla
// EXCLUSIVA de platform staff (ver OrganizationController::index()/etc.,
// gate `isPlatformStaff()`, no una Policy de modelo -- las pantallas usan
// `useRequireAuth(undefined, { requirePlatformStaff: true })`, sin permiso
// RBAC asociado). Mismo patrón `apiFetch`/`buildQuery` que el resto de este
// archivo.

export async function fetchOrganizations(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: string
    businessRole?: string
    department?: number | string
    municipality?: number | string
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminOrganization> & { kpis: OrganizationKpi[] }> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
    business_role: params.businessRole,
    department: params.department,
    municipality: params.municipality,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/organizations${query}`)
}

export async function fetchOrganization(id: number | string): Promise<{ organization: AdminOrganizationDetail }> {
  return apiFetch(`/api/admin/organizations/${id}`)
}

export async function createOrganization(
  payload: CreateOrganizationPayload
): Promise<{ organization: AdminOrganization }> {
  return apiFetch('/api/admin/organizations', { method: 'POST', body: JSON.stringify(payload) })
}

// `tax_id`/`tax_id_type` NUNCA viajan aquí -- inmutables tras crear, el
// backend ni siquiera los valida en update() (ver UpdateOrganizationPayload
// en types.ts).
export async function updateOrganization(
  id: number | string,
  payload: UpdateOrganizationPayload
): Promise<{ organization: AdminOrganization }> {
  return apiFetch(`/api/admin/organizations/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

// `is_active` es independiente de `organization_status_id` (ver
// OrganizationController::activate()) -- NUNCA cambia el badge de Estado.
export async function activateOrganization(id: number | string): Promise<{ organization: AdminOrganization }> {
  return apiFetch(`/api/admin/organizations/${id}/activate`, { method: 'POST' })
}

export async function deactivateOrganization(id: number | string): Promise<{ organization: AdminOrganization }> {
  return apiFetch(`/api/admin/organizations/${id}/deactivate`, { method: 'POST' })
}

// Tab "Sedes" -- solo lectura, sin filtros adicionales (ver
// OrganizationController::branches()).
export async function fetchOrganizationBranches(
  organizationId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<OrganizationBranch>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/organizations/${organizationId}/branches${query}`)
}

// Tab "Contactos" -- plan "CRUD de Sedes + Contactos" (D-P02/L-08). Reemplaza
// `fetchOrganizationPeople()`/`.../people` (pivote N:N `organization_contacts`
// nuevo, antes 1:1 vía `people.organization_id`) -- ver
// `OrganizationController::contacts()`. Ahora con create/link/revoke reales,
// ya no es de solo lectura (ver funciones abajo).
export async function fetchOrganizationContacts(
  organizationId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<AdminOrganizationContact>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/organizations/${organizationId}/contacts${query}`)
}

// Crea un contacto NUEVO (Person nueva) o vincula uno EXISTENTE
// (`existing_contact_id`, ver `searchContacts()`) a la organización -- ver
// `OrganizationController::storeContact()`.
export async function createOrganizationContact(
  organizationId: number | string,
  payload: CreateOrganizationContactPayload
): Promise<{ organization_contact: OrganizationContactLink }> {
  return apiFetch(`/api/admin/organizations/${organizationId}/contacts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// Edita SOLO el vínculo (branch_id/position_title/relationship_type/
// is_primary), NUNCA los datos de la Person -- ver
// `OrganizationController::updateContact()`.
export async function updateOrganizationContact(
  organizationId: number | string,
  organizationContactId: number | string,
  payload: UpdateOrganizationContactPayload
): Promise<{ organization_contact: OrganizationContactLink }> {
  return apiFetch(`/api/admin/organizations/${organizationId}/contacts/${organizationContactId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

// Revoca el vínculo (is_active=false) -- NUNCA borra la Person ni la
// organización, idempotente. Ver `OrganizationController::revokeContact()`.
export async function revokeOrganizationContact(
  organizationId: number | string,
  organizationContactId: number | string
): Promise<{ organization_contact: OrganizationContactLink }> {
  return apiFetch(`/api/admin/organizations/${organizationId}/contacts/${organizationContactId}/revoke`, {
    method: 'POST',
  })
}

// Selector "Vincular Contacto Existente" -- SIEMPRE usar este endpoint para
// poblar el combo (acotado al tenant del actor, o global si platform staff),
// nunca dejar que el usuario escriba un id a mano (ver
// `OrganizationController::searchContacts()`).
export async function searchContacts(
  params: { q?: string; perPage?: number } = {}
): Promise<Paginated<ContactSearchResult>> {
  const query = buildQuery({ q: params.q, per_page: params.perPage })
  return apiFetch(`/api/admin/organizations/contacts/search${query}`)
}

// Tab "Usuarios" -- mismo shape que fetchUsers()/fetchRoleUsers() (ver
// OrganizationController::users()).
export async function fetchOrganizationUsers(
  organizationId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<AdminUser>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/organizations/${organizationId}/users${query}`)
}

// Tab "Actividad" -- exige AMBOS `isPlatformStaff()` Y `audit.read` en el
// backend (dos chequeos distintos, ver OrganizationController::activity());
// un 403 aquí es esperable para un platform staff sin `audit.read`. Mismo
// shape {event_type, description, actor, created_at} que
// fetchRoleActivity()/fetchPermissionActivity() -- tipo `RoleActivityEvent`
// reutilizado tal cual (no se crea un tipo `OrganizationActivityEvent`
// separado porque el backend limita `event_type` a los mismos 6 valores de
// `OrganizationController::BUSINESS_ROLE_EVENTS`, ya cubiertos por ese
// shape genérico {event_type: string, ...}).
export async function fetchOrganizationActivity(
  organizationId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<RoleActivityEvent>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/organizations/${organizationId}/activity${query}`)
}

// Catálogo "Tipo de Organización" (business_roles) -- GET
// /api/admin/business-roles, mismo gate `isPlatformStaff()` que el resto de
// OrganizationController (sin Policy de modelo). Cierra el gap declarado en
// organizationCatalogs.ts (BUSINESS_ROLES_FALLBACK ya eliminado, 2026-07-15)
// -- ordenado por `sort_order` en el backend, sin paginación (`{ data: [...] }`
// plano, no `Paginated<T>`).
export async function fetchBusinessRoles(
  params: { activeOnly?: boolean } = {}
): Promise<{ data: AdminBusinessRole[] }> {
  const query = buildQuery({ active_only: params.activeOnly ? '1' : undefined })
  return apiFetch(`/api/admin/business-roles${query}`)
}

// Catálogo "Estado" (organization_statuses) -- GET
// /api/admin/organization-statuses, mismo criterio que fetchBusinessRoles()
// arriba (mismo gate, mismo shape sin paginación, mismo cierre de gap --
// ver AVISO ya eliminado en organizationCatalogs.ts). Devuelve
// AdminOrganizationStatusOption (subconjunto de columnas, ver types.ts), NO
// el AdminOrganizationStatus completo que ya viaja eager-cargado en
// `organization.status`.
export async function fetchOrganizationStatuses(
  params: { activeOnly?: boolean } = {}
): Promise<{ data: AdminOrganizationStatusOption[] }> {
  const query = buildQuery({ active_only: params.activeOnly ? '1' : undefined })
  return apiFetch(`/api/admin/organization-statuses${query}`)
}

// "Tipo de Organización" (business_roles) -- calca EXACTAMENTE
// assignPermissionToRole()/revokePermissionFromRole() (pivote idempotente,
// nunca borra la fila).
export async function assignBusinessRoleToOrganization(
  organizationId: number | string,
  businessRoleId: number
): Promise<{ message?: string }> {
  return apiFetch(`/api/admin/organizations/${organizationId}/business-roles/${businessRoleId}/assign`, {
    method: 'POST',
  })
}

export async function revokeBusinessRoleFromOrganization(
  organizationId: number | string,
  businessRoleId: number
): Promise<{ message?: string }> {
  return apiFetch(`/api/admin/organizations/${organizationId}/business-roles/${businessRoleId}/revoke`, {
    method: 'POST',
  })
}

// Selector "Organización Matriz" (`parent_organization_id`) -- ver
// OrganizationController::search(). `excludeId` evita que el formulario de
// edición se ofrezca a sí mismo como su propia matriz.
export async function searchOrganizations(
  params: { q?: string; excludeId?: number | string; perPage?: number } = {}
): Promise<Paginated<OrganizationSearchResult>> {
  const query = buildQuery({ q: params.q, exclude_id: params.excludeId, per_page: params.perPage })
  return apiFetch(`/api/admin/organizations/search${query}`)
}

// ---- Módulo standalone "Contactos" (/api/admin/contacts) ------------------
// Distinto de fetchOrganizationContacts()/createOrganizationContact()/etc.
// (esos siguen gestionando vínculos DENTRO del contexto de una organización/
// sede, sin tocar) -- ver docblock de AdminContact en types.ts. Acceso DUAL
// (mismo criterio que fetchBranches()): platform staff ve todos los
// contactos, un admin de tenant (`contacts.read`) solo los suyos -- ya
// resuelto por el backend, sin filtros de organización desde el cliente.
export async function fetchContacts(
  params: {
    page?: number
    perPage?: number
    search?: string
    sort?: 'first_name' | 'last_name' | 'document_number' | 'email'
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminContact>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/contacts${query}`)
}

export async function fetchContact(id: number | string): Promise<{ person: AdminContactDetail }> {
  return apiFetch(`/api/admin/contacts/${id}`)
}

// Edita SOLO los campos de la Persona -- EXCLUSIVO de platform staff (el
// backend responde 403 para cualquier otro actor, ver docblock de
// UpdateContactPayload en types.ts). El caller (ContactDetailScreen) nunca
// debe renderizar el formulario que llama a esta función si
// `user.is_platform_staff` no es `true`. Respuesta SIN `organization_links`
// (mismo shape que el detalle, ver ContactController::update()) -- el
// caller preserva el array ya cargado desde fetchContact().
export async function updateContact(
  id: number | string,
  payload: UpdateContactPayload
): Promise<{ person: Omit<AdminContactDetail, 'organization_links'> }> {
  return apiFetch(`/api/admin/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

// ---- Sedes (/api/admin/branches) -------------------------------------------
// Plan "CRUD de Sedes (Branches) + Contactos" -- acceso DUAL, ver docblock de
// `AdminBranch` en types.ts. `organizationId` como filtro SOLO tiene efecto
// si el actor es platform staff (el backend lo ignora si lo manda un tenant
// admin, ya acotado a la suya) -- el caller decide si lo manda según
// `useAuth().user?.is_platform_staff`, mismo criterio que
// `fetchOrganizationalAreas()`.
export async function fetchBranches(
  params: {
    page?: number
    perPage?: number
    search?: string
    organizationId?: number | string
    departmentId?: number | string
    municipalityId?: number | string
    status?: string
    branchTypeId?: number | string
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminBranch> & { kpis: BranchKpis }> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    organization_id: params.organizationId,
    department_id: params.departmentId,
    municipality_id: params.municipalityId,
    status: params.status,
    branch_type_id: params.branchTypeId,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/branches${query}`)
}

export async function fetchBranch(id: number | string): Promise<{ branch: AdminBranchDetail }> {
  return apiFetch(`/api/admin/branches/${id}`)
}

export async function createBranch(payload: CreateBranchPayload): Promise<{ branch: AdminBranch }> {
  return apiFetch('/api/admin/branches', { method: 'POST', body: JSON.stringify(payload) })
}

// `organization_id` NUNCA viaja aquí -- inmutable tras crear (ver
// `UpdateBranchPayload` en types.ts).
export async function updateBranch(
  id: number | string,
  payload: UpdateBranchPayload
): Promise<{ branch: AdminBranch }> {
  return apiFetch(`/api/admin/branches/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

// `status` (badge de 3 colores) e `is_active` (este botón) son columnas
// INDEPENDIENTES -- ver docblock de `BranchController::activate()`.
export async function activateBranch(id: number | string): Promise<{ branch: AdminBranch }> {
  return apiFetch(`/api/admin/branches/${id}/activate`, { method: 'POST' })
}

export async function deactivateBranch(id: number | string): Promise<{ branch: AdminBranch }> {
  return apiFetch(`/api/admin/branches/${id}/deactivate`, { method: 'POST' })
}

// Tab "Usuarios" -- mismo shape que fetchUsers()/fetchOrganizationUsers().
export async function fetchBranchUsers(
  branchId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<AdminUser>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/branches/${branchId}/users${query}`)
}

// Tab "Contactos" -- mismo shape que fetchOrganizationContacts(), filtrado a
// esta sede (ver `BranchController::contacts()`).
export async function fetchBranchContacts(
  branchId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<AdminOrganizationContact>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/branches/${branchId}/contacts${query}`)
}

// Tab "Actividad" -- exige `audit.read` además de acceso a la sede, mismo
// shape {event_type, description, actor, created_at} que
// fetchOrganizationActivity()/fetchRoleActivity().
export async function fetchBranchActivity(
  branchId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<RoleActivityEvent>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/branches/${branchId}/activity${query}`)
}

export type * from './types'
