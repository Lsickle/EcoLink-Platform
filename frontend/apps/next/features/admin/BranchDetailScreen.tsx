'use client'

import { useEffect, useRef, useState } from 'react'
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
import {
  ApiValidationError,
  activateBranch,
  deactivateBranch,
  fetchBranch,
  fetchBranchActivity,
  fetchBranchContacts,
  fetchBranchTypes,
  fetchBranchUsers,
  fetchCountries,
  fetchDepartments,
  fetchLocalities,
  fetchMunicipalities,
  updateBranch,
  type AdminBranchDetail,
  type AdminBranchType,
  type AdminCountry,
  type AdminDepartment,
  type AdminLocality,
  type AdminMunicipality,
  type AdminOrganizationContact,
  type AdminUser,
  type BranchStatus,
  type RoleActivityEvent,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'
import { BranchLocationsPanel } from './BranchLocationsPanel'
import { OrganizationContactsPanel } from './OrganizationContactsPanel'

const BRANCH_STATUSES: BranchStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED']

const STATUS_LABELS: Record<BranchStatus, string> = {
  ACTIVE: 'Activa',
  INACTIVE: 'Inactiva',
  SUSPENDED: 'Suspendida',
}

const STATUS_BADGE_VARIANT: Record<BranchStatus, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  INACTIVE: 'secondary',
  SUSPENDED: 'destructive',
}

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  )
}

// Plan "CRUD de Sedes (Branches) + Contactos" -- mismo layout de 2 columnas
// que OrganizationDetailScreen.tsx. Sin variantes por tipo de organización
// dueña (una sola vista genérica, decisión ya confirmada en el plan). Header
// con badges Estado (3 colores)/Tipo de Sede + Editar/Activar-Inactivar.
// Card "Información General" con geografía completa en cascada
// (País->Departamento->Municipio->Localidad). Tabs Usuarios/Contactos/
// Actividad con carga perezosa (mismo patrón que OrganizationDetailScreen.tsx
// -- `xLoaded` se lee pero deliberadamente se omite de las dependencias del
// efecto).
export function BranchDetailScreen({ branchId }: { branchId: number | string }) {
  const { isAuthorized, user } = useRequireAuth('branches.read')
  // Tab "Muelles" (`branch_locations`, Fase 4 "Cita de Recepción en Planta")
  // -- gateado por su propio permiso, mismo criterio que el resto de
  // tabs/pestañas de este proyecto que agregan un dominio hermano (ver
  // AppSidebar) en vez de asumir que quien administra Sedes también
  // administra Muelles.
  const canManageBranchLocations = Boolean(user?.permissions?.includes('branch_locations.read'))
  const [branch, setBranch] = useState<AdminBranchDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const infoCardRef = useRef<HTMLDivElement | null>(null)

  const [branchTypes, setBranchTypes] = useState<AdminBranchType[]>([])
  const [countries, setCountries] = useState<AdminCountry[]>([])
  const [departments, setDepartments] = useState<AdminDepartment[]>([])
  const [municipalities, setMunicipalities] = useState<AdminMunicipality[]>([])
  const [localities, setLocalities] = useState<AdminLocality[]>([])

  // Formulario de edición (sección "Información General")
  const [branchTypeId, setBranchTypeId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<BranchStatus>('ACTIVE')
  const [countryId, setCountryId] = useState<number | null>(null)
  const [departmentId, setDepartmentId] = useState<number | null>(null)
  const [municipalityId, setMunicipalityId] = useState<number | null>(null)
  const [localityId, setLocalityId] = useState<number | null>(null)
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [environmentalLicense, setEnvironmentalLicense] = useState('')
  const [licenseExpirationDate, setLicenseExpirationDate] = useState('')
  const [operationalCapacity, setOperationalCapacity] = useState('')
  const [observations, setObservations] = useState('')
  const [isActiveField, setIsActiveField] = useState(true)

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'usuarios' | 'contactos' | 'muelles' | 'auditoria'>('usuarios')

  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)

  const [contacts, setContacts] = useState<AdminOrganizationContact[]>([])
  const [contactsLoaded, setContactsLoaded] = useState(false)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError, setContactsError] = useState<string | null>(null)

  const [activityEvents, setActivityEvents] = useState<RoleActivityEvent[]>([])
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    Promise.all([
      fetchBranch(branchId),
      fetchBranchTypes({ perPage: 100, status: 'active' }),
      fetchCountries({ perPage: 300, status: 'active' }),
    ])
      .then(([branchResult, branchTypesResult, countriesResult]) => {
        if (cancelled) return
        const b = branchResult.branch
        setBranch(b)
        setBranchTypes(branchTypesResult.data)
        setCountries(countriesResult.data)
        setBranchTypeId(b.branch_type_id)
        setCode(b.code ?? '')
        setName(b.name)
        setStatus(b.status)
        setCountryId(b.country_id)
        setDepartmentId(b.department_id)
        setMunicipalityId(b.municipality_id)
        setLocalityId(b.locality_id)
        setAddress(b.address ?? '')
        setPhone(b.phone ?? '')
        setEmail(b.email ?? '')
        setEnvironmentalLicense(b.environmental_license ?? '')
        setLicenseExpirationDate(b.license_expiration_date ?? '')
        setOperationalCapacity(b.operational_capacity != null ? String(b.operational_capacity) : '')
        setObservations(b.observations ?? '')
        setIsActiveField(b.is_active)
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
  }, [isAuthorized, branchId])

  // Cascada geográfica -- mismo patrón que LocalitiesListScreen.tsx: cada
  // nivel se recarga cuando el nivel padre cambia. Los selects RESETEAN los
  // hijos de forma imperativa en su propio onValueChange (no vía este
  // efecto) para no perder la hidratación inicial.
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

  useEffect(() => {
    if (activeTab !== 'usuarios' || usersLoaded || !isAuthorized) return
    let cancelled = false
    setUsersLoading(true)
    fetchBranchUsers(branchId, { perPage: 15 })
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
  }, [activeTab, isAuthorized, branchId])

  function loadContacts() {
    let cancelled = false
    setContactsLoading(true)
    fetchBranchContacts(branchId, { perPage: 15 })
      .then((result) => {
        if (cancelled) return
        setContacts(result.data)
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
  }, [activeTab, isAuthorized, branchId])

  useEffect(() => {
    if (activeTab !== 'auditoria' || activityLoaded || !isAuthorized) return
    let cancelled = false
    setActivityLoading(true)
    fetchBranchActivity(branchId, { perPage: 15 })
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
  }, [activeTab, isAuthorized, branchId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!branch || branchTypeId === null) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { branch: updated } = await updateBranch(branch.id, {
        branch_type_id: branchTypeId,
        code,
        name,
        status,
        country_id: countryId ?? undefined,
        department_id: departmentId ?? undefined,
        municipality_id: municipalityId ?? undefined,
        locality_id: localityId ?? undefined,
        address: address || undefined,
        phone: phone || undefined,
        email: email || undefined,
        environmental_license: environmentalLicense || undefined,
        license_expiration_date: licenseExpirationDate || undefined,
        operational_capacity: operationalCapacity ? Number(operationalCapacity) : undefined,
        observations: observations || undefined,
        is_active: isActiveField,
      })
      // updateBranch() devuelve organization/branch_type recargados pero NO
      // geografía/created_by/updated_by/users_count (ver docblock de
      // AdminBranch en types.ts) -- se preservan los ya cargados de show().
      setBranch((current) =>
        current
          ? {
              ...current,
              ...updated,
              organization: updated.organization ?? current.organization,
              branch_type: updated.branch_type !== undefined ? updated.branch_type : current.branch_type,
              country: current.country,
              department: current.department,
              municipality: current.municipality,
              locality: current.locality,
              created_by: current.created_by,
              updated_by: current.updated_by,
              users_count: current.users_count,
            }
          : current
      )
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!branch) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { branch: updated } = branch.is_active ? await deactivateBranch(branch.id) : await activateBranch(branch.id)
      setBranch((current) => (current ? { ...current, is_active: updated.is_active, status: updated.status } : current))
      setStatus(updated.status)
      setIsActiveField(updated.is_active)
    } catch (error) {
      setToggleError(errorMessage(error, 'branch'))
    } finally {
      setIsTogglingActive(false)
    }
  }

  if (!isAuthorized || isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (loadError || !branch) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró la sucursal.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              {branch.name.charAt(0).toUpperCase() || <Building2 className="size-5" aria-hidden="true" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{branch.name}</CardTitle>
                {branch.branch_type && <Badge variant="outline">{branch.branch_type.name}</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {branch.code ?? '—'} · {branch.organization.legal_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANT[branch.status]}>{STATUS_LABELS[branch.status]}</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => infoCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Editar
            </Button>
            <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
              {branch.is_active ? 'Inactivar' : 'Activar'}
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
                <InfoField label="Organización">{branch.organization.legal_name}</InfoField>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="branchTypeId">Tipo de Sucursal</Label>
                  <Select
                    items={branchTypes.map((type) => ({ value: String(type.id), label: type.name }))}
                    value={branchTypeId !== null ? String(branchTypeId) : null}
                    onValueChange={(value) => setBranchTypeId(value !== null ? Number(value) : null)}
                  >
                    <SelectTrigger id="branchTypeId">
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
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name">Nombre</Label>
                  <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="code">Código</Label>
                  <Input id="code" value={code} onChange={(event) => setCode(event.target.value)} />
                </div>

                <div className="flex flex-col gap-1.5">
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
                <div className="flex items-center gap-2 self-end pb-2">
                  <Checkbox
                    id="isActiveField"
                    checked={isActiveField}
                    onCheckedChange={(checked) => setIsActiveField(checked === true)}
                  />
                  <Label htmlFor="isActiveField" className="font-normal">
                    Sucursal activa
                  </Label>
                </div>

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

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="address">
                    Dirección <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input id="address" value={address} onChange={(event) => setAddress(event.target.value)} />
                </div>

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
                  <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>

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
                <div className="flex flex-col gap-1.5">
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

                <div className="flex flex-col gap-1.5 sm:col-span-2">
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

                <InfoField label="Fecha de Creación">{formatDate(branch.created_at)}</InfoField>
                <InfoField label="Creado Por">{branch.created_by?.username ?? '—'}</InfoField>

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
            <CardContent>
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
                <TabsList>
                  <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
                  <TabsTrigger value="contactos">Contactos</TabsTrigger>
                  {canManageBranchLocations && <TabsTrigger value="muelles">Muelles</TabsTrigger>}
                  <TabsTrigger value="auditoria">Actividad</TabsTrigger>
                </TabsList>

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
                                Esta sucursal no tiene usuarios registrados.
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

                <TabsContent value="contactos" className="pt-4">
                  <OrganizationContactsPanel
                    organizationId={branch.organization.id}
                    contacts={contacts}
                    isLoading={contactsLoading && !contactsLoaded}
                    loadError={contactsError}
                    branches={[]}
                    lockedBranchId={branch.id}
                    onChanged={loadContacts}
                  />
                </TabsContent>

                {canManageBranchLocations && (
                  <TabsContent value="muelles" className="pt-4">
                    <BranchLocationsPanel branchId={branch.id} />
                  </TabsContent>
                )}

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
            <CardContent className="grid grid-cols-1 gap-3">
              <MetricTile label="Usuarios" value={String(branch.users_count)} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
