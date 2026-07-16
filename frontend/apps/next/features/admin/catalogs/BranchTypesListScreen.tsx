'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, MoreHorizontal } from 'lucide-react'
import { CatalogPageHeader } from '@/components/catalog/CatalogPageHeader'
import { CatalogSidebarSection } from '@/components/catalog/CatalogSidebarSection'
import { CatalogSidebarStat } from '@/components/catalog/CatalogSidebarStat'
import { CatalogStatCard } from '@/components/catalog/CatalogStatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  ApiValidationError,
  activateBranchType,
  deactivateBranchType,
  fetchBranchTypes,
  type AdminBranchType,
} from 'app/features/admin/api'
import { useRequireAuth } from 'app/provider/auth'

type StatusFilter = 'all' | 'active' | 'inactive'

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
]

const perPageOptions = [10, 25, 50] as const
const SEARCH_DEBOUNCE_MS = 300

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// Badges de capacidad (is_logistics/is_storage/is_treatment/is_dispatch,
// ver BranchTypeSeeder) -- compartido entre la tabla y el sidebar del
// detalle (BranchTypeDetailScreen.tsx).
export function CapabilityBadges({ branchType }: { branchType: AdminBranchType }) {
  const flags: { active: boolean; label: string }[] = [
    { active: branchType.is_logistics, label: 'Logística' },
    { active: branchType.is_storage, label: 'Almacenamiento' },
    { active: branchType.is_treatment, label: 'Tratamiento' },
    { active: branchType.is_dispatch, label: 'Despacho' },
  ]
  const activeFlags = flags.filter((flag) => flag.active)
  if (activeFlags.length === 0) {
    return <span className="text-xs text-muted-foreground">Sin capacidades</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {activeFlags.map((flag) => (
        <Badge key={flag.label} variant="outline">
          {flag.label}
        </Badge>
      ))}
    </div>
  )
}

// Catálogo Maestro "Tipos de Sede" (Batch 1/3, backend cerrado -- ver
// BranchTypeController): a diferencia de los 4 catálogos geográficos
// hermanos, este SÍ tiene CRUD completo -- mismo patrón EXACTO de
// filtros/tabla/menú de fila que WasteStreamsListScreen.tsx/
// UnCodesListScreen.tsx, con el layout visual nuevo (CatalogPageHeader +
// KPIs + grilla tabla/sidebar) del patrón "Catálogos Maestros". Catálogo
// pequeño (8 valores sembrados, ver BranchTypeSeeder) -- las estadísticas
// de capacidad del sidebar se calculan client-side sobre un fetch único de
// hasta 100 filas, no con fetches por-filtro como en las 4 pantallas
// geográficas (que sí pueden tener miles de filas).
export function BranchTypesListScreen() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('branch_types.read')

  const [branchTypes, setBranchTypes] = useState<AdminBranchType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number>(perPageOptions[0])
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [busyId, setBusyId] = useState<number | null>(null)
  const [actionErrors, setActionErrors] = useState<Record<number, string>>({})

  const [allBranchTypes, setAllBranchTypes] = useState<AdminBranchType[]>([])

  const loadStats = useCallback(() => {
    if (!isAuthorized) return
    fetchBranchTypes({ perPage: 100, sort: 'sort_order' }).then((result) => setAllBranchTypes(result.data))
  }, [isAuthorized])

  useEffect(() => loadStats(), [loadStats])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const load = useCallback(() => {
    if (!isAuthorized) return
    let cancelled = false
    setIsLoading(true)
    fetchBranchTypes({
      page,
      perPage,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      sort: 'sort_order',
    })
      .then((result) => {
        if (cancelled) return
        setBranchTypes(result.data)
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
  }, [isAuthorized, page, perPage, search, statusFilter])

  useEffect(() => load(), [load])

  function handleStatusFilterChange(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function handlePerPageChange(value: string | null) {
    if (!value) return
    setPerPage(Number(value))
    setPage(1)
  }

  async function handleToggleActive(branchType: AdminBranchType) {
    setBusyId(branchType.id)
    setActionErrors((current) => ({ ...current, [branchType.id]: '' }))
    try {
      const { branch_type: updated } = branchType.is_active
        ? await deactivateBranchType(branchType.id)
        : await activateBranchType(branchType.id)
      setBranchTypes((current) => current.map((item) => (item.id === branchType.id ? { ...item, ...updated } : item)))
      loadStats()
    } catch (error) {
      setActionErrors((current) => ({ ...current, [branchType.id]: errorMessage(error, 'branch_type') }))
    } finally {
      setBusyId(null)
    }
  }

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const totalCount = allBranchTypes.length
  const activeCount = allBranchTypes.filter((item) => item.is_active).length
  const inactiveCount = totalCount - activeCount
  const treatmentCount = allBranchTypes.filter((item) => item.is_treatment).length
  const logisticsCount = allBranchTypes.filter((item) => item.is_logistics).length
  const storageCount = allBranchTypes.filter((item) => item.is_storage).length
  const dispatchCount = allBranchTypes.filter((item) => item.is_dispatch).length

  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1
  const rangeEnd = Math.min(page * perPage, total)

  return (
    <div className="flex flex-col gap-4">
      <CatalogPageHeader
        title="Tipos de Sede"
        description="Catálogo de tipos de sede, con flags de capacidad operativa."
        colorVariant="purple"
        actions={<Button onClick={() => router.push('/admin/catalogs/branch-types/new')}>+ Crear Tipo de Sede</Button>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CatalogStatCard value={totalCount} label="Total" colorVariant="purple" icon={<Building2 className="size-5" />} />
        <CatalogStatCard value={activeCount} label="Activos" colorVariant="green" />
        <CatalogStatCard value={inactiveCount} label="Inactivos" colorVariant="red" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Input
              placeholder="Buscar por código o nombre…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="sm:max-w-xs"
              aria-label="Buscar tipos de sede"
            />
            <Select
              items={statusFilterOptions}
              value={statusFilter}
              onValueChange={(value) => handleStatusFilterChange(value as StatusFilter)}
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
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Capacidades</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchTypes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No hay tipos de sede que coincidan con los filtros.
                      </TableCell>
                    </TableRow>
                  )}
                  {branchTypes.map((branchType) => (
                    <TableRow key={branchType.id}>
                      <TableCell className="text-muted-foreground">{branchType.code}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          onClick={() => router.push(`/admin/catalogs/branch-types/${branchType.id}`)}
                        >
                          {branchType.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{branchType.category}</TableCell>
                      <TableCell>
                        <CapabilityBadges branchType={branchType} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={branchType.is_active ? 'default' : 'secondary'}>
                          {branchType.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button variant="outline" size="sm" aria-label={`Acciones para ${branchType.name}`}>
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/admin/catalogs/branch-types/${branchType.id}`)}>
                                Ver
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => router.push(`/admin/catalogs/branch-types/${branchType.id}`)}>
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={busyId === branchType.id}
                                onClick={() => handleToggleActive(branchType)}
                              >
                                {branchType.is_active ? 'Inactivar' : 'Activar'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {actionErrors[branchType.id] && (
                            <p className="max-w-56 text-right text-xs text-destructive" role="alert">
                              {actionErrors[branchType.id]}
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                Mostrando {rangeStart}–{rangeEnd} de {total} tipos de sede
              </span>
              <Select value={String(perPage)} onValueChange={handlePerPageChange}>
                <SelectTrigger aria-label="Filas por página" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {perPageOptions.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

        <div className="flex flex-col gap-4">
          <CatalogSidebarSection title="Resumen del Catálogo" colorVariant="purple" icon={<Building2 className="size-4" />}>
            <CatalogSidebarStat label="Total" value={totalCount} colorVariant="purple" />
            <CatalogSidebarStat label="Activos" value={activeCount} colorVariant="green" />
            <CatalogSidebarStat label="Inactivos" value={inactiveCount} colorVariant="red" withDivider={false} />
          </CatalogSidebarSection>

          <CatalogSidebarSection title="Distribución por Capacidad">
            <CatalogSidebarStat label="Logística" value={logisticsCount} colorVariant="blue" />
            <CatalogSidebarStat label="Almacenamiento" value={storageCount} colorVariant="orange" />
            <CatalogSidebarStat label="Tratamiento" value={treatmentCount} colorVariant="green" />
            <CatalogSidebarStat label="Despacho" value={dispatchCount} colorVariant="purple" withDivider={false} />
          </CatalogSidebarSection>
        </div>
      </div>
    </div>
  )
}
