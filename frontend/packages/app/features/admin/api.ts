import { apiFetch, apiUrl } from '../../lib/api-client'
import type {
  AdminBranch,
  AdminBranchDetail,
  AdminBranchTreatment,
  AdminBranchTreatmentDetail,
  AdminBranchType,
  AdminBusinessRole,
  AdminCancellationReason,
  AdminContact,
  AdminContactDetail,
  AdminCountry,
  AdminDepartment,
  AdminHazardCharacteristic,
  AdminInvitationRequest,
  AdminLocality,
  AdminManifestLoad,
  AdminManifestLoadDetail,
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
  AdminPreapprovedWaste,
  AdminPreapprovedWasteDetail,
  AdminRespelStatus,
  AdminRole,
  AdminRoleDetail,
  AdminTransportPersonnel,
  AdminTransportPersonnelDetail,
  AdminTransportRoute,
  AdminTransportRouteDetail,
  AdminTransportSchedule,
  AdminTransportScheduleDetail,
  AdminTreatment,
  AdminTreatmentApproval,
  AdminTreatmentApprovalDetail,
  AdminTreatmentApprovalForWaste,
  AdminTreatmentDetail,
  AdminUnCode,
  AdminUnCodeDetail,
  AdminServiceRequest,
  AdminServiceRequestDetail,
  AdminFile,
  AdminGenerationFrequency,
  AdminMeasurementUnit,
  AdminUser,
  AdminVehicle,
  AdminVehicleDetail,
  AdminVehicleType,
  AdminWaste,
  AdminWasteCategory,
  AdminWasteDetail,
  AdminWasteOperationalStatus,
  AdminWasteStream,
  AdminWasteStreamDetail,
  AdminWasteType,
  AdminWorkflow,
  AdminWorkflowDetail,
  AdminWorkflowTransition,
  AdminWorkflowVersion,
  ApproveInvitationRequestPayload,
  ApproveTreatmentApprovalTechnicalPayload,
  AssignPermissionPayload,
  AssignRolePayload,
  AssignTransportScheduleToRoutePayload,
  AvailableBranchTreatment,
  ApproveServiceRequestItemPayload,
  BranchKpis,
  BranchTreatmentKpis,
  CancelServiceRequestPayload,
  ContactSearchResult,
  CreateBranchPayload,
  CreateBranchTreatmentPayload,
  CreateBranchTypePayload,
  CreateServiceRequestPayload,
  CreateHazardCharacteristicPayload,
  CreateManifestLoadPayload,
  CreateOrganizationalAreaPayload,
  CreateOrganizationContactPayload,
  CreateOrganizationPayload,
  CreatePackagingConditionPayload,
  CreatePackagingTypePayload,
  CreatePhysicalStatePayload,
  CreatePreapprovedWastePayload,
  CreateRolePayload,
  CreateTransportPersonnelPayload,
  CreateTransportRoutePayload,
  CreateTransportSchedulePayload,
  CreateTreatmentApprovalRequestPayload,
  CreateTreatmentPayload,
  CreateUnCodePayload,
  CreateUserPayload,
  CreateVehiclePayload,
  CreateVehicleTypePayload,
  CreateWastePayload,
  CreateWasteCategoryPayload,
  CreateWasteStreamPayload,
  CreateWorkflowTransitionPayload,
  ImportResult,
  OrganizationBranch,
  OrganizationContactLink,
  OrganizationKpi,
  OrganizationSearchResult,
  Paginated,
  PermissionActivityEvent,
  PermissionMatrixByModule,
  PreapprovedTreatmentMatch,
  RejectInvitationRequestPayload,
  RejectServiceRequestItemPayload,
  RejectTreatmentApprovalCommercialPayload,
  RejectTreatmentApprovalTechnicalPayload,
  RejectWastePayload,
  RoleActivityEvent,
  SignManifestLoadPayload,
  TreatmentApprovalCommercialStatus,
  TreatmentApprovalTechnicalStatus,
  UpdateBranchPayload,
  UpdateBranchTreatmentPayload,
  UpdateBranchTypePayload,
  UpdateContactPayload,
  UpdateHazardCharacteristicPayload,
  UpdateOrganizationalAreaPayload,
  UpdateOrganizationContactPayload,
  UpdateOrganizationPayload,
  UpdatePackagingConditionPayload,
  UpdatePackagingTypePayload,
  UpdatePhysicalStatePayload,
  UpdatePreapprovedWastePayload,
  UpdateRolePayload,
  UpdateServiceRequestPayload,
  UpdateTransportPersonnelPayload,
  UpdateTransportSchedulePayload,
  UpdateTreatmentApprovalPayload,
  UpdateTreatmentPayload,
  UpdateUnCodePayload,
  UpdateUserPayload,
  UpdateVehiclePayload,
  UpdateVehicleTypePayload,
  UpdateWastePayload,
  UpdateWasteCategoryPayload,
  UpdateWasteStreamPayload,
  UpdateWorkflowTransitionPayload,
  UploadFilePayload,
  UserActivityEvent,
  VehicleKpis,
  WasteFileCategory,
  WasteFilesByCategory,
  WasteKpis,
  WasteStatus,
  WorkflowEntityType,
} from './types'

export { apiUrl } from '../../lib/api-client'

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

// `organizationId` (CU-021 "Configurar Workflow"): filtro OPCIONAL, mismo
// criterio EXACTO que `fetchWorkflows()`/`fetchOrganizationalAreas()` -- el
// backend solo lo respeta para un actor `isPlatformStaff()` (ver
// `RoleController::index()`); para cualquier otro actor lo ignora en
// silencio. Se usa cuando platform staff administra el workflow
// PERSONALIZADO de una organización Gestor ajena, para traer los roles
// reales de ESA organización (no los del propio actor) al selector de la
// transición.
export async function fetchRoles(
  params: {
    page?: number
    perPage?: number
    search?: string
    status?: 'active' | 'inactive'
    type?: 'system' | 'custom'
    sort?: string
    direction?: 'asc' | 'desc'
    organizationId?: number | string
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
    organization_id: params.organizationId,
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
//
// `transportScheduleId` (lote 2026-07-19, cierre del gap "0 resultados" para
// el firmante del Generador en "Generar Manifiesto de Cargue"): cuando se
// manda, el backend acota la búsqueda a la organización GENERADORA real de
// esa `transport_schedule` (en vez de la organización del actor) -- IMPORTANTE:
// `q` pasa a ser OBLIGATORIO en el backend en ese caso (422 en `errors.q` si
// viene vacío/ausente), a diferencia del uso normal donde `q` es opcional.
// El caller es responsable de no invocar esto con `q` vacío cuando manda
// `transportScheduleId` (ver `ContactSearchSelect.tsx`, que nunca busca sin
// al menos un carácter). Puede además rechazar con 404 (programación
// inexistente) o 403 (`'No tiene acceso a esta programación de transporte.'`,
// actor sin permiso para operarla).
export async function searchContacts(
  params: { q?: string; perPage?: number; transportScheduleId?: number | string } = {}
): Promise<Paginated<ContactSearchResult>> {
  const query = buildQuery({
    q: params.q,
    per_page: params.perPage,
    transport_schedule_id: params.transportScheduleId,
  })
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
// edición se ofrezca a sí mismo como su propia matriz. `capability` filtra
// por business_role activo (ej. `can_treat_waste` para el selector de
// organizaciones Gestor de CreateBranchTreatmentForm.tsx) -- mismo mecanismo
// que `Organization::hasCapability()`, ver whitelist de valores aceptados en
// `OrganizationController::search()`.
export async function searchOrganizations(
  params: { q?: string; excludeId?: number | string; perPage?: number; capability?: string } = {}
): Promise<Paginated<OrganizationSearchResult>> {
  const query = buildQuery({
    q: params.q,
    exclude_id: params.excludeId,
    per_page: params.perPage,
    capability: params.capability,
  })
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

// ---- Vehículos (/api/admin/vehicles) ---------------------------------------
// CRUD de Vehículos (RN-VEH-001 a RN-VEH-008, CU-051.1/.2/.3/.4) -- mismo
// patrón EXACTO que fetchBranches()/fetchBranch()/etc. (acceso DUAL, ver
// docblock de `AdminVehicle` en types.ts). `organizationId` como filtro SOLO
// tiene efecto para platform staff, mismo criterio que `fetchBranches()`.
export async function fetchVehicles(
  params: {
    page?: number
    perPage?: number
    search?: string
    organizationId?: number | string
    vehicleTypeId?: number | string
    operationalStatus?: string
    supportsHazmat?: boolean
    hasGps?: boolean
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminVehicle> & { kpis: VehicleKpis }> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    organization_id: params.organizationId,
    vehicle_type_id: params.vehicleTypeId,
    operational_status: params.operationalStatus,
    supports_hazmat: params.supportsHazmat === undefined ? undefined : String(params.supportsHazmat),
    has_gps: params.hasGps === undefined ? undefined : String(params.hasGps),
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/vehicles${query}`)
}

export async function fetchVehicle(id: number | string): Promise<{ vehicle: AdminVehicleDetail }> {
  return apiFetch(`/api/admin/vehicles/${id}`)
}

export async function createVehicle(payload: CreateVehiclePayload): Promise<{ vehicle: AdminVehicle }> {
  return apiFetch('/api/admin/vehicles', { method: 'POST', body: JSON.stringify(payload) })
}

// `organization_id` NUNCA viaja aquí -- inmutable tras crear (ver
// `UpdateVehiclePayload` en types.ts).
export async function updateVehicle(
  id: number | string,
  payload: UpdateVehiclePayload
): Promise<{ vehicle: AdminVehicle }> {
  return apiFetch(`/api/admin/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

// `operational_status`/`is_active` se gestionan EXCLUSIVAMENTE aquí, nunca
// vía updateVehicle() -- permiso granular `vehicles.activate`/`.deactivate`,
// distinto de `vehicles.update` (ver VehicleController::activate()).
export async function activateVehicle(id: number | string): Promise<{ vehicle: AdminVehicle }> {
  return apiFetch(`/api/admin/vehicles/${id}/activate`, { method: 'POST' })
}

export async function deactivateVehicle(id: number | string): Promise<{ vehicle: AdminVehicle }> {
  return apiFetch(`/api/admin/vehicles/${id}/deactivate`, { method: 'POST' })
}

// Tab "Actividad" -- exige `audit.read` además de acceso al vehículo, mismo
// shape {event_type, description, actor, created_at} que
// fetchBranchActivity()/fetchOrganizationActivity().
export async function fetchVehicleActivity(
  vehicleId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<RoleActivityEvent>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/vehicles/${vehicleId}/activity${query}`)
}

// ---- Catálogo "Tratamientos" (/api/admin/treatments) ----------------------
// Módulo Tratamiento (RN-063/D-R02) -- mismo patrón EXACTO que
// fetchWasteCategories()/etc. (catálogo global, CRUD completo). Escritura
// (`create`/`update`/`activate`/`deactivate`) EXCLUSIVA de platform staff en
// el backend (`TreatmentPolicy`) -- el caller oculta esos controles si
// `!user.is_platform_staff`, ver TreatmentDetailScreen.tsx/
// TreatmentsListScreen.tsx.
export async function fetchTreatments(
  params: {
    page?: number
    perPage?: number
    search?: string
    treatmentType?: string
    riskLevel?: string
    status?: 'active' | 'inactive'
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminTreatment>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    treatment_type: params.treatmentType,
    risk_level: params.riskLevel,
    status: params.status,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/treatments${query}`)
}

export async function createTreatment(payload: CreateTreatmentPayload): Promise<{ treatment: AdminTreatment }> {
  return apiFetch('/api/admin/treatments', { method: 'POST', body: JSON.stringify(payload) })
}

export async function fetchTreatment(id: number | string): Promise<{ treatment: AdminTreatmentDetail }> {
  return apiFetch(`/api/admin/treatments/${id}`)
}

export async function updateTreatment(
  id: number | string,
  payload: UpdateTreatmentPayload
): Promise<{ treatment: AdminTreatment }> {
  return apiFetch(`/api/admin/treatments/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activateTreatment(id: number | string): Promise<{ treatment: AdminTreatment }> {
  return apiFetch(`/api/admin/treatments/${id}/activate`, { method: 'POST' })
}

export async function deactivateTreatment(id: number | string): Promise<{ treatment: AdminTreatment }> {
  return apiFetch(`/api/admin/treatments/${id}/deactivate`, { method: 'POST' })
}

// ---- "Tratamientos de Sucursal" (/api/admin/branch-treatments) -----------
// Habilitación de Tratamientos por Sede (RN-063/D-R02) -- mismo patrón
// EXACTO que fetchVehicles()/fetchVehicle()/etc. (acceso DUAL, ver docblock
// de `AdminBranchTreatment` en types.ts). `organizationId` como filtro SOLO
// tiene efecto para platform staff, mismo criterio que `fetchVehicles()`.
export async function fetchBranchTreatments(
  params: {
    page?: number
    perPage?: number
    search?: string
    organizationId?: number | string
    branchId?: number | string
    treatmentId?: number | string
    operationalStatus?: string
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminBranchTreatment> & { kpis: BranchTreatmentKpis }> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    organization_id: params.organizationId,
    branch_id: params.branchId,
    treatment_id: params.treatmentId,
    operational_status: params.operationalStatus,
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/branch-treatments${query}`)
}

export async function fetchBranchTreatment(
  id: number | string
): Promise<{ branch_treatment: AdminBranchTreatmentDetail }> {
  return apiFetch(`/api/admin/branch-treatments/${id}`)
}

export async function createBranchTreatment(
  payload: CreateBranchTreatmentPayload
): Promise<{ branch_treatment: AdminBranchTreatment }> {
  return apiFetch('/api/admin/branch-treatments', { method: 'POST', body: JSON.stringify(payload) })
}

// `organization_id` NUNCA viaja aquí -- inmutable tras crear (ver
// `UpdateBranchTreatmentPayload` en types.ts).
export async function updateBranchTreatment(
  id: number | string,
  payload: UpdateBranchTreatmentPayload
): Promise<{ branch_treatment: AdminBranchTreatment }> {
  return apiFetch(`/api/admin/branch-treatments/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activateBranchTreatment(
  id: number | string
): Promise<{ branch_treatment: AdminBranchTreatment }> {
  return apiFetch(`/api/admin/branch-treatments/${id}/activate`, { method: 'POST' })
}

export async function deactivateBranchTreatment(
  id: number | string
): Promise<{ branch_treatment: AdminBranchTreatment }> {
  return apiFetch(`/api/admin/branch-treatments/${id}/deactivate`, { method: 'POST' })
}

// Tab "Actividad" -- exige `audit.read` además de acceso al tratamiento de
// sede, mismo shape {event_type, description, actor, created_at} que
// fetchVehicleActivity()/fetchBranchActivity().
export async function fetchBranchTreatmentActivity(
  branchTreatmentId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<RoleActivityEvent>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/branch-treatments/${branchTreatmentId}/activity${query}`)
}

// Tab "Corrientes" -- REEMPLAZA la lista COMPLETA de corrientes Y/A
// permitidas (selección múltiple tipo checklist, no assign/revoke
// individual) -- ver `BranchTreatmentController::syncAllowedWasteStreams()`.
export async function syncBranchTreatmentAllowedWasteStreams(
  branchTreatmentId: number | string,
  wasteStreamIds: number[]
): Promise<{ branch_treatment: AdminBranchTreatmentDetail }> {
  return apiFetch(`/api/admin/branch-treatments/${branchTreatmentId}/allowed-waste-streams`, {
    method: 'PUT',
    body: JSON.stringify({ waste_stream_ids: wasteStreamIds }),
  })
}

// Mismo patrón exacto que syncBranchTreatmentAllowedWasteStreams(), eje
// Códigos UN -- ver `BranchTreatmentController::syncAllowedUnCodes()`.
export async function syncBranchTreatmentAllowedUnCodes(
  branchTreatmentId: number | string,
  unCodeIds: number[]
): Promise<{ branch_treatment: AdminBranchTreatmentDetail }> {
  return apiFetch(`/api/admin/branch-treatments/${branchTreatmentId}/allowed-un-codes`, {
    method: 'PUT',
    body: JSON.stringify({ un_code_ids: unCodeIds }),
  })
}

// ---- Catálogos de solo lectura del wizard de Residuos ----------------------
// `waste-types`/`measurement-units`/`generation-frequencies`/
// `waste-operational-statuses` -- ya sembrados, SOLO lectura para este lote
// (sin create/update/activate -- esas pantallas de catálogo quedan fuera de
// alcance). Mismo patrón `buildQuery` que el resto de catálogos simples.

export async function fetchWasteTypes(
  params: { page?: number; perPage?: number; search?: string; status?: 'active' | 'inactive' } = {}
): Promise<Paginated<AdminWasteType>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
  })
  return apiFetch(`/api/admin/waste-types${query}`)
}

export async function fetchMeasurementUnits(
  params: { page?: number; perPage?: number; search?: string; status?: 'active' | 'inactive' } = {}
): Promise<Paginated<AdminMeasurementUnit>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
  })
  return apiFetch(`/api/admin/measurement-units${query}`)
}

export async function fetchGenerationFrequencies(
  params: { page?: number; perPage?: number; search?: string; status?: 'active' | 'inactive' } = {}
): Promise<Paginated<AdminGenerationFrequency>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
  })
  return apiFetch(`/api/admin/generation-frequencies${query}`)
}

export async function fetchWasteOperationalStatuses(
  params: { page?: number; perPage?: number; search?: string; status?: 'active' | 'inactive' } = {}
): Promise<Paginated<AdminWasteOperationalStatus>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    status: params.status,
  })
  return apiFetch(`/api/admin/waste-operational-statuses${query}`)
}

// ---- Núcleo del Módulo Residuos (/api/admin/wastes) -----------------------
// Declaración + clasificación (wizard de 5 pasos) -- mismo patrón EXACTO que
// fetchVehicles()/fetchVehicle()/etc. (acceso DUAL, ver docblock de
// `AdminWaste` en types.ts). `organizationId` como filtro SOLO tiene efecto
// para platform staff, mismo criterio que `fetchVehicles()`.
//
// `withViableTreatment` (-> `with_viable_treatment=1`): cierre del gap de
// contrato señalado en el lote del wizard de Solicitudes de Servicio --
// reutiliza `Waste::scopeWithViableTreatment()` (ya existía en el modelo,
// nunca se exponía como filtro de `index()`). ADITIVO al resto de filtros
// (nunca reemplaza el scoping de organización de arriba). Ver
// `ServiceRequestWizard.tsx` (Paso 2, "Residuos Disponibles Para Solicitar")
// -- reemplaza el workaround N+1 que traía TODOS los residuos y filtraba en
// cliente contra `fetchWasteTreatmentApprovals()` por cada uno.
export async function fetchWastes(
  params: {
    page?: number
    perPage?: number
    search?: string
    organizationId?: number | string
    branchId?: number | string
    wasteCategoryId?: number | string
    status?: WasteStatus
    operationalStatusId?: number | string
    withViableTreatment?: boolean
    sort?: string
    direction?: 'asc' | 'desc'
  } = {}
): Promise<Paginated<AdminWaste> & { kpis: WasteKpis }> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    organization_id: params.organizationId,
    branch_id: params.branchId,
    waste_category_id: params.wasteCategoryId,
    status: params.status,
    operational_status_id: params.operationalStatusId,
    with_viable_treatment: params.withViableTreatment === undefined ? undefined : String(params.withViableTreatment),
    sort: params.sort,
    direction: params.direction,
  })
  return apiFetch(`/api/admin/wastes${query}`)
}

export async function fetchWaste(id: number | string): Promise<{ waste: AdminWasteDetail }> {
  return apiFetch(`/api/admin/wastes/${id}`)
}

export async function createWaste(payload: CreateWastePayload): Promise<{ waste: AdminWaste }> {
  return apiFetch('/api/admin/wastes', { method: 'POST', body: JSON.stringify(payload) })
}

// `organization_id` NUNCA viaja aquí -- inmutable tras crear (ver
// `UpdateWastePayload` en types.ts).
export async function updateWaste(id: number | string, payload: UpdateWastePayload): Promise<{ waste: AdminWaste }> {
  return apiFetch(`/api/admin/wastes/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export async function activateWaste(id: number | string): Promise<{ waste: AdminWaste }> {
  return apiFetch(`/api/admin/wastes/${id}/activate`, { method: 'POST' })
}

export async function deactivateWaste(id: number | string): Promise<{ waste: AdminWaste }> {
  return apiFetch(`/api/admin/wastes/${id}/deactivate`, { method: 'POST' })
}

// Workflow de declaración -- BR -> DEC. Ver `WasteController::submit()`
// (422 si falta algún campo obligatorio o ninguna corriente/UN asignado).
export async function submitWaste(id: number | string): Promise<{ waste: AdminWaste }> {
  return apiFetch(`/api/admin/wastes/${id}/submit`, { method: 'POST' })
}

// DEC -> REV.
export async function startReviewWaste(id: number | string): Promise<{ waste: AdminWaste }> {
  return apiFetch(`/api/admin/wastes/${id}/start-review`, { method: 'POST' })
}

// REV -> CLS.
export async function classifyWaste(id: number | string): Promise<{ waste: AdminWaste }> {
  return apiFetch(`/api/admin/wastes/${id}/classify`, { method: 'POST' })
}

// DEC|REV -> BR (reversible).
export async function rejectWaste(id: number | string, payload: RejectWastePayload): Promise<{ waste: AdminWaste }> {
  return apiFetch(`/api/admin/wastes/${id}/reject`, { method: 'POST', body: JSON.stringify(payload) })
}

// Reemplaza la pivote COMPLETA de corrientes Y/A asignadas -- Paso 2 del
// wizard (Caracterización). Ver `WasteController::syncWasteStreams()`.
export async function syncWasteWasteStreams(
  wasteId: number | string,
  wasteStreamIds: number[]
): Promise<{ waste: AdminWasteDetail }> {
  return apiFetch(`/api/admin/wastes/${wasteId}/waste-streams`, {
    method: 'PUT',
    body: JSON.stringify({ waste_stream_ids: wasteStreamIds }),
  })
}

// Mismo patrón exacto que syncWasteWasteStreams(), eje Códigos UN.
export async function syncWasteUnCodes(
  wasteId: number | string,
  unCodeIds: number[]
): Promise<{ waste: AdminWasteDetail }> {
  return apiFetch(`/api/admin/wastes/${wasteId}/un-codes`, {
    method: 'PUT',
    body: JSON.stringify({ un_code_ids: unCodeIds }),
  })
}

// Reemplaza la pivote completa de Características de Peligrosidad -- el
// backend recalcula `waste_danger` automáticamente tras esto (ver
// `Waste::recalculateWasteDanger()`), NUNCA se envía `waste_danger` desde
// aquí.
export async function syncWasteHazardCharacteristics(
  wasteId: number | string,
  hazardCharacteristicIds: number[]
): Promise<{ waste: AdminWasteDetail }> {
  return apiFetch(`/api/admin/wastes/${wasteId}/hazard-characteristics`, {
    method: 'PUT',
    body: JSON.stringify({ hazard_characteristic_ids: hazardCharacteristicIds }),
  })
}

// Tab "Actividad" -- mismo shape {event_type, description, actor, created_at}
// que fetchVehicleActivity()/fetchBranchTreatmentActivity().
export async function fetchWasteActivity(
  wasteId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<RoleActivityEvent>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/wastes/${wasteId}/activity${query}`)
}

// Tab "Evidencias" / Paso 4 del wizard -- archivos activos agrupados por
// `file_category`, ver `WasteController::files()`.
export async function fetchWasteFiles(
  wasteId: number | string,
  params: { fileCategory?: WasteFileCategory } = {}
): Promise<{ files: WasteFilesByCategory }> {
  const query = buildQuery({ file_category: params.fileCategory })
  return apiFetch(`/api/admin/wastes/${wasteId}/files${query}`)
}

// ---- "Residuos Preaprobados" (/api/admin/preapproved-wastes) --------------
// Catálogo de referencia auto-declarado/auto-aprobado por una organización
// Gestor (RN-191, ver docblock completo de `PreapprovedWasteController` y de
// los tipos en types.ts). `organizationId` como filtro SOLO tiene efecto para
// platform staff, mismo criterio EXACTO que `fetchOrganizationalAreas()`/
// `fetchWastes()`. SIN kpis en la respuesta (a diferencia de
// `fetchWastes()`/`fetchBranchTreatments()`) -- `index()` no los calcula.
export async function fetchPreapprovedWastes(
  params: {
    page?: number
    perPage?: number
    search?: string
    organizationId?: number | string
  } = {}
): Promise<Paginated<AdminPreapprovedWaste>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    organization_id: params.organizationId,
  })
  return apiFetch(`/api/admin/preapproved-wastes${query}`)
}

export async function fetchPreapprovedWaste(
  id: number | string
): Promise<{ waste: AdminPreapprovedWasteDetail }> {
  return apiFetch(`/api/admin/preapproved-wastes/${id}`)
}

// `waste->fresh([...])` en el backend NO incluye
// `treatmentApprovals.branchTreatment.branch` (solo `.treatment`) -- GAP de
// contrato documentado (no se corrige aquí, ver docblock del controller):
// tras crear/editar, las pantallas deben navegar/refrescar contra
// `fetchPreapprovedWaste()` (show(), SIEMPRE completo) en vez de confiar en
// esta respuesta para pintar el detalle completo.
export async function createPreapprovedWaste(
  payload: CreatePreapprovedWastePayload
): Promise<{ waste: AdminPreapprovedWaste }> {
  return apiFetch('/api/admin/preapproved-wastes', { method: 'POST', body: JSON.stringify(payload) })
}

// `organization_id`/`waste_type_id` NUNCA viajan aquí -- inmutables tras
// crear (ver `UpdatePreapprovedWastePayload` en types.ts). Mismo GAP de
// `branchTreatment.branch` que `createPreapprovedWaste()` -- ver comentario
// arriba.
export async function updatePreapprovedWaste(
  id: number | string,
  payload: UpdatePreapprovedWastePayload
): Promise<{ waste: AdminPreapprovedWaste }> {
  return apiFetch(`/api/admin/preapproved-wastes/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

// Cascada: activa/desactiva TAMBIÉN la `WasteTreatmentApproval` asociada (ver
// docblock de `activate()`/`deactivate()` en el backend). Devuelve
// `waste->fresh()` SIN relaciones -- ver `AdminPreapprovedWaste.organization?`
// etc. arriba.
export async function activatePreapprovedWaste(
  id: number | string
): Promise<{ waste: AdminPreapprovedWaste }> {
  return apiFetch(`/api/admin/preapproved-wastes/${id}/activate`, { method: 'POST' })
}

export async function deactivatePreapprovedWaste(
  id: number | string
): Promise<{ waste: AdminPreapprovedWaste }> {
  return apiFetch(`/api/admin/preapproved-wastes/${id}/deactivate`, { method: 'POST' })
}

// ---- Archivos transversales (/api/admin/files) ----------------------------
// Subida REAL a disco (S3 en prod, `local` en dev vía Laravel Storage, ver
// docblock de `FileController`). `apiFetch` detecta `FormData` y omite
// `Content-Type: application/json` -- mismo mecanismo que
// importWasteStreams()/importUnCodes().
export async function uploadFile(payload: UploadFilePayload): Promise<{ file: AdminFile }> {
  const formData = new FormData()
  formData.append('file', payload.file)
  formData.append('entity_type', payload.entityType)
  formData.append('entity_id', String(payload.entityId))
  formData.append('file_category', payload.fileCategory)
  if (payload.description) formData.append('description', payload.description)
  return apiFetch('/api/admin/files', { method: 'POST', body: formData })
}

// Soft-delete únicamente -- ver `FileController::destroy()`.
export async function deleteFile(id: number | string): Promise<{ message: string }> {
  return apiFetch(`/api/admin/files/${id}`, { method: 'DELETE' })
}

// El binario NUNCA se pide vía `apiFetch()` -- el caller abre esta URL
// directamente (`window.open(getFileDownloadUrl(id), '_blank')`), la cookie
// de sesión Sanctum viaja igual en una navegación normal del navegador.
export function getFileDownloadUrl(id: number | string): string {
  return apiUrl(`/api/admin/files/${id}/download`)
}

// ---- "Evaluación del Gestor" (waste_treatment_approvals) -------------------
// Ver docblock de `WasteTreatmentApprovalController`/tipos en types.ts.

// GET /api/admin/branch-treatments/available -- exploración pública
// (cualquier usuario autenticado) de tratamientos de sede ACTIVOS de
// organizaciones Gestor, filtrada opcionalmente por corrientes/UN
// compatibles (arrays -- de ahí el `URLSearchParams.append` manual en vez de
// `buildQuery`, que solo soporta valores escalares).
export async function fetchAvailableBranchTreatments(
  params: { wasteStreamIds?: number[]; unCodeIds?: number[] } = {}
): Promise<{ branch_treatments: AvailableBranchTreatment[] }> {
  const query = new URLSearchParams()
  for (const id of params.wasteStreamIds ?? []) query.append('waste_stream_ids[]', String(id))
  for (const id of params.unCodeIds ?? []) query.append('un_code_ids[]', String(id))
  const qs = query.toString()
  return apiFetch(`/api/admin/branch-treatments/available${qs ? `?${qs}` : ''}`)
}

// GET /api/admin/wastes/{waste}/treatment-approvals -- visible para el
// dueño del residuo (ve TODAS) y para cada Gestor (solo la suya) -- ver
// `indexForWaste()`.
export async function fetchWasteTreatmentApprovals(
  wasteId: number | string,
  params: { page?: number; perPage?: number } = {}
): Promise<Paginated<AdminTreatmentApprovalForWaste>> {
  const query = buildQuery({ page: params.page, per_page: params.perPage })
  return apiFetch(`/api/admin/wastes/${wasteId}/treatment-approvals${query}`)
}

// POST /api/admin/wastes/{waste}/treatment-approvals -- el dueño del
// residuo elige un `branch_treatment_id` de un Gestor -- esa elección ES la
// invitación. Rate-limited (10/min) y rechaza duplicado activo con 422.
export async function createWasteTreatmentApprovalRequest(
  wasteId: number | string,
  payload: CreateTreatmentApprovalRequestPayload
): Promise<{ treatment_approval: AdminTreatmentApprovalForWaste }> {
  return apiFetch(`/api/admin/wastes/${wasteId}/treatment-approvals`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// GET /api/admin/wastes/{waste}/preapproved-matches -- "Tratamiento
// Preaprobado Detectado" (Paso 2 del wizard / tab Tratamientos). Requiere
// que el residuo ya tenga corrientes/UN asignados EN EL SERVIDOR (el
// backend consulta `waste_stream_assignments`/`waste_un_codes`, no el
// estado local del wizard) -- el caller debe sincronizar la clasificación
// antes de llamar esto. Puede devolver lista vacía.
export async function fetchWastePreapprovedMatches(
  wasteId: number | string
): Promise<{ matches: PreapprovedTreatmentMatch[] }> {
  return apiFetch(`/api/admin/wastes/${wasteId}/preapproved-matches`)
}

// POST /api/admin/wastes/{waste}/preapproved-matches/{treatmentApproval}/use
// -- el Generador confirma usar la sugerencia. La evaluación nueva SIEMPRE
// nace PENDING/DRAFT (nunca auto-aprobada) -- el caller debe comunicarlo
// explícitamente en la UI, no dar a entender que ya quedó aprobada.
export async function usePreapprovedTreatmentMatch(
  wasteId: number | string,
  treatmentApprovalId: number | string
): Promise<{ treatment_approval: AdminTreatmentApprovalForWaste }> {
  return apiFetch(`/api/admin/wastes/${wasteId}/preapproved-matches/${treatmentApprovalId}/use`, { method: 'POST' })
}

// GET /api/admin/treatment-approvals -- listado GENERAL desde la
// perspectiva del Gestor (acceso dual: platform staff ve todas, un Gestor
// solo las suyas). Sin KPIs -- `index()` no los calcula (a diferencia de
// fetchBranchTreatments()/fetchVehicles()).
export async function fetchTreatmentApprovals(
  params: {
    page?: number
    perPage?: number
    search?: string
    technicalStatus?: TreatmentApprovalTechnicalStatus
    commercialStatus?: TreatmentApprovalCommercialStatus
    wasteId?: number | string
  } = {}
): Promise<Paginated<AdminTreatmentApproval>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    technical_status: params.technicalStatus,
    commercial_status: params.commercialStatus,
    waste_id: params.wasteId,
  })
  return apiFetch(`/api/admin/treatment-approvals${query}`)
}

export async function fetchTreatmentApproval(
  id: number | string
): Promise<{ treatment_approval: AdminTreatmentApprovalDetail }> {
  return apiFetch(`/api/admin/treatment-approvals/${id}`)
}

// PUT /api/admin/treatment-approvals/{id} -- SOLO el Gestor evaluador (ver
// `WasteTreatmentApprovalPolicy::update()`).
export async function updateTreatmentApproval(
  id: number | string,
  payload: UpdateTreatmentApprovalPayload
): Promise<{ treatment_approval: AdminTreatmentApproval }> {
  return apiFetch(`/api/admin/treatment-approvals/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

// Transiciones -- SOLO el Gestor evaluador, permiso `treatment_approvals.evaluate`
// (ver `WasteTreatmentApprovalPolicy::evaluate()`).
export async function approveTreatmentApprovalTechnical(
  id: number | string,
  payload: ApproveTreatmentApprovalTechnicalPayload = {}
): Promise<{ treatment_approval: AdminTreatmentApproval }> {
  return apiFetch(`/api/admin/treatment-approvals/${id}/approve-technical`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function rejectTreatmentApprovalTechnical(
  id: number | string,
  payload: RejectTreatmentApprovalTechnicalPayload
): Promise<{ treatment_approval: AdminTreatmentApproval }> {
  return apiFetch(`/api/admin/treatment-approvals/${id}/reject-technical`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// Exige que `unit_price` ya esté fijado -- el backend responde 422 si no.
export async function approveTreatmentApprovalCommercial(
  id: number | string
): Promise<{ treatment_approval: AdminTreatmentApproval }> {
  return apiFetch(`/api/admin/treatment-approvals/${id}/approve-commercial`, { method: 'POST' })
}

export async function rejectTreatmentApprovalCommercial(
  id: number | string,
  payload: RejectTreatmentApprovalCommercialPayload = {}
): Promise<{ treatment_approval: AdminTreatmentApproval }> {
  return apiFetch(`/api/admin/treatment-approvals/${id}/reject-commercial`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function quoteTreatmentApproval(id: number | string): Promise<{ treatment_approval: AdminTreatmentApproval }> {
  return apiFetch(`/api/admin/treatment-approvals/${id}/quote`, { method: 'POST' })
}

export async function negotiateTreatmentApproval(
  id: number | string
): Promise<{ treatment_approval: AdminTreatmentApproval }> {
  return apiFetch(`/api/admin/treatment-approvals/${id}/negotiate`, { method: 'POST' })
}

export async function cancelTreatmentApproval(id: number | string): Promise<{ treatment_approval: AdminTreatmentApproval }> {
  return apiFetch(`/api/admin/treatment-approvals/${id}/cancel`, { method: 'POST' })
}

// ---- Motor de Workflow genérico (/api/admin/workflows, CU-021) -----------
// Ver docblock completo de `WorkflowController`/`WorkflowPolicy` en el
// backend. Los 2 gaps de contrato documentados en el lote anterior ya se
// cerraron: `show()` ahora eager-carga `versions[].transitions` completo
// (no solo `current_version`), y existe `GET /admin/respel-statuses`
// (`fetchRespelStatuses()` abajo) para el catálogo de estados.

// GET /api/admin/respel-statuses -- catálogo de solo lectura (ver
// `RespelStatusController::index()`), gateado por `workflows.manage` (no
// `isPlatformStaff()`) -- lo consume cualquier actor autorizado a
// administrar un workflow, incluido un admin de organización Gestor sobre
// su propio clon. `activeOnly` mapea a `active_only=true` en el backend.
export async function fetchRespelStatuses(
  params: { activeOnly?: boolean } = {}
): Promise<{ data: AdminRespelStatus[] }> {
  const query = buildQuery({ active_only: params.activeOnly ? 'true' : undefined })
  return apiFetch(`/api/admin/respel-statuses${query}`)
}

// `organizationId`: filtro OPCIONAL, SOLO tiene efecto para platform staff
// (el backend lo exige si lo manda, y lo ignora -- fuerza BASE + tenant
// propio -- para cualquier otro actor), mismo criterio EXACTO que
// `fetchOrganizationalAreas()`/`fetchBranches()`. `entityType` acota a un
// valor de `Workflow::ENTITY_TYPES` -- hoy solo `TREATMENT` tiene datos
// reales.
export async function fetchWorkflows(
  params: {
    page?: number
    perPage?: number
    organizationId?: number | string
    entityType?: WorkflowEntityType
  } = {}
): Promise<Paginated<AdminWorkflow>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    organization_id: params.organizationId,
    entity_type: params.entityType,
  })
  return apiFetch(`/api/admin/workflows${query}`)
}

export async function fetchWorkflow(id: number | string): Promise<{ workflow: AdminWorkflowDetail }> {
  return apiFetch(`/api/admin/workflows/${id}`)
}

// POST /api/admin/workflows/{workflow}/clone (CU-021_13) -- SOLO sobre el
// workflow BASE, SOLO un admin de organización Gestor sin workflow propio de
// ese `entity_type` todavía (ver `WorkflowPolicy::clone()`, el backend
// responde 403/422 fuera de ese caso). El caller (WorkflowsListScreen/
// WorkflowDetailScreen) navega al workflow recién clonado y deja que
// `WorkflowDetailScreen` lo cargue con `fetchWorkflow()` (show() ya trae el
// detalle completo de todas las versiones, ver types.ts) -- ya NO hace falta
// aprovechar/cachear la respuesta de este endpoint (gap de contrato cerrado,
// se retiró el workaround de `sessionStorage`).
export async function cloneWorkflow(id: number | string): Promise<{ workflow: AdminWorkflowDetail }> {
  return apiFetch(`/api/admin/workflows/${id}/clone`, { method: 'POST' })
}

// POST /api/admin/workflows/{workflow}/versions (CU-021_12) -- rechaza con
// 422 (clave "workflow") si ya existe una versión DRAFT sin publicar.
export async function storeWorkflowVersion(
  workflowId: number | string
): Promise<{ workflow_version: AdminWorkflowVersion }> {
  return apiFetch(`/api/admin/workflows/${workflowId}/versions`, { method: 'POST' })
}

// POST /api/admin/workflows/{workflow}/versions/{version}/publish (CU-021_15)
// -- atómico, fija `version.status=PUBLISHED` Y `workflow.current_version_id`
// en el mismo paso (ver requisito 4, docblock del backend). Rechaza con 422
// si la versión no está en DRAFT.
export async function publishWorkflowVersion(
  workflowId: number | string,
  versionId: number | string
): Promise<{ workflow: AdminWorkflowDetail }> {
  return apiFetch(`/api/admin/workflows/${workflowId}/versions/${versionId}/publish`, { method: 'POST' })
}

// POST /api/admin/workflows/{workflow}/transitions -- crea SOLO sobre la
// versión DRAFT más reciente (resuelta en el backend, `resolveDraftVersion()`
// -- el caller nunca manda un `workflow_version_id`). 422 (clave
// "workflow_version") si no hay ninguna DRAFT -- cree una versión primero
// con `storeWorkflowVersion()`.
export async function storeWorkflowTransition(
  workflowId: number | string,
  payload: CreateWorkflowTransitionPayload
): Promise<{ workflow_transition: AdminWorkflowTransition }> {
  return apiFetch(`/api/admin/workflows/${workflowId}/transitions`, { method: 'POST', body: JSON.stringify(payload) })
}

// PUT /api/admin/workflows/{workflow}/transitions/{transition} -- 422 (clave
// "workflow_transition") si la transición pertenece a una versión PUBLISHED
// (inmutable, ver `assertTransitionBelongsToDraftOf()`).
export async function updateWorkflowTransition(
  workflowId: number | string,
  transitionId: number | string,
  payload: UpdateWorkflowTransitionPayload
): Promise<{ workflow_transition: AdminWorkflowTransition }> {
  return apiFetch(`/api/admin/workflows/${workflowId}/transitions/${transitionId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

// DELETE /api/admin/workflows/{workflow}/transitions/{transition} -- mismo
// guard DRAFT-only que `updateWorkflowTransition()`. 204 sin body.
export async function destroyWorkflowTransition(
  workflowId: number | string,
  transitionId: number | string
): Promise<void> {
  await apiFetch(`/api/admin/workflows/${workflowId}/transitions/${transitionId}`, { method: 'DELETE' })
}

// ---- Solicitudes de Servicio (/api/admin/service-requests) ---------------
// Fase 1b -- ver docblock completo de tipos en types.ts. Acceso NO simétrico
// (ver `ServiceRequestPolicy`): `organizationId` como filtro de `index()`
// SOLO tiene efecto para platform staff, mismo criterio que
// `fetchWastes()`/`fetchVehicles()` -- para cualquier otro actor el backend
// devuelve la UNIÓN de "mis solicitudes como Generador" + "solicitudes donde
// tengo al menos un ítem asignado como Gestor", sin que el cliente pueda
// elegir cuál de las dos ver.
export async function fetchServiceRequests(
  params: {
    page?: number
    perPage?: number
    search?: string
    organizationId?: number | string
    status?: string
  } = {}
): Promise<Paginated<AdminServiceRequest>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    organization_id: params.organizationId,
    status: params.status,
  })
  return apiFetch(`/api/admin/service-requests${query}`)
}

// GET /api/admin/service-requests/{id} -- ver `ServiceRequestController::show()`.
// La forma de `items` es POLIMÓRFICA según quién pregunta -- ver AVISO
// completo en `AdminServiceRequestDetail` (types.ts).
export async function fetchServiceRequest(id: number | string): Promise<{ service_request: AdminServiceRequestDetail }> {
  return apiFetch(`/api/admin/service-requests/${id}`)
}

// POST /api/admin/service-requests -- `items` es OBLIGATORIO desde la
// creación (ver AVISO en `CreateServiceRequestPayload`, types.ts) -- nunca
// llamar esto con un array vacío, el backend responde 422.
export async function createServiceRequest(
  payload: CreateServiceRequestPayload
): Promise<{ service_request: AdminServiceRequestDetail }> {
  return apiFetch('/api/admin/service-requests', { method: 'POST', body: JSON.stringify(payload) })
}

// PUT /api/admin/service-requests/{id} -- SOLO campos de cabecera, y SOLO
// mientras `service_status.code === 'DRAFT'` (ver
// `ServiceRequestController::update()`, 422 clave "service_status" en
// cualquier otro estado).
export async function updateServiceRequest(
  id: number | string,
  payload: UpdateServiceRequestPayload
): Promise<{ service_request: AdminServiceRequestDetail }> {
  return apiFetch(`/api/admin/service-requests/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

// POST /api/admin/service-requests/{id}/submit -- DRAFT -> SUBMITTED ->
// UNDER_REVIEW (D-S13, la segunda transición es automática en el mismo
// request). Exige al menos un ítem y que TODOS tengan
// `waste_treatment_approval_id`/`estimated_quantity`/`measurement_unit_id`
// completos -- 422 con esas claves si falta alguno.
export async function submitServiceRequest(id: number | string): Promise<{ service_request: AdminServiceRequestDetail }> {
  return apiFetch(`/api/admin/service-requests/${id}/submit`, { method: 'POST' })
}

// POST /api/admin/service-requests/{id}/cancel -- SOLO el Generador dueño (o
// platform staff), alcanzable desde cualquier estado no-final (RN-SOL-009).
// `cancellation_reason_id` se puebla desde `fetchCancellationReasons()`
// (gap de contrato ya cerrado, 2026-07-19).
export async function cancelServiceRequest(
  id: number | string,
  payload: CancelServiceRequestPayload
): Promise<{ service_request: AdminServiceRequestDetail }> {
  return apiFetch(`/api/admin/service-requests/${id}/cancel`, { method: 'POST', body: JSON.stringify(payload) })
}

// GET /api/admin/cancellation-reasons -- ver
// `CancellationReasonController::index()`. Catálogo de solo lectura,
// gateado por `service_requests.read` (NO `isPlatformStaff()`) -- cierre del
// GAP DE CONTRATO señalado en el resumen del lote anterior (2026-07-19). Se
// usa para poblar el selector "Motivo de Cancelación" de
// `ServiceRequestDetailScreen.tsx`, siempre con `activeOnly: true` (nunca se
// ofrece un motivo inactivo en el selector, aunque el backend no lo impida
// por sí solo -- el filtro es responsabilidad del caller).
export async function fetchCancellationReasons(
  params: { activeOnly?: boolean } = {}
): Promise<{ data: AdminCancellationReason[] }> {
  const query = buildQuery({
    active_only: params.activeOnly === undefined ? undefined : String(params.activeOnly),
  })
  return apiFetch(`/api/admin/cancellation-reasons${query}`)
}

// POST /api/admin/service-requests/items/{item}/approve -- SOLO el Gestor
// dueño de ESE ítem específico (o platform staff), ver
// `WasteServiceRequestItem::isEvaluableBy()`.
export async function approveServiceRequestItem(
  itemId: number | string,
  payload: ApproveServiceRequestItemPayload = {}
): Promise<{ item: AdminServiceRequestDetail['items'][number] }> {
  return apiFetch(`/api/admin/service-requests/items/${itemId}/approve`, { method: 'POST', body: JSON.stringify(payload) })
}

// POST /api/admin/service-requests/items/{item}/reject -- mismo criterio que
// approveServiceRequestItem(), `notes` es OBLIGATORIO (motivo de rechazo).
export async function rejectServiceRequestItem(
  itemId: number | string,
  payload: RejectServiceRequestItemPayload
): Promise<{ item: AdminServiceRequestDetail['items'][number] }> {
  return apiFetch(`/api/admin/service-requests/items/${itemId}/reject`, { method: 'POST', body: JSON.stringify(payload) })
}

// ---- Programación de Recolección (/api/admin/transport-schedules) --------
// Módulo Programación Logística, Fase 2a (backend cerrado -- 1177 tests
// Pest, revisión de seguridad -- ver docblock completo de
// `TransportScheduleController`/`TransportSchedulePolicy` en types.ts, junto
// con el GAP DE CONTRATO explícito de `TransportPersonnelController`/
// `TransportRouteController`, ninguno de los dos existe todavía).

export async function fetchTransportSchedules(
  params: {
    page?: number
    perPage?: number
    search?: string
    organizationId?: number | string
    status?: string
  } = {}
): Promise<Paginated<AdminTransportSchedule>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    organization_id: params.organizationId,
    status: params.status,
  })
  return apiFetch(`/api/admin/transport-schedules${query}`)
}

export async function fetchTransportSchedule(
  id: number | string
): Promise<{ transport_schedule: AdminTransportScheduleDetail }> {
  return apiFetch(`/api/admin/transport-schedules/${id}`)
}

// POST /api/admin/transport-schedules -- ver
// `TransportScheduleController::store()`. La respuesta real del backend es
// `schedule->fresh(['items', 'transportStatus', 'organization:id,legal_name',
// 'vehicle', 'transportPersonnel'])` -- NO el shape completo de
// `AdminTransportScheduleDetail` (sin `waste_service_request`/`source_branch`/
// `destination_branch`/`transport_personnel.person`/`route_stop` cargados).
// El caller (`CreateTransportScheduleForm.tsx`) solo necesita `id` para
// redirigir al detalle (que sí hace un `show()` completo) -- se tipa acorde
// a lo que la API realmente devuelve, sin inventar campos.
export async function createTransportSchedule(
  payload: CreateTransportSchedulePayload
): Promise<{ transport_schedule: { id: number; schedule_number: string } }> {
  return apiFetch('/api/admin/transport-schedules', { method: 'POST', body: JSON.stringify(payload) })
}

// PUT /api/admin/transport-schedules/{id} -- ver
// `TransportScheduleController::update()`. NO hay UI de edición de cabecera
// en este lote (prioridad puesta en listado/detalle/transiciones, ver
// resumen del lote) -- se deja el cliente listo para cuando se construya.
export async function updateTransportSchedule(
  id: number | string,
  payload: UpdateTransportSchedulePayload
): Promise<{ transport_schedule: { id: number } }> {
  return apiFetch(`/api/admin/transport-schedules/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

// POST .../submit -- BOR -> PEND. Mismo patrón que `submitServiceRequest()`:
// el caller SIEMPRE recarga el detalle completo después (`fetchTransportSchedule()`),
// nunca confía en el shape parcial de esta respuesta.
export async function submitTransportSchedule(
  id: number | string
): Promise<{ transport_schedule: { id: number } }> {
  return apiFetch(`/api/admin/transport-schedules/${id}/submit`, { method: 'POST' })
}

// POST .../confirm -- PEND/PROG -> CONF (encadena hasta 2 transiciones en una
// sola llamada, ver docblock de `TransportScheduleController::confirm()`).
export async function confirmTransportSchedule(
  id: number | string
): Promise<{ transport_schedule: { id: number } }> {
  return apiFetch(`/api/admin/transport-schedules/${id}/confirm`, { method: 'POST' })
}

// POST .../cancel -- -> CANC, alcanzable desde cualquier estado NO operativo
// (BOR/PEND/PROG/CONF).
export async function cancelTransportSchedule(
  id: number | string
): Promise<{ transport_schedule: { id: number } }> {
  return apiFetch(`/api/admin/transport-schedules/${id}/cancel`, { method: 'POST' })
}

// POST .../route -- ver `TransportScheduleController::assignToRoute()`. NO
// SE USA en este lote -- GAP DE CONTRATO de `TransportRouteController` (ver
// AVISO en `AssignTransportScheduleToRoutePayload`, types.ts). Se deja el
// cliente listo (el endpoint YA existe en el backend) para cuando el CRUD de
// rutas quede disponible y se construya el "dispatch board" (CU-059).
export async function assignTransportScheduleToRoute(
  id: number | string,
  payload: AssignTransportScheduleToRoutePayload
): Promise<{ route_stop: { id: number; stop_sequence: number; transport_route: { id: number; route_code: string } } }> {
  return apiFetch(`/api/admin/transport-schedules/${id}/route`, { method: 'POST', body: JSON.stringify(payload) })
}

// ---- Conductores (/api/admin/transport-personnel) --------------------------
// Cierre del GAP DE CONTRATO señalado en el lote anterior (2026-07-19) -- ver
// docblock completo de `TransportPersonnelController`/AVISO en
// `AdminTransportPersonnel` (types.ts). Mismo patrón EXACTO que
// `fetchVehicles()`/`createVehicle()`/`updateVehicle()`.

export async function fetchTransportPersonnel(
  params: {
    page?: number
    perPage?: number
    search?: string
    organizationId?: number | string
    isActive?: boolean
  } = {}
): Promise<Paginated<AdminTransportPersonnel>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    organization_id: params.organizationId,
    is_active: params.isActive === undefined ? undefined : String(params.isActive),
  })
  return apiFetch(`/api/admin/transport-personnel${query}`)
}

export async function fetchTransportPersonnelById(
  id: number | string
): Promise<{ transport_personnel: AdminTransportPersonnelDetail }> {
  return apiFetch(`/api/admin/transport-personnel/${id}`)
}

export async function createTransportPersonnel(
  payload: CreateTransportPersonnelPayload
): Promise<{ transport_personnel: AdminTransportPersonnel }> {
  return apiFetch('/api/admin/transport-personnel', { method: 'POST', body: JSON.stringify(payload) })
}

export async function updateTransportPersonnel(
  id: number | string,
  payload: UpdateTransportPersonnelPayload
): Promise<{ transport_personnel: AdminTransportPersonnel }> {
  return apiFetch(`/api/admin/transport-personnel/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

// ---- Rutas de Transporte (/api/admin/transport-routes) ---------------------
// Cierre del GAP DE CONTRATO señalado en el lote anterior (CU-059,
// 2026-07-19) -- ver docblock completo de `TransportRouteController`/AVISO en
// `AdminTransportRoute` (types.ts). CRUD MÍNIMO a propósito -- sin
// `updateTransportRoute()`/`cancelTransportRoute()`, el backend no expone
// esos endpoints en este lote.

export async function fetchTransportRoutes(
  params: {
    page?: number
    perPage?: number
    search?: string
    organizationId?: number | string
    isActive?: boolean
  } = {}
): Promise<Paginated<AdminTransportRoute>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    organization_id: params.organizationId,
    is_active: params.isActive === undefined ? undefined : String(params.isActive),
  })
  return apiFetch(`/api/admin/transport-routes${query}`)
}

export async function fetchTransportRoute(id: number | string): Promise<{ transport_route: AdminTransportRouteDetail }> {
  return apiFetch(`/api/admin/transport-routes/${id}`)
}

export async function createTransportRoute(
  payload: CreateTransportRoutePayload
): Promise<{ transport_route: AdminTransportRoute }> {
  return apiFetch('/api/admin/transport-routes', { method: 'POST', body: JSON.stringify(payload) })
}

// ---- Manifiesto de Cargue (/api/admin/manifest-loads) ----------------------
// Módulo Manifiesto de Cargue, Fase 3 (backend cerrado -- 1247 tests Pest,
// hallazgo de seguridad ya cerrado -- ver docblock completo de
// `ManifestLoadController`/AVISO en `AdminManifestLoad` (types.ts)).

export async function fetchManifestLoads(
  params: {
    page?: number
    perPage?: number
    search?: string
    organizationId?: number | string
    status?: string
  } = {}
): Promise<Paginated<AdminManifestLoad>> {
  const query = buildQuery({
    page: params.page,
    per_page: params.perPage,
    search: params.search,
    organization_id: params.organizationId,
    status: params.status,
  })
  return apiFetch(`/api/admin/manifest-loads${query}`)
}

export async function fetchManifestLoad(id: number | string): Promise<{ manifest_load: AdminManifestLoadDetail }> {
  return apiFetch(`/api/admin/manifest-loads/${id}`)
}

// POST /api/admin/manifest-loads -- ver `ManifestLoadController::store()`. La
// respuesta real del backend es `manifestLoad->fresh(['items',
// 'manifestStatus', 'carrierOrganization:id,legal_name', 'vehicle',
// 'transportPersonnel'])` -- el caller (formulario de creación, embebido en
// `TransportScheduleDetailScreen.tsx`) solo necesita `id` para redirigir al
// detalle (que sí hace un `show()` completo), mismo criterio que
// `createTransportSchedule()`.
export async function createManifestLoad(
  payload: CreateManifestLoadPayload
): Promise<{ manifest_load: { id: number; manifest_number: string } }> {
  return apiFetch('/api/admin/manifest-loads', { method: 'POST', body: JSON.stringify(payload) })
}

// POST .../generate -- Draft -> Generated (rol LOGÍSTICA, lado transportador).
export async function generateManifestLoad(id: number | string): Promise<{ manifest_load: { id: number } }> {
  return apiFetch(`/api/admin/manifest-loads/${id}/generate`, { method: 'POST' })
}

// POST .../sign -- ver `ManifestLoadController::sign()`. Recalcula el estado
// automáticamente (Generated/PartiallySigned/Signed según cuántas firmas
// haya) -- el caller siempre recarga el detalle completo después.
export async function signManifestLoad(
  id: number | string,
  payload: SignManifestLoadPayload
): Promise<{ manifest_load: { id: number } }> {
  return apiFetch(`/api/admin/manifest-loads/${id}/sign`, { method: 'POST', body: JSON.stringify(payload) })
}

// POST .../start-transit -- Signed -> InTransit. RN-193 (ya gateada
// server-side): rechaza con 422 si falta alguna firma.
export async function startManifestLoadTransit(id: number | string): Promise<{ manifest_load: { id: number } }> {
  return apiFetch(`/api/admin/manifest-loads/${id}/start-transit`, { method: 'POST' })
}

// POST .../cancel -- -> Cancelled, alcanzable SOLO desde Generated/
// PartiallySigned (ver docblock de `ManifestLoadController::cancel()`).
export async function cancelManifestLoad(id: number | string): Promise<{ manifest_load: { id: number } }> {
  return apiFetch(`/api/admin/manifest-loads/${id}/cancel`, { method: 'POST' })
}

export type * from './types'
