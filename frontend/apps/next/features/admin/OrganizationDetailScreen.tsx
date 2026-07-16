'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  ApiValidationError,
  activateOrganization,
  assignBusinessRoleToOrganization,
  deactivateOrganization,
  fetchBusinessRoles,
  fetchCountries,
  fetchOrganization,
  fetchOrganizationActivity,
  fetchOrganizationBranches,
  fetchOrganizationContacts,
  fetchOrganizationStatuses,
  fetchOrganizationUsers,
  revokeBusinessRoleFromOrganization,
  updateOrganization,
  type AdminBusinessRole,
  type AdminCountry,
  type AdminOrganizationContact,
  type AdminOrganizationDetail,
  type AdminOrganizationStatusOption,
  type AdminUser,
  type OrganizationBranch,
  type RiskLevel,
  type RoleActivityEvent,
} from 'app/features/admin/api'
import { COMPANY_SIZES, CURRENCIES, RISK_LEVELS, TIMEZONES } from 'app/features/admin/organizationCatalogs'
import { RISK_LEVEL_BAR_CLASSES, RISK_LEVEL_CLASSES, RISK_LEVEL_LABELS } from 'app/features/admin/riskLevel'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'
import { OrganizationContactsPanel } from './OrganizationContactsPanel'
import { OrganizationSearchSelect } from './OrganizationSearchSelect'

const RISK_LEVEL_ORDER: RiskLevel[] = ['bajo', 'medio', 'alto', 'critico']

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

function statusBadgeStyle(colorHex: string | null): React.CSSProperties {
  if (!colorHex) return {}
  return { backgroundColor: `${colorHex}26`, color: colorHex }
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

function MetricTile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-lg border border-border p-3', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  )
}

// CU "CRUD de Organizaciones vs. Figma" -- pantalla de detalle, EXCLUSIVA de
// platform staff (mismo gate que OrganizationsListScreen.tsx). Header con
// badges reales de Estado/Tipo(s) + Activar/Inactivar, card "Información
// General" SIEMPRE editable inline (mismo criterio ya documentado en
// RoleDetailScreen.tsx/UserDetailScreen.tsx: no existe un "modo edición"
// separado en este proyecto -- el botón "Editar" del header hace scroll
// hacia el formulario en vez de togglear un modo que no existe en ningún
// otro lado del código), sección "Tipos de Organización" con checkboxes
// assign/revoke, sidebar "Resumen" (Sedes/Contactos/Usuarios reales +
// barra de Nivel de Riesgo), Tabs Sedes/Contactos/Usuarios/Actividad con
// carga perezosa (mismo patrón de guarda de carrera ya documentado en
// RoleDetailScreen.tsx -- `xLoaded` se lee pero deliberadamente se omite
// de las dependencias del efecto, ver comentario ahí).
export function OrganizationDetailScreen({ organizationId }: { organizationId: number | string }) {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth(undefined, { requirePlatformStaff: true })
  const [organization, setOrganization] = useState<AdminOrganizationDetail | null>(null)
  const [countries, setCountries] = useState<AdminCountry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const infoCardRef = useRef<HTMLDivElement | null>(null)

  // Formulario de edición (sección "Información General")
  const [legalName, setLegalName] = useState('')
  const [tradeName, setTradeName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [companySize, setCompanySize] = useState('')
  const [employeeCount, setEmployeeCount] = useState('')
  const [economicActivityCode, setEconomicActivityCode] = useState('')
  const [economicActivityName, setEconomicActivityName] = useState('')
  const [environmentalAuthority, setEnvironmentalAuthority] = useState('')
  const [environmentalRegistration, setEnvironmentalRegistration] = useState('')
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('bajo')
  const [contractExpirationDate, setContractExpirationDate] = useState('')
  // Sobreescrito SIEMPRE por `org.organization_status_id` en cuanto
  // fetchOrganization() resuelve (ver efecto de carga abajo) -- el `0`
  // inicial nunca se renderiza (la pantalla muestra "Cargando…" hasta
  // entonces), a diferencia de CreateOrganizationForm.tsx (sin una
  // organización ya cargada de la cual tomar el default).
  const [organizationStatusId, setOrganizationStatusId] = useState<number>(0)
  const [organizationStatuses, setOrganizationStatuses] = useState<AdminOrganizationStatusOption[]>([])
  const [businessRoles, setBusinessRoles] = useState<AdminBusinessRole[]>([])
  const [businessRolesError, setBusinessRolesError] = useState<string | null>(null)
  const [timezone, setTimezone] = useState<string>(TIMEZONES[0])
  const [countryCode, setCountryCode] = useState('')
  const [currencyCode, setCurrencyCode] = useState<string>(CURRENCIES[0])
  const [storageQuotaGb, setStorageQuotaGb] = useState('')
  const [isActiveField, setIsActiveField] = useState(true)
  const [customFieldsEnabled, setCustomFieldsEnabled] = useState(true)
  const [observations, setObservations] = useState('')
  const [parentOrganizationId, setParentOrganizationId] = useState<number | null>(null)
  const [parentOrganizationLabel, setParentOrganizationLabel] = useState<string | null>(null)

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const [businessRoleError, setBusinessRoleError] = useState<string | null>(null)
  const [busyBusinessRoleId, setBusyBusinessRoleId] = useState<number | null>(null)

  const [activeTab, setActiveTab] = useState<'sedes' | 'contactos' | 'usuarios' | 'auditoria'>('sedes')

  const [branches, setBranches] = useState<OrganizationBranch[]>([])
  const [branchesLoaded, setBranchesLoaded] = useState(false)
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [branchesError, setBranchesError] = useState<string | null>(null)

  const [contacts, setContacts] = useState<AdminOrganizationContact[]>([])
  const [contactsLoaded, setContactsLoaded] = useState(false)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError, setContactsError] = useState<string | null>(null)
  // Sedes de ESTA organización, para poblar el selector "Sede" del panel de
  // Contactos y resolver el nombre en su columna "Sede" -- carga aparte de
  // `branches` (tab Sedes, paginado a 15) para no depender de que ese tab ya
  // se haya abierto: perPage alto porque el propósito aquí es una lista
  // completa para un <Select>, no una tabla paginada.
  const [contactBranchOptions, setContactBranchOptions] = useState<OrganizationBranch[]>([])

  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)

  const [activityEvents, setActivityEvents] = useState<RoleActivityEvent[]>([])
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    // `fetchOrganizationStatuses()` SIN `activeOnly` -- a diferencia del
    // filtro de OrganizationsListScreen.tsx, aquí el Select "Estado" debe
    // seguir mostrando el estado YA ASIGNADO a esta organización aunque ese
    // estado se haya desactivado después (si se filtrara solo activos, el
    // valor actual podría quedar fuera de las opciones del Select).
    Promise.all([
      fetchOrganization(organizationId),
      fetchCountries({ perPage: 300, status: 'active' }),
      fetchOrganizationStatuses(),
    ])
      .then(([orgResult, countriesResult, statusesResult]) => {
        if (cancelled) return
        const org = orgResult.organization
        setOrganization(org)
        setCountries(countriesResult.data)
        setOrganizationStatuses(statusesResult.data)
        setLegalName(org.legal_name)
        setTradeName(org.trade_name ?? '')
        setEmail(org.email ?? '')
        setPhone(org.phone ?? '')
        setWebsite(org.website ?? '')
        setBillingEmail(org.billing_email ?? '')
        setSupportEmail(org.support_email ?? '')
        setCompanySize(org.company_size ?? '')
        setEmployeeCount(org.employee_count != null ? String(org.employee_count) : '')
        setEconomicActivityCode(org.economic_activity_code ?? '')
        setEconomicActivityName(org.economic_activity_name ?? '')
        setEnvironmentalAuthority(org.environmental_authority ?? '')
        setEnvironmentalRegistration(org.environmental_registration ?? '')
        setRiskLevel(org.risk_level)
        setContractExpirationDate(org.contract_expiration_date ?? '')
        setOrganizationStatusId(org.organization_status_id)
        setTimezone(org.timezone)
        setCountryCode(org.country_code)
        setCurrencyCode(org.currency_code)
        setStorageQuotaGb(org.storage_quota_gb != null ? String(org.storage_quota_gb) : '')
        setIsActiveField(org.is_active)
        setCustomFieldsEnabled(org.custom_fields_enabled)
        setObservations(org.observations ?? '')
        setParentOrganizationId(org.parent_organization_id)
        setParentOrganizationLabel(org.parent_organization_id ? `Organización #${org.parent_organization_id}` : null)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, organizationId])

  // Catálogo "Tipos de Organización" (business_roles) -- cierra el gap que
  // antes resolvía BUSINESS_ROLES_FALLBACK (ver organizationCatalogs.ts). A
  // diferencia de organization-statuses (bloqueante para el Select "Estado"
  // del form), este catálogo solo alimenta la sección de checkboxes de más
  // abajo -- un fallo aquí no debe bloquear el resto de la pantalla (mismo
  // criterio que fetchDepartments()/fetchBusinessRoles() en
  // OrganizationsListScreen.tsx), pero SÍ se muestra el error para que el
  // usuario sepa por qué la lista de checkboxes está vacía.
  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    // Sin `activeOnly` por el mismo motivo que organization-statuses arriba
    // -- un business_role ya asignado (aunque se haya desactivado después)
    // debe seguir apareciendo marcado en la lista.
    fetchBusinessRoles()
      .then((result) => {
        if (cancelled) return
        setBusinessRoles(result.data)
      })
      .catch((error) => {
        if (cancelled) return
        setBusinessRolesError(error instanceof Error ? error.message : 'Error inesperado.')
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized])

  useEffect(() => {
    if (activeTab !== 'sedes' || branchesLoaded || !isAuthorized) return
    let cancelled = false
    setBranchesLoading(true)
    fetchOrganizationBranches(organizationId, { perPage: 15 })
      .then((result) => {
        if (cancelled) return
        setBranches(result.data)
        setBranchesLoaded(true)
        setBranchesError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setBranchesError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setBranchesLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver comentario del docblock (mismo patrón que RoleDetailScreen.tsx)
  }, [activeTab, isAuthorized, organizationId])

  function loadContacts() {
    let cancelled = false
    setContactsLoading(true)
    Promise.all([
      fetchOrganizationContacts(organizationId, { perPage: 15 }),
      fetchOrganizationBranches(organizationId, { perPage: 100 }),
    ])
      .then(([contactsResult, branchesResult]) => {
        if (cancelled) return
        setContacts(contactsResult.data)
        setContactBranchOptions(branchesResult.data)
        setContactsLoaded(true)
        setContactsError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setContactsError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setContactsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }

  useEffect(() => {
    if (activeTab !== 'contactos' || contactsLoaded || !isAuthorized) return
    return loadContacts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthorized, organizationId])

  useEffect(() => {
    if (activeTab !== 'usuarios' || usersLoaded || !isAuthorized) return
    let cancelled = false
    setUsersLoading(true)
    fetchOrganizationUsers(organizationId, { perPage: 15 })
      .then((result) => {
        if (cancelled) return
        setUsers(result.data)
        setUsersLoaded(true)
        setUsersError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setUsersError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthorized, organizationId])

  useEffect(() => {
    if (activeTab !== 'auditoria' || activityLoaded || !isAuthorized) return
    let cancelled = false
    setActivityLoading(true)
    fetchOrganizationActivity(organizationId, { perPage: 15 })
      .then((result) => {
        if (cancelled) return
        setActivityEvents(result.data)
        setActivityLoaded(true)
        setActivityError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setActivityError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthorized, organizationId])

  const assignedBusinessRoleNames = useMemo(() => new Set(organization?.type ?? []), [organization])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!organization) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { organization: updated } = await updateOrganization(organization.id, {
        legal_name: legalName,
        trade_name: tradeName || undefined,
        email: email || undefined,
        phone: phone || undefined,
        website: website || undefined,
        billing_email: billingEmail || undefined,
        support_email: supportEmail || undefined,
        company_size: companySize || undefined,
        employee_count: employeeCount ? Number(employeeCount) : undefined,
        economic_activity_code: economicActivityCode || undefined,
        economic_activity_name: economicActivityName || undefined,
        environmental_authority: environmentalAuthority || undefined,
        environmental_registration: environmentalRegistration || undefined,
        risk_level: riskLevel,
        contract_expiration_date: contractExpirationDate || undefined,
        organization_status_id: organizationStatusId,
        timezone,
        country_code: countryCode,
        currency_code: currencyCode,
        storage_quota_gb: storageQuotaGb ? Number(storageQuotaGb) : undefined,
        is_active: isActiveField,
        custom_fields_enabled: customFieldsEnabled,
        observations: observations || undefined,
        parent_organization_id: parentOrganizationId ?? undefined,
      })
      // `updateOrganization()` devuelve el shape base de AdminOrganization
      // (created_by como FK entera cruda -- ver docblock de
      // AdminOrganizationDetail.created_by en types.ts), NUNCA el
      // {id, username} que ya tenemos en pantalla desde fetchOrganization()
      // -- se preserva explícitamente el created_by ya cargado para no
      // perder ese dato en la UI.
      setOrganization((current) => (current ? { ...current, ...updated, created_by: current.created_by } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'legal_name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!organization) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { organization: updated } = organization.is_active
        ? await deactivateOrganization(organization.id)
        : await activateOrganization(organization.id)
      // Mismo criterio que handleSave: activate()/deactivate() devuelven
      // created_by como FK entera cruda -- se preserva el {id, username}
      // ya cargado.
      setOrganization((current) => (current ? { ...current, ...updated, created_by: current.created_by } : current))
      setIsActiveField(updated.is_active)
    } catch (error) {
      setToggleError(errorMessage(error, 'organization'))
    } finally {
      setIsTogglingActive(false)
    }
  }

  async function handleToggleBusinessRole(role: AdminBusinessRole) {
    if (!organization) return
    setBusinessRoleError(null)
    setBusyBusinessRoleId(role.id)
    const isAssigned = assignedBusinessRoleNames.has(role.name)
    try {
      if (isAssigned) {
        await revokeBusinessRoleFromOrganization(organization.id, role.id)
        setOrganization((current) =>
          current ? { ...current, type: current.type.filter((name) => name !== role.name) } : current
        )
      } else {
        await assignBusinessRoleToOrganization(organization.id, role.id)
        setOrganization((current) => (current ? { ...current, type: [...current.type, role.name] } : current))
      }
    } catch (error) {
      setBusinessRoleError(error instanceof Error ? error.message : 'Error inesperado.')
    } finally {
      setBusyBusinessRoleId(null)
    }
  }

  if (!isAuthorized || isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (loadError || !organization) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró la organización.'}
      </p>
    )
  }

  const primaryBranch = organization.primary_branch
  const cityLabel = primaryBranch?.municipality
    ? `${primaryBranch.municipality.name}${primaryBranch.department ? `, ${primaryBranch.department.name}` : ''}`
    : '—'

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <div className={cn('h-1.5 w-full', RISK_LEVEL_CLASSES[organization.risk_level].split(' ')[0])} />
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              {organization.legal_name.charAt(0).toUpperCase() || <Building2 className="size-5" aria-hidden="true" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{organization.legal_name}</CardTitle>
                {organization.type.map((typeName) => (
                  <Badge key={typeName} variant="outline">
                    {typeName}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{organization.tax_id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge style={statusBadgeStyle(organization.status.color_hex)}>{organization.status.name}</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => infoCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Editar
            </Button>
            <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
              {organization.is_active ? 'Inactivar' : 'Activar'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {toggleError && (
            <p className="text-sm text-destructive" role="alert">
              {toggleError}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <Card ref={infoCardRef}>
            <CardHeader>
              <CardTitle className="text-base">Información General</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="legalName">Razón Social</Label>
                  <Input id="legalName" value={legalName} onChange={(event) => setLegalName(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tradeName">Nombre Comercial</Label>
                  <Input id="tradeName" value={tradeName} onChange={(event) => setTradeName(event.target.value)} />
                </div>

                <InfoField label="NIT / Identificación">
                  {organization.tax_id} ({organization.tax_id_type})
                </InfoField>
                <InfoField label="País (sede principal)">
                  {primaryBranch?.department?.name ? countries.find((c) => c.iso_code === countryCode)?.name ?? countryCode : '—'}
                </InfoField>
                <InfoField label="Ciudad Principal (sede principal)">{cityLabel}</InfoField>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="website">Sitio Web</Label>
                  <Input id="website" value={website} onChange={(event) => setWebsite(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="billingEmail">Correo de Facturación</Label>
                  <Input
                    id="billingEmail"
                    type="email"
                    value={billingEmail}
                    onChange={(event) => setBillingEmail(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="supportEmail">Correo de Soporte</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={supportEmail}
                    onChange={(event) => setSupportEmail(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="companySize">Tamaño de la Empresa</Label>
                  <Select
                    items={COMPANY_SIZES.map((v) => ({ value: v, label: v }))}
                    value={companySize || null}
                    onValueChange={(v) => setCompanySize((v as string) ?? '')}
                  >
                    <SelectTrigger id="companySize">
                      <SelectValue placeholder="Selecciona un tamaño" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_SIZES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="employeeCount">Número de Empleados</Label>
                  <Input
                    id="employeeCount"
                    type="number"
                    min={0}
                    value={employeeCount}
                    onChange={(event) => setEmployeeCount(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="economicActivityCode">Código de Actividad Económica</Label>
                  <Input
                    id="economicActivityCode"
                    value={economicActivityCode}
                    onChange={(event) => setEconomicActivityCode(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="economicActivityName">Actividad Económica</Label>
                  <Input
                    id="economicActivityName"
                    value={economicActivityName}
                    onChange={(event) => setEconomicActivityName(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="environmentalAuthority">Autoridad Ambiental</Label>
                  <Input
                    id="environmentalAuthority"
                    value={environmentalAuthority}
                    onChange={(event) => setEnvironmentalAuthority(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="environmentalRegistration">Registro Ambiental</Label>
                  <Input
                    id="environmentalRegistration"
                    value={environmentalRegistration}
                    onChange={(event) => setEnvironmentalRegistration(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="riskLevel">Nivel de Riesgo</Label>
                  <Select
                    items={RISK_LEVELS.map((v) => ({ value: v, label: RISK_LEVEL_LABELS[v] }))}
                    value={riskLevel}
                    onValueChange={(v) => setRiskLevel(v as RiskLevel)}
                  >
                    <SelectTrigger id="riskLevel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RISK_LEVELS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {RISK_LEVEL_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="organizationStatusId">Estado</Label>
                  <Select
                    items={organizationStatuses.map((s) => ({ value: String(s.id), label: s.name }))}
                    value={String(organizationStatusId)}
                    disabled={organizationStatuses.length === 0}
                    onValueChange={(v) => setOrganizationStatusId(Number(v))}
                  >
                    <SelectTrigger id="organizationStatusId">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {organizationStatuses.map((option) => (
                        <SelectItem key={option.id} value={String(option.id)}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="contractExpirationDate">Vencimiento de Contrato</Label>
                  <Input
                    id="contractExpirationDate"
                    type="date"
                    value={contractExpirationDate}
                    onChange={(event) => setContractExpirationDate(event.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="countryCode">País</Label>
                  <Select
                    items={countries.map((c) => ({ value: c.iso_code, label: c.name }))}
                    value={countryCode || null}
                    onValueChange={(v) => setCountryCode((v as string) ?? '')}
                  >
                    <SelectTrigger id="countryCode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((country) => (
                        <SelectItem key={country.id} value={country.iso_code}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="timezone">Zona Horaria</Label>
                  <Select items={TIMEZONES.map((v) => ({ value: v, label: v }))} value={timezone} onValueChange={(v) => setTimezone(v as string)}>
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="currencyCode">Moneda</Label>
                  <Select items={CURRENCIES.map((v) => ({ value: v, label: v }))} value={currencyCode} onValueChange={(v) => setCurrencyCode(v as string)}>
                    <SelectTrigger id="currencyCode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="storageQuotaGb">Cuota de Almacenamiento (GB)</Label>
                  <Input
                    id="storageQuotaGb"
                    type="number"
                    min={0}
                    value={storageQuotaGb}
                    onChange={(event) => setStorageQuotaGb(event.target.value)}
                  />
                </div>

                <div className="sm:col-span-2">
                  <OrganizationSearchSelect
                    label="Organización Matriz"
                    htmlId="parentOrganization"
                    excludeId={organization.id}
                    selectedId={parentOrganizationId}
                    selectedLabel={parentOrganizationLabel}
                    onSelect={(result) => {
                      setParentOrganizationId(result.id)
                      setParentOrganizationLabel(`${result.legal_name} (${result.tax_id})`)
                    }}
                    onClear={() => {
                      setParentOrganizationId(null)
                      setParentOrganizationLabel(null)
                    }}
                  />
                </div>

                <div className="flex flex-col gap-2 sm:col-span-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="isActiveField"
                      checked={isActiveField}
                      onCheckedChange={(checked) => setIsActiveField(checked === true)}
                    />
                    <Label htmlFor="isActiveField" className="font-normal">
                      Organización activa
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="customFieldsEnabled"
                      checked={customFieldsEnabled}
                      onCheckedChange={(checked) => setCustomFieldsEnabled(checked === true)}
                    />
                    <Label htmlFor="customFieldsEnabled" className="font-normal">
                      Campos personalizados habilitados
                    </Label>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="observations">Observaciones</Label>
                  <textarea
                    id="observations"
                    className="min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={observations}
                    onChange={(event) => setObservations(event.target.value)}
                  />
                </div>

                <InfoField label="Fecha de Creación">{formatDate(organization.created_at)}</InfoField>
                <InfoField label="Creado Por">{organization.created_by?.username ?? '—'}</InfoField>

                {saveError && (
                  <p className="text-sm text-destructive sm:col-span-2" role="alert">
                    {saveError}
                  </p>
                )}
                {saveMessage && (
                  <p className="text-sm text-muted-foreground sm:col-span-2" role="status">
                    {saveMessage}
                  </p>
                )}

                <div className="flex justify-end sm:col-span-2">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Guardando…' : 'Guardar cambios'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tipos de Organización</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {businessRoleError && (
                <p className="text-sm text-destructive" role="alert">
                  {businessRoleError}
                </p>
              )}
              {businessRolesError && (
                <p className="text-sm text-destructive" role="alert">
                  {businessRolesError}
                </p>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {businessRoles.map((role) => (
                  <div key={role.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`org-business-role-${role.id}`}
                      checked={assignedBusinessRoleNames.has(role.name)}
                      disabled={busyBusinessRoleId === role.id}
                      onCheckedChange={() => handleToggleBusinessRole(role)}
                    />
                    <Label htmlFor={`org-business-role-${role.id}`} className="font-normal">
                      {role.name}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
                <TabsList>
                  <TabsTrigger value="sedes">Sedes</TabsTrigger>
                  <TabsTrigger value="contactos">Contactos</TabsTrigger>
                  <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
                  <TabsTrigger value="auditoria">Actividad</TabsTrigger>
                </TabsList>

                <TabsContent value="sedes" className="flex flex-col gap-3 pt-4">
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => router.push(`/admin/branches/new?organizationId=${organization.id}`)}
                    >
                      + Crear Sede
                    </Button>
                  </div>
                  {branchesError && (
                    <p className="text-sm text-destructive" role="alert">
                      {branchesError}
                    </p>
                  )}
                  {branchesLoading && !branchesLoaded ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      Cargando…
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Tipo de Sede</TableHead>
                            <TableHead>Dirección</TableHead>
                            <TableHead>Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {branches.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground">
                                Esta organización no tiene sedes registradas.
                              </TableCell>
                            </TableRow>
                          )}
                          {branches.map((branch) => (
                            <TableRow
                              key={branch.id}
                              className="cursor-pointer"
                              onClick={() => router.push(`/admin/branches/${branch.id}`)}
                            >
                              <TableCell>
                                <button
                                  type="button"
                                  className="text-left hover:underline"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    router.push(`/admin/branches/${branch.id}`)
                                  }}
                                >
                                  {branch.name}
                                </button>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{branch.branch_type?.name ?? '—'}</TableCell>
                              <TableCell className="text-muted-foreground">{branch.address ?? '—'}</TableCell>
                              <TableCell>
                                <Badge variant={branch.is_active ? 'default' : 'secondary'}>
                                  {branch.is_active ? 'Activa' : 'Inactiva'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="contactos" className="pt-4">
                  <OrganizationContactsPanel
                    organizationId={organization.id}
                    contacts={contacts}
                    isLoading={contactsLoading && !contactsLoaded}
                    loadError={contactsError}
                    branches={contactBranchOptions.map((branch) => ({ id: branch.id, name: branch.name }))}
                    onChanged={loadContacts}
                  />
                </TabsContent>

                <TabsContent value="usuarios" className="flex flex-col gap-3 pt-4">
                  {usersError && (
                    <p className="text-sm text-destructive" role="alert">
                      {usersError}
                    </p>
                  )}
                  {usersLoading && !usersLoaded ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      Cargando…
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Correo</TableHead>
                            <TableHead>Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground">
                                Esta organización no tiene usuarios registrados.
                              </TableCell>
                            </TableRow>
                          )}
                          {users.map((user) => (
                            <TableRow key={user.id}>
                              <TableCell>{user.person.full_name}</TableCell>
                              <TableCell className="text-muted-foreground">{user.email}</TableCell>
                              <TableCell>
                                <Badge variant={user.status.code === 'ACTIVE' ? 'default' : 'secondary'}>
                                  {user.status.name}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="auditoria" className="flex flex-col gap-3 pt-4">
                  {activityError && (
                    <p className="text-sm text-destructive" role="alert">
                      {activityError}
                    </p>
                  )}
                  {activityLoading && activityEvents.length === 0 && !activityLoaded ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      Cargando…
                    </p>
                  ) : activityEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>
                  ) : (
                    <ol className="flex flex-col gap-4 border-l border-border pl-4">
                      {activityEvents.map((event, index) => (
                        <li key={`${event.created_at}-${index}`} className="relative">
                          <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-primary" aria-hidden="true" />
                          <p className="text-sm">{event.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(event.created_at)}
                            {event.actor ? ` · ${event.actor.username}` : ''}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <MetricTile label="Sedes" value={String(organization.branches_count)} />
              <MetricTile label="Contactos" value={String(organization.contacts_count)} />
              <MetricTile className="col-span-2" label="Usuarios" value={String(organization.users_count)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nivel de Riesgo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex gap-1">
                {RISK_LEVEL_ORDER.map((level) => (
                  <div
                    key={level}
                    className={cn(
                      'h-2 flex-1 rounded-full bg-muted',
                      level === organization.risk_level && RISK_LEVEL_BAR_CLASSES[level]
                    )}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Riesgo actual</span>
                <Badge className={RISK_LEVEL_CLASSES[organization.risk_level]}>
                  {RISK_LEVEL_LABELS[organization.risk_level]}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
