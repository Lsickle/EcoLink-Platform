// Shapes espejo del contrato de /api/admin/* (backend RBAC ya cerrado,
// 151 tests Pest, 2 pasadas de revisión de seguridad -- ver resumen del
// lote RBAC). No inventar campos que la API no documenta.

export type Paginated<T> = {
  data: T[]
  current_page: number
  last_page: number
  total: number
  per_page: number
}

export type AdminPersonInfo = {
  first_name: string
  last_name: string
  middle_name: string | null
  second_last_name: string | null
  full_name: string
  document_type: string
  document_number: string
  email: string
  phone: string | null
}

export type AdminUserStatus = {
  code: string
  name: string
}

export type AdminUserRole = {
  id: number
  code: string
  name: string
  pivot?: Record<string, unknown>
}

// Cierre de brecha con Figma (lote 2026-07-14, paridad con AdminRole
// arriba): index()/show() de UserManagementController SIEMPRE devuelven
// last_login_at/created_at/updated_at -- son columnas nativas de `users`,
// no relaciones, y User no las oculta (#[Hidden] solo cubre password_hash/
// mfa_secret). created_by/updated_by en cambio solo vienen en show() (ver
// docblock del controller) -- igual que en AdminRole, quedan opcionales y
// NUNCA se asumen presentes en la respuesta de index()/activate()/
// deactivate() (esas dos últimas devuelven el modelo base vía
// user->fresh(['status']), sin roles ni person siquiera).
export type AdminUser = {
  id: number
  uuid: string
  username: string
  email: string
  tenant_organization_id: number | null
  organization_id: number | null
  person: AdminPersonInfo
  status: AdminUserStatus
  roles: AdminUserRole[]
  last_login_at?: string | null
  created_at?: string
  updated_at?: string
  created_by?: AdminActorRef | null
  updated_by?: AdminActorRef | null
}

// organization_id existe en el backend pero no hay UI de Organizaciones
// todavía -- se omite del payload a propósito (ver contrato del lote).
//
// Mecanismo de invitación (CU-006.1 modificado): store() YA NO acepta
// password/password_confirmation ni is_active_initial -- todo usuario nace
// PENDING_ACTIVATION y activa su propia cuenta vía la invitación por correo
// que el backend dispara automáticamente (ver UserProvisioningService::
// createPendingUser()).
export type CreateUserPayload = {
  first_name: string
  last_name: string
  middle_name?: string
  second_last_name?: string
  document_type: string
  document_number: string
  username: string
  email: string
  phone?: string
  role_ids: number[]
}

export type UpdateUserPayload = {
  email?: string
  phone?: string
  first_name?: string
  last_name?: string
}

export type RiskLevel = 'bajo' | 'medio' | 'alto' | 'critico'

// {id, username} -- forma mínima devuelta por RoleController::show() para
// created_by/updated_by (Figma "Detalle de Rol", lote 4). NO trae
// person.full_name: Role no tiene relación directa a Person, ver docblock
// del controller.
export type AdminActorRef = {
  id: number
  username: string
}

// Figma "Roles Management" (lote 3): index() y show() ahora devuelven
// AMBOS users_count/permissions_count/risk_level (antes risk_level solo
// venía en show) -- ver contrato del lote en RoleController::index()/
// riskLevel(). activate()/deactivate()/update() devuelven el modelo base
// SIN estos 3 campos calculados (role->fresh()/role->toArray() plano) --
// el caller debe mergear con el registro ya cargado, nunca asumir que
// vienen en esas respuestas. created_by/updated_by (lote 4, solo show())
// también quedan fuera de esas respuestas del modelo base por el mismo
// motivo -- pueden ser `undefined` ahí, nunca asumidos.
export type AdminRole = {
  id: number
  uuid: string
  code: string
  name: string
  description: string | null
  is_system: boolean
  is_editable: boolean
  priority_level: number
  is_active: boolean
  tenant_organization_id: number | null
  created_at: string
  updated_at: string
  users_count: number
  permissions_count: number
  risk_level: RiskLevel
  created_by?: AdminActorRef | null
  updated_by?: AdminActorRef | null
}

// Cierre de brecha con Figma (lote "Matriz de Permisos"/"Detalle de
// Permiso"): index()/show() de PermissionController devuelven TODOS los
// campos del modelo (ver contrato del lote) -- priority_level/description/
// created_at/updated_at son columnas nativas de `permissions`, nunca
// ausentes. `roles_count` en cambio solo viene en index()/show() (mismo
// criterio ya documentado para AdminRole.users_count) -- opcional,
// NUNCA asumido en otras respuestas (assign()/revoke() devuelven solo
// {message}).
export type AdminPermission = {
  id: number
  code: string
  name: string
  module: string
  action: string
  scope: string | null
  description: string | null
  priority_level: number
  is_system: boolean
  is_critical: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  roles_count?: number
}

// GET /api/admin/permissions/{id} -- ver PermissionController::show().
// created_by/updated_by mismo shape mínimo {id,username} que AdminRole/
// AdminUser (Permission tampoco tiene relación directa a Person).
// users_impacted_count es un conteo derivado en el backend (usuarios con
// al menos una asignación activa de este permiso vía algún rol), distinto
// de roles_count (roles con el permiso activo).
export type AdminPermissionDetail = AdminPermission & {
  created_by: AdminActorRef | null
  updated_by: AdminActorRef | null
  roles_count: number
  users_impacted_count: number
}

// ---- Actividad de permiso (GET /api/admin/permissions/{id}/activity) ----
// Mismo shape que RoleActivityEvent/UserActivityEvent -- tipo separado (no
// alias) por el mismo criterio de trazabilidad por dominio ya aplicado a
// esos dos.
export type PermissionActivityEventType = 'PERMISSION_ASSIGNED' | 'PERMISSION_REVOKED'

export type PermissionActivityEvent = {
  event_type: PermissionActivityEventType
  description: string
  actor: AdminActorRef | null
  created_at: string
}

// GET /api/admin/permissions/matrix-by-module?module=<code> -- sub-vista
// "Por Módulo" de la Matriz de Permisos. `assignments` mapea
// permission_id (como string, llave de objeto JSON) -> role_ids con ese
// permiso activo.
export type PermissionMatrixByModule = {
  module: string
  permissions: AdminPermission[]
  roles: AdminRole[]
  assignments: Record<string, number[]>
}

// Solo GET /api/admin/roles/{id} (show) trae el árbol de `permissions` --
// index/store no lo incluyen (ver contrato del lote). risk_level ya no es
// exclusivo de show (ver AdminRole).
export type AdminRoleDetail = AdminRole & {
  permissions: AdminPermission[]
}

// El backend SIEMPRE fuerza is_system=false/is_editable=true/
// tenant_organization_id=<tenant del actor> en store() -- no hay forma de
// mandar esos campos, así que no aparecen en este payload.
export type CreateRolePayload = {
  code: string
  name: string
  description?: string
  priority_level?: number
}

export type UpdateRolePayload = {
  name?: string
  description?: string
  priority_level?: number
}

export type AssignRolePayload = {
  user_id: number
  expires_at?: string
}

export type AssignPermissionPayload = {
  role_id: number
  expires_at?: string
}

// ---- Solicitudes de invitación (/api/admin/invitation-requests) ----------
// Cola de solicitudes públicas (InvitationRequestController) revisadas por
// un ADMINISTRADOR con `users.create` -- reemplaza el registro público
// eliminado (CU-006.1 modificado). Shape espejo de InvitationRequest::
// $casts + columnas fillable (backend/app/Models/InvitationRequest.php) --
// no lleva tenant_organization_id, es una cola PRE-tenant.

export type InvitationRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export type AdminInvitationRequest = {
  id: number
  uuid: string
  first_name: string
  middle_name: string | null
  last_name: string
  second_last_name: string | null
  document_type: string
  document_number: string
  email: string
  phone: string | null
  status: InvitationRequestStatus
  created_at: string
  reviewed_by: number | null
  reviewed_at: string | null
  rejection_reason: string | null
  resulting_user_id: number | null
}

export type ApproveInvitationRequestPayload = {
  role_ids: number[]
  organization_id?: number
}

export type RejectInvitationRequestPayload = {
  reason?: string
}

// ---- Actividad de rol (GET /api/admin/roles/{id}/activity) --------------
// Figma "Detalle de Rol", lote 4. Ver docblock de RoleController::
// activity() -- limitación conocida: el filtro por rol depende de que
// `metadata.role_id`/`metadata.target_role_id` estén presentes en el
// evento, no de una columna dedicada.
export type RoleActivityEventType =
  | 'ROLE_CREATED'
  | 'ROLE_UPDATED'
  | 'ROLE_DELETED'
  | 'ROLE_ACTIVATED'
  | 'ROLE_DEACTIVATED'
  | 'ROLE_ASSIGNED'
  | 'PERMISSION_ASSIGNED'

export type RoleActivityEvent = {
  event_type: RoleActivityEventType
  description: string
  actor: AdminActorRef | null
  created_at: string
}

// ---- Actividad de usuario (GET /api/admin/users/{id}/activity) ----------
// Cierre de brecha con Figma (lote 2026-07-14). Mismo shape EXACTO que
// RoleActivityEvent (ver UserManagementController::activity()) -- se
// mantiene como un tipo separado (no un alias) porque el conjunto de
// `event_type` es semánticamente distinto (eventos de usuario, no de rol) y
// el proyecto ya prefiere tipos con trazabilidad propia por dominio.
export type UserActivityEventType =
  | 'USER_CREATED_BY_ADMIN'
  | 'USER_INVITED'
  | 'INVITATION_RESENT'
  | 'INVITATION_ACCEPTED'
  | 'USER_UPDATED_BY_ADMIN'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'ROLE_ASSIGNED'
  | 'ROLE_REVOKED'
  | 'PASSWORD_RESET_BY_ADMIN'

export type UserActivityEvent = {
  event_type: UserActivityEventType
  description: string
  actor: AdminActorRef | null
  created_at: string
}

// ---- Corrientes Y/A (/api/admin/waste-streams) --------------------------
// Primer módulo real del dominio Residuos (distinto de RBAC/Administración).
// Catálogo GLOBAL (tenant_organization_id NULL para lo sembrado, o el tenant
// del actor si lo creó vía API) editable por ADMINISTRADOR -- a diferencia
// de AdminPermission (solo lectura), aquí sí hay create/update/activate/
// deactivate/import reales (ver WasteStreamController).
//
// Excluido a propósito (investigación normativa, plan aprobado): sin
// peligrosidad/estado físico -- van en el futuro RESIDUO, no en la
// corriente. `name` es TEXT en BD (no VARCHAR(255)), 8 de las 179 filas
// reales del catálogo Basilea exceden 255 caracteres -- nunca validar
// maxLength en el form.
export type WasteStreamTipo = 'Y' | 'A'

// index()/show() devuelven `created_by`/`updated_by` (columnas nativas
// created_by/updated_by, ints) SIEMPRE -- pero solo show() los REEMPLAZA con
// la relación cargada {id, username} (ver WasteStreamController::show()).
// Mismo criterio ya aplicado a AdminRole/AdminPermission: quedan opcionales
// aquí y solo se leen como AdminActorRef en AdminWasteStreamDetail (show()).
export type AdminWasteStream = {
  id: number
  uuid: string
  tenant_organization_id: number | null
  code: string
  name: string
  description: string | null
  tipo: WasteStreamTipo
  requires_manifest: boolean
  requires_special_transport: boolean
  is_system: boolean
  is_active: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  created_by?: AdminActorRef | null
  updated_by?: AdminActorRef | null
}

// GET /api/admin/waste-streams/{id} -- created_by/updated_by SIEMPRE
// presentes como {id, username} | null (relación cargada explícitamente).
export type AdminWasteStreamDetail = AdminWasteStream & {
  created_by: AdminActorRef | null
  updated_by: AdminActorRef | null
}

// POST /api/admin/waste-streams -- el backend SIEMPRE fija
// tenant_organization_id/is_system/is_active/created_by/updated_by
// server-side (nunca aceptados del cliente). `tipo` es INMUTABLE tras crear
// -- solo existe en el payload de creación, nunca en UpdateWasteStreamPayload.
export type CreateWasteStreamPayload = {
  code: string
  name: string
  tipo: WasteStreamTipo
  description?: string
  requires_manifest?: boolean
  requires_special_transport?: boolean
}

// PUT /api/admin/waste-streams/{id} -- sin `tipo` (inmutable, ver
// WasteStreamController::update()). `code` se acepta en el payload pero el
// backend rechaza (422) el cambio si is_system=true -- la UI deshabilita el
// campo en ese caso en vez de esperar el 422, pero el guard real vive en el
// backend.
export type UpdateWasteStreamPayload = {
  code?: string
  name?: string
  description?: string | null
  requires_manifest?: boolean
  requires_special_transport?: boolean
}

// ---- Códigos UN (/api/admin/un-codes) ------------------------------------
// Catálogo de transporte de mercancías peligrosas, independiente de
// waste_streams (sin FK ni relación 1:1 en este lote -- ver plan aprobado y
// UnCodeController). Mismo criterio de permisos/tenant-scoping que
// WasteStream.
export type AdminUnCode = {
  id: number
  uuid: string
  tenant_organization_id: number | null
  code: string
  name: string
  hazard_class: string | null
  packing_group: string | null
  is_system: boolean
  is_active: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  created_by?: AdminActorRef | null
  updated_by?: AdminActorRef | null
}

export type AdminUnCodeDetail = AdminUnCode & {
  created_by: AdminActorRef | null
  updated_by: AdminActorRef | null
}

export type CreateUnCodePayload = {
  code: string
  name: string
  hazard_class?: string
  packing_group?: string
}

export type UpdateUnCodePayload = {
  code?: string
  name?: string
  hazard_class?: string | null
  packing_group?: string | null
}

// ---- Catálogos Maestros: geografía en cascada (D-P01) ---------------------
// Batch 1/3 de Catálogos Maestros (backend cerrado, 432 tests Pest en
// verde). Los 4 catálogos geográficos son de SOLO LECTURA desde la UI/API
// -- sin create/update, solo index/show/activate/deactivate (ver
// CountryController/DepartmentController/MunicipalityController/
// LocalityController). Gateados por `geography.read`/`geography.manage`.

export type AdminCountry = {
  id: number
  uuid: string
  iso_code: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// `dane_code` nullable -- ver migración create_departments_table (D-P01).
export type AdminDepartment = {
  id: number
  uuid: string
  country_id: number
  dane_code: string | null
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AdminMunicipality = {
  id: number
  uuid: string
  department_id: number
  codigo_dane: string | null
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// Solo Bogotá D.C. tiene localidades pobladas hoy (ver LocalitySeeder) --
// el catálogo/filtro sigue siendo genérico por `municipality_id`, no
// hardcodeado a Bogotá.
export type AdminLocality = {
  id: number
  uuid: string
  municipality_id: number
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// ---- Tipos de Sede (/api/admin/branch-types) -------------------------------
// Batch 1/3 de Catálogos Maestros -- a diferencia de los 4 catálogos
// geográficos hermanos de arriba, `branch_types` SÍ tiene CRUD completo
// (ver BranchTypeController). Catálogo 100% global -- sin
// tenant_organization_id/created_by/updated_by (branch_types no tiene esas
// columnas, ver migración create_branch_types_table). Gateado por
// `branch_types.read`/`branch_types.manage`.
export type AdminBranchType = {
  id: number
  uuid: string
  code: string
  name: string
  category: string
  is_logistics: boolean
  is_storage: boolean
  is_treatment: boolean
  is_dispatch: boolean
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// POST /api/admin/branch-types -- ver BranchTypeController::store(). Los 4
// flags son `sometimes` en el backend (opcionales, default false vía
// columna DB) -- se mandan siempre desde el form de todos modos, mismo
// criterio que requiresManifest/requiresSpecialTransport en
// CreateWasteStreamPayload.
export type CreateBranchTypePayload = {
  code: string
  name: string
  category: string
  is_logistics?: boolean
  is_storage?: boolean
  is_treatment?: boolean
  is_dispatch?: boolean
  sort_order?: number
}

// PUT /api/admin/branch-types/{id} -- todos los campos son `sometimes` en
// el backend (ver BranchTypeController::update()), incluido `code` (a
// diferencia de WasteStream, branch_types no tiene noción de is_system que
// bloquee el cambio de código).
export type UpdateBranchTypePayload = Partial<CreateBranchTypePayload>

// ---- Áreas Organizacionales (/api/admin/organizational-areas) -------------
// Batch 1/3 de Catálogos Maestros -- a diferencia de los 5 catálogos
// hermanos de este lote, NO es un catálogo global: `organization_id` es
// NOT NULL, cada fila pertenece a UNA organización concreta (ver
// OrganizationalAreaController). Jerárquico (`parent_area_id`,
// auto-referencial) con `responsible_person_id` (validado contra la misma
// organización) y `level` (enum fijo del backend, NO un catálogo editable
// -- ver `OrganizationalAreaController::LEVELS`).
export const ORGANIZATIONAL_AREA_LEVELS = ['Dirección', 'Gerencia', 'Coordinación'] as const

export type OrganizationalAreaLevel = (typeof ORGANIZATIONAL_AREA_LEVELS)[number]

export type AdminOrganizationalArea = {
  id: number
  uuid: string
  organization_id: number
  code: string
  name: string
  parent_area_id: number | null
  level: OrganizationalAreaLevel
  responsible_person_id: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// POST /api/admin/organizational-areas -- ver
// OrganizationalAreaController::store(). `organization_id` solo es
// aceptado (y obligatorio) si el actor es `isPlatformStaff()`; para
// cualquier otro actor el backend lo IGNORA y fuerza su propio
// `tenant_organization_id` -- se manda igual desde el cliente cuando el
// actor es staff de plataforma (nunca para el resto, ver
// OrganizationalAreasListScreen/CreateOrganizationalAreaForm).
export type CreateOrganizationalAreaPayload = {
  organization_id?: number
  code: string
  name: string
  parent_area_id?: number
  level: OrganizationalAreaLevel
  responsible_person_id?: number
}

// PUT /api/admin/organizational-areas/{id} -- todos los campos son
// `sometimes` en el backend (ver OrganizationalAreaController::update()),
// sin `organization_id` (inmutable tras crear, el backend ni lo acepta).
export type UpdateOrganizationalAreaPayload = {
  code?: string
  name?: string
  parent_area_id?: number | null
  level?: OrganizationalAreaLevel
  responsible_person_id?: number | null
}

// ---- Características de Peligrosidad (/api/admin/hazard-characteristics) --
// Batch 2/3 de Catálogos Maestros (RESPEL, backend cerrado -- 506 tests
// Pest en verde, ver HazardCharacteristicController). Catálogo 100% global
// -- SIN tenant_organization_id/created_by/updated_by (mismo criterio que
// AdminBranchType, `hazard_characteristics` no tiene esas columnas). `risk_level`
// es un entero 1-9 (mayor = más peligroso, ver esquema-bd item 14) -- la UI
// deriva una etiqueta cualitativa a partir de él (ver hazardRiskLevel.ts),
// NUNCA se persiste la etiqueta como texto.
export type AdminHazardCharacteristic = {
  id: number
  uuid: string
  code: string
  name: string
  risk_level: number
  description: string | null
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

// POST /api/admin/hazard-characteristics -- ver
// HazardCharacteristicController::store(). `risk_level` obligatorio
// (`required|integer|min:1|max:9` en el backend).
export type CreateHazardCharacteristicPayload = {
  code: string
  name: string
  risk_level: number
  description?: string
}

// PUT /api/admin/hazard-characteristics/{id} -- todos los campos
// `sometimes` en el backend (ver HazardCharacteristicController::update()).
export type UpdateHazardCharacteristicPayload = Partial<CreateHazardCharacteristicPayload>

// ---- Categoría de Residuo (/api/admin/waste-categories) -------------------
// Batch 2/3 de Catálogos Maestros (RESPEL, backend cerrado -- ver
// WasteCategoryController). Catálogo 100% global, mismo criterio SIN
// tenant_organization_id/created_by/updated_by que AdminHazardCharacteristic.
// Sin particularidades (D-R05: la activación por organización se difiere al
// futuro módulo Residuos, no se construye en este lote).
export type AdminWasteCategory = {
  id: number
  uuid: string
  code: string
  name: string
  description: string | null
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateWasteCategoryPayload = {
  code: string
  name: string
  description?: string
}

export type UpdateWasteCategoryPayload = Partial<CreateWasteCategoryPayload>

// ---- Estado Físico (/api/admin/physical-states) ----------------------------
// Batch 2/3 de Catálogos Maestros (RESPEL, backend cerrado -- ver
// PhysicalStateController). Catálogo 100% global, el más simple de los 3
// (sin `description`, ver migración create_physical_states_table).
export type AdminPhysicalState = {
  id: number
  uuid: string
  code: string
  name: string
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreatePhysicalStatePayload = {
  code: string
  name: string
}

export type UpdatePhysicalStatePayload = Partial<CreatePhysicalStatePayload>

// ---- Tipos de Embalaje (/api/admin/packaging-types) -----------------------
// Batch 3/3 (último) de Catálogos Maestros (backend cerrado -- 581 tests
// Pest en verde, ver PackagingTypeController). Catálogo 100% global, mismo
// criterio SIN tenant_organization_id/created_by/updated_by que
// AdminHazardCharacteristic/AdminPhysicalState -- el más simple de los 3
// catálogos de este lote (solo code/name, sin description, ver migración
// create_packaging_types_table). Datos REALES confirmados (29 valores, ver
// PackagingTypeSeeder) -- a diferencia de los dos catálogos hermanos de
// abajo, que son PROVISIONALES.
export type AdminPackagingType = {
  id: number
  uuid: string
  code: string
  name: string
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreatePackagingTypePayload = {
  code: string
  name: string
}

export type UpdatePackagingTypePayload = Partial<CreatePackagingTypePayload>

// ---- Estados del Embalaje (/api/admin/packaging-conditions) ---------------
// Batch 3/3 (último) de Catálogos Maestros -- mismo patrón EXACTO que
// AdminPackagingType (catálogo 100% global, CRUD completo, ver
// PackagingConditionController). AVISO -- PROVISIONAL: los 3 valores
// sembrados (BUENO/REGULAR/DETERIORADO) NO tienen fuente de negocio
// (RN-XXX) confirmada, solo vienen del mockup de Figma (ver AVISO en
// PackagingConditionSeeder.php) -- la UI debe mostrar esto explícitamente
// (ver ProvisionalDataNotice). `risk_level` es un entero 1-9 NULLABLE
// (mayor = más peligroso, mismo criterio que
// AdminHazardCharacteristic.risk_level) -- a diferencia de ese catálogo,
// aquí SÍ puede venir `null` (validación backend `nullable`), la UI debe
// contemplar ese caso al derivar la etiqueta cualitativa (ver
// hazardRiskLevel.ts, reutilizado tal cual).
export type AdminPackagingCondition = {
  id: number
  uuid: string
  code: string
  name: string
  risk_level: number | null
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreatePackagingConditionPayload = {
  code: string
  name: string
  risk_level?: number | null
}

export type UpdatePackagingConditionPayload = Partial<CreatePackagingConditionPayload>

// ---- Tipos de Vehículo (/api/admin/vehicle-types) --------------------------
// Batch 3/3 (último) de Catálogos Maestros -- mismo patrón EXACTO que
// AdminPackagingType (catálogo 100% global, CRUD completo, ver
// VehicleTypeController). AVISO -- PROVISIONAL: los 4 valores sembrados
// (CAM/TRACTO/FURGON/CISTERNA) NO tienen fuente de negocio confirmada,
// solo vienen del mockup de Figma (ver AVISO en VehicleTypeSeeder.php) --
// la UI debe mostrar esto explícitamente (ver ProvisionalDataNotice).
// `category` es VARCHAR NULL de texto libre, sin valores sembrados hoy (ver
// docblock del seeder) -- NO es un catálogo editable ni un enum fijo, se
// edita como texto simple (mismo criterio que AdminBranchType.category, que
// sí es obligatorio -- aquí es opcional). Tabla de referencia AISLADA -- NO
// toca `vehicles.vehicle_type` (esquema-bd), el módulo Vehículos no está
// construido todavía.
export type AdminVehicleType = {
  id: number
  uuid: string
  code: string
  name: string
  category: string | null
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CreateVehicleTypePayload = {
  code: string
  name: string
  category?: string
}

export type UpdateVehicleTypePayload = Partial<CreateVehicleTypePayload>

// ---- Organizaciones (/api/admin/organizations) -----------------------------
// Plan "CRUD de Organizaciones vs. Figma (solo Organizaciones)" -- pantalla
// EXCLUSIVA de platform staff (ver OrganizationController, gate
// `$request->user()->isPlatformStaff()`, NO una Policy de modelo). Shape
// espejo EXACTO de `organizations` + lo que `transformOrganization()`
// agrega/quita (ver docblock del controller) -- no inventar campos que la
// API no documenta.

// Filas de organization_statuses tal como vienen SIEMPRE eager-cargadas
// (relación `status`, ver `->with(['status', ...])` en index() Y show() --
// a diferencia de AdminRole/AdminPermission, aquí NO es exclusivo de
// show()). Shape completo de la tabla (columnas reales, ver esquema-bd).
export type AdminOrganizationStatus = {
  id: number
  code: string
  name: string
  description: string | null
  sort_order: number
  is_initial: boolean
  is_final: boolean
  allows_operation: boolean
  requires_document_validation: boolean
  requires_commercial_approval: boolean
  is_suspended: boolean
  color_hex: string | null
  icon: string | null
  is_active: boolean
}

// Catálogo "Tipo de Organización" -- GET /api/admin/business-roles. Cierre
// del gap declarado en BUSINESS_ROLES_FALLBACK (organizationCatalogs.ts,
// eliminado ahora que el endpoint real existe, 2026-07-15). Mismo gate
// `isPlatformStaff()` que el resto de OrganizationController, sin Policy de
// modelo -- ordenado por `sort_order` en el backend. `description` nullable
// (mismo criterio que el resto de catálogos de este archivo, p. ej.
// AdminHazardCharacteristic.description).
export type AdminBusinessRole = {
  id: number
  code: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
}

// GET /api/admin/organization-statuses -- cierre del gap declarado en
// ORGANIZATION_STATUSES_FALLBACK (organizationCatalogs.ts, eliminado ahora
// que el endpoint real existe, 2026-07-15). Subconjunto DELIBERADO de
// AdminOrganizationStatus (arriba): ese tipo espeja la fila COMPLETA que
// SIEMPRE viaja eager-cargada en `organizations.status` (index()/show()) --
// este tipo espeja SOLO lo que el endpoint de catálogo realmente devuelve
// (sin description/is_initial/is_final/allows_operation/
// requires_document_validation/requires_commercial_approval/is_suspended/
// icon). No se reutiliza AdminOrganizationStatus tal cual para no declarar
// campos que esta respuesta nunca trae.
export type AdminOrganizationStatusOption = {
  id: number
  code: string
  name: string
  color_hex: string | null
  sort_order: number
  is_active: boolean
}

// KPIs del listado (`kpis` en la respuesta de index(), fuera del bloque de
// paginación) -- un conteo por cada una de las 5 filas REALES de
// organization_statuses, en su `sort_order`, ver
// OrganizationController::statusKpis().
export type OrganizationKpi = {
  code: string
  name: string
  color_hex: string | null
  count: number
}

// "Ciudad Principal" (Figma) -- derivada de la sede activa de MENOR id
// (`Organization::primaryBranch()`, un `hasOne::ofMany()`, NO una columna
// propia de `organizations`) -- `null` si la organización no tiene ninguna
// sede activa. Mostrar SIEMPRE marcado como dato de la sede principal, no
// como un campo propio de la organización (ver plan del lote).
export type OrganizationPrimaryBranch = {
  municipality: AdminMunicipality | null
  department: AdminDepartment | null
} | null

// Shape de una fila de index() Y de show() -- ambos pasan por
// `transformOrganization()` (ver controller), que siempre agrega
// `type`/`primary_branch` y siempre elimina el árbol `business_roles`
// crudo. `created_by`/`updated_by` son las columnas FK NATIVAS de
// `organizations` (enteras) en AMBAS respuestas -- `show()` es el único
// endpoint que las SOBREESCRIBE con `{id, username}` (ver
// AdminOrganizationDetail.created_by más abajo, y el docblock de
// `show()` sobre por qué solo created_by, nunca updated_by, se resuelve
// así hoy).
export type AdminOrganization = {
  id: number
  uuid: string
  legal_name: string
  trade_name: string | null
  tax_id: string
  tax_id_type: string
  email: string | null
  phone: string | null
  website: string | null
  organization_status_id: number
  registration_date: string
  is_active: boolean
  is_platform_tenant: boolean
  observations: string | null
  created_at: string
  created_by: number | null
  updated_at: string | null
  updated_by: number | null
  economic_activity_code: string | null
  economic_activity_name: string | null
  environmental_authority: string | null
  environmental_registration: string | null
  billing_email: string | null
  support_email: string | null
  timezone: string
  country_code: string
  currency_code: string
  company_size: string | null
  employee_count: number | null
  customer_since: string | null
  risk_level: RiskLevel
  custom_fields_enabled: boolean
  storage_quota_gb: number | string | null
  contract_expiration_date: string | null
  parent_organization_id: number | null
  status: AdminOrganizationStatus
  // Nombres de business_roles ACTIVOS (`organization_business_roles.
  // is_active=true`), NO sus ids -- ver AVISO de gap en
  // organizationCatalogs.ts sobre por qué el frontend no puede resolver
  // estos nombres de vuelta a un id sin un endpoint de catálogo nuevo.
  type: string[]
  primary_branch: OrganizationPrimaryBranch
}

// GET /api/admin/organizations/{id} -- ver OrganizationController::show().
// `branches_count`/`contacts_count`/`users_count` SOLO existen aquí (index()
// NO los trae por fila, ver AVISO en OrganizationsListScreen.tsx).
// `contacts_count` (antes `people_count`) -- renombrado junto con el pivote
// N:N `organization_contacts` (D-P02/L-08, plan "CRUD de Sedes + Contactos"):
// ahora cuenta vínculos ACTIVOS del pivote, no filas de `people` con
// `organization_id` directo (ver docblock de `OrganizationController::show()`).
export type AdminOrganizationDetail = Omit<AdminOrganization, 'created_by'> & {
  created_by: AdminActorRef | null
  branches_count: number
  contacts_count: number
  users_count: number
}

// GET /api/admin/organizations/{id}/branches (tab "Sedes") -- modelo Branch
// real (ver backend/app/Models/Branch.php) + `branchType` eager-cargada
// (serializada como `branch_type` por Eloquent, snake_case de la relación).
// Solo lectura -- sin create/update en este lote (fuera de alcance).
export type OrganizationBranch = {
  id: number
  uuid: string
  organization_id: number
  branch_type_id: number | null
  code: string | null
  name: string
  status: string | null
  address: string | null
  phone: string | null
  email: string | null
  environmental_license: string | null
  license_expiration_date: string | null
  operational_capacity: number | string | null
  is_active: boolean
  created_at: string
  branch_type: AdminBranchType | null
}

// GET /api/admin/organizations/{id}/contacts (tab "Contactos" de
// Organización) y GET /api/admin/branches/{id}/contacts (tab "Contactos" de
// Sede) -- plan "CRUD de Sedes + Contactos" (D-P02/L-08). Reemplaza el viejo
// `OrganizationContact` (solo lectura sobre `people.organization_id` 1:1,
// ruta `.../people`) -- ahora es un `Person` completo + `has_user_account`
// derivado + los atributos del VÍNCULO (`organization_contacts`) aplanados
// en la misma fila (ver `OrganizationController::contacts()`/
// `BranchController::contacts()`). Los dos endpoints devuelven un shape
// LIGERAMENTE distinto (`branch_id`/`start_date`/`link_is_active` solo en el
// de Organización; `organization_id` solo en el de Sede, ya redundante ahí
// porque la sede ya acota la organización) -- documentado campo por campo
// abajo, nunca asumido presente fuera de su endpoint de origen.
export type AdminOrganizationContact = {
  id: number
  uuid: string
  document_type: string
  document_number: string
  first_name: string
  middle_name: string | null
  last_name: string
  second_last_name: string | null
  full_name: string
  email: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  has_user_account: boolean
  // Atributos del vínculo `organization_contacts` (pivote), aplanados en
  // AMBOS endpoints.
  organization_contact_id: number
  position_title: string | null
  relationship_type: string | null
  is_primary: boolean
  // Solo en `OrganizationController::contacts()` (tab Contactos de
  // Organización) -- el tab de Sede omite estos 3 porque la sede ya acota el
  // vínculo (branch_id es la sede misma, siempre activo por construcción del
  // query `wherePivot('is_active', true)`).
  branch_id?: number | null
  start_date?: string | null
  link_is_active?: boolean
  // Solo en `BranchController::contacts()` (tab Contactos de Sede) --
  // redundante en el tab de Organización (ya se sabe qué organización es).
  organization_id?: number
}

// Fila cruda de `organization_contacts` (el pivote CON IDENTIDAD PROPIA,
// mismo patrón que `OrganizationBusinessRole`) -- shape devuelto por
// `storeContact()`/`updateContact()`/`revokeContact()`, DISTINTO del `Person`
// aplanado de `AdminOrganizationContact` de arriba (esos endpoints no
// recargan la relación `contact`, devuelven el modelo del vínculo tal cual).
export type OrganizationContactLink = {
  id: number
  uuid: string
  tenant_organization_id: number | null
  contact_id: number
  organization_id: number
  branch_id: number | null
  position_title: string | null
  relationship_type: string | null
  is_primary: boolean
  start_date: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: number | null
  updated_by: number | null
}

// POST /api/admin/organizations/{id}/contacts -- ver
// OrganizationController::storeContact(). O BIEN `existing_contact_id`
// (vincula una Person YA conocida por el tenant del actor, ver
// `searchContacts()`) O BIEN los campos de una persona nueva
// (`document_type`/`document_number`/`first_name`/`last_name` requeridos si
// no viene `existing_contact_id`, validación `required_without` en el
// backend -- no se puede expresar ambos casos con un solo tipo TS
// discriminado sin duplicar el shape, se deja como unión de opcionales y el
// formulario decide cuál rama llenar).
export type CreateOrganizationContactPayload = {
  existing_contact_id?: number
  document_type?: string
  document_number?: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  branch_id?: number
  position_title?: string
  relationship_type?: OrganizationContactRelationshipType
  is_primary?: boolean
}

export type OrganizationContactRelationshipType = 'Empleado' | 'Consultor' | 'Externo'

// PUT /api/admin/organizations/{id}/contacts/{organizationContactId} -- ver
// OrganizationController::updateContact(). Edita SOLO el vínculo, NUNCA los
// datos de la Person (esos viven en su propio CRUD, fuera de alcance de este
// lote).
export type UpdateOrganizationContactPayload = {
  branch_id?: number | null
  position_title?: string | null
  relationship_type?: OrganizationContactRelationshipType | null
  is_primary?: boolean
}

// GET /api/admin/organizations/contacts/search?q=...&per_page=... -- selector
// "Vincular Contacto Existente". Acotado al tenant del actor (o global si
// platform staff, ver OrganizationController::searchContacts()) -- SIEMPRE
// usar este endpoint para poblar el combo, nunca dejar que el usuario
// escriba un id a mano (el backend rechaza con 422 cualquier
// `existing_contact_id` fuera de este universo, salvo platform staff).
export type ContactSearchResult = {
  id: number
  first_name: string
  last_name: string
  document_number: string
  email: string | null
}

// GET /api/admin/organizations/search?q=...&exclude_id=... -- selector
// "Organización Matriz" del form de creación/edición (`parent_organization_
// id`). Solo 3 columnas (ver OrganizationController::search()).
export type OrganizationSearchResult = {
  id: number
  legal_name: string
  tax_id: string
}

// POST/PUT /api/admin/organizations -- ver OrganizationController::
// validationRules(). `tax_id`/`tax_id_type` NO están aquí: solo existen en
// CreateOrganizationPayload (inmutables tras crear, el backend ni siquiera
// los valida en update(), ver docblock de `update()`).
export type OrganizationFormFields = {
  legal_name: string
  trade_name?: string
  company_size?: string
  employee_count?: number
  parent_organization_id?: number
  customer_since?: string
  economic_activity_code?: string
  economic_activity_name?: string
  email?: string
  billing_email?: string
  support_email?: string
  phone?: string
  website?: string
  environmental_authority?: string
  environmental_registration?: string
  risk_level?: RiskLevel
  contract_expiration_date?: string
  organization_status_id: number
  timezone: string
  country_code: string
  currency_code: string
  storage_quota_gb?: number
  is_active?: boolean
  custom_fields_enabled?: boolean
  observations?: string
  business_role_ids?: number[]
}

export type CreateOrganizationPayload = OrganizationFormFields & {
  tax_id: string
  tax_id_type: string
}

export type UpdateOrganizationPayload = OrganizationFormFields

// ---- Sedes (/api/admin/branches) -------------------------------------------
// Plan "CRUD de Sedes (Branches) + Contactos" -- acceso DUAL (a diferencia de
// Organizaciones, exclusiva de platform staff): platform staff gestiona
// TODAS las sedes de TODAS las organizaciones; un admin de tenant (permisos
// `branches.*`) solo las de la suya (ver `BranchController`/`BranchPolicy`).
// `status` (3 valores, ACTIVE/INACTIVE/SUSPENDED) es el badge de color de la
// UI -- INDEPENDIENTE de `is_active` (el botón Activar/Inactivar), no
// confundir los dos (ver docblock de `BranchController::activate()`).
export type BranchStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'

// Shape base de `Branch` -- devuelto TAL CUAL (sin relaciones) por
// `index()`/`activate()`/`deactivate()`. `store()`/`update()` en cambio
// SIEMPRE recargan `organization:id,legal_name` y `branchType`
// (`$branch->fresh(['organization:id,legal_name', 'branchType'])`) -- esos 2
// campos quedan opcionales aquí, presentes SOLO en esas 2 respuestas (nunca
// asumidos en index()/activate()/deactivate(), mismo criterio ya
// documentado para `AdminRole.users_count`/`AdminPermission.roles_count`).
//
// AVISO -- gap declarado explícitamente (no reinterpretado en silencio):
// `index()` NO eager-carga `organization`/`branchType`/geografía por fila
// (solo `withCount('users')`, ver docblock de `BranchController::index()`) --
// las columnas "Organización"/"Ciudad" de `BranchesListScreen.tsx` muestran
// "—" a propósito, mismo criterio ya aplicado a
// `branches_count`/`contacts_count`/`users_count` en
// `OrganizationsListScreen.tsx`. Cerrar este gap requiere que el backend
// agregue esas relaciones a `index()` (fuera de alcance de este lote,
// señalado en el resumen entregado).
export type AdminBranch = {
  id: number
  uuid: string
  tenant_organization_id: number | null
  organization_id: number
  branch_type_id: number
  code: string | null
  name: string
  status: BranchStatus
  country_id: number | null
  department_id: number | null
  municipality_id: number | null
  locality_id: number | null
  address: string | null
  phone: string | null
  email: string | null
  environmental_license: string | null
  license_expiration_date: string | null
  operational_capacity: number | string | null
  observations: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: number | null
  updated_by: number | null
  users_count?: number
  organization?: { id: number; legal_name: string }
  municipality?: { id: number; name: string }
  branch_type?: AdminBranchType | null
}

// GET /api/admin/branches/{id} -- ver BranchController::show(). A diferencia
// de `AdminBranch` (fila cruda de index()), aquí TODAS las relaciones vienen
// SIEMPRE eager-cargadas: `organization`/`branch_type`/geografía completa
// (país/departamento/municipio/localidad)/`created_by`/`updated_by`
// ({id, username})/`users_count`.
export type AdminBranchDetail = Omit<AdminBranch, 'organization' | 'branch_type' | 'created_by' | 'updated_by' | 'users_count'> & {
  organization: { id: number; legal_name: string }
  branch_type: AdminBranchType | null
  country: AdminCountry | null
  department: AdminDepartment | null
  municipality: AdminMunicipality | null
  locality: AdminLocality | null
  created_by: AdminActorRef | null
  updated_by: AdminActorRef | null
  users_count: number
}

// KPIs del listado -- objeto PLANO (a diferencia de `OrganizationKpi[]`, que
// es un array por cada fila real de `organization_statuses`) -- 3 conteos
// fijos por el valor real de `status` + total, ver
// `BranchController::statusKpis()`.
export type BranchKpis = {
  total: number
  active: number
  inactive: number
  suspended: number
}

// POST /api/admin/branches -- ver BranchController::store()/
// validationRules(). `organization_id` SOLO se manda si el actor es
// `is_platform_staff` (REQUERIDO en ese caso, el backend lo exige con 422 si
// falta) -- para cualquier otro actor el backend lo IGNORA y fuerza su
// propia organización, el formulario ni siquiera muestra el campo (ver plan
// del lote).
export type CreateBranchPayload = {
  organization_id?: number
  branch_type_id: number
  code: string
  name: string
  status?: BranchStatus
  country_id?: number
  department_id?: number
  municipality_id?: number
  locality_id?: number
  address?: string
  phone?: string
  email?: string
  environmental_license?: string
  license_expiration_date?: string
  operational_capacity?: number
  observations?: string
  is_active?: boolean
}

// PUT /api/admin/branches/{id} -- mismos campos que `CreateBranchPayload`
// MENOS `organization_id` (inmutable tras crear -- el backend ni siquiera lo
// valida en update(), lo descarta en silencio si viene en el payload).
export type UpdateBranchPayload = Omit<CreateBranchPayload, 'organization_id'>

// ---- Módulo standalone "Contactos" (/api/admin/contacts) ------------------
// Distinto de `AdminOrganizationContact`/`organization_contacts*` (esos
// siguen gestionando vínculos DENTRO del contexto de una organización/sede,
// sin tocar, ver `OrganizationContactsPanel.tsx`) -- este módulo es una
// vista propia de la `Person` con TODOS sus vínculos, y el ÚNICO lugar donde
// se editan los datos propios de `Person` (RN-189/D-P02, ver docblock de
// `ContactController` en el backend). Acceso DUAL: platform staff ve/
// gestiona TODOS los contactos; un admin de tenant (`contacts.read`) solo
// los que tengan al menos un vínculo ACTIVO con SU organización -- ya
// resuelto por el backend, el frontend solo refleja lo que la API devuelve.

// GET /api/admin/contacts -- fila de listado (`ContactController::index()`).
// Shape allowlist EXACTO (`Person::only([...])` + 2 campos derivados) -- sin
// uuid/created_at/full_name, esta fila NO los expone.
export type AdminContact = {
  id: number
  document_type: string
  document_number: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  has_user_account: boolean
  organizations_count: number
}

// Vínculo de la Persona con una organización (`organization_contacts`),
// aplanado con el nombre de la organización/sede -- ver
// `ContactController::show()`. `organization_links` YA viene acotado por el
// backend según quién pregunta (tenant admin: solo vínculos con su propia
// organización; platform staff: todos, activos e inactivos) -- el frontend
// nunca filtra este array de nuevo. De solo lectura -- editar cargo/sede/
// tipo de relación es exclusivo de `OrganizationContactsPanel.tsx`.
export type ContactOrganizationLink = {
  organization_contact_id: number
  organization_id: number
  organization_name: string | null
  branch_id: number | null
  branch_name: string | null
  position_title: string | null
  relationship_type: string | null
  is_primary: boolean
  is_active: boolean
  start_date: string | null
  created_at: string
}

// GET /api/admin/contacts/{id} -- ver `ContactController::show()`. Mismo
// allowlist de campos propios de `Person` que `AdminContact`, más
// `organization_links`.
export type AdminContactDetail = {
  id: number
  document_type: string
  document_number: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  has_user_account: boolean
  organization_links: ContactOrganizationLink[]
}

// PATCH /api/admin/contacts/{id} -- ver `ContactController::update()`. Todos
// `sometimes` en el backend. EXCLUSIVO de platform staff (403 si no --
// `hasPermission('contacts.update') && isPlatformStaff()`) -- la UI oculta
// el formulario editable por completo para cualquier otro actor, ver
// `ContactDetailScreen.tsx`.
export type UpdateContactPayload = {
  document_type?: string
  document_number?: string
  first_name?: string
  last_name?: string
  email?: string | null
  phone?: string | null
}

// ---- Import CSV (POST .../import, ambos recursos) ------------------------
// Shape idéntico devuelto por WasteStreamController::import()/
// UnCodeController::import() -- cada fila se procesa de forma independiente,
// nunca aborta el archivo completo por una fila inválida.
export type ImportRowError = {
  row: number
  message: string
}

export type ImportResult = {
  created: number
  updated: number
  errors: ImportRowError[]
}
