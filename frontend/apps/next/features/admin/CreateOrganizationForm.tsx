'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ApiValidationError,
  createOrganization,
  fetchBusinessRoles,
  fetchCountries,
  fetchOrganizationStatuses,
  type AdminBusinessRole,
  type AdminCountry,
  type AdminOrganizationStatusOption,
} from 'app/features/admin/api'
import { COMPANY_SIZES, CURRENCIES, RISK_LEVELS, TAX_ID_TYPES, TIMEZONES } from 'app/features/admin/organizationCatalogs'
import { RISK_LEVEL_LABELS } from 'app/features/admin/riskLevel'
import { createOrganizationSchema } from 'app/features/admin/schemas'
import { useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from './OrganizationSearchSelect'

type FieldErrors = Partial<
  Record<
    | 'legalName'
    | 'taxId'
    | 'taxIdType'
    | 'email'
    | 'billingEmail'
    | 'supportEmail'
    | 'organizationStatusId'
    | 'timezone'
    | 'countryCode'
    | 'currencyCode',
    string
  >
>

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>
}

// Formulario de creación (POST /api/admin/organizations) -- las 6 secciones
// del mockup de Figma mapeadas a los campos reales de `organizations` (ver
// OrganizationController::validationRules()). Sin campo de logo (diferido,
// sin infraestructura de archivos aún -- ver plan del lote). Pantalla
// EXCLUSIVA de platform staff, mismo gate que OrganizationsListScreen.tsx.
export function CreateOrganizationForm() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth(undefined, { requirePlatformStaff: true })

  const [countries, setCountries] = useState<AdminCountry[]>([])
  const [businessRoles, setBusinessRoles] = useState<AdminBusinessRole[]>([])
  const [organizationStatuses, setOrganizationStatuses] = useState<AdminOrganizationStatusOption[]>([])
  const [catalogsLoading, setCatalogsLoading] = useState(true)
  const [catalogsError, setCatalogsError] = useState<string | null>(null)

  // Sección 1 -- Información básica
  const [legalName, setLegalName] = useState('')
  const [tradeName, setTradeName] = useState('')
  const [taxId, setTaxId] = useState('')
  const [taxIdType, setTaxIdType] = useState<string>(TAX_ID_TYPES[0])
  const [companySize, setCompanySize] = useState<string>('')
  const [employeeCount, setEmployeeCount] = useState('')

  // Sección 2 -- Actividad económica / ambiental
  const [economicActivityCode, setEconomicActivityCode] = useState('')
  const [economicActivityName, setEconomicActivityName] = useState('')
  const [environmentalAuthority, setEnvironmentalAuthority] = useState('')
  const [environmentalRegistration, setEnvironmentalRegistration] = useState('')

  // Sección 3 -- Contacto
  const [email, setEmail] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const [supportEmail, setSupportEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')

  // Sección 4 -- Comercial
  const [customerSince, setCustomerSince] = useState('')
  const [contractExpirationDate, setContractExpirationDate] = useState('')
  const [riskLevel, setRiskLevel] = useState<string>('bajo')
  // `null` hasta que fetchOrganizationStatuses() resuelva -- a diferencia de
  // OrganizationDetailScreen.tsx (que siempre tiene un
  // org.organization_status_id ya asignado que sobreescribe el valor
  // inicial), aquí no hay ninguna organización todavía de la cual tomar un
  // default: se fija al primer estado del catálogo (ya ordenado por
  // sort_order en el backend) en cuanto el fetch resuelve, ver efecto abajo.
  const [organizationStatusId, setOrganizationStatusId] = useState<number | null>(null)
  const [parentOrganizationId, setParentOrganizationId] = useState<number | null>(null)
  const [parentOrganizationLabel, setParentOrganizationLabel] = useState<string | null>(null)

  // Sección 5 -- Configuración regional
  const [timezone, setTimezone] = useState<string>(TIMEZONES[0])
  const [countryCode, setCountryCode] = useState('')
  const [currencyCode, setCurrencyCode] = useState<string>(CURRENCIES[0])
  const [storageQuotaGb, setStorageQuotaGb] = useState('')

  // Sección 6 -- Tipo de organización / configuración adicional
  const [businessRoleIds, setBusinessRoleIds] = useState<number[]>([])
  const [isActive, setIsActive] = useState(true)
  const [customFieldsEnabled, setCustomFieldsEnabled] = useState(true)
  const [observations, setObservations] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isAuthorized) return
    fetchCountries({ perPage: 300, status: 'active' })
      .then((result) => {
        setCountries(result.data)
        setCountryCode((current) => current || result.data[0]?.iso_code || '')
      })
      .catch(() => setCountries([]))
  }, [isAuthorized])

  // Catálogos "Tipo de Organización" (business_roles) y "Estado"
  // (organization_statuses) -- cierran el gap que antes resolvían
  // BUSINESS_ROLES_FALLBACK/ORGANIZATION_STATUSES_FALLBACK (ver
  // organizationCatalogs.ts). Solo `active_only=1` aquí: un formulario de
  // CREACIÓN no tiene ningún motivo para ofrecer un estado/tipo ya
  // desactivado como opción nueva (a diferencia de OrganizationDetailScreen.
  // tsx, que sí necesita poder seguir mostrando un valor ya asignado aunque
  // se haya desactivado después). A diferencia del catálogo de países
  // (best-effort, un fallo no bloquea nada), `organization_status_id` es
  // `required` en el backend -- un fallo aquí SÍ debe impedir el envío
  // (ver catalogsError/deshabilitado del Select y del botón "Crear
  // Organización" más abajo).
  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    setCatalogsLoading(true)
    Promise.all([fetchBusinessRoles({ activeOnly: true }), fetchOrganizationStatuses({ activeOnly: true })])
      .then(([businessRolesResult, statusesResult]) => {
        if (cancelled) return
        setBusinessRoles(businessRolesResult.data)
        setOrganizationStatuses(statusesResult.data)
        setOrganizationStatusId((current) => current ?? statusesResult.data[0]?.id ?? null)
        setCatalogsError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setCatalogsError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setCatalogsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized])

  function toggleBusinessRole(roleId: number) {
    setBusinessRoleIds((current) => (current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = createOrganizationSchema.safeParse({
      legalName,
      tradeName,
      taxId,
      taxIdType,
      companySize,
      employeeCount: employeeCount ? Number(employeeCount) : undefined,
      parentOrganizationId: parentOrganizationId ?? undefined,
      customerSince,
      economicActivityCode,
      economicActivityName,
      email,
      billingEmail,
      supportEmail,
      phone,
      website,
      environmentalAuthority,
      environmentalRegistration,
      riskLevel,
      contractExpirationDate,
      // `?? 0` -- fuerza el mensaje amigable "Selecciona un estado." de
      // `createOrganizationSchema` (z.number().int().positive(...)) en vez
      // de un error de tipo genérico si el catálogo todavía no cargó o
      // falló (ver catalogsError/deshabilitado del botón de envío abajo,
      // que en la práctica ya evita llegar aquí con `null`).
      organizationStatusId: organizationStatusId ?? 0,
      timezone,
      countryCode,
      currencyCode,
      storageQuotaGb: storageQuotaGb ? Number(storageQuotaGb) : undefined,
      isActive,
      customFieldsEnabled,
      observations,
      businessRoleIds,
    })

    if (!parsed.success) {
      const errors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors
        errors[key] ??= issue.message
      }
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const { organization: created } = await createOrganization({
        legal_name: parsed.data.legalName,
        trade_name: parsed.data.tradeName || undefined,
        tax_id: parsed.data.taxId,
        tax_id_type: parsed.data.taxIdType,
        company_size: parsed.data.companySize || undefined,
        employee_count: parsed.data.employeeCount,
        parent_organization_id: parsed.data.parentOrganizationId,
        customer_since: parsed.data.customerSince || undefined,
        economic_activity_code: parsed.data.economicActivityCode || undefined,
        economic_activity_name: parsed.data.economicActivityName || undefined,
        email: parsed.data.email || undefined,
        billing_email: parsed.data.billingEmail || undefined,
        support_email: parsed.data.supportEmail || undefined,
        phone: parsed.data.phone || undefined,
        website: parsed.data.website || undefined,
        environmental_authority: parsed.data.environmentalAuthority || undefined,
        environmental_registration: parsed.data.environmentalRegistration || undefined,
        risk_level: parsed.data.riskLevel,
        contract_expiration_date: parsed.data.contractExpirationDate || undefined,
        organization_status_id: parsed.data.organizationStatusId,
        timezone: parsed.data.timezone,
        country_code: parsed.data.countryCode,
        currency_code: parsed.data.currencyCode,
        storage_quota_gb: parsed.data.storageQuotaGb,
        is_active: parsed.data.isActive,
        custom_fields_enabled: parsed.data.customFieldsEnabled,
        observations: parsed.data.observations || undefined,
        business_role_ids: parsed.data.businessRoleIds,
      })
      router.push(`/admin/organizations/${created.id}`)
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFormError(error.firstError('tax_id') ?? error.firstError('legal_name') ?? error.message)
      } else {
        setFormError(error instanceof Error ? error.message : 'Error inesperado.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="text-xl">Crear Organización</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-4">
            <SectionHeading>Información básica</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="legalName">Razón Social</Label>
                <Input
                  id="legalName"
                  value={legalName}
                  onChange={(event) => setLegalName(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.legalName)}
                />
                {fieldErrors.legalName && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.legalName}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tradeName">
                  Nombre Comercial <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="tradeName" value={tradeName} onChange={(event) => setTradeName(event.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="taxId">NIT / Identificación Tributaria</Label>
                <Input
                  id="taxId"
                  value={taxId}
                  onChange={(event) => setTaxId(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.taxId)}
                />
                {fieldErrors.taxId && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.taxId}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="taxIdType">Tipo de Identificación</Label>
                <Select items={TAX_ID_TYPES.map((v) => ({ value: v, label: v }))} value={taxIdType} onValueChange={(v) => setTaxIdType(v as string)}>
                  <SelectTrigger id="taxIdType" className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAX_ID_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">No se puede modificar después.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="companySize">
                  Tamaño de la Empresa <span className="text-muted-foreground">(opcional)</span>
                </Label>
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
                <Label htmlFor="employeeCount">
                  Número de Empleados <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="employeeCount"
                  type="number"
                  min={0}
                  value={employeeCount}
                  onChange={(event) => setEmployeeCount(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Actividad económica y ambiental</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="economicActivityCode">
                  Código de Actividad Económica <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="economicActivityCode"
                  value={economicActivityCode}
                  onChange={(event) => setEconomicActivityCode(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="economicActivityName">
                  Actividad Económica <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="economicActivityName"
                  value={economicActivityName}
                  onChange={(event) => setEconomicActivityName(event.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="environmentalAuthority">
                  Autoridad Ambiental <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="environmentalAuthority"
                  value={environmentalAuthority}
                  onChange={(event) => setEnvironmentalAuthority(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="environmentalRegistration">
                  Registro Ambiental <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="environmentalRegistration"
                  value={environmentalRegistration}
                  onChange={(event) => setEnvironmentalRegistration(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Contacto</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">
                  Correo Electrónico <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.email)}
                />
                {fieldErrors.email && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.email}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">
                  Teléfono <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="billingEmail">
                  Correo de Facturación <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="billingEmail"
                  type="email"
                  value={billingEmail}
                  onChange={(event) => setBillingEmail(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.billingEmail)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="supportEmail">
                  Correo de Soporte <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="supportEmail"
                  type="email"
                  value={supportEmail}
                  onChange={(event) => setSupportEmail(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.supportEmail)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="website">
                Sitio Web <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input id="website" value={website} onChange={(event) => setWebsite(event.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Comercial</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customerSince">
                  Cliente Desde <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="customerSince"
                  type="date"
                  value={customerSince}
                  onChange={(event) => setCustomerSince(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contractExpirationDate">
                  Vencimiento de Contrato <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="contractExpirationDate"
                  type="date"
                  value={contractExpirationDate}
                  onChange={(event) => setContractExpirationDate(event.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="riskLevel">Nivel de Riesgo</Label>
                <Select
                  items={RISK_LEVELS.map((v) => ({ value: v, label: RISK_LEVEL_LABELS[v] }))}
                  value={riskLevel}
                  onValueChange={(v) => setRiskLevel(v as string)}
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
                  value={organizationStatusId !== null ? String(organizationStatusId) : null}
                  disabled={catalogsLoading || organizationStatuses.length === 0}
                  onValueChange={(v) => setOrganizationStatusId(v !== null ? Number(v) : null)}
                >
                  <SelectTrigger id="organizationStatusId">
                    <SelectValue placeholder={catalogsLoading ? 'Cargando…' : 'Selecciona un estado'} />
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
            </div>
            <OrganizationSearchSelect
              label="Organización Matriz (opcional)"
              htmlId="parentOrganization"
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

          <div className="flex flex-col gap-4">
            <SectionHeading>Configuración regional</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="countryCode">País</Label>
                <Select
                  items={countries.map((c) => ({ value: c.iso_code, label: c.name }))}
                  value={countryCode || null}
                  onValueChange={(v) => setCountryCode((v as string) ?? '')}
                >
                  <SelectTrigger id="countryCode" aria-invalid={Boolean(fieldErrors.countryCode)}>
                    <SelectValue placeholder="Selecciona un país" />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((country) => (
                      <SelectItem key={country.id} value={country.iso_code}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.countryCode && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.countryCode}
                  </p>
                )}
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
            </div>
            <div className="flex flex-col gap-1.5 sm:w-1/2">
              <Label htmlFor="storageQuotaGb">
                Cuota de Almacenamiento (GB) <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="storageQuotaGb"
                type="number"
                min={0}
                value={storageQuotaGb}
                onChange={(event) => setStorageQuotaGb(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Tipo de Organización y configuración adicional</SectionHeading>
            <div className="flex flex-col gap-2">
              <Label>Tipo de Organización</Label>
              <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                {catalogsLoading && businessRoles.length === 0 && (
                  <p className="text-sm text-muted-foreground" role="status">
                    Cargando…
                  </p>
                )}
                {businessRoles.map((role) => (
                  <div key={role.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`business-role-${role.id}`}
                      checked={businessRoleIds.includes(role.id)}
                      onCheckedChange={() => toggleBusinessRole(role.id)}
                    />
                    <Label htmlFor={`business-role-${role.id}`} className="font-normal">
                      {role.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox id="isActive" checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
                <Label htmlFor="isActive" className="font-normal">
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="observations">
                Observaciones <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <textarea
                id="observations"
                className="min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={observations}
                onChange={(event) => setObservations(event.target.value)}
              />
            </div>
          </div>

          {catalogsError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              No se pudieron cargar los catálogos de Tipo de Organización/Estado: {catalogsError}
            </p>
          )}

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/organizations')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || catalogsLoading || organizationStatusId === null}>
              {isSubmitting ? 'Creando…' : 'Crear Organización'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
