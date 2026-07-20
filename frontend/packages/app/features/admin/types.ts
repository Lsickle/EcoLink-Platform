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
  /**
   * Cierre de brecha de UX (2026-07-18): eager-cargada por
   * `OrganizationalAreaController::index()` SOLO cuando el actor es
   * `isPlatformStaff()` y consulta SIN `organization_id` (la respuesta
   * mezcla filas de varias organizaciones) -- ausente/`undefined` en
   * cualquier otro caso (organization_id ya conocido por el propio filtro,
   * o actor de tenant normal). Ver columna "Organización" de
   * OrganizationalAreasListScreen.tsx.
   */
  organization?: { id: number; legal_name: string; tax_id: string }
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
  // Cargo del contacto (texto libre, puede ser `null`) -- se muestra en el
  // combo de `ContactSearchSelect` para que el usuario pueda distinguir,
  // p.ej., quién tiene el cargo "Conductor" al registrar Personal de
  // Transporte (ver CreateTransportPersonnelForm.tsx). Gap de UX detectado
  // 2026-07-19, no una feature nueva de alcance abierto.
  position_title: string | null
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

// ---- Vehículos (/api/admin/vehicles) --------------------------------------
// CRUD de Vehículos (RN-VEH-001 a RN-VEH-008, CU-051.1/.2/.3/.4) -- mismo
// patrón EXACTO de acceso DUAL que `AdminBranch`: platform staff gestiona
// TODOS los vehículos de CUALQUIER organización; un admin de tenant (o un
// usuario con permiso `vehicles.read` sin ser platform staff) solo los de su
// propia organización (ver `VehicleController`/`VehiclePolicy`). SIN
// restricción de business_role para poseer vehículos -- desviación
// deliberada de RN-090 tal como está escrita hoy, ya confirmada por el
// usuario: cualquier organización puede registrar vehículos, el selector de
// Organización del formulario de creación NO filtra por tipo de
// organización.
//
// `operational_status` es una lista CERRADA de texto (no un catálogo FK) --
// 3 valores reales que el backend acepta como filtro
// (`VehicleController::OPERATIONAL_STATUSES`), aunque store()/activate()/
// deactivate() solo producen 'ACTIVE'/'OUT_OF_SERVICE' hoy (MAINTENANCE
// existe en el dominio de filtro pero ningún endpoint lo asigna todavía).
export type VehicleOperationalStatus = 'ACTIVE' | 'OUT_OF_SERVICE' | 'MAINTENANCE'

// Shape base de `Vehicle` -- devuelto por `index()` con
// `organization:id,legal_name`/`vehicleType:id,name` SIEMPRE eager-cargados
// (a diferencia de `AdminBranch.organization`/`.branch_type`, que index() de
// Sedes NO carga -- ver AVISO corregido en el docblock de
// `VehicleController::index()`, lección explícita de un bug reciente de
// Sedes). `activate()`/`deactivate()` en cambio devuelven el modelo base SIN
// esas 2 relaciones (`vehicle->fresh()` plano) -- quedan opcionales aquí,
// nunca asumidas presentes en esas 2 respuestas puntuales.
export type AdminVehicle = {
  id: number
  uuid: string
  organization_id: number
  branch_id: number | null
  code: string | null
  plate_number: string
  vin: string | null
  vehicle_type_id: number
  brand: string | null
  model: string | null
  manufacturing_year: number | null
  max_load_capacity: number | string | null
  capacity_unit: string
  supports_hazmat: boolean
  has_gps: boolean
  operational_status: VehicleOperationalStatus
  soat_expiration_date: string | null
  technical_inspection_expiration: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: number | null
  updated_by: number | null
  organization?: { id: number; legal_name: string }
  vehicle_type?: { id: number; name: string }
}

// GET /api/admin/vehicles/{id} -- ver VehicleController::show(). A
// diferencia de `AdminVehicle` (fila de index()), aquí TODAS las relaciones
// vienen SIEMPRE eager-cargadas: `organization`/`branch`/`vehicleType`
// completo (no solo id/name)/`created_by`/`updated_by` ({id, username}).
export type AdminVehicleDetail = Omit<AdminVehicle, 'organization' | 'vehicle_type' | 'created_by' | 'updated_by'> & {
  organization: { id: number; legal_name: string }
  branch: { id: number; name: string } | null
  vehicle_type: AdminVehicleType
  created_by: AdminActorRef | null
  updated_by: AdminActorRef | null
}

// KPIs del listado -- objeto PLANO por `is_active` (NO por
// `operational_status`), mismo criterio que `BranchKpis` pero con solo 3
// conteos (Sedes tiene 4, un estado más -- Vehículos no tiene equivalente a
// "Suspendida"), misma visibilidad que `index()` (ver
// `VehicleController::statusKpis()`).
export type VehicleKpis = {
  total: number
  active: number
  inactive: number
}

// POST /api/admin/vehicles -- ver VehicleController::store()/
// validationRules(). `organization_id` SOLO se manda si el actor es
// `is_platform_staff` (REQUERIDO en ese caso) -- para cualquier otro actor
// el backend lo IGNORA y fuerza su propia organización. `operational_status`/
// `is_active` NUNCA viajan aquí -- el backend los fuerza SIEMPRE a
// 'ACTIVE'/true en creación, sin importar lo que el cliente envíe (RN-VEH-005,
// hallazgo Medio ya corregido por especialista-seguridad 2026-07-16).
export type CreateVehiclePayload = {
  organization_id?: number
  branch_id?: number
  code?: string
  plate_number: string
  vin?: string
  vehicle_type_id: number
  brand?: string
  model?: string
  manufacturing_year?: number
  max_load_capacity?: number
  capacity_unit?: string
  supports_hazmat?: boolean
  has_gps?: boolean
  soat_expiration_date?: string
  technical_inspection_expiration?: string
}

// PUT /api/admin/vehicles/{id} -- mismos campos que `CreateVehiclePayload`
// MENOS `organization_id` (inmutable tras crear). `operational_status`/
// `is_active` tampoco viajan aquí -- se gestionan exclusivamente vía
// activate()/deactivate() (permiso granular `vehicles.activate`/
// `.deactivate`, distinto de `vehicles.update` -- hallazgo Medio ya
// corregido por especialista-seguridad 2026-07-16).
export type UpdateVehiclePayload = Omit<CreateVehiclePayload, 'organization_id'>

// ---- Catálogo "Tratamientos" (/api/admin/treatments) ----------------------
// Módulo Tratamiento (RN-063/D-R02). Catálogo GLOBAL (tenant_organization_id
// SIEMPRE null en store(), ver docblock de TreatmentController) gestionado
// EXCLUSIVAMENTE por platform staff -- `TreatmentPolicy::create()`/
// `update()` exigen `isPlatformStaff()` ADEMÁS del permiso RBAC, mismo gate
// binario que OrganizationController/BusinessRoleController. La LECTURA
// (`treatments.read`) está disponible para cualquier usuario autenticado con
// el permiso -- los Gestores lo necesitan para configurar sus
// `branch_treatments`. El frontend OCULTA (no solo deshabilita) los
// controles de escritura si `!user.is_platform_staff`, mismo criterio ya
// usado en ContactDetailScreen.tsx para el gate de edición de Persona.
export const TREATMENT_TYPES = [
  'THERMAL', 'PHYSICOCHEMICAL', 'BIOLOGICAL', 'STABILIZATION', 'DISPOSAL',
  'RECOVERY', 'CHEMICAL', 'LIQUID', 'SLUDGE', 'PHYSICAL',
] as const

export type TreatmentType = (typeof TREATMENT_TYPES)[number]

export const TREATMENT_RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const

export type TreatmentRiskLevel = (typeof TREATMENT_RISK_LEVELS)[number]

// `min_temperature`/`max_temperature`/`estimated_processing_time_hours` son
// `decimal:2` en el modelo -- Eloquent los serializa como STRING en JSON
// (nunca number), mismo criterio ya documentado para
// `AdminVehicle.max_load_capacity`/`AdminBranch.operational_capacity`.
export type AdminTreatment = {
  id: number
  uuid: string
  tenant_organization_id: number | null
  code: string
  name: string
  description: string | null
  treatment_type: TreatmentType
  parent_treatment_id: number | null
  requires_environmental_license: boolean
  requires_special_transport: boolean
  allows_recovery: boolean
  requires_certificate: boolean
  requires_weight_control: boolean
  min_temperature: string | null
  max_temperature: string | null
  temperature_unit: string
  risk_level: TreatmentRiskLevel
  estimated_processing_time_hours: string | null
  is_system: boolean
  is_active: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  created_by?: AdminActorRef | null
  updated_by?: AdminActorRef | null
}

// GET /api/admin/treatments/{id} -- ver TreatmentController::show().
// created_by/updated_by SIEMPRE presentes como {id, username} | null.
export type AdminTreatmentDetail = AdminTreatment & {
  created_by: AdminActorRef | null
  updated_by: AdminActorRef | null
}

// POST /api/admin/treatments -- ver TreatmentController::store()/
// validationRules(). El backend SIEMPRE fija tenant_organization_id=null/
// parent_treatment_id=null/is_system=false/is_active=true/created_by/
// updated_by server-side (nunca aceptados del cliente).
export type CreateTreatmentPayload = {
  code: string
  name: string
  description?: string
  treatment_type?: TreatmentType
  requires_environmental_license?: boolean
  requires_special_transport?: boolean
  allows_recovery?: boolean
  requires_certificate?: boolean
  requires_weight_control?: boolean
  min_temperature?: number
  max_temperature?: number
  temperature_unit?: string
  risk_level?: TreatmentRiskLevel
  estimated_processing_time_hours?: number
}

// PUT /api/admin/treatments/{id} -- mismos campos, todos `sometimes` en el
// backend.
export type UpdateTreatmentPayload = Partial<CreateTreatmentPayload>

// ---- "Tratamientos de Sucursal" (/api/admin/branch-treatments) -----------
// Habilitación de un Treatment (catálogo global) en una SEDE concreta de un
// Gestor, con su propia capacidad/licencia (RN-063/D-R02). Acceso DUAL,
// mismo patrón EXACTO que AdminVehicle/AdminBranch: platform staff gestiona
// TODOS los `branch_treatments` de cualquier organización; un admin de
// tenant (o usuario con `branch_treatments.read` sin ser platform staff)
// solo los de su propia organización (ver BranchTreatment::isAccessibleBy()/
// BranchTreatmentPolicy). Restricción de negocio: SOLO organizaciones con
// business_role GESTOR (`can_treat_waste=true`) pueden tener
// `branch_treatments` -- el backend lo revalida siempre en store(), el
// frontend además filtra el selector de Organización del formulario de
// creación por esa capacidad (ver `capability` en `searchOrganizations()`).
//
// `operational_status` es una lista CERRADA de texto (no catálogo FK) --
// mismo criterio que `BranchStatus`/`VehicleOperationalStatus`. Solo
// ACTIVE/INACTIVE se producen hoy vía activate()/deactivate() (SUSPENDED
// existe en el dominio pero ningún endpoint lo asigna todavía, mismo aviso
// ya documentado para `VehicleOperationalStatus`).
export type BranchTreatmentOperationalStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'

// Corriente Y/A permitida para un `branch_treatment` (RN-063/D-R02) -- shape
// allowlist EXACTO devuelto por `allowedWasteStreams:id,code,name,tipo`.
export type BranchTreatmentAllowedWasteStream = {
  id: number
  code: string
  name: string
  tipo: WasteStreamTipo
}

// Código UN permitido -- shape allowlist EXACTO devuelto por
// `allowedUnCodes:id,code,name`.
export type BranchTreatmentAllowedUnCode = {
  id: number
  code: string
  name: string
}

// Shape base de `BranchTreatment` -- devuelto por `index()` con
// `organization:id,legal_name`/`branch:id,name`/`treatment:id,code,name`
// SIEMPRE eager-cargados. `activate()`/`deactivate()` en cambio devuelven el
// modelo base SIN esas 3 relaciones (`branchTreatment->fresh()` plano) --
// quedan opcionales aquí, mismo criterio que `AdminVehicle`.
//
// `max_capacity`/`daily_capacity`/`monthly_capacity` son `decimal:2` --
// siempre STRING en JSON, nunca number.
export type AdminBranchTreatment = {
  id: number
  uuid: string
  tenant_organization_id: number | null
  organization_id: number
  branch_id: number
  treatment_id: number
  internal_code: string | null
  operational_name: string | null
  max_capacity: string | null
  capacity_unit: string
  daily_capacity: string | null
  monthly_capacity: string | null
  environmental_license_number: string | null
  valid_from: string | null
  valid_until: string | null
  requires_manual_approval: boolean
  allows_mixed_waste: boolean
  requires_weight_validation: boolean
  operational_status: BranchTreatmentOperationalStatus
  observations: string | null
  is_active: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  created_by: number | null
  updated_by: number | null
  organization?: { id: number; legal_name: string }
  branch?: { id: number; name: string }
  treatment?: { id: number; code: string; name: string }
}

// GET /api/admin/branch-treatments/{id} -- ver
// BranchTreatmentController::show(). A diferencia de `AdminBranchTreatment`
// (fila de index()), aquí TODAS las relaciones vienen SIEMPRE
// eager-cargadas: `organization`/`branch`/`treatment` completo (no solo id/
// code/name)/`allowed_waste_streams`/`allowed_un_codes`/`created_by`/
// `updated_by` ({id, username}).
export type AdminBranchTreatmentDetail = Omit<
  AdminBranchTreatment,
  'organization' | 'branch' | 'treatment' | 'created_by' | 'updated_by'
> & {
  organization: { id: number; legal_name: string }
  branch: { id: number; name: string }
  treatment: AdminTreatment
  allowed_waste_streams: BranchTreatmentAllowedWasteStream[]
  allowed_un_codes: BranchTreatmentAllowedUnCode[]
  created_by: AdminActorRef | null
  updated_by: AdminActorRef | null
}

// KPIs del listado -- objeto PLANO, mismo shape que `VehicleKpis` (ver
// `BranchTreatmentController::statusKpis()`).
export type BranchTreatmentKpis = {
  total: number
  active: number
  inactive: number
}

// POST /api/admin/branch-treatments -- ver
// BranchTreatmentController::store()/validationRules(). `organization_id`
// SOLO se manda si el actor es `is_platform_staff` (REQUERIDO en ese caso) --
// para cualquier otro actor el backend lo IGNORA y fuerza su propia
// organización, mismo criterio que `CreateVehiclePayload`.
// `operational_status`/`is_active` NUNCA viajan aquí -- el backend los fuerza
// SIEMPRE a 'ACTIVE'/true en creación.
export type CreateBranchTreatmentPayload = {
  organization_id?: number
  branch_id: number
  treatment_id: number
  internal_code?: string
  operational_name?: string
  max_capacity?: number
  capacity_unit?: string
  daily_capacity?: number
  monthly_capacity?: number
  environmental_license_number?: string
  valid_from?: string
  valid_until?: string
  requires_manual_approval?: boolean
  allows_mixed_waste?: boolean
  requires_weight_validation?: boolean
  observations?: string
}

// PUT /api/admin/branch-treatments/{id} -- mismos campos que
// `CreateBranchTreatmentPayload` MENOS `organization_id` (inmutable tras
// crear). `operational_status`/`is_active` tampoco viajan aquí -- se
// gestionan exclusivamente vía activate()/deactivate().
export type UpdateBranchTreatmentPayload = Omit<CreateBranchTreatmentPayload, 'organization_id'>

// ---- Núcleo del Módulo Residuos (/api/admin/wastes) ------------------------
// Declaración + clasificación de residuos (CU-XXX del wizard de 5 pasos,
// Figma fileKey pX6vqXxnJ66YSIYpE7v9pV nodeId 777:9186). Acceso DUAL, mismo
// patrón EXACTO que AdminVehicle/AdminBranch: platform staff gestiona TODOS
// los residuos, un tenant admin (o `wastes.read`) solo los de su propia
// organización -- ver `Waste::isAccessibleBy()`/`WastePolicy`. SIN
// restricción de business_role.

// Catálogos de solo lectura nuevos consumidos por el wizard -- mismo shape
// simple {id,uuid,code,name,is_system,is_active,created_at,updated_at} que
// AdminPhysicalState (ver WasteTypeController/MeasurementUnitController/
// GenerationFrequencyController, todos "mismo patrón EXACTO que
// PhysicalStateController").
export type AdminWasteType = {
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

export type AdminMeasurementUnit = {
  id: number
  uuid: string
  code: string
  name: string
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AdminGenerationFrequency = {
  id: number
  uuid: string
  code: string
  name: string
  is_system: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

// Waste_operational_statuses -- DISTINTO del workflow de declaración
// (`WasteStatus` abajo), ver docblock de `WasteOperationalStatus` en el
// backend. Con `description` (a diferencia de MeasurementUnit/
// GenerationFrequency, que no la tienen -- ver migración real).
export type AdminWasteOperationalStatus = {
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

// Workflow de declaración (`wastes.status`, SIN motor de workflow
// configurable, esquema-bd punto 14/L-22): BR (Borrador) -> DEC (Declarado)
// -> REV (En Revisión) -> CLS (Clasificado); RCH (Rechazado, reversible a
// BR). DISTINTO de `operational_status_id` (catálogo `waste_operational_statuses`,
// eje independiente is_active/ACTIVE-SUSPENDED-etc).
export type WasteStatus = 'BR' | 'DEC' | 'REV' | 'CLS' | 'RCH'

// Pivote residuo<->corriente Y/A, tal como lo expone
// `wasteStreamAssignments.wasteStream` en show() -- mismo criterio de forma
// "pivote con relación anidada" que el resto del proyecto (ver
// AdminOrganizationContact).
export type AdminWasteStreamAssignment = {
  id: number
  waste_stream_id: number
  is_primary: boolean
  waste_stream: AdminWasteStream
}

export type AdminWasteUnCodeAssignment = {
  id: number
  un_code_id: number
  is_primary: boolean
  un_code: AdminUnCode
}

export type AdminWasteHazardCharacteristicAssignment = {
  id: number
  hazard_characteristic_id: number
  hazard_characteristic: AdminHazardCharacteristic
}

// Shape base de `Waste` -- devuelto por `index()` con
// `organization:id,legal_name`/`branch:id,name`/`wasteCategory:id,code,name`
// SIEMPRE eager-cargados (ver `WasteController::index()`), SIN las 3
// pivotes de clasificación (esas solo viajan en `show()`, ver
// `AdminWasteDetail` abajo).
export type AdminWaste = {
  id: number
  uuid: string
  tenant_organization_id: number | null
  organization_id: number
  branch_id: number | null
  waste_category_id: number | null
  code: string | null
  name: string
  description: string | null
  status: WasteStatus
  waste_danger: string | null
  waste_type_id: number
  is_template: boolean
  is_preapproved: boolean
  preapproved_by_organization_id: number | null
  requires_characterization: boolean
  requires_sds: boolean
  physical_state_id: number | null
  measurement_unit_id: number
  average_weight: number | string | null
  generation_frequency_id: number | null
  requires_special_transport: boolean
  requires_special_ppe: boolean
  operational_status_id: number
  quantity: number | string | null
  generation_date: string | null
  internal_reference: string | null
  operational_notes: string | null
  last_classification_review_at?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: number | null
  updated_by: number | null
  organization?: { id: number; legal_name: string }
  branch?: { id: number; name: string } | null
  waste_category?: { id: number; code: string; name: string } | null
}

// GET /api/admin/wastes/{id} -- ver `WasteController::show()`. TODAS las
// relaciones vienen SIEMPRE eager-cargadas, incluidas las 3 pivotes de
// clasificación y `created_by`/`updated_by` ({id, username}).
export type AdminWasteDetail = Omit<
  AdminWaste,
  'organization' | 'branch' | 'waste_category' | 'created_by' | 'updated_by'
> & {
  organization: { id: number; legal_name: string }
  branch: { id: number; name: string } | null
  waste_category: AdminWasteCategory | null
  waste_type: AdminWasteType
  physical_state: AdminPhysicalState | null
  measurement_unit: AdminMeasurementUnit
  generation_frequency: AdminGenerationFrequency | null
  operational_status: AdminWasteOperationalStatus
  waste_stream_assignments: AdminWasteStreamAssignment[]
  waste_un_codes: AdminWasteUnCodeAssignment[]
  waste_hazard_characteristics: AdminWasteHazardCharacteristicAssignment[]
  created_by: AdminActorRef | null
  updated_by: AdminActorRef | null
}

// KPIs del listado -- objeto PLANO, mismo shape que `VehicleKpis` (ver
// `WasteController::statusKpis()`).
export type WasteKpis = {
  total: number
  active: number
  inactive: number
}

// POST /api/admin/wastes -- ver `WasteController::store()`/
// `validationRules()`. `organization_id` SOLO se manda si el actor es
// `is_platform_staff` (REQUERIDO en ese caso), mismo criterio que
// `CreateVehiclePayload`. `status`/`waste_danger`/
// `last_classification_review_at` NUNCA viajan aquí -- el backend los
// ignora/fuerza siempre (nace en 'BR', ver docblock del controller).
export type CreateWastePayload = {
  organization_id?: number
  branch_id?: number
  waste_category_id?: number
  code?: string
  name: string
  description?: string
  waste_type_id?: number
  is_template?: boolean
  requires_characterization?: boolean
  requires_sds?: boolean
  physical_state_id?: number
  measurement_unit_id?: number
  average_weight?: number
  generation_frequency_id?: number
  requires_special_transport?: boolean
  requires_special_ppe?: boolean
  quantity?: number
  generation_date?: string
  internal_reference?: string
  operational_notes?: string
}

// PUT /api/admin/wastes/{id} -- mismos campos que `CreateWastePayload` MENOS
// `organization_id` (inmutable tras crear). Todos `sometimes` en el backend
// -- el wizard manda solo los campos del paso actual en cada "Guardar
// Borrador"/"Siguiente". Solo editable mientras `status` sea BR o RCH (el
// backend no bloquea explícitamente por status en update(), pero el flujo
// de negocio del wizard asume eso -- ver docblock de WasteDetailScreen).
export type UpdateWastePayload = Omit<CreateWastePayload, 'organization_id'>

// POST /api/admin/wastes/{id}/reject -- ver `WasteController::reject()`.
export type RejectWastePayload = {
  reason: string
}

// GET /api/admin/wastes/{waste}/files -- ver `WasteController::files()`.
// Agrupado por `file_category` en el backend (`->groupBy('file_category')`,
// Laravel serializa un Collection agrupado como objeto plano
// {CATEGORIA: [...]}), nunca un array plano.
export type WasteFileCategory = 'WASTE_PHOTO' | 'SDS' | 'ADDITIONAL_DOCUMENT'

// esquema-bd: `files` -- repositorio documental transversal (primer
// consumidor real: evidencias del wizard de Residuos, Paso 4). Ver
// `FileController`.
export type AdminFile = {
  id: number
  uuid: string
  tenant_organization_id: number | null
  entity_type: string
  entity_id: number
  file_category: string
  original_filename: string
  stored_filename: string
  file_extension: string
  mime_type: string
  file_size_bytes: number
  file_hash_sha256: string | null
  storage_provider: string
  storage_path: string
  visibility_level: string
  description: string | null
  uploaded_by_user_id: number | null
  uploaded_at: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type WasteFilesByCategory = Partial<Record<WasteFileCategory, AdminFile[]>>

// POST /api/admin/files -- multipart, ver `FileController::store()`. SIEMPRE
// `entity_type='WASTE'` en este lote (único consumidor real).
export type UploadFilePayload = {
  file: File
  entityType: 'WASTE'
  entityId: number | string
  fileCategory: WasteFileCategory
  description?: string
}

// ---- "Evaluación del Gestor" (/api/admin/treatment-approvals, /api/admin/wastes/{waste}/treatment-approvals) ----
// waste_treatment_approvals -- acceso CRUZADO controlado (DISTINTO del resto
// del proyecto, que solo conoce acceso dual platform-staff-vs-tenant):
// `organization_id` de la fila es SIEMPRE el GESTOR evaluador (dueño de
// `branch_treatment_id`); `waste_id` puede pertenecer a CUALQUIER otra
// organización (el Generador, dueño del residuo). Ambos lados pueden VER la
// fila, solo el Gestor puede EDITARLA/EVALUARLA -- ver
// `WasteTreatmentApproval::isAccessibleBy()`/`isEditableBy()`.
export type TreatmentApprovalTechnicalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RESTRICTED'
export type TreatmentApprovalCommercialStatus = 'DRAFT' | 'QUOTED' | 'NEGOTIATING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

// Ref recortado de `waste` tal como lo expone `index()`/`indexForWaste()`
// (`waste:id,name,code,organization_id` -- SIN `waste.organization`
// anidado). El detalle (`show()`) SÍ agrega `waste.organization:id,legal_name`
// -- ver `AdminTreatmentApprovalDetail` abajo.
export type TreatmentApprovalWasteRef = {
  id: number
  name: string
  code: string | null
  organization_id: number
}

// Ref recortado de `branch_treatment` tal como lo expone `index()` GENERAL
// (`branchTreatment:id,operational_name,branch_id,treatment_id` -- SIN
// `treatment`/`branch` anidados). DISTINTO del ref completo que exponen
// `indexForWaste()`/`show()`/`preapprovedMatches()` (ver
// `TreatmentApprovalBranchTreatmentRef` abajo) -- GAP de contrato
// documentado en el resumen del lote: el listado general
// (`TreatmentApprovalsListScreen`) no puede mostrar el nombre del
// tratamiento base ni el de la sucursal, solo `operational_name` (el
// nombre que el propio Gestor le dio a esa habilitación).
export type TreatmentApprovalBranchTreatmentSummaryRef = {
  id: number
  operational_name: string | null
  branch_id: number
  treatment_id: number
}

// Ref completo de `branch_treatment` tal como lo exponen
// `indexForWaste()`/`show()`/`preapprovedMatches()` (TODOS con
// `branchTreatment.treatment` completo + `branchTreatment.branch:id,name`).
export type TreatmentApprovalBranchTreatmentRef = {
  id: number
  operational_name: string | null
  branch_id: number
  treatment_id: number
  max_capacity: string | null
  capacity_unit: string
  treatment: AdminTreatment
  branch: { id: number; name: string }
}

// Shape base de `WasteTreatmentApproval` -- devuelto por `index()` GENERAL
// (perspectiva del Gestor, acceso dual: platform staff ve todas, un Gestor
// solo las suyas por `organization_id`). `unit_price`/`minimum_quantity`/
// `maximum_quantity` son `decimal:2` -- siempre STRING en JSON.
export type AdminTreatmentApproval = {
  id: number
  uuid: string
  tenant_organization_id: number | null
  organization_id: number
  waste_id: number
  branch_treatment_id: number
  version: number
  commercial_status: TreatmentApprovalCommercialStatus
  technical_status: TreatmentApprovalTechnicalStatus
  unit_price: string | null
  currency: string
  billing_unit: string
  minimum_quantity: string | null
  maximum_quantity: string | null
  requires_lab_analysis: boolean
  requires_sds: boolean
  restrictions: string | null
  commercial_notes: string | null
  technical_notes: string | null
  technical_approved_at: string | null
  technical_approved_by: number | null
  commercial_approved_at: string | null
  commercial_approved_by: number | null
  valid_from: string | null
  valid_until: string | null
  detailed_notes?: string | null
  is_active: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  organization?: { id: number; legal_name: string }
  waste?: TreatmentApprovalWasteRef
  branch_treatment?: TreatmentApprovalBranchTreatmentSummaryRef
}

// GET /api/admin/wastes/{waste}/treatment-approvals -- perspectiva del
// DUEÑO DEL RESIDUO (ve todas las evaluaciones que generó, de cualquier
// Gestor). A diferencia de `AdminTreatmentApproval` (index() general), aquí
// `branch_treatment` SIEMPRE viene con `treatment`/`branch` completos (ver
// `WasteTreatmentApprovalController::indexForWaste()`).
export type AdminTreatmentApprovalForWaste = Omit<AdminTreatmentApproval, 'organization' | 'branch_treatment'> & {
  organization: { id: number; legal_name: string }
  branch_treatment: TreatmentApprovalBranchTreatmentRef
}

// GET /api/admin/wastes/{waste}/preapproved-matches -- mismo shape que
// `AdminTreatmentApprovalForWaste` (misma forma de eager-load en el
// controller), sin `waste` (no se carga esa relación en este endpoint).
export type PreapprovedTreatmentMatch = AdminTreatmentApprovalForWaste

// GET /api/admin/treatment-approvals/{id} -- ambos lados de la relación
// cruzada pueden ver el detalle. `waste` agrega `waste.organization` (a
// diferencia de `index()`/`indexForWaste()`) -- pero SIGUE SIN incluir las
// corrientes/UN/características de peligrosidad del residuo (GAP
// documentado en el resumen del lote: el Gestor evaluador no tiene forma de
// consultarlas por otra vía, `WastePolicy::view()` bloquea el acceso
// cruzado a `GET /admin/wastes/{id}`).
export type AdminTreatmentApprovalDetail = Omit<
  AdminTreatmentApproval,
  'organization' | 'waste' | 'branch_treatment' | 'technical_approved_by' | 'commercial_approved_by'
> & {
  organization: { id: number; legal_name: string }
  waste: TreatmentApprovalWasteRef & {
    organization: { id: number; legal_name: string }
    // `WasteTreatmentApprovalController::show()` eager-carga estas 3
    // relaciones (fix de gap de contrato posterior al lote original) -- el
    // Gestor evaluador ve la clasificación real del residuo, unica via de
    // acceso autorizada ya que `WastePolicy::view()` bloquea su acceso
    // directo a `GET /admin/wastes/{id}`.
    waste_stream_assignments: AdminWasteStreamAssignment[]
    waste_un_codes: AdminWasteUnCodeAssignment[]
    waste_hazard_characteristics: AdminWasteHazardCharacteristicAssignment[]
  }
  branch_treatment: TreatmentApprovalBranchTreatmentRef
  technical_approved_by: AdminActorRef | null
  commercial_approved_by: AdminActorRef | null
}

// GET /api/admin/branch-treatments/available -- exploración PÚBLICA (para
// cualquier usuario autenticado, no solo el Gestor) de tratamientos de sede
// ACTIVOS de organizaciones Gestor, campos LIMITADOS (sin licencia
// ambiental/observaciones/internal_code) -- ver
// `BranchTreatmentController::available()`.
export type AvailableBranchTreatment = {
  id: number
  treatment_name: string
  organization_name: string
  branch_name: string
  max_capacity: string | null
  capacity_unit: string
}

// POST /api/admin/wastes/{waste}/treatment-approvals -- el Generador elige
// un `branch_treatment_id` de un Gestor -- esa elección ES la invitación
// (sin paso de invitación aparte).
export type CreateTreatmentApprovalRequestPayload = {
  branch_treatment_id: number
}

// PUT /api/admin/treatment-approvals/{id} -- SOLO el Gestor evaluador edita
// términos comerciales/técnicos (ver `WasteTreatmentApprovalPolicy::update()`).
// `technical_status`/`commercial_status` NUNCA viajan aquí -- solo vía las
// transiciones dedicadas de abajo.
export type UpdateTreatmentApprovalPayload = {
  unit_price?: number
  currency?: string
  billing_unit?: string
  minimum_quantity?: number
  maximum_quantity?: number
  requires_lab_analysis?: boolean
  requires_sds?: boolean
  restrictions?: string
  commercial_notes?: string
  technical_notes?: string
  valid_from?: string
  valid_until?: string
  detailed_notes?: string
}

// POST .../approve-technical -- si `restrictions` viene no vacío, el
// backend resuelve a RESTRICTED en vez de APPROVED.
export type ApproveTreatmentApprovalTechnicalPayload = {
  restrictions?: string
}

// POST .../reject-technical -- `technical_notes` REQUERIDO.
export type RejectTreatmentApprovalTechnicalPayload = {
  technical_notes: string
}

// POST .../reject-commercial -- `commercial_notes` opcional.
export type RejectTreatmentApprovalCommercialPayload = {
  commercial_notes?: string
}

// ---- "Residuos Preaprobados" (/api/admin/preapproved-wastes) --------------
// `wastes.waste_type_id` = catálogo `PREAPPROVED` -- residuos de referencia
// que una organización Gestor declara y AUTO-APRUEBA de una vez (RN-191, ver
// docblock completo de `PreapprovedWasteController`), sin pasar por el ciclo
// normal `waste_treatment_approvals` (solicitud/evaluación técnica/
// comercial). Acceso DUAL, mismo mecanismo EXACTO que AdminOrganizationalArea/
// AdminBranchTreatment: platform staff gestiona los de TODAS las
// organizaciones Gestor (filtro `organization_id` OPCIONAL); un admin de
// tenant solo ve/gestiona los de la SUYA -- si su organización no tiene la
// capacidad `can_treat_waste`, el listado vuelve VACÍO (200), NO un 403 (ver
// docblock de `index()` en el backend, criterio anti-oráculo deliberado).

// Fila de la `WasteTreatmentApproval` auto-aprobada asociada -- SIEMPRE
// exactamente una por residuo preaprobado (creada en la misma transacción de
// `store()`), nace con AMBOS ejes `APPROVED`. `technical_approved_by`/
// `commercial_approved_by` SOLO vienen en `show()` (no en `index()`).
export type PreapprovedWasteApproval = {
  id: number
  branch_treatment_id: number
  unit_price: string | null
  currency: string
  billing_unit: string
  minimum_quantity: string | null
  maximum_quantity: string | null
  requires_lab_analysis: boolean
  requires_sds: boolean
  restrictions: string | null
  valid_from: string | null
  valid_until: string | null
  technical_status: TreatmentApprovalTechnicalStatus
  commercial_status: TreatmentApprovalCommercialStatus
  is_active: boolean
  branch_treatment: TreatmentApprovalBranchTreatmentRef
  technical_approved_by?: AdminActorRef | null
  commercial_approved_by?: AdminActorRef | null
}

// GET /api/admin/preapproved-wastes -- fila tal como la expone `index()`:
// SIEMPRE con `wasteStreamAssignments.wasteStream`/`wasteUnCodes.unCode`/
// `treatmentApprovals.branchTreatment.{treatment,branch}` eager-cargados.
// `organization` SOLO viaja cuando la respuesta mezcla organizaciones
// (platform staff sin filtro de `organization_id`) -- mismo criterio que
// `AdminWaste`/`AdminOrganizationalArea`. Los 3 campos de relación son
// OPCIONALES (`?`) porque `activate()`/`deactivate()` devuelven
// `waste->fresh()` SIN relaciones -- ver `activatePreapprovedWaste()`/
// `deactivatePreapprovedWaste()` en api.ts.
export type AdminPreapprovedWaste = {
  id: number
  uuid: string
  tenant_organization_id: number | null
  organization_id: number
  branch_id: number | null
  waste_category_id: number | null
  code: string | null
  name: string
  description: string | null
  physical_state_id: number | null
  measurement_unit_id: number
  average_weight: number | string | null
  generation_frequency_id: number | null
  requires_special_transport: boolean
  requires_special_ppe: boolean
  requires_characterization: boolean
  requires_sds: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  organization?: { id: number; legal_name: string; tax_id?: string }
  waste_stream_assignments?: AdminWasteStreamAssignment[]
  waste_un_codes?: AdminWasteUnCodeAssignment[]
  treatment_approvals?: PreapprovedWasteApproval[]
}

// GET /api/admin/preapproved-wastes/{waste} -- ver
// `PreapprovedWasteController::show()`. TODAS las relaciones vienen SIEMPRE
// eager-cargadas (a diferencia de `AdminPreapprovedWaste`, aquí no son
// opcionales), incluida la clasificación completa y `technical_approved_by`/
// `commercial_approved_by` de la aprobación.
export type AdminPreapprovedWasteDetail = Omit<
  AdminPreapprovedWaste,
  'organization' | 'waste_stream_assignments' | 'waste_un_codes' | 'treatment_approvals'
> & {
  organization: { id: number; legal_name: string; tax_id?: string }
  waste_category: AdminWasteCategory | null
  physical_state: AdminPhysicalState | null
  measurement_unit: AdminMeasurementUnit
  generation_frequency: AdminGenerationFrequency | null
  waste_stream_assignments: AdminWasteStreamAssignment[]
  waste_un_codes: AdminWasteUnCodeAssignment[]
  treatment_approvals: PreapprovedWasteApproval[]
}

// POST /api/admin/preapproved-wastes -- ver
// `PreapprovedWasteController::store()`/`wasteValidationRules()`/
// `approvalValidationRules()`. `organization_id` SOLO viaja si el actor es
// `is_platform_staff` (REQUERIDO en ese caso), mismo criterio que
// `CreateWastePayload`/`CreateBranchTreatmentPayload`. `approval.*` va
// ANIDADO (no aplanado) a propósito -- ver docblock de
// `approvalValidationRules()` en el backend (evita que `requires_sds` del
// residuo colisione con `requires_sds` de la aprobación, cada uno con
// significado distinto). El backend exige al menos una corriente Y/A o un
// código UN (422 en `waste_stream_ids` si ambos arrays vienen vacíos).
export type CreatePreapprovedWasteApprovalPayload = {
  branch_treatment_id: number
  unit_price?: number
  currency?: string
  billing_unit?: string
  minimum_quantity?: number
  maximum_quantity?: number
  requires_lab_analysis?: boolean
  requires_sds?: boolean
  restrictions?: string
  valid_from?: string
  valid_until?: string
}

export type CreatePreapprovedWastePayload = {
  organization_id?: number
  branch_id?: number
  waste_category_id?: number
  code?: string
  name: string
  description?: string
  physical_state_id?: number
  measurement_unit_id?: number
  average_weight?: number
  generation_frequency_id?: number
  requires_special_transport?: boolean
  requires_special_ppe?: boolean
  requires_characterization?: boolean
  requires_sds?: boolean
  waste_stream_ids?: number[]
  un_code_ids?: number[]
  approval: CreatePreapprovedWasteApprovalPayload
}

// PUT /api/admin/preapproved-wastes/{waste} -- mismos campos MENOS
// `organization_id`/`waste_type_id` (inmutables tras crear); TODOS
// `sometimes` en el backend, incluido `approval.branch_treatment_id`.
export type UpdatePreapprovedWastePayload = Partial<
  Omit<CreatePreapprovedWastePayload, 'organization_id' | 'approval'>
> & {
  approval?: Partial<CreatePreapprovedWasteApprovalPayload>
}

// ---- Motor de Workflow genérico (workflows / CU-021 "Configurar Workflow") -
// Ver docblock completo de `WorkflowController`/`WorkflowPolicy` en el
// backend. Solo `entity_type=TREATMENT` tiene datos reales sembrados hoy
// (WorkflowSeeder, 11 `respel_statuses` / 17 `workflow_transitions` sobre el
// BASE "RESPEL") -- el resto de valores de `WorkflowEntityType` está
// reservado para módulos futuros, ninguno con pantalla propia todavía.
export type WorkflowEntityType =
  | 'WASTE'
  | 'SERVICE'
  | 'TRANSPORT'
  | 'MANIFEST'
  | 'CERTIFICATE'
  | 'CONCILIATION'
  | 'TREATMENT'
  | 'ORGANIZATION'
  | 'BRANCH'
  | 'CONTACT'
  | 'SCHEDULING'
  | 'DOCUMENT'

export type WorkflowVersionStatus = 'DRAFT' | 'PUBLISHED'

// GET /api/admin/respel-statuses -- catálogo de solo lectura de
// `respel_statuses` (ver `RespelStatusController::index()`). Cierra el gap de
// contrato que existía en el lote anterior: antes `WorkflowTransition` solo
// exponía el código crudo (`from_status_code`/`to_status_code`), sin forma de
// resolver nombre/orden/flags -- ahora este catálogo existe y, además,
// `WorkflowTransition::fromStatus()`/`toStatus()` lo embeben directamente en
// cada transición (ver `AdminWorkflowTransition.from_status`/`to_status`
// abajo).
export type AdminRespelStatus = {
  id: number
  code: string
  name: string
  description: string | null
  sort_order: number
  is_initial: boolean
  is_final: boolean
  is_approved_status: boolean
  is_rejected_status: boolean
  color_hex: string | null
  icon: string | null
  is_active: boolean
}

export type AdminWorkflowTransitionRoleAssignment = {
  id: number
  role_id: number | null
  business_role_id: number | null
  role: { id: number; code: string; name: string } | null
  business_role: { id: number; code: string; name: string } | null
}

// `rule_type`/`rule_definition`/`error_message` -- `WorkflowController` los
// devuelve (eager-cargados en `show()`) pero NO tiene forma de crearlos ni
// editarlos (`storeTransition()`/`updateTransition()` no validan ningún
// campo `rules`, ver docblock del controller) -- de solo lectura en la UI,
// sin formulario asociado.
export type AdminWorkflowTransitionRule = {
  id: number
  rule_type: string
  rule_definition: Record<string, unknown> | null
  error_message: string | null
}

export type AdminWorkflowTransition = {
  id: number
  uuid: string
  workflow_version_id: number
  from_status_code: string
  to_status_code: string
  is_automatic: boolean
  requires_approval: boolean
  // Gap de contrato cerrado (backend, `WorkflowTransition::fromStatus()`/
  // `toStatus()`): la fila completa de `respel_statuses` viaja embebida en
  // CADA transición -- preferir esto sobre cruzar `from_status_code`/
  // `to_status_code` contra un catálogo cargado aparte, es más simple y
  // siempre consistente con la transición concreta que se está mostrando.
  from_status?: AdminRespelStatus | null
  to_status?: AdminRespelStatus | null
  roles?: AdminWorkflowTransitionRoleAssignment[]
  rules?: AdminWorkflowTransitionRule[]
}

// Gap de contrato cerrado (backend, `WorkflowController::show()`): ahora se
// eager-carga el mismo detalle completo (`roles`/`rules`/`fromStatus`/
// `toStatus`) para TODAS las versiones (`versions[]`), no solo
// `current_version` -- `transitions` ya no es opcional/"desconocido", viene
// SIEMPRE como array (posiblemente vacío) para cualquier versión de
// `AdminWorkflowDetail.versions`.
export type AdminWorkflowVersion = {
  id: number
  uuid: string
  workflow_id: number
  version_number: number
  status: WorkflowVersionStatus
  published_at: string | null
  published_by: number | null
  created_by: number | null
  created_at: string
  transitions: AdminWorkflowTransition[]
}

// `tenant_organization` (gap de contrato cerrado, `WorkflowController::
// index()`/`show()` ahora eager-cargan `tenantOrganization:id,legal_name`
// en AMBOS métodos) -- disponible tanto en el listado como en el detalle,
// por eso vive en el tipo base en vez de solo en `AdminWorkflowDetail`.
export type AdminWorkflow = {
  id: number
  uuid: string
  tenant_organization_id: number | null
  code: string
  name: string
  description: string | null
  entity_type: WorkflowEntityType
  is_system: boolean
  is_active: boolean
  current_version_id: number | null
  created_at: string
  updated_at: string
  current_version?: AdminWorkflowVersion | null
  tenant_organization?: { id: number; legal_name: string } | null
}

// GET /api/admin/workflows/{workflow} -- ver `WorkflowController::show()`.
// Todas las entradas de `versions` (no solo `current_version`) traen el
// detalle completo de sus transiciones (ver AVISO en `AdminWorkflowVersion`
// arriba).
export type AdminWorkflowDetail = AdminWorkflow & {
  versions: AdminWorkflowVersion[]
}

export type CreateWorkflowTransitionRolePayload = {
  role_id?: number | null
  business_role_id?: number | null
}

// POST /api/admin/workflows/{workflow}/transitions -- ver
// `WorkflowController::validateTransitionPayload()`. `from_status_code`/
// `to_status_code` deben existir en `respel_statuses` (código EXACTO,
// prefijado -- `TECH_*`/`COM_*`, ver `RespelStatusSeeder`).
export type CreateWorkflowTransitionPayload = {
  from_status_code: string
  to_status_code: string
  is_automatic?: boolean
  requires_approval?: boolean
  roles?: CreateWorkflowTransitionRolePayload[]
}

// PUT /api/admin/workflows/{workflow}/transitions/{transition} --
// `from_status_code`/`to_status_code` NUNCA viajan aquí (inmutables tras
// crear, ver `WorkflowController::updateTransition()` -- solo
// is_automatic/requires_approval/roles).
export type UpdateWorkflowTransitionPayload = {
  is_automatic?: boolean
  requires_approval?: boolean
  roles?: CreateWorkflowTransitionRolePayload[]
}

// ---- Solicitudes de Servicio (/api/admin/service-requests) ---------------
// Fase 1b (D-S01/D-S02/D-S04/D-S06/D-S09/D-S12/D-S25/D-S27, backend cerrado
// -- 1111 tests Pest, revisión de seguridad -- ver docblock completo de
// `ServiceRequestController`/`ServiceRequestPolicy`). Acceso NO simétrico
// (distinto de todo lo demás en este archivo): el Generador dueño
// (`organization_id`) ve/edita/cancela su propia solicitud completa; un
// Gestor con AL MENOS UN ítem asignado (vía
// `waste_treatment_approval.organization_id`) puede VER la solicitud
// completa pero solo EVALUAR (aprobar/rechazar) sus propios ítems -- nunca
// los de otro Gestor en la misma solicitud.
//
// `priority`/`request_source` -- AVISO: columnas VARCHAR libres
// (`priority varchar(20)`, `request_source varchar(30)`), SIN catálogo FK
// ni whitelist server-side (`ServiceRequestController::headerValidationRules()`
// solo valida `string|max:N`). Los 4 valores de prioridad (LOW/MEDIUM/HIGH/
// CRITICAL) y el default de origen (PORTAL) se tomaron LITERALMENTE del
// Figma "Solicitud de Servicio" (fileKey pX6vqXxnJ66YSIYpE7v9pV, node
// 635:5846 en adelante) -- no están confirmados como catálogo canónico en
// Notion/esquema-bd, señalado como flag explícito en el resumen del lote.
export type ServiceRequestPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type AdminServiceStatus = {
  id: number
  code: string
  name: string
  sequence_order: number
  is_initial_status: boolean
  is_terminal_status: boolean
  is_system_status: boolean
  blocks_editing: boolean
}

// `service_item_statuses` (D-S10) -- catálogo SEPARADO de `service_statuses`,
// viabilidad de recolección de UN ítem individual.
export type AdminServiceItemStatus = {
  id: number
  code: string
  name: string
}

// GET /api/admin/cancellation-reasons -- ver
// `CancellationReasonController::index()`. Catálogo de solo lectura (D-S09),
// gateado por `service_requests.read` (NO `isPlatformStaff()`, ver docblock
// del controller) -- accesible a CUALQUIER actor ya autorizado a operar
// sobre Solicitudes de Servicio (p. ej. el Generador dueño que va a cancelar
// su propia solicitud), no solo platform staff. Cierre del GAP DE CONTRATO
// señalado en el resumen del lote anterior de wizard/detalle de Solicitudes
// de Servicio (2026-07-19) -- ver `fetchCancellationReasons()` y el selector
// ya habilitado en `ServiceRequestDetailScreen.tsx`. `is_other=true` exige
// `cancellation_details` no vacío (RN-SOL-009, ver
// `ServiceRequestController::cancel()`) -- la UI lo refleja como campo
// obligatorio solo cuando el motivo seleccionado tiene esta bandera.
export type AdminCancellationReason = {
  id: number
  code: string
  name: string
  is_other: boolean
  is_system: boolean
  is_active: boolean
}

// Ítem COMPLETO -- lo que ve el Generador dueño/platform staff siempre, y
// lo que ve un Gestor SOLO para sus propios ítems (`isEvaluableBy()`). Los
// snapshots (`waste_name_snapshot`/`waste_code_snapshot`/`treatment_snapshot`)
// son la copia congelada al crear el ítem -- las relaciones `waste`/
// `waste_treatment_approval` reflejan el estado ACTUAL (pueden divergir del
// snapshot si el residuo o la aprobación cambiaron después).
export type AdminServiceRequestItem = {
  id: number
  uuid: string
  service_request_id: number
  item_sequence: number
  waste_id: number
  waste_treatment_approval_id: number | null
  waste_name_snapshot: string
  waste_code_snapshot: string | null
  treatment_snapshot: string | null
  estimated_quantity: number | string | null
  actual_quantity: number | string | null
  estimated_weight: number | string | null
  actual_weight: number | string | null
  measurement_unit_id: number | null
  packaging_type: string | null
  physical_state_id: number | null
  is_stackable: boolean
  requires_forklift: boolean
  requires_isolation: boolean
  height: number | string | null
  width: number | string | null
  length: number | string | null
  calculated_volume: number | string | null
  item_status_id: number
  observations: string | null
  is_active: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  waste?: { id: number; name: string; code: string | null; organization_id: number }
  waste_treatment_approval?: {
    id: number
    organization: { id: number; legal_name: string }
    branch_treatment: { id: number; treatment: { id: number; name: string } | null } | null
  } | null
  item_status?: AdminServiceItemStatus
  measurement_unit?: AdminMeasurementUnit | null
  physical_state?: AdminPhysicalState | null
}

// Hallazgo Media (especialista-seguridad, revisión de
// `ServiceRequestController::show()`, 2026-07-19): un Gestor ajeno a un
// ítem lo ve REDUCIDO a esto (existencia sin identidad/cantidad/tratamiento)
// -- distinguir de `AdminServiceRequestItem` con `'waste_id' in item`
// (ver `isFullServiceRequestItem()` en ServiceRequestDetailScreen.tsx).
export type AdminServiceRequestItemReduced = {
  id: number
  item_sequence: number
}

export type AdminServiceRequest = {
  id: number
  uuid: string
  organization_id: number
  branch_id: number
  request_code: string
  service_status_id: number
  requested_at: string
  requested_collection_date: string | null
  estimated_ready_date: string | null
  scheduled_collection_date: string | null
  estimated_total_weight: number | string | null
  estimated_total_volume: number | string | null
  measurement_unit_id: number | null
  packaging_type: string | null
  requires_lift_platform: boolean
  requires_audit: boolean
  requires_photo_record: boolean
  requires_container_return: boolean
  estimated_height: number | string | null
  estimated_width: number | string | null
  estimated_length: number | string | null
  observations: string | null
  request_source: string
  priority: string
  requested_by: number | null
  cancellation_reason_id: number | null
  cancellation_details: string | null
  cancelled_by: number | null
  cancelled_at: string | null
  is_active: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  organization?: { id: number; legal_name: string }
  branch?: { id: number; name: string }
  service_status?: AdminServiceStatus
}

// GET /api/admin/service-requests/{id} -- ver docblock de
// `ServiceRequestController::show()`. `items` es POLIMÓRFICO según quién
// pregunta (ver `AdminServiceRequestItem`/`AdminServiceRequestItemReduced`
// arriba) -- `other_items_count` SOLO viene presente cuando la respuesta
// está reducida (un Gestor con ítems ajenos en la misma solicitud), nunca
// para el Generador dueño ni platform staff.
export type AdminServiceRequestDetail = Omit<AdminServiceRequest, 'organization' | 'branch' | 'service_status'> & {
  organization: { id: number; legal_name: string }
  branch: { id: number; name: string }
  service_status: AdminServiceStatus
  cancellation_reason: AdminCancellationReason | null
  measurement_unit: AdminMeasurementUnit | null
  requested_by_user?: { id: number; username: string } | null
  items: Array<AdminServiceRequestItem | AdminServiceRequestItemReduced>
  other_items_count?: number
}

export type ServiceRequestItemPayload = {
  waste_id: number
  waste_treatment_approval_id?: number
  estimated_quantity?: number
  measurement_unit_id?: number
  packaging_type?: string
  physical_state_id?: number
  is_stackable?: boolean
  requires_forklift?: boolean
  requires_isolation?: boolean
  height?: number
  width?: number
  length?: number
  calculated_volume?: number
  observations?: string
  metadata?: Record<string, unknown>
}

// POST /api/admin/service-requests -- ver `ServiceRequestController::store()`.
// `organization_id` SOLO se manda si el actor es platform staff (REQUERIDO
// en ese caso), mismo criterio que `CreateWastePayload`. `items` es
// OBLIGATORIO desde la creación (`required|array|min:1` en el backend) --
// a diferencia del wizard de Residuos, NO existe un Borrador de cabecera
// sin ítems: `ServiceRequestWizard.tsx` por eso solo llama a este endpoint
// al final del asistente (Paso 6), nunca progresivamente por paso.
export type CreateServiceRequestPayload = {
  organization_id?: number
  branch_id: number
  requested_collection_date?: string
  estimated_ready_date?: string
  estimated_total_weight?: number
  estimated_total_volume?: number
  measurement_unit_id?: number
  packaging_type?: string
  requires_lift_platform?: boolean
  requires_audit?: boolean
  requires_photo_record?: boolean
  requires_container_return?: boolean
  estimated_height?: number
  estimated_width?: number
  estimated_length?: number
  observations?: string
  request_source?: string
  priority?: string
  metadata?: Record<string, unknown>
  items: ServiceRequestItemPayload[]
}

// PUT /api/admin/service-requests/{id} -- ver `ServiceRequestController::update()`.
// SOLO campos de cabecera, y SOLO mientras `service_status.code === 'DRAFT'`
// -- el backend NO expone sync de ítems aquí (AVISO ya documentado en el
// docblock del controller), `items` no existe en este payload a propósito.
export type UpdateServiceRequestPayload = Partial<Omit<CreateServiceRequestPayload, 'organization_id' | 'items'>>

// POST /api/admin/service-requests/{id}/cancel -- ver
// `ServiceRequestController::cancel()`. `cancellation_reason_id` debe
// existir en `cancellation_reasons` (activo) -- poblado desde
// `fetchCancellationReasons({ activeOnly: true })` (gap de contrato ya
// cerrado, 2026-07-19, ver docblock de `AdminCancellationReason`).
export type CancelServiceRequestPayload = {
  cancellation_reason_id: number
  cancellation_details?: string
}

// POST .../items/{item}/approve -- `notes` opcional.
export type ApproveServiceRequestItemPayload = {
  notes?: string
}

// POST .../items/{item}/reject -- `notes` OBLIGATORIO (motivo del rechazo).
export type RejectServiceRequestItemPayload = {
  notes: string
}

// ---- Programación de Recolección (/api/admin/transport-schedules) --------
// Módulo Programación Logística, Fase 2a (D-PRG-01 a D-PRG-14, backend
// cerrado -- 1177 tests Pest, revisión de seguridad -- ver docblock completo
// de `TransportScheduleController`/`TransportSchedulePolicy`). Acceso DUAL
// SIMPLE (a diferencia de `AdminServiceRequest`, sin acceso cruzado):
// `organization_id` es SIEMPRE la organización que PROGRAMA (Gestor/
// Subgestor, o el Generador con doble rol GENERATOR+TRANSPORTER en
// autotransporte) -- mismo criterio tenant-vs-platform-staff que
// `AdminVehicle`/`AdminBranch`.
//
// GAP DE CONTRATO explícito (2026-07-19, ver resumen del lote): NO existe
// todavía un `TransportPersonnelController` (sin rutas `/api/admin/
// transport-personnel`, sin permiso `transport_personnel.*` sembrado en
// `PermissionSeeder`) NI un `TransportRouteController` (sin rutas `/api/
// admin/transport-routes`, `assignToRoute()` exige un `transport_route_id`
// que hoy no hay forma de listar ni crear desde el frontend). Ambos
// controllers quedan delegados al backend -- no se inventa un contrato de
// CRUD para ninguno de los dos. Efecto práctico: `transport_personnel_id`
// se captura como un campo numérico temporal en
// `CreateTransportScheduleForm.tsx` (sin selector real), y la agrupación en
// rutas (CU-059, "dispatch board") NO se construye en este lote.
export type AdminTransportStatus = {
  id: number
  code: string
  name: string
  description: string | null
  sort_order: number
  is_initial: boolean
  is_final: boolean
  requires_schedule: boolean
  requires_vehicle: boolean
  requires_load_manifest: boolean
  requires_unload_manifest: boolean
  color_hex: string | null
  icon: string | null
  is_active: boolean
}

// Fila de `GET /api/admin/transport-schedules` -- ver
// `TransportScheduleController::index()`, que eager-carga exactamente estas
// 5 relaciones (columnas mínimas cada una).
export type AdminTransportSchedule = {
  id: number
  uuid: string
  tenant_organization_id: number | null
  organization_id: number
  waste_service_request_id: number
  schedule_number: string
  source_branch_id: number
  destination_branch_id: number
  vehicle_id: number
  transport_personnel_id: number
  responsible_user_id: number | null
  scheduled_pickup_at: string
  pickup_window_start: string | null
  pickup_window_end: string | null
  priority: string
  estimated_weight_kg: number | string | null
  estimated_volume_m3: number | string | null
  planned_distance_km: number | string | null
  planned_duration_minutes: number | null
  requires_special_handling: boolean
  observations: string | null
  version_number: number
  parent_schedule_id: number | null
  is_active: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  organization?: { id: number; legal_name: string }
  waste_service_request?: { id: number; request_code: string }
  transport_status?: AdminTransportStatus
  vehicle?: { id: number; plate_number: string }
  source_branch?: { id: number; name: string }
  destination_branch?: { id: number; name: string }
}

// Ítem de la programación (`transport_schedule_items`) -- ver migración
// `create_transport_schedule_items_table` (esquema-bd).
export type AdminTransportScheduleItem = {
  id: number
  uuid: string
  transport_schedule_id: number
  waste_service_request_item_id: number
  waste_id: number
  scheduled_quantity: number | string
  measurement_unit_id: number | null
  estimated_weight_kg: number | string | null
  estimated_volume_m3: number | string | null
  container_quantity: number | null
  packaging_type: string | null
  length_cm: number | string | null
  width_cm: number | string | null
  height_cm: number | string | null
  requires_special_handling: boolean
  observations: string | null
  is_active: boolean
  metadata: Record<string, unknown> | null
  waste?: { id: number; name: string; code: string | null }
  measurement_unit?: AdminMeasurementUnit | null
}

// GET /api/admin/transport-schedules/{id} -- ver
// `TransportScheduleController::show()`. A diferencia de la fila de
// index(), TODAS las relaciones vienen SIEMPRE eager-cargadas.
// `transport_personnel.person` es la relación 1:1 real (ver docblock de
// `TransportPersonnel`) -- se tipa con el subconjunto mínimo de columnas de
// `Person` que la UI necesita, sin asumir un accessor `full_name` (Person no
// lo expone como atributo propio en esta relación, a diferencia de
// `AdminPersonInfo`).
export type AdminTransportScheduleDetail = Omit<
  AdminTransportSchedule,
  'organization' | 'waste_service_request' | 'transport_status' | 'vehicle' | 'source_branch' | 'destination_branch'
> & {
  organization: { id: number; legal_name: string }
  waste_service_request: { id: number; request_code: string; organization_id: number }
  transport_status: AdminTransportStatus
  source_branch: { id: number; name: string }
  destination_branch: { id: number; name: string }
  vehicle: AdminVehicle
  transport_personnel: {
    id: number
    license_number: string
    license_category: string | null
    has_hazmat_permit: boolean
    person: { id: number; first_name: string; last_name: string; document_number?: string }
  }
  responsible_user: { id: number; username: string } | null
  items: AdminTransportScheduleItem[]
  route_stop: { id: number; stop_sequence: number; transport_route: { id: number; route_code: string } } | null
}

export type TransportScheduleItemPayload = {
  waste_service_request_item_id: number
  scheduled_quantity: number
  measurement_unit_id?: number
  estimated_weight_kg?: number
  estimated_volume_m3?: number
  container_quantity?: number
  packaging_type?: string
  length_cm?: number
  width_cm?: number
  height_cm?: number
  requires_special_handling?: boolean
  observations?: string
  metadata?: Record<string, unknown>
}

// POST /api/admin/transport-schedules -- ver
// `TransportScheduleController::store()`/`headerValidationRules()`.
// `vehicle_id`/`transport_personnel_id` son OBLIGATORIOS desde la creación
// (D-PRG-03) -- a diferencia de `CreateServiceRequestPayload`, aquí NO existe
// un Borrador de "solo cabecera sin recursos". `organization_id` sigue el
// mismo criterio que `CreateVehiclePayload`: solo se manda si el actor es
// platform staff (REQUERIDO en ese caso), cualquier otro actor lo IGNORA
// server-side.
export type CreateTransportSchedulePayload = {
  organization_id?: number
  waste_service_request_id: number
  vehicle_id: number
  transport_personnel_id: number
  source_branch_id: number
  destination_branch_id: number
  scheduled_pickup_at: string
  pickup_window_start?: string
  pickup_window_end?: string
  priority?: string
  estimated_weight_kg?: number
  estimated_volume_m3?: number
  planned_distance_km?: number
  planned_duration_minutes?: number
  requires_special_handling?: boolean
  observations?: string
  responsible_user_id?: number
  metadata?: Record<string, unknown>
  items: TransportScheduleItemPayload[]
}

// PUT /api/admin/transport-schedules/{id} -- ver
// `TransportScheduleController::update()`. Editable SOLO mientras
// `transport_status.code` sea `BOR`/`PEND` (D-PRG-11, el backend responde
// 422 clave "transport_status" en cualquier otro estado) -- sin `items`
// (sync de ítems fuera de alcance, mismo AVISO que
// `UpdateServiceRequestPayload`) ni `waste_service_request_id` (inmutable
// tras crear).
export type UpdateTransportSchedulePayload = Partial<
  Omit<CreateTransportSchedulePayload, 'organization_id' | 'waste_service_request_id' | 'items'>
>

// POST /api/admin/transport-schedules/{id}/route -- ver
// `TransportScheduleController::assignToRoute()`. Ver
// `TransportRouteQuickAssign.tsx`/`TransportDispatchBoardScreen.tsx` para el
// consumidor real (cierre del gap de `TransportRouteController`, 2026-07-19).
export type AssignTransportScheduleToRoutePayload = {
  transport_route_id: number
  stop_sequence?: number
}

// ---- Conductores (/api/admin/transport-personnel) -------------------------
// Cierre del GAP DE CONTRATO señalado en el lote anterior (Módulo
// Programación Logística, Fase 2a, 2026-07-19) -- ver docblock completo de
// `TransportPersonnelController`/`TransportPersonnelPolicy`. Acceso DUAL,
// mismo patrón EXACTO que `AdminVehicle`: platform staff gestiona TODOS los
// conductores de cualquier organización; un admin de tenant (o LOGÍSTICA,
// solo lectura vía `transport_personnel.read`) gestiona solo los de su
// propia organización.
export type AdminTransportPersonnel = {
  id: number
  uuid: string
  organization_id: number
  person_id: number
  license_number: string | null
  license_category: string | null
  license_expiration_date: string | null
  has_hazmat_permit: boolean
  is_active: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  organization?: { id: number; legal_name: string }
  person?: { id: number; full_name: string; document_number: string }
}

// GET /api/admin/transport-personnel/{id} -- ver
// `TransportPersonnelController::show()`. A diferencia de la fila de
// index(), `person` viene SIEMPRE eager-cargada COMPLETA (sin allowlist de
// columnas) y se agregan `created_by`/`updated_by` ({id, username}).
export type AdminTransportPersonnelDetail = Omit<AdminTransportPersonnel, 'organization' | 'person'> & {
  organization: { id: number; legal_name: string }
  person: { id: number; first_name: string; last_name: string; full_name: string; document_number: string; email: string | null; phone: string | null }
  created_by: AdminActorRef | null
  updated_by: AdminActorRef | null
}

// POST /api/admin/transport-personnel -- ver
// `TransportPersonnelController::store()`/`validationRules()`. `person_id`
// debe pertenecer a la MISMA organización que registra al conductor
// (`people.organization_id`, columna DIRECTA -- distinta del pivote N:N
// `organization_contacts` que usa `ContactSearchResult`/`searchContacts()`,
// ver AVISO en `TransportPersonnelQuickSelect`/formulario de creación).
// `organization_id` solo se manda si el actor es platform staff (REQUERIDO
// en ese caso), mismo criterio que `CreateVehiclePayload`. `is_active`
// NUNCA viaja aquí -- el backend lo fuerza siempre a `true` en creación.
export type CreateTransportPersonnelPayload = {
  organization_id?: number
  person_id: number
  license_number?: string
  license_category?: string
  license_expiration_date?: string
  has_hazmat_permit?: boolean
  metadata?: Record<string, unknown>
}

// PUT /api/admin/transport-personnel/{id} -- mismos campos que
// `CreateTransportPersonnelPayload` MENOS `organization_id`/`person_id`
// (inmutables tras crear, el backend los ignora si vienen en el payload).
// `is_active` SÍ es editable aquí (a diferencia de `Vehicle`, que lo separa
// en `activate()`/`deactivate()` -- `transport_personnel` no tiene ese par
// de endpoints, ver docblock del controller).
export type UpdateTransportPersonnelPayload = Partial<
  Omit<CreateTransportPersonnelPayload, 'organization_id' | 'person_id'>
> & {
  is_active?: boolean
}

// ---- Rutas de Transporte (/api/admin/transport-routes) --------------------
// Cierre del GAP DE CONTRATO señalado en el lote anterior (CU-059
// "Agrupar por Zona/Ruta", 2026-07-19) -- ver docblock completo de
// `TransportRouteController`/`TransportRoutePolicy`. CRUD MÍNIMO a propósito
// (decisión de alcance del backend): solo index/show/store, SIN update()/
// cancel() -- `transport_routes` es hoy un contenedor simple sin workflow
// propio, editar/archivar una ruta queda diferido a un lote futuro.
export type AdminTransportRoute = {
  id: number
  uuid: string
  organization_id: number
  route_code: string
  name: string
  route_date: string | null
  observations: string | null
  is_active: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  stops_count?: number
  organization?: { id: number; legal_name: string }
}

export type AdminTransportRouteStop = {
  id: number
  uuid: string
  transport_route_id: number
  transport_schedule_id: number
  stop_sequence: number
  observations: string | null
  transport_schedule?: { id: number; schedule_number: string; organization_id: number }
}

// GET /api/admin/transport-routes/{id} -- ver
// `TransportRouteController::show()`. `stops` viene SIEMPRE eager-cargada
// con `transportSchedule:id,schedule_number,organization_id` anidado -- es
// la ÚNICA forma de saber qué `transport_schedules` ya están agrupados en
// esta ruta (no existe un conteo/lista separada).
export type AdminTransportRouteDetail = Omit<AdminTransportRoute, 'organization'> & {
  organization: { id: number; legal_name: string }
  stops: AdminTransportRouteStop[]
}

// POST /api/admin/transport-routes -- ver
// `TransportRouteController::store()`. `route_code` se genera SIEMPRE
// server-side (`RUTA-{org}-{random8}`), nunca se acepta del cliente --
// mismo criterio que `schedule_number` de `CreateTransportSchedulePayload`.
export type CreateTransportRoutePayload = {
  organization_id?: number
  name: string
  route_date?: string
  observations?: string
  metadata?: Record<string, unknown>
}

// ---- Manifiesto de Cargue (/api/admin/manifest-loads) ----------------------
// Módulo Manifiesto de Cargue, Fase 3 (backend cerrado -- 1247 tests Pest,
// hallazgo de seguridad ya cerrado -- ver docblock completo de
// `ManifestLoadController`/`ManifestLoadPolicy`/`ManifestLoadWorkflowService`/
// `ManifestLoadSignatureService`). Acceso DUAL NO SIMÉTRICO (a diferencia de
// `AdminTransportSchedule`, mismo criterio que `AdminServiceRequest`): AMBOS
// lados (`carrier_organization_id` -- el Gestor/transportador que programó el
// transporte -- y la organización Generadora dueña de `generator_branch_id`)
// pueden VER el manifiesto, pero SOLO el lado transportador puede
// generar/cancelar/iniciar tránsito; el Generador tiene solo lectura + firmar
// como GENERATOR (ver `ManifestLoadPolicy::manage()`/`::sign()`).
//
// Grafo cubierto por este controller (ver docblock de `ManifestLoadController`):
// Draft->(generate)->Generated->(sign, automático)->PartiallySigned/Signed
// ->(startTransit)->InTransit. Cancelled alcanzable SOLO desde
// Generated/PartiallySigned. `Received`/`Closed` pertenecen al ciclo del
// futuro `manifest_unloads` (Fase 5) -- el catálogo `manifest_statuses` los
// incluye (8 valores compartidos), pero nunca aparecen en un `manifest_load`.
export type AdminManifestStatus = {
  id: number
  code: string
  name: string
  description: string | null
  sort_order: number
  is_initial: boolean
  is_final: boolean
  color_hex: string | null
  icon: string | null
  is_active: boolean
}

// Fila de `GET /api/admin/manifest-loads` -- ver
// `ManifestLoadController::index()`, que eager-carga exactamente estas 5
// relaciones (columnas mínimas cada una).
export type AdminManifestLoad = {
  id: number
  uuid: string
  tenant_organization_id: number
  manifest_number: string
  transport_schedule_id: number
  generator_branch_id: number
  carrier_organization_id: number
  vehicle_id: number
  transport_personnel_id: number
  load_date: string
  load_started_at: string | null
  load_completed_at: string | null
  declared_total_weight_kg: number | string | null
  declared_total_volume_m3: number | string | null
  generator_signer_person_id: number
  generator_signed_at: string | null
  driver_signer_person_id: number
  driver_signed_at: string | null
  pdf_file_id: number | null
  observations: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  manifest_status?: AdminManifestStatus
  transport_schedule?: { id: number; schedule_number: string }
  carrier_organization?: { id: number; legal_name: string }
  generator_branch?: { id: number; name: string; organization_id: number }
  vehicle?: { id: number; plate_number: string }
}

// Ítem de carga (`manifest_load_items`) -- ver migración
// `create_manifest_load_items_table` (esquema-bd). Derivado automáticamente
// de un `transport_schedule_item` al crear el manifiesto -- no se selecciona
// a mano (ver docblock de `ManifestLoadController::store()`).
export type AdminManifestLoadItem = {
  id: number
  uuid: string
  manifest_load_id: number
  transport_schedule_item_id: number | null
  waste_id: number
  approved_treatment_id: number | null
  declared_quantity: number | string
  unit_of_measure: string
  actual_weight_kg: number | string | null
  actual_volume_m3: number | string | null
  container_quantity: number | null
  packaging_type: string | null
  internal_container_code: string | null
  packaging_condition: string | null
  transport_approved: boolean
  special_handling_required: boolean
  observations: string | null
  line_number: number
  is_active: boolean
  waste?: { id: number; name: string; code: string | null }
}

// GET /api/admin/manifest-loads/{id} -- ver `ManifestLoadController::show()`.
// A diferencia de la fila de `index()`, TODAS las relaciones vienen SIEMPRE
// eager-cargadas, incluyendo los firmantes (`generator_signer_person`/
// `driver_signer_person`) que alimentan el panel de firmas de la UI.
export type AdminManifestLoadDetail = Omit<
  AdminManifestLoad,
  'manifest_status' | 'transport_schedule' | 'carrier_organization' | 'generator_branch' | 'vehicle'
> & {
  manifest_status: AdminManifestStatus
  transport_schedule: { id: number; schedule_number: string; organization_id: number }
  generator_branch: { id: number; name: string; organization_id: number }
  carrier_organization: { id: number; legal_name: string }
  vehicle: AdminVehicle
  transport_personnel: {
    id: number
    license_number: string | null
    license_category: string | null
    has_hazmat_permit: boolean
    person: { id: number; first_name: string; last_name: string }
  }
  generator_signer_person: { id: number; first_name: string; last_name: string; document_number?: string }
  driver_signer_person: { id: number; first_name: string; last_name: string; document_number?: string }
  items: AdminManifestLoadItem[]
}

// POST /api/admin/manifest-loads -- ver `ManifestLoadController::store()`. El
// resto de los campos (branch/carrier/vehicle/personnel/driver_signer/items)
// se derivan AUTOMÁTICAMENTE server-side del `transport_schedule_id` -- NO se
// aceptan independientes en este payload (ver docblock completo del
// controller). `generator_signer_person_id` es la ÚNICA persona que se elige
// a mano -- debe pertenecer a la organización Generadora dueña de la sede de
// origen de la programación (anti-IDOR server-side,
// `ManifestLoadController::assertPersonBelongsToOrganization()`).
export type CreateManifestLoadPayload = {
  transport_schedule_id: number
  generator_signer_person_id: number
  load_date?: string
  observations?: string
}

// POST .../sign -- ver `ManifestLoadController::sign()`/
// `ManifestLoadSignatureService`. Anti-IDOR fino por tipo de firmante ya
// resuelto server-side (`assertActorCanSign()`) -- el frontend solo oculta el
// botón cuyo lado no le corresponde al actor, sin duplicar esa validación.
export type SignManifestLoadPayload = {
  signer_type: 'GENERATOR' | 'DRIVER'
}

// ---- Muelles (/api/admin/branch-locations) --------------------------------
// Fase 4 "Cita de Recepción en Planta (bilateral)" -- CRUD MÍNIMO de
// "muelles" de una sede (ver docblock de la migración
// create_branch_locations_table: acotado a este subconjunto, el resto del
// DDL de canvas 2D de `esquema-bd` -- coordenadas/capacidad/riesgo/EPP -- se
// difiere a una feature futura con react-konva, NO se construye aquí).
export type AdminBranchLocation = {
  id: number
  uuid: string
  tenant_organization_id: number | null
  branch_id: number
  code: string
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
  branch?: { id: number; name: string; organization_id: number }
}

// GET /api/admin/branch-locations/{id} -- ver `BranchLocationController::show()`.
export type AdminBranchLocationDetail = Omit<AdminBranchLocation, 'branch'> & {
  branch: { id: number; name: string; organization_id: number }
  created_by: AdminActorRef | null
  updated_by: AdminActorRef | null
}

export type CreateBranchLocationPayload = {
  branch_id: number
  code: string
  name: string
}

// `branch_id` deliberadamente ausente -- NO editable tras creación (ver
// docblock de `BranchLocationController::update()`).
export type UpdateBranchLocationPayload = {
  code?: string
  name?: string
  is_active?: boolean
}

// ---- Solicitudes de Descargue (/api/admin/unload-requests) ----------------
// Fase 4 "Cita de Recepción en Planta (bilateral)" -- ver docblock completo
// de `UnloadRequestController`. Acceso DUAL NO SIMÉTRICO: el lado
// TRANSPORTADOR (`carrier_organization_id`) crea/envía; el lado RECEPTOR
// (dueño de `receiving_branch_id`) aprueba/rechaza. Grafo de 4 estados
// (`unload_request_statuses`, sin agregado por ítems): Draft->(submit)->
// Submitted->(approve)->Approved / ->(reject)->Rejected.
export type AdminUnloadRequestStatus = {
  id: number
  code: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'
  name: string
  sort_order: number
  is_initial: boolean
  is_final: boolean
  is_active: boolean
}

// Fila de `GET /api/admin/unload-requests` -- ver `UnloadRequestController::index()`,
// que eager-carga exactamente estas 4 relaciones (columnas mínimas cada una).
export type AdminUnloadRequest = {
  id: number
  uuid: string
  tenant_organization_id: number
  request_number: string
  receiving_branch_id: number
  manifest_load_id: number | null
  transport_schedule_id: number | null
  origin_branch_id: number | null
  carrier_organization_id: number | null
  vehicle_id: number | null
  transport_personnel_id: number | null
  service_modality: 'COLLECTION' | 'SELF_TRANSPORT'
  estimated_arrival_at: string | null
  priority: string
  rejection_reason: string | null
  transport_discrepancy_notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  unload_request_status?: AdminUnloadRequestStatus
  receiving_branch?: { id: number; name: string; organization_id: number }
  carrier_organization?: { id: number; legal_name: string } | null
  transport_schedule?: { id: number; schedule_number: string } | null
}

// Ítem de descargue (`unload_request_items`) -- ver migración
// create_unload_request_items_table (esquema-bd).
export type AdminUnloadRequestItem = {
  id: number
  uuid: string
  unload_request_id: number
  manifest_load_item_id: number | null
  waste_id: number
  requested_quantity: number | string
  unit_of_measure: string
  packaging_type: string | null
  line_number: number
  is_active: boolean
  waste?: { id: number; name: string; code: string | null }
}

// `plant_reception_schedules` -- ver docblock completo de
// `PlantReceptionScheduleService`. `status` VARCHAR libre (NO motor de
// Workflow genérico): PROPOSED -> (counterPropose, repetible) ->
// COUNTER_PROPOSED -> (confirm, por el lado CONTRARIO al último
// proponente) -> CONFIRMED -> (reschedule) -> SUPERSEDED + fila nueva
// PROPOSED con `parent_schedule_id` apuntando a esta.
export type AdminPlantReceptionSchedule = {
  id: number
  uuid: string
  tenant_organization_id: number
  unload_request_id: number
  receiving_branch_id: number
  dock_location_id: number | null
  scheduled_date: string
  scheduled_start_at: string
  scheduled_end_at: string
  proposed_by_role: 'LOGISTICS_COORDINATOR' | 'GENERATOR' | 'RECEPTION_COORDINATOR'
  proposed_by_user_id: number
  proposed_at: string
  counter_proposed_date: string | null
  counter_proposed_start_at: string | null
  counter_proposed_end_at: string | null
  counter_proposed_by: number | null
  counter_proposed_at: string | null
  confirmed_by: number | null
  confirmed_at: string | null
  status: 'PROPOSED' | 'COUNTER_PROPOSED' | 'CONFIRMED' | 'SUPERSEDED'
  reschedule_reason: string | null
  rejection_reason: string | null
  version_number: number
  parent_schedule_id: number | null
  is_active: boolean
  // Solo presente cuando el endpoint que la devuelve la eager-carga
  // explícitamente (`show()` la trae siempre; `propose()` solo trae
  // `dock_location`; `counterPropose()`/`confirm()`/`reschedule()` no traen
  // ninguna; el índice general `GET /api/admin/plant-reception-schedules` --
  // ver `AdminPlantReceptionScheduleAgendaRow` -- SIEMPRE trae las 4) -- el
  // caller no debe asumir que siempre vienen pobladas.
  dock_location?: { id: number; code: string; name: string } | null
  proposed_by_user?: { id: number; username: string } | null
  counter_proposed_by_user?: { id: number; username: string } | null
  confirmed_by_user?: { id: number; username: string } | null
}

// GET /api/admin/plant-reception-schedules?receiving_branch_id=&date_from=&date_to=&status=
// -- índice GENERAL por sede receptora (`PlantReceptionScheduleController::
// index()`), NO anidado bajo una `unload_request` puntual -- cierre del gap
// N+1 que documentaba el docblock de `PlantReceptionAgendaScreen.tsx` hasta
// 2026-07-20 (ese docblock ya NO aplica, ver el actual). `receiving_branch_id`
// es OBLIGATORIO en el query (ver AVISO en el controller sobre por qué). A
// diferencia de `AdminPlantReceptionSchedule` base (fila devuelta por los
// endpoints anidados, donde `dock_location`/`proposed_by_user` son
// opcionales según el endpoint), esta fila SIEMPRE trae las 4 relaciones
// eager-cargadas (aunque cualquiera puede ser `null` si esa etapa no
// aplicó) + `unload_request` anidado en su forma MÍNIMA ({id,
// request_number, receiving_branch_id, carrier_organization_id}) -- SIN
// `carrier_organization.legal_name`; el caller que necesite el nombre del
// transportador debe cruzar por `unload_request_id` con
// `fetchUnloadRequests()` (ver `PlantReceptionAgendaScreen.tsx`).
export type AdminPlantReceptionScheduleAgendaRow = AdminPlantReceptionSchedule & {
  dock_location: { id: number; code: string; name: string } | null
  proposed_by_user: { id: number; username: string } | null
  counter_proposed_by_user: { id: number; username: string } | null
  confirmed_by_user: { id: number; username: string } | null
  unload_request: {
    id: number
    request_number: string
    receiving_branch_id: number
    carrier_organization_id: number | null
  }
}

// GET /api/admin/unload-requests/{id} -- ver `UnloadRequestController::show()`.
// A diferencia de la fila de `index()`, TODAS las relaciones vienen SIEMPRE
// eager-cargadas.
export type AdminUnloadRequestDetail = Omit<
  AdminUnloadRequest,
  'unload_request_status' | 'receiving_branch' | 'carrier_organization' | 'transport_schedule'
> & {
  unload_request_status: AdminUnloadRequestStatus
  receiving_branch: { id: number; name: string; organization_id: number }
  manifest_load: { id: number; manifest_number: string } | null
  transport_schedule: { id: number; schedule_number: string; organization_id: number } | null
  origin_branch: { id: number; name: string; organization_id: number } | null
  carrier_organization: { id: number; legal_name: string } | null
  vehicle: { id: number; plate_number: string } | null
  transport_personnel: { id: number; person: { id: number; first_name: string; last_name: string } } | null
  items: AdminUnloadRequestItem[]
  // "Vigente" -- ver `UnloadRequest::activeReceptionSchedule()`. NULL si
  // todavía no se ha propuesto ninguna franja para esta solicitud.
  active_reception_schedule: AdminPlantReceptionSchedule | null
}

// POST /api/admin/unload-requests -- creación MANUAL, caso "anticipada"
// (D-RCP: `manifest_load_id`/`transport_schedule_id` NUNCA se aceptan del
// payload, ver docblock de `UnloadRequestController::store()`). La INMENSA
// mayoría de las filas nacen automáticamente al confirmar una
// `transport_schedule` (D-PRG-13) -- este payload cubre solo el caso
// excepcional.
export type CreateUnloadRequestPayload = {
  receiving_branch_id: number
  origin_branch_id?: number
  vehicle_id?: number
  transport_personnel_id?: number
  service_modality?: 'COLLECTION' | 'SELF_TRANSPORT'
  estimated_arrival_at?: string
  priority?: string
  carrier_organization_id?: number
  items: Array<{
    waste_id: number
    requested_quantity: number
    unit_of_measure?: string
    packaging_type?: string
  }>
}

export type RejectUnloadRequestPayload = {
  rejection_reason: string
}

// POST .../reception-schedule -- ver `PlantReceptionScheduleController::propose()`.
// Solo estos 4 campos (`slotValidationRules()`) -- el Figma de referencia
// (node 991:14338) muestra campos adicionales (Operador Responsable, Equipos
// de Seguridad, Instrucciones Especiales, notificación automática) que el
// backend real de este lote NO acepta -- se omiten a propósito (ver resumen
// del agente frontend-web), no se inventan.
export type ProposePlantReceptionSchedulePayload = {
  dock_location_id?: number
  scheduled_date: string
  scheduled_start_at: string
  scheduled_end_at: string
}

// POST .../counter-propose -- ver `PlantReceptionScheduleController::counterPropose()`.
// EXTENSIÓN PROPIA de este lote (sin frame de Figma -- el frame de
// referencia solo cubre el lado propuesta/confirmación, ver resumen del
// agente frontend-web): mismo lenguaje visual que `ProposePlantReceptionSchedulePayload`.
export type CounterProposePlantReceptionSchedulePayload = {
  counter_proposed_date: string
  counter_proposed_start_at: string
  counter_proposed_end_at: string
}

// POST .../reschedule -- ver `PlantReceptionScheduleController::reschedule()`.
export type ReschedulePlantReceptionSchedulePayload = ProposePlantReceptionSchedulePayload & {
  reschedule_reason: string
}

// ---- Autorizaciones de Transportador / "Modalidad 3" -----------------------
// (/api/admin/gestor-carrier-authorizations) -- ver docblock completo de
// `GestorCarrierAuthorizationController`. Relación BILATERAL (gestor,
// transportador), un solo registro VIGENTE por par, sin borrado físico
// (`revoke()` solo marca `is_active=false`).
export type AdminGestorCarrierAuthorization = {
  id: number
  uuid: string
  gestor_organization_id: number
  carrier_organization_id: number
  authorized_by: number | null
  authorized_at: string | null
  revoked_by: number | null
  revoked_at: string | null
  observations: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  gestor_organization?: { id: number; legal_name: string }
  carrier_organization?: { id: number; legal_name: string }
}

export type CreateGestorCarrierAuthorizationPayload = {
  carrier_organization_id: number
  observations?: string
  // Solo platform staff -- un tenant admin SIEMPRE autoriza desde SU PROPIA
  // organización (anti-role-smuggling, ver docblock del controller).
  gestor_organization_id?: number
}
