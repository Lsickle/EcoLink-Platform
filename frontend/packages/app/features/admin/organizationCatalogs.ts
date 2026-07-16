// Catálogos fijos del formulario de Organizaciones -- copiados EXACTOS de
// las constantes privadas de OrganizationController (TAX_ID_TYPES/
// COMPANY_SIZES/RISK_LEVELS/TIMEZONES/CURRENCIES), validadas ahí con
// `Rule::in([...])` contra un array fijo, SIN tabla propia en BD (ver
// docblock de la clase). No agregar/quitar valores aquí sin sincronizar con
// el backend -- un valor fuera de esta lista es rechazado con 422.

export const TAX_ID_TYPES = ['NIT', 'CC', 'CE', 'Pasaporte', 'Tax ID'] as const
export type TaxIdType = (typeof TAX_ID_TYPES)[number]

export const COMPANY_SIZES = ['Micro', 'Pequeña', 'Mediana', 'Grande'] as const
export type CompanySize = (typeof COMPANY_SIZES)[number]

// `RISK_LEVELS` reutiliza el tipo `RiskLevel`/`RISK_LEVEL_LABELS`/
// `RISK_LEVEL_CLASSES`/`RISK_LEVEL_BAR_CLASSES` YA EXISTENTES en
// riskLevel.ts (bajo/medio/alto/critico) -- no se duplica la paleta aquí,
// solo se re-exporta el array de valores para poblar el Select del form.
export const RISK_LEVELS = ['bajo', 'medio', 'alto', 'critico'] as const

export const TIMEZONES = ['America/Bogota', 'America/Mexico_City', 'America/New_York', 'UTC'] as const
export type OrganizationTimezone = (typeof TIMEZONES)[number]

export const CURRENCIES = ['COP', 'USD', 'EUR'] as const
export type CurrencyCode = (typeof CURRENCIES)[number]

// Gap de backend CERRADO (2026-07-15): las constantes `BUSINESS_ROLES_
// FALLBACK`/`ORGANIZATION_STATUSES_FALLBACK` que vivían aquí (ids 1-5
// asumidos del orden del seeder, ver historial de este archivo) se
// eliminaron -- ahora existen `GET /api/admin/business-roles` y
// `GET /api/admin/organization-statuses` (mismo gate `isPlatformStaff()`,
// solo lectura, ordenados por `sort_order`). Usar `fetchBusinessRoles()`/
// `fetchOrganizationStatuses()` de `app/features/admin/api` en su lugar --
// ver OrganizationsListScreen.tsx/OrganizationDetailScreen.tsx/
// CreateOrganizationForm.tsx para el patrón de carga (useEffect + estado
// local, mismo criterio que fetchRoles()/fetchPermissions() en
// RoleDetailScreen.tsx).
