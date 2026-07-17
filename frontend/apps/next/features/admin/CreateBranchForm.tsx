'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ApiValidationError,
  createBranch,
  fetchBranchTypes,
  fetchCountries,
  fetchDepartments,
  fetchLocalities,
  fetchMunicipalities,
  type AdminBranchType,
  type AdminCountry,
  type AdminDepartment,
  type AdminLocality,
  type AdminMunicipality,
  type BranchStatus,
} from 'app/features/admin/api'
import { createBranchSchema } from 'app/features/admin/schemas'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from './OrganizationSearchSelect'

const BRANCH_STATUSES: BranchStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED']

const STATUS_LABELS: Record<BranchStatus, string> = {
  ACTIVE: 'Activa',
  INACTIVE: 'Inactiva',
  SUSPENDED: 'Suspendida',
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>
}

type FieldErrors = Partial<Record<'name' | 'code' | 'branchTypeId' | 'email', string>>

// Formulario de creación (POST /api/admin/branches) -- plan "CRUD de Sedes
// (Branches) + Contactos". El selector de Organización dueña SOLO se
// muestra si `user.is_platform_staff` (para cualquier otro actor el backend
// fuerza su propia organización server-side, ver contrato del lote) --
// `?organizationId=` en la URL pre-carga el valor cuando se navega desde el
// botón "Crear Sede" de `OrganizationDetailScreen.tsx` (tab Sedes).
export function CreateBranchForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('branches.create')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [branchTypes, setBranchTypes] = useState<AdminBranchType[]>([])
  const [countries, setCountries] = useState<AdminCountry[]>([])
  const [departments, setDepartments] = useState<AdminDepartment[]>([])
  const [municipalities, setMunicipalities] = useState<AdminMunicipality[]>([])
  const [localities, setLocalities] = useState<AdminLocality[]>([])
  const [catalogsError, setCatalogsError] = useState<string | null>(null)

  // Sección 1 -- Identificación
  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [organizationLabel, setOrganizationLabel] = useState<string | null>(null)
  const [branchTypeId, setBranchTypeId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')

  // Sección 2 -- Ubicación
  const [countryId, setCountryId] = useState<number | null>(null)
  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const [municipalityId, setMunicipalityId] = useState<number | null>(null)
  const [localityId, setLocalityId] = useState<number | null>(null)
  const [address, setAddress] = useState('')

  // Sección 3 -- Contacto
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')

  // Sección 4 -- Regulatorio
  const [environmentalLicense, setEnvironmentalLicense] = useState('')
  const [licenseExpirationDate, setLicenseExpirationDate] = useState('')
  const [operationalCapacity, setOperationalCapacity] = useState('')

  // Sección 5 -- Estado + Observaciones
  const [status, setStatus] = useState<BranchStatus>('ACTIVE')
  const [isActive, setIsActive] = useState(true)
  const [observations, setObservations] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const queryOrganizationId = searchParams.get('organizationId')
    if (queryOrganizationId) {
      const parsed = Number(queryOrganizationId)
      if (Number.isFinite(parsed) && parsed > 0) {
        setOrganizationId(parsed)
        setOrganizationLabel(`Organización #${parsed}`)
      }
    }
    // Solo se lee una vez, al montar -- `searchParams` no cambia después.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    Promise.all([fetchBranchTypes({ perPage: 100, status: 'active' }), fetchCountries({ perPage: 300, status: 'active' })])
      .then(([branchTypesResult, countriesResult]) => {
        if (cancelled) return
        setBranchTypes(branchTypesResult.data)
        setCountries(countriesResult.data)
        setCatalogsError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setCatalogsError(error instanceof Error ? error.message : 'Error inesperado.')
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized])

  useEffect(() => {
    if (!isAuthorized || !countryId) {
      setDepartments([])
      return
    }
    fetchDepartments({ countryId, perPage: 100, status: 'active' })
      .then((result) => setDepartments(result.data))
      .catch(() => {})
  }, [isAuthorized, countryId])

  useEffect(() => {
    if (!isAuthorized || !departmentId) {
      setMunicipalities([])
      return
    }
    fetchMunicipalities({ departmentId, perPage: 200, status: 'active' })
      .then((result) => setMunicipalities(result.data))
      .catch(() => {})
  }, [isAuthorized, departmentId])

  useEffect(() => {
    if (!isAuthorized || !municipalityId) {
      setLocalities([])
      return
    }
    fetchLocalities({ municipalityId, perPage: 100, status: 'active' })
      .then((result) => setLocalities(result.data))
      .catch(() => {})
  }, [isAuthorized, municipalityId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = createBranchSchema.safeParse({
      organizationId: isPlatformStaff ? (organizationId ?? undefined) : undefined,
      branchTypeId: branchTypeId ?? 0,
      code,
      name,
      status,
      countryId: countryId ?? undefined,
      departmentId: departmentId ?? undefined,
      municipalityId: municipalityId ?? undefined,
      localityId: localityId ?? undefined,
      address,
      phone,
      email,
      environmentalLicense,
      licenseExpirationDate,
      operationalCapacity: operationalCapacity ? Number(operationalCapacity) : undefined,
      observations,
      isActive,
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

    if (isPlatformStaff && !parsed.data.organizationId) {
      setFormError('Selecciona la organización dueña de la sucursal.')
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const { branch: created } = await createBranch({
        organization_id: isPlatformStaff ? (parsed.data.organizationId ?? undefined) : undefined,
        branch_type_id: parsed.data.branchTypeId,
        code: parsed.data.code,
        name: parsed.data.name,
        status: parsed.data.status,
        country_id: parsed.data.countryId,
        department_id: parsed.data.departmentId,
        municipality_id: parsed.data.municipalityId,
        locality_id: parsed.data.localityId,
        address: parsed.data.address || undefined,
        phone: parsed.data.phone || undefined,
        email: parsed.data.email || undefined,
        environmental_license: parsed.data.environmentalLicense || undefined,
        license_expiration_date: parsed.data.licenseExpirationDate || undefined,
        operational_capacity: parsed.data.operationalCapacity,
        observations: parsed.data.observations || undefined,
        is_active: parsed.data.isActive,
      })
      router.push(`/admin/branches/${created.id}`)
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFormError(error.firstError('code') ?? error.firstError('name') ?? error.message)
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
        <CardTitle className="text-xl">Crear Sucursal</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-4">
            <SectionHeading>Identificación</SectionHeading>
            {isPlatformStaff && (
              <OrganizationSearchSelect
                label="Organización dueña"
                htmlId="organizationId"
                selectedId={organizationId}
                selectedLabel={organizationLabel}
                onSelect={(result) => {
                  setOrganizationId(result.id)
                  setOrganizationLabel(`${result.legal_name} (${result.tax_id})`)
                }}
                onClear={() => {
                  setOrganizationId(null)
                  setOrganizationLabel(null)
                }}
              />
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.name)}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Código</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.code)}
                />
                {fieldErrors.code && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.code}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="branchTypeId">Tipo de Sucursal</Label>
              <Select
                items={branchTypes.map((type) => ({ value: String(type.id), label: type.name }))}
                value={branchTypeId !== null ? String(branchTypeId) : null}
                onValueChange={(value) => setBranchTypeId(value !== null ? Number(value) : null)}
              >
                <SelectTrigger id="branchTypeId" aria-invalid={Boolean(fieldErrors.branchTypeId)}>
                  <SelectValue placeholder="Selecciona un tipo" />
                </SelectTrigger>
                <SelectContent>
                  {branchTypes.map((type) => (
                    <SelectItem key={type.id} value={String(type.id)}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.branchTypeId && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.branchTypeId}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Ubicación</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="countryId">
                  País <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Select
                  items={[{ value: 'none', label: 'Sin especificar' }, ...countries.map((c) => ({ value: String(c.id), label: c.name }))]}
                  value={countryId !== null ? String(countryId) : 'none'}
                  onValueChange={(value) => {
                    const next = value === 'none' ? null : Number(value)
                    setCountryId(next)
                    setDepartmentId(null)
                    setMunicipalityId(null)
                    setLocalityId(null)
                  }}
                >
                  <SelectTrigger id="countryId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin especificar</SelectItem>
                    {countries.map((country) => (
                      <SelectItem key={country.id} value={String(country.id)}>
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="departmentId">
                  Departamento <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Select
                  items={[{ value: 'none', label: 'Sin especificar' }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))]}
                  value={departmentId !== null ? String(departmentId) : 'none'}
                  disabled={!countryId}
                  onValueChange={(value) => {
                    const next = value === 'none' ? null : Number(value)
                    setDepartmentId(next)
                    setMunicipalityId(null)
                    setLocalityId(null)
                  }}
                >
                  <SelectTrigger id="departmentId">
                    <SelectValue placeholder="Elige un país" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin especificar</SelectItem>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={String(department.id)}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="municipalityId">
                  Municipio <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Select
                  items={[{ value: 'none', label: 'Sin especificar' }, ...municipalities.map((m) => ({ value: String(m.id), label: m.name }))]}
                  value={municipalityId !== null ? String(municipalityId) : 'none'}
                  disabled={!departmentId}
                  onValueChange={(value) => {
                    const next = value === 'none' ? null : Number(value)
                    setMunicipalityId(next)
                    setLocalityId(null)
                  }}
                >
                  <SelectTrigger id="municipalityId">
                    <SelectValue placeholder="Elige un departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin especificar</SelectItem>
                    {municipalities.map((municipality) => (
                      <SelectItem key={municipality.id} value={String(municipality.id)}>
                        {municipality.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="localityId">
                  Localidad <span className="text-muted-foreground">(opcional, solo Bogotá)</span>
                </Label>
                <Select
                  items={[{ value: 'none', label: 'Sin especificar' }, ...localities.map((l) => ({ value: String(l.id), label: l.name }))]}
                  value={localityId !== null ? String(localityId) : 'none'}
                  disabled={!municipalityId || localities.length === 0}
                  onValueChange={(value) => setLocalityId(value === 'none' ? null : Number(value))}
                >
                  <SelectTrigger id="localityId">
                    <SelectValue placeholder="Elige un municipio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin especificar</SelectItem>
                    {localities.map((locality) => (
                      <SelectItem key={locality.id} value={String(locality.id)}>
                        {locality.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="address">
                Dirección <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input id="address" value={address} onChange={(event) => setAddress(event.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Contacto</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="phone">
                  Teléfono <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">
                  Correo <span className="text-muted-foreground">(opcional)</span>
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
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Regulatorio</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="environmentalLicense">
                  Licencia Ambiental <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="environmentalLicense"
                  value={environmentalLicense}
                  onChange={(event) => setEnvironmentalLicense(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="licenseExpirationDate">
                  Vencimiento de Licencia <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="licenseExpirationDate"
                  type="date"
                  value={licenseExpirationDate}
                  onChange={(event) => setLicenseExpirationDate(event.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5 sm:w-1/2">
              <Label htmlFor="operationalCapacity">
                Capacidad Operativa <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="operationalCapacity"
                type="number"
                min={0}
                value={operationalCapacity}
                onChange={(event) => setOperationalCapacity(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Estado y observaciones</SectionHeading>
            <div className="flex flex-col gap-1.5 sm:w-1/2">
              <Label htmlFor="status">Estado</Label>
              <Select
                items={BRANCH_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
                value={status}
                onValueChange={(value) => setStatus(value as BranchStatus)}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRANCH_STATUSES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {STATUS_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="isActive" checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
              <Label htmlFor="isActive" className="font-normal">
                Sucursal activa
              </Label>
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
              No se pudieron cargar los catálogos de Tipo de Sucursal/Geografía: {catalogsError}
            </p>
          )}

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/branches')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Sucursal'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
