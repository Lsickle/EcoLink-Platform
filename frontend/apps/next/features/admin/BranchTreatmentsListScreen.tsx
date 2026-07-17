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
  fetchBranchTreatments,
  fetchTreatments,
  type AdminBranchTreatment,
  type AdminTreatment,
  type BranchTreatmentKpis,
  type BranchTreatmentOperationalStatus,
} from 'app/features/admin/api'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from './OrganizationSearchSelect'

const PER_PAGE = 15
const SEARCH_DEBOUNCE_MS = 300
const allFilterValue = 'all'

// RN-063/D-R02: `operational_status` es lista cerrada de texto (no catálogo
// FK), mismo criterio que `VehicleOperationalStatus`/`BranchStatus`.
const OPERATIONAL_STATUSES: BranchTreatmentOperationalStatus[] = ['ACTIVE', 'INACTIVE', 'SUSPENDED']

const STATUS_LABELS: Record<BranchTreatmentOperationalStatus, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  SUSPENDED: 'Suspendido',
}

const STATUS_BADGE_VARIANT: Record<BranchTreatmentOperationalStatus, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  INACTIVE: 'secondary',
  SUSPENDED: 'destructive',
}

const statusFilterOptions = [
  { value: allFilterValue, label: 'Todos' },
  ...OPERATIONAL_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
]

const emptyKpis: BranchTreatmentKpis = { total: 0, active: 0, inactive: 0 }

// "Tratamientos de Sucursal" (RN-063/D-R02) -- acceso DUAL, mismo mecanismo
// EXACTO que VehiclesListScreen.tsx/BranchesListScreen.tsx: platform staff
// ve/gestiona TODOS los `branch_treatments` de cualquier organización; un
// admin de tenant (o un usuario con `branch_treatments.read` sin ser
// platform staff) solo ve los de su propia organización. Columnas Sucursal/
// Organización/Tratamiento/Capacidad/Estado (ver requerimiento explícito del
// lote) + filtros (búsqueda, Organización [solo platform staff], Tratamiento,
// Estado Operativo), mismo patrón de debounce/paginación server-side que
// VehiclesListScreen.tsx.
export function BranchTreatmentsListScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('branch_treatments.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [branchTreatments, setBranchTreatments] = useState<AdminBranchTreatment[]>([])
  const [kpis, setKpis] = useState<BranchTreatmentKpis>(emptyKpis)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [organizationFilterId, setOrganizationFilterId] = useState<number | null>(null)
  const [organizationFilterLabel, setOrganizationFilterLabel] = useState<string | null>(null)
  const [treatmentFilter, setTreatmentFilter] = useState(allFilterValue)
  const [statusFilter, setStatusFilter] = useState(allFilterValue)

  const [treatments, setTreatments] = useState<AdminTreatment[]>([])

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!isAuthorized) return
    fetchTreatments({ perPage: 100, status: 'active' })
      .then((result) => setTreatments(result.data))
      .catch(() => {})
  }, [isAuthorized])

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
    fetchBranchTreatments({
      page,
      perPage: PER_PAGE,
      search: search || undefined,
      organizationId: isPlatformStaff && organizationFilterId ? organizationFilterId : undefined,
      treatmentId: treatmentFilter === allFilterValue ? undefined : treatmentFilter,
      operationalStatus: statusFilter === allFilterValue ? undefined : statusFilter,
    })
      .then((result) => {
        if (cancelled) return
        setBranchTreatments(result.data)
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
  }, [isAuthorized, page, search, isPlatformStaff, organizationFilterId, treatmentFilter, statusFilter])

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  const treatmentFilterItems = [
    { value: allFilterValue, label: 'Todos los tratamientos' },
    ...treatments.map((treatment) => ({ value: String(treatment.id), label: treatment.name })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-t-4 border-t-foreground/20 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="text-2xl font-semibold">{kpis.total}</span>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Activos</span>
            <span className="text-2xl font-semibold">{kpis.active}</span>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-muted-foreground/40 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Inactivos</span>
            <span className="text-2xl font-semibold">{kpis.inactive}</span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Buscar por código o nombre operativo…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar tratamientos de sede"
          />
          {isPlatformStaff && (
            <div className="sm:w-64">
              <OrganizationSearchSelect
                label="Organización"
                htmlId="branchTreatmentOrganizationFilter"
                capability="can_treat_waste"
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
            items={treatmentFilterItems}
            value={treatmentFilter}
            onValueChange={(value) => {
              if (!value) return
              setTreatmentFilter(value as string)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por tratamiento" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {treatmentFilterItems.map((option) => (
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
        </div>
        <Button onClick={() => router.push('/admin/branch-treatments/new')}>+ Crear Tratamiento de Sede</Button>
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
                <TableHead>Sucursal</TableHead>
                <TableHead>Organización</TableHead>
                <TableHead>Tratamiento</TableHead>
                <TableHead>Capacidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branchTreatments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No hay tratamientos de sede que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {branchTreatments.map((branchTreatment) => (
                <TableRow key={branchTreatment.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => router.push(`/admin/branch-treatments/${branchTreatment.id}`)}
                    >
                      <div className="font-medium">{branchTreatment.branch?.name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{branchTreatment.internal_code ?? '—'}</div>
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {branchTreatment.organization?.legal_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{branchTreatment.treatment?.name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {branchTreatment.max_capacity != null
                      ? `${branchTreatment.max_capacity} ${branchTreatment.capacity_unit}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[branchTreatment.operational_status]}>
                      {STATUS_LABELS[branchTreatment.operational_status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Acciones para ${branchTreatment.branch?.name ?? branchTreatment.id}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/admin/branch-treatments/${branchTreatment.id}`)}>
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
          Mostrando {rangeStart}–{rangeEnd} de {total} tratamientos de sede
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
