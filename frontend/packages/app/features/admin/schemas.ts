import { z } from 'zod'
import { documentTypeOptions } from '../auth/schemas'
import { CURRENCIES, TAX_ID_TYPES, TIMEZONES } from './organizationCatalogs'
import { ORGANIZATIONAL_AREA_LEVELS, TREATMENT_RISK_LEVELS, TREATMENT_TYPES } from './types'

export { documentTypeOptions }

// POST /api/admin/users -- organization_id se omite a propósito (no hay UI
// de Organizaciones todavía, ver contrato del lote). Mecanismo de invitación
// (CU-006.1 modificado): store() YA NO acepta password/password_confirmation
// -- todo usuario nace PENDING_ACTIVATION y fija su propia contraseña al
// aceptar la invitación por correo (ver UserManagementController::store()).
export const createUserSchema = z.object({
  documentType: z.enum(['CC', 'CE', 'PA']),
  documentNumber: z.string().trim().min(1, 'Ingresa el número de documento.'),
  firstName: z.string().trim().min(1, 'Ingresa los nombres.'),
  lastName: z.string().trim().min(1, 'Ingresa los apellidos.'),
  middleName: z.string().trim().optional().or(z.literal('')),
  secondLastName: z.string().trim().optional().or(z.literal('')),
  username: z.string().trim().min(1, 'Ingresa un nombre de usuario.'),
  email: z.string().trim().email('Ingresa un correo válido.'),
  phone: z.string().trim().optional().or(z.literal('')),
  roleIds: z.array(z.number()).default([]),
})

export type CreateUserFormValues = z.infer<typeof createUserSchema>

// PUT /api/admin/users/{id} -- solo los 4 campos que la API acepta.
export const editUserSchema = z.object({
  firstName: z.string().trim().min(1, 'Ingresa los nombres.'),
  lastName: z.string().trim().min(1, 'Ingresa los apellidos.'),
  email: z.string().trim().email('Ingresa un correo válido.'),
  phone: z.string().trim().optional().or(z.literal('')),
})

export type EditUserFormValues = z.infer<typeof editUserSchema>

// Paso 1 del wizard "Crear Rol" -- code sin espacios (guion bajo como
// separador recomendado en el mockup).
export const roleCodePattern = /^[A-Za-z0-9_]+$/

export const roleGeneralInfoSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Ingresa un código.')
    .regex(roleCodePattern, 'Usa solo letras, números y guión bajo (_), sin espacios.'),
  name: z.string().trim().min(1, 'Ingresa un nombre.'),
  description: z.string().trim().optional().or(z.literal('')),
  templateRoleId: z.number().optional(),
})

export type RoleGeneralInfoValues = z.infer<typeof roleGeneralInfoSchema>

// Paso 2 -- priority_level como 5 opciones fijas (1=Dirección .. 5=Operación,
// mockup ya confirmado). Ningún toggle "Rol del Sistema" ni "Rol Activo": no
// existen vía API (ver contrato del lote, store() solo acepta
// code/name/description/priority_level).
export const priorityLevelOptions = [
  { value: 1, label: 'Dirección' },
  { value: 2, label: 'Gerencia' },
  { value: 3, label: 'Coordinación' },
  { value: 4, label: 'Supervisión' },
  { value: 5, label: 'Operación' },
] as const

export const roleConfigurationSchema = z.object({
  priorityLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
})

export type RoleConfigurationValues = z.infer<typeof roleConfigurationSchema>

// POST /api/admin/waste-streams -- ver WasteStreamController::store(). `name`
// es TEXT en BD (no VARCHAR(255)), 8 de las 179 filas reales del catálogo
// Basilea exceden 255 caracteres -- nunca agregar un `.max()` aquí.
// `tipo` es INMUTABLE tras crear (solo existe en este schema de creación,
// nunca en un schema de edición).
export const createWasteStreamSchema = z.object({
  code: z.string().trim().min(1, 'Ingresa un código.'),
  name: z.string().trim().min(1, 'Ingresa un nombre.'),
  tipo: z.enum(['Y', 'A']),
  description: z.string().trim().optional().or(z.literal('')),
  requiresManifest: z.boolean(),
  requiresSpecialTransport: z.boolean(),
})

export type CreateWasteStreamFormValues = z.infer<typeof createWasteStreamSchema>

// POST /api/admin/un-codes -- ver UnCodeController::store().
export const createUnCodeSchema = z.object({
  code: z.string().trim().min(1, 'Ingresa un código.'),
  name: z.string().trim().min(1, 'Ingresa un nombre.'),
  hazardClass: z.string().trim().optional().or(z.literal('')),
  packingGroup: z.string().trim().optional().or(z.literal('')),
})

export type CreateUnCodeFormValues = z.infer<typeof createUnCodeSchema>

// POST /api/admin/branch-types -- ver BranchTypeController::store(). Los 4
// flags de capacidad viajan siempre (default false vía checkbox sin
// marcar), mismo criterio que requiresManifest/requiresSpecialTransport en
// createWasteStreamSchema.
export const createBranchTypeSchema = z.object({
  code: z.string().trim().min(1, 'Ingresa un código.'),
  name: z.string().trim().min(1, 'Ingresa un nombre.'),
  category: z.string().trim().min(1, 'Ingresa una categoría.'),
  isLogistics: z.boolean(),
  isStorage: z.boolean(),
  isTreatment: z.boolean(),
  isDispatch: z.boolean(),
})

export type CreateBranchTypeFormValues = z.infer<typeof createBranchTypeSchema>

// POST /api/admin/organizational-areas -- ver OrganizationalAreaController::
// store(). `level` es un enum FIJO del backend (LEVELS = Dirección/
// Gerencia/Coordinación), no un catálogo editable -- z.enum valida contra
// esos 3 valores exactos, cualquier otro string ni siquiera llega al fetch.
// `organizationId`/`parentAreaId`/`responsiblePersonId` quedan opcionales
// aquí (el form decide si los manda según el actor y los selects
// disponibles) -- ninguno tiene endpoint de catálogo real para resolver
// nombres (ver AVISO en OrganizationalAreasListScreen.tsx), por eso viajan
// como IDs numéricos simples, no como selección validada contra una lista.
export const createOrganizationalAreaSchema = z.object({
  organizationId: z.number().int().positive().optional(),
  code: z.string().trim().min(1, 'Ingresa un código.'),
  name: z.string().trim().min(1, 'Ingresa un nombre.'),
  level: z.enum(ORGANIZATIONAL_AREA_LEVELS, { message: 'Selecciona un nivel.' }),
  parentAreaId: z.number().int().positive().optional(),
  responsiblePersonId: z.number().int().positive().optional(),
})

export type CreateOrganizationalAreaFormValues = z.infer<typeof createOrganizationalAreaSchema>

// PUT /api/admin/organizational-areas/{id} -- mismo enum de `level`, sin
// `organizationId` (inmutable tras crear).
export const editOrganizationalAreaSchema = z.object({
  code: z.string().trim().min(1, 'Ingresa un código.'),
  name: z.string().trim().min(1, 'Ingresa un nombre.'),
  level: z.enum(ORGANIZATIONAL_AREA_LEVELS, { message: 'Selecciona un nivel.' }),
  parentAreaId: z.number().int().positive().optional(),
  responsiblePersonId: z.number().int().positive().optional(),
})

export type EditOrganizationalAreaFormValues = z.infer<typeof editOrganizationalAreaSchema>

// POST /api/admin/hazard-characteristics -- ver
// HazardCharacteristicController::store(). `riskLevel` 1-9 (mayor = más
// peligroso, ver esquema-bd item 14) -- la UI deriva la etiqueta cualitativa
// a partir de este número (ver hazardRiskLevel.ts), nunca se pide como
// texto libre.
export const createHazardCharacteristicSchema = z.object({
  code: z.string().trim().min(1, 'Ingresa un código.'),
  name: z.string().trim().min(1, 'Ingresa un nombre.'),
  riskLevel: z.number().int().min(1, 'El nivel de riesgo debe estar entre 1 y 9.').max(9, 'El nivel de riesgo debe estar entre 1 y 9.'),
  description: z.string().trim().optional().or(z.literal('')),
})

export type CreateHazardCharacteristicFormValues = z.infer<typeof createHazardCharacteristicSchema>

// POST /api/admin/waste-categories -- ver WasteCategoryController::store().
export const createWasteCategorySchema = z.object({
  code: z.string().trim().min(1, 'Ingresa un código.'),
  name: z.string().trim().min(1, 'Ingresa un nombre.'),
  description: z.string().trim().optional().or(z.literal('')),
})

export type CreateWasteCategoryFormValues = z.infer<typeof createWasteCategorySchema>

// POST /api/admin/physical-states -- ver PhysicalStateController::store().
// El más simple de los 3 catálogos RESPEL (sin `description`).
export const createPhysicalStateSchema = z.object({
  code: z.string().trim().min(1, 'Ingresa un código.'),
  name: z.string().trim().min(1, 'Ingresa un nombre.'),
})

export type CreatePhysicalStateFormValues = z.infer<typeof createPhysicalStateSchema>

// POST /api/admin/packaging-types -- ver PackagingTypeController::store().
// Batch 3/3 (último) de Catálogos Maestros, el más simple de los 3 catálogos
// del lote (solo code/name, mismo shape que createPhysicalStateSchema).
export const createPackagingTypeSchema = z.object({
  code: z.string().trim().min(1, 'Ingresa un código.'),
  name: z.string().trim().min(1, 'Ingresa un nombre.'),
})

export type CreatePackagingTypeFormValues = z.infer<typeof createPackagingTypeSchema>

// POST /api/admin/packaging-conditions -- ver
// PackagingConditionController::store(). AVISO -- PROVISIONAL: catálogo sin
// fuente de negocio confirmada (ver AdminPackagingCondition en types.ts).
// `riskLevel` es OPCIONAL (a diferencia de createHazardCharacteristicSchema,
// donde `risk_level` es obligatorio) -- el backend valida `nullable`, así
// que un valor vacío se manda como `undefined`, nunca como `0` u otro
// entero fuera de rango.
export const createPackagingConditionSchema = z.object({
  code: z.string().trim().min(1, 'Ingresa un código.'),
  name: z.string().trim().min(1, 'Ingresa un nombre.'),
  riskLevel: z
    .number()
    .int()
    .min(1, 'El nivel de riesgo debe estar entre 1 y 9.')
    .max(9, 'El nivel de riesgo debe estar entre 1 y 9.')
    .optional(),
})

export type CreatePackagingConditionFormValues = z.infer<typeof createPackagingConditionSchema>

// POST /api/admin/vehicle-types -- ver VehicleTypeController::store(). AVISO
// -- PROVISIONAL: catálogo sin fuente de negocio confirmada (ver
// AdminVehicleType en types.ts). `category` es texto libre OPCIONAL (VARCHAR
// NULL, sin catálogo ni enum fijo detrás -- ver docblock del seeder).
export const createVehicleTypeSchema = z.object({
  code: z.string().trim().min(1, 'Ingresa un código.'),
  name: z.string().trim().min(1, 'Ingresa un nombre.'),
  category: z.string().trim().optional().or(z.literal('')),
})

export type CreateVehicleTypeFormValues = z.infer<typeof createVehicleTypeSchema>

// POST /api/admin/organizations -- ver OrganizationController::
// validationRules()/store(). `organizationStatusId`/`timezone`/
// `countryCode`/`currencyCode` son `required` en el backend (los otros 4
// campos `required` -- legalName/taxId/taxIdType -- se validan aparte). Sin
// `.max()` en `legalName`/`tradeName`: el backend sí valida `max:255`, pero
// ese límite se deja como validación server-side (422) en vez de duplicarlo
// aquí -- mismo criterio ya usado en el resto de este archivo para no
// arriesgar divergencia silenciosa si el backend cambia el límite.
export const createOrganizationSchema = z.object({
  legalName: z.string().trim().min(1, 'Ingresa la razón social.'),
  tradeName: z.string().trim().optional().or(z.literal('')),
  taxId: z.string().trim().min(1, 'Ingresa el NIT/identificación tributaria.'),
  taxIdType: z.enum(TAX_ID_TYPES, { message: 'Selecciona un tipo de identificación.' }),
  companySize: z.string().trim().optional().or(z.literal('')),
  employeeCount: z.number().int().min(0).optional(),
  parentOrganizationId: z.number().int().positive().optional(),
  customerSince: z.string().trim().optional().or(z.literal('')),
  economicActivityCode: z.string().trim().optional().or(z.literal('')),
  economicActivityName: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email('Ingresa un correo válido.').optional().or(z.literal('')),
  billingEmail: z.string().trim().email('Ingresa un correo válido.').optional().or(z.literal('')),
  supportEmail: z.string().trim().email('Ingresa un correo válido.').optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  website: z.string().trim().optional().or(z.literal('')),
  environmentalAuthority: z.string().trim().optional().or(z.literal('')),
  environmentalRegistration: z.string().trim().optional().or(z.literal('')),
  riskLevel: z.enum(['bajo', 'medio', 'alto', 'critico']).optional(),
  contractExpirationDate: z.string().trim().optional().or(z.literal('')),
  organizationStatusId: z.number().int().positive('Selecciona un estado.'),
  timezone: z.enum(TIMEZONES, { message: 'Selecciona una zona horaria.' }),
  countryCode: z.string().trim().min(1, 'Selecciona un país.'),
  currencyCode: z.enum(CURRENCIES, { message: 'Selecciona una moneda.' }),
  storageQuotaGb: z.number().min(0).optional(),
  isActive: z.boolean(),
  customFieldsEnabled: z.boolean(),
  observations: z.string().trim().optional().or(z.literal('')),
  businessRoleIds: z.array(z.number()).default([]),
})

export type CreateOrganizationFormValues = z.infer<typeof createOrganizationSchema>

// POST /api/admin/branches -- ver BranchController::store()/
// validationRules(). `organizationId` opcional aquí (el form solo lo llena
// si `user.is_platform_staff`, ver plan del lote); `code` sin `.max(50)`
// duplicado del backend por el mismo criterio ya usado en
// `createOrganizationSchema` (max:255 del backend no se duplica aquí).
export const createBranchSchema = z.object({
  organizationId: z.number().int().positive().optional(),
  branchTypeId: z.number().int().positive('Selecciona un tipo de sucursal.'),
  code: z.string().trim().min(1, 'Ingresa un código.'),
  name: z.string().trim().min(1, 'Ingresa un nombre.'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  countryId: z.number().int().positive().optional(),
  departmentId: z.number().int().positive().optional(),
  municipalityId: z.number().int().positive().optional(),
  localityId: z.number().int().positive().optional(),
  address: z.string().trim().optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email('Ingresa un correo válido.').optional().or(z.literal('')),
  environmentalLicense: z.string().trim().optional().or(z.literal('')),
  licenseExpirationDate: z.string().trim().optional().or(z.literal('')),
  operationalCapacity: z.number().min(0).optional(),
  observations: z.string().trim().optional().or(z.literal('')),
  isActive: z.boolean(),
})

export type CreateBranchFormValues = z.infer<typeof createBranchSchema>

// POST /api/admin/vehicles -- ver VehicleController::store()/
// validationRules(). `organizationId` opcional (el form solo lo llena si
// `user.is_platform_staff`, mismo criterio que `createBranchSchema`).
// `manufacturingYear` valida 4 dígitos (mismo `digits:4` del backend, sin
// acotar el rango real de años -- ese matiz se deja al 422 del servidor).
// `maxLoadCapacity` > 0 si se envía (RN-VEH-008, `min:0.01` en el backend).
// Sin `.max()` en `code`/`plateNumber`/`vin` -- los límites `max:50`/
// `max:20`/`max:100` del backend no se duplican aquí, mismo criterio ya
// usado en el resto de este archivo.
export const createVehicleSchema = z.object({
  organizationId: z.number().int().positive().optional(),
  branchId: z.number().int().positive().optional(),
  code: z.string().trim().optional().or(z.literal('')),
  plateNumber: z.string().trim().min(1, 'Ingresa la placa.'),
  vin: z.string().trim().optional().or(z.literal('')),
  vehicleTypeId: z.number().int().positive('Selecciona un tipo de vehículo.'),
  brand: z.string().trim().optional().or(z.literal('')),
  model: z.string().trim().optional().or(z.literal('')),
  manufacturingYear: z
    .number()
    .int()
    .min(1000, 'Ingresa un año de 4 dígitos.')
    .max(9999, 'Ingresa un año de 4 dígitos.')
    .optional(),
  maxLoadCapacity: z.number().min(0.01, 'La capacidad debe ser mayor a 0.').optional(),
  capacityUnit: z.string().trim().min(1, 'Ingresa una unidad.'),
  supportsHazmat: z.boolean(),
  hasGps: z.boolean(),
  soatExpirationDate: z.string().trim().optional().or(z.literal('')),
  technicalInspectionExpiration: z.string().trim().optional().or(z.literal('')),
})

export type CreateVehicleFormValues = z.infer<typeof createVehicleSchema>

// POST /api/admin/organizations/{id}/contacts -- rama "persona nueva" del
// diálogo "Crear Contacto" (ver OrganizationController::storeContact()).
export const createContactSchema = z.object({
  documentType: z.enum(['CC', 'CE', 'PA']),
  documentNumber: z.string().trim().min(1, 'Ingresa el número de documento.'),
  firstName: z.string().trim().min(1, 'Ingresa los nombres.'),
  lastName: z.string().trim().min(1, 'Ingresa los apellidos.'),
  email: z.string().trim().email('Ingresa un correo válido.').optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  branchId: z.number().int().positive().optional(),
  positionTitle: z.string().trim().optional().or(z.literal('')),
  relationshipType: z.enum(['Empleado', 'Consultor', 'Externo']).optional(),
  isPrimary: z.boolean(),
})

export type CreateContactFormValues = z.infer<typeof createContactSchema>

// POST /api/admin/organizations/{id}/contacts -- rama "existing_contact_id"
// del diálogo "Vincular Contacto Existente". `existingContactId` SIEMPRE
// proviene de `searchContacts()` (ver AVISO de seguridad en
// OrganizationContactsPanel.tsx), nunca de un input libre.
export const linkExistingContactSchema = z.object({
  existingContactId: z.number().int().positive('Selecciona un contacto.'),
  branchId: z.number().int().positive().optional(),
  positionTitle: z.string().trim().optional().or(z.literal('')),
  relationshipType: z.enum(['Empleado', 'Consultor', 'Externo']).optional(),
  isPrimary: z.boolean(),
})

export type LinkExistingContactFormValues = z.infer<typeof linkExistingContactSchema>

// POST /api/admin/treatments -- ver TreatmentController::store()/
// validationRules(). EXCLUSIVO de platform staff (el caller gatea el acceso
// a este formulario con `useRequireAuth('treatments.create', {
// requirePlatformStaff: true })`, mismo criterio que
// InvitationRequestsListScreen.tsx). `minTemperature`/`maxTemperature` solo
// tienen sentido para tratamientos térmicos -- opcionales aquí, el form los
// muestra en una sección colapsable, nunca obligatoria. Sin `.max()` en
// `code`/`name` -- el backend valida `max:50`/`max:255`, mismo criterio ya
// usado en el resto de este archivo para no duplicar ese límite.
export const createTreatmentSchema = z
  .object({
    code: z.string().trim().min(1, 'Ingresa un código.'),
    name: z.string().trim().min(1, 'Ingresa un nombre.'),
    description: z.string().trim().optional().or(z.literal('')),
    treatmentType: z.enum(TREATMENT_TYPES, { message: 'Selecciona un tipo de tratamiento.' }),
    requiresEnvironmentalLicense: z.boolean(),
    requiresSpecialTransport: z.boolean(),
    allowsRecovery: z.boolean(),
    requiresCertificate: z.boolean(),
    requiresWeightControl: z.boolean(),
    minTemperature: z.number().optional(),
    maxTemperature: z.number().optional(),
    temperatureUnit: z.string().trim().min(1, 'Ingresa una unidad.'),
    riskLevel: z.enum(TREATMENT_RISK_LEVELS, { message: 'Selecciona un nivel de riesgo.' }),
    estimatedProcessingTimeHours: z.number().min(0).optional(),
  })
  .refine((data) => data.maxTemperature === undefined || data.minTemperature === undefined || data.maxTemperature >= data.minTemperature, {
    message: 'La temperatura máxima debe ser mayor o igual a la mínima.',
    path: ['maxTemperature'],
  })

export type CreateTreatmentFormValues = z.infer<typeof createTreatmentSchema>

// POST /api/admin/branch-treatments -- ver
// BranchTreatmentController::store()/validationRules(). `organizationId`
// opcional aquí (el form solo lo llena si `user.is_platform_staff`, mismo
// criterio que `createVehicleSchema`) -- filtrado además por
// `capability=can_treat_waste` en el selector (RN-063, solo organizaciones
// Gestor). Sin `.max()` en `internalCode`/`operationalName`/
// `environmentalLicenseNumber` -- límites del backend no duplicados aquí,
// mismo criterio ya usado en el resto de este archivo.
export const createBranchTreatmentSchema = z
  .object({
    organizationId: z.number().int().positive().optional(),
    branchId: z.number().int().positive('Selecciona una sede.'),
    treatmentId: z.number().int().positive('Selecciona un tratamiento.'),
    internalCode: z.string().trim().optional().or(z.literal('')),
    operationalName: z.string().trim().optional().or(z.literal('')),
    maxCapacity: z.number().min(0).optional(),
    capacityUnit: z.string().trim().min(1, 'Ingresa una unidad.'),
    dailyCapacity: z.number().min(0).optional(),
    monthlyCapacity: z.number().min(0).optional(),
    environmentalLicenseNumber: z.string().trim().optional().or(z.literal('')),
    validFrom: z.string().trim().optional().or(z.literal('')),
    validUntil: z.string().trim().optional().or(z.literal('')),
    requiresManualApproval: z.boolean(),
    allowsMixedWaste: z.boolean(),
    requiresWeightValidation: z.boolean(),
    observations: z.string().trim().optional().or(z.literal('')),
  })
  .refine((data) => !data.validFrom || !data.validUntil || data.validUntil >= data.validFrom, {
    message: 'La fecha de vigencia final debe ser posterior o igual a la inicial.',
    path: ['validUntil'],
  })

// POST /api/admin/transport-schedules -- ver
// `TransportScheduleController::store()`/`headerValidationRules()`
// (Módulo Programación Logística, Fase 2a). `transportPersonnelId` es un
// campo numérico TEMPORAL (sin selector real) -- GAP DE CONTRATO explícito,
// ver AVISO en `AdminTransportScheduleDetail` (types.ts): no existe todavía
// un `TransportPersonnelController`. `items` exige al menos 1 elemento
// (D-PRG-03, mismo criterio que `waste_service_request_id`/`items` de
// `CreateServiceRequestPayload` -- sin Borrador de "solo cabecera").
export const createTransportScheduleSchema = z.object({
  organizationId: z.number().int().positive().optional(),
  wasteServiceRequestId: z.number().int().positive('Selecciona una solicitud de servicio.'),
  vehicleId: z.number().int().positive('Selecciona un vehículo.'),
  transportPersonnelId: z.number().int().positive('Ingresa el ID del conductor.'),
  sourceBranchId: z.number().int().positive('La solicitud de origen debe tener una sede.'),
  destinationBranchId: z.number().int().positive('Selecciona una sede de destino.'),
  scheduledPickupAt: z.string().trim().min(1, 'Ingresa la fecha y hora de recolección.'),
  pickupWindowStart: z.string().trim().optional().or(z.literal('')),
  pickupWindowEnd: z.string().trim().optional().or(z.literal('')),
  priority: z.string().trim().optional().or(z.literal('')),
  estimatedWeightKg: z.number().min(0).optional(),
  estimatedVolumeM3: z.number().min(0).optional(),
  plannedDistanceKm: z.number().min(0).optional(),
  plannedDurationMinutes: z.number().int().min(0).optional(),
  requiresSpecialHandling: z.boolean(),
  observations: z.string().trim().optional().or(z.literal('')),
  items: z
    .array(
      z.object({
        wasteServiceRequestItemId: z.number().int().positive(),
        scheduledQuantity: z.number().min(0, 'La cantidad programada debe ser mayor o igual a 0.'),
      })
    )
    .min(1, 'Selecciona al menos un ítem para programar.'),
})

export type CreateTransportScheduleFormValues = z.infer<typeof createTransportScheduleSchema>

export type CreateBranchTreatmentFormValues = z.infer<typeof createBranchTreatmentSchema>

// POST /api/admin/transport-personnel -- ver
// `TransportPersonnelController::store()`/`validationRules()` (cierre del
// GAP DE CONTRATO señalado en el lote anterior de Programación Logística,
// 2026-07-19). "Un conductor es una Person YA existente como contacto de la
// organización con cargo Conductor" (decisión de negocio verbatim) --
// `personId` SIEMPRE proviene de `ContactSearchSelect`/`searchContacts()`,
// nunca de un input libre (mismo criterio que `linkExistingContactSchema`).
// `licenseNumber`/`licenseCategory`/`licenseExpirationDate` son opcionales en
// el backend (`sometimes|nullable`) -- se dejan igual aquí, sin inventar
// obligatoriedad que el backend no exige.
export const createTransportPersonnelSchema = z.object({
  organizationId: z.number().int().positive().optional(),
  personId: z.number().int().positive('Selecciona un contacto.'),
  licenseNumber: z.string().trim().optional().or(z.literal('')),
  licenseCategory: z.string().trim().optional().or(z.literal('')),
  licenseExpirationDate: z.string().trim().optional().or(z.literal('')),
  hasHazmatPermit: z.boolean(),
})

export type CreateTransportPersonnelFormValues = z.infer<typeof createTransportPersonnelSchema>

// PUT /api/admin/transport-personnel/{id} -- ver
// `TransportPersonnelController::update()`. Mismos campos que
// `createTransportPersonnelSchema` MENOS `organizationId`/`personId`
// (inmutables tras crear) MÁS `isActive` (editable aquí, `transport_personnel`
// no tiene el par activate()/deactivate() dedicado que sí tiene `Vehicle`).
export const updateTransportPersonnelSchema = createTransportPersonnelSchema
  .omit({ organizationId: true, personId: true })
  .extend({ isActive: z.boolean() })

export type UpdateTransportPersonnelFormValues = z.infer<typeof updateTransportPersonnelSchema>

// POST /api/admin/manifest-loads -- ver `ManifestLoadController::store()`
// (Módulo Manifiesto de Cargue, Fase 3). El resto de los campos
// (branch/carrier/vehicle/personnel/driver_signer/items) se derivan
// AUTOMÁTICAMENTE server-side del `transportScheduleId` -- este formulario
// SOLO pide `generatorSignerPersonId` (vía `ContactSearchSelect`) y,
// opcionalmente, `loadDate`/`observations`.
export const createManifestLoadSchema = z.object({
  transportScheduleId: z.number().int().positive(),
  generatorSignerPersonId: z.number().int().positive('Selecciona el firmante del Generador.'),
  loadDate: z.string().trim().optional().or(z.literal('')),
  observations: z.string().trim().optional().or(z.literal('')),
})

export type CreateManifestLoadFormValues = z.infer<typeof createManifestLoadSchema>
