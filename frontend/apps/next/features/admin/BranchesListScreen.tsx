'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  fetchBranches,
  fetchBranchTypes,
  fetchDepartments,
  fetchMunicipalities,
  type AdminBranch,
  type AdminBranchType,
  type AdminDepartment,
  type AdminMunicipality,
  type BranchKpis,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from './OrganizationSearchSelect'

const PER_PAGE = 15
const SEARCH_DEBOUNCE_MS = 300
const allFilterValue = 'all'

const statusFilterOptions = [
  { value: allFilterValue, label: 'Todos' },
  { value: 'ACTIVE', label: 'Activa' },
  { value: 'INACTIVE', label: 'Inactiva' },
  { value: 'SUSPENDED', label: 'Suspendida' },
]

function branchStatusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'ACTIVE') return 'default'
  if (status === 'SUSPENDED') return 'destructive'
  return 'secondary'
}

function branchStatusLabel(status: string): string {
  return statusFilterOptions.find((option) => option.value === status)?.label ?? status
}

const emptyKpis: BranchKpis = { total: 0, active: 0, inactive: 0, suspended: 0 }

// Plan "CRUD de Sedes (Branches) + Contactos" -- acceso DUAL (gateado por
// `branches.read`, no exclusivo de platform staff como Organizaciones): un
// admin de tenant ve solo las sedes de su propia organización (el backend ya
// lo acota, ver `BranchController::index()`), un platform staff ve todas y
// obtiene además el filtro/columna "Organización". 4 KPIs reales (objeto
// PLANO `{total,active,inactive,suspended}`, no un array por fila de
// catálogo como `OrganizationKpi[]`) + filtros (búsqueda, Organización
// [solo platform staff], Departamento->Municipio en cascada, Estado, Tipo de
// Sede) + tabla, mismo patrón EXACTO de filtros con debounce/paginación
// server-side que OrganizationsListScreen.tsx/LocalitiesListScreen.tsx.
export function BranchesListScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('branches.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [branches, setBranches] = useState<AdminBranch[]>([])
  const [kpis, setKpis] = useState<BranchKpis>(emptyKpis)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [organizationFilterId, setOrganizationFilterId] = useState<number | null>(null)
  const [organizationFilterLabel, setOrganizationFilterLabel] = useState<string | null>(null)
  const [departmentFilter, setDepartmentFilter] = useState(allFilterValue)
  const [municipalityFilter, setMunicipalityFilter] = useState(allFilterValue)
  const [statusFilter, setStatusFilter] = useState(allFilterValue)
  const [branchTypeFilter, setBranchTypeFilter] = useState(allFilterValue)

  const [departments, setDepartments] = useState<AdminDepartment[]>([])
  const [municipalities, setMunicipalities] = useState<AdminMunicipality[]>([])
  const [branchTypes, setBranchTypes] = useState<AdminBranchType[]>([])

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!isAuthorized) return
    fetchDepartments({ perPage: 100, status: 'active' })
      .then((result) => setDepartments(result.data))
      .catch(() => {})
    fetchBranchTypes({ perPage: 100, status: 'active' })
      .then((result) => setBranchTypes(result.data))
      .catch(() => {})
  }, [isAuthorized])

  useEffect(() => {
    if (!isAuthorized || departmentFilter === allFilterValue) {
      setMunicipalities([])
      return
    }
    fetchMunicipalities({ departmentId: departmentFilter, perPage: 100, status: 'active' })
      .then((result) => setMunicipalities(result.data))
      .catch(() => {})
  }, [isAuthorized, departmentFilter])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    setIsLoading(true)
    fetchBranches({
      page,
      perPage: PER_PAGE,
      search: search || undefined,
      organizationId: isPlatformStaff && organizationFilterId ? organizationFilterId : undefined,
      departmentId: departmentFilter === allFilterValue ? undefined : departmentFilter,
      municipalityId: municipalityFilter === allFilterValue ? undefined : municipalityFilter,
      status: statusFilter === allFilterValue ? undefined : statusFilter,
      branchTypeId: branchTypeFilter === allFilterValue ? undefined : branchTypeFilter,
    })
      .then((result) => {
        if (cancelled) return
        setBranches(result.data)
        setKpis(result.kpis)
        setLastPage(result.last_page)
        setTotal(result.total)
        setLoadError(null)
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
  }, [
    isAuthorized,
    page,
    search,
    isPlatformStaff,
    organizationFilterId,
    departmentFilter,
    municipalityFilter,
    statusFilter,
    branchTypeFilter,
  ])

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  const departmentFilterItems = [
    { value: allFilterValue, label: 'Todos los departamentos' },
    ...departments.map((department) => ({ value: String(department.id), label: department.name })),
  ]
  const municipalityFilterItems = [
    { value: allFilterValue, label: 'Todos los municipios' },
    ...municipalities.map((municipality) => ({ value: String(municipality.id), label: municipality.name })),
  ]
  const branchTypeFilterItems = [
    { value: allFilterValue, label: 'Todos los tipos' },
    ...branchTypes.map((type) => ({ value: String(type.id), label: type.name })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-t-4 border-t-foreground/20 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="text-2xl font-semibold">{kpis.total}</span>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Activas</span>
            <span className="text-2xl font-semibold">{kpis.active}</span>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-muted-foreground/40 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Inactivas</span>
            <span className="text-2xl font-semibold">{kpis.inactive}</span>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-amber-500 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Suspendidas</span>
            <span className="text-2xl font-semibold">{kpis.suspended}</span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Buscar por nombre o código…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar sedes"
          />
          {isPlatformStaff && (
            <div className="sm:w-64">
              <OrganizationSearchSelect
                label="Organización"
                htmlId="branchOrganizationFilter"
                selectedId={organizationFilterId}
                selectedLabel={organizationFilterLabel}
                onSelect={(result) => {
                  setOrganizationFilterId(result.id)
                  setOrganizationFilterLabel(result.legal_name)
                  setPage(1)
                }}
                onClear={() => {
                  setOrganizationFilterId(null)
                  setOrganizationFilterLabel(null)
                  setPage(1)
                }}
              />
            </div>
          )}
          <Select
            items={departmentFilterItems}
            value={departmentFilter}
            onValueChange={(value) => {
              if (!value) return
              setDepartmentFilter(value as string)
              setMunicipalityFilter(allFilterValue)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por departamento" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {departmentFilterItems.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={municipalityFilterItems}
            value={municipalityFilter}
            onValueChange={(value) => {
              if (!value) return
              setMunicipalityFilter(value as string)
              setPage(1)
            }}
            disabled={departmentFilter === allFilterValue}
          >
            <SelectTrigger aria-label="Filtrar por municipio" className="w-full sm:w-48">
              <SelectValue placeholder="Elige un departamento" />
            </SelectTrigger>
            <SelectContent>
              {municipalityFilterItems.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={statusFilterOptions}
            value={statusFilter}
            onValueChange={(value) => {
              if (!value) return
              setStatusFilter(value as string)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por estado" className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={branchTypeFilterItems}
            value={branchTypeFilter}
            onValueChange={(value) => {
              if (!value) return
              setBranchTypeFilter(value as string)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por tipo de sede" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {branchTypeFilterItems.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => router.push('/admin/branches/new')}>+ Crear Sede</Button>
      </div>

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Cargando…
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sede</TableHead>
                {isPlatformStaff && <TableHead>Organización</TableHead>}
                <TableHead>Ciudad</TableHead>
                <TableHead>Usuarios</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creación</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isPlatformStaff ? 7 : 6} className="text-center text-muted-foreground">
                    No hay sedes que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {branches.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => router.push(`/admin/branches/${branch.id}`)}
                    >
                      <div className="font-medium">{branch.name}</div>
                      <div className="text-xs text-muted-foreground">{branch.code ?? '—'}</div>
                    </button>
                  </TableCell>
                  {isPlatformStaff && (
                    <TableCell className="text-muted-foreground">{branch.organization?.legal_name ?? '—'}</TableCell>
                  )}
                  <TableCell className="text-muted-foreground">{branch.municipality?.name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{branch.users_count ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={branchStatusBadgeVariant(branch.status)}>{branchStatusLabel(branch.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(branch.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="outline" size="sm" aria-label={`Acciones para ${branch.name}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/admin/branches/${branch.id}`)}>
                          Ver detalle
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="text-sm text-muted-foreground">
          Mostrando {rangeStart}–{rangeEnd} de {total} sedes
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {lastPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => setPage((current) => current + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}
