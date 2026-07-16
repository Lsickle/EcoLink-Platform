'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, ShieldAlert } from 'lucide-react'
import { CatalogPageHeader } from '@/components/catalog/CatalogPageHeader'
import { CatalogSidebarSection } from '@/components/catalog/CatalogSidebarSection'
import { CatalogSidebarStat } from '@/components/catalog/CatalogSidebarStat'
import { CatalogStatCard } from '@/components/catalog/CatalogStatCard'
import { ProvisionalDataNotice } from '@/components/catalog/ProvisionalDataNotice'
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
  activatePackagingCondition,
  deactivatePackagingCondition,
  fetchPackagingConditions,
  type AdminPackagingCondition,
} from 'app/features/admin/api'
import { useRequireAuth } from 'app/provider/auth'
import { RiskLevelBadge } from './HazardCharacteristicsListScreen'

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

// Badge de nivel de riesgo cualitativo para `risk_level` NULLABLE --
// reutiliza tal cual RiskLevelBadge/hazardRiskLevel de
// HazardCharacteristicsListScreen.tsx (mismo mapeo 1-9, ver AVISO en
// PackagingConditionSeeder.php) en vez de escribir un mapeo nuevo, con un
// fallback textual cuando el valor es `null` (a diferencia de
// hazard_characteristics, aquí SÍ puede venir sin definir).
function ConditionRiskLevelBadge({ riskLevel }: { riskLevel: number | null }) {
  if (riskLevel == null) {
    return <span className="text-xs text-muted-foreground">Sin definir</span>
  }
  return <RiskLevelBadge riskLevel={riskLevel} />
}

// Catálogo Maestro "Estados del Embalaje" (Batch 3/3, último de Catálogos
// Maestros -- ver PackagingConditionController): mismo patrón EXACTO que
// HazardCharacteristicsListScreen.tsx (catálogo global, CRUD completo, badge
// de riesgo cualitativo). AVISO -- PROVISIONAL: los 3 valores sembrados NO
// tienen fuente de negocio confirmada (ver AdminPackagingCondition en
// types.ts) -- ProvisionalDataNotice se muestra justo debajo del header,
// visible en cualquier filtro/página.
export function PackagingConditionsListScreen() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('packaging_conditions.read')

  const [packagingConditions, setPackagingConditions] = useState<AdminPackagingCondition[]>([])
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

  const [totalCount, setTotalCount] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [inactiveCount, setInactiveCount] = useState(0)

  const loadStats = useCallback(() => {
    if (!isAuthorized) return
    fetchPackagingConditions({ perPage: 1 }).then((result) => setTotalCount(result.total))
    fetchPackagingConditions({ status: 'active', perPage: 1 }).then((result) => setActiveCount(result.total))
    fetchPackagingConditions({ status: 'inactive', perPage: 1 }).then((result) => setInactiveCount(result.total))
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
    fetchPackagingConditions({
      page,
      perPage,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
    })
      .then((result) => {
        if (cancelled) return
        setPackagingConditions(result.data)
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

  async function handleToggleActive(packagingCondition: AdminPackagingCondition) {
    setBusyId(packagingCondition.id)
    setActionErrors((current) => ({ ...current, [packagingCondition.id]: '' }))
    try {
      const { packaging_condition: updated } = packagingCondition.is_active
        ? await deactivatePackagingCondition(packagingCondition.id)
        : await activatePackagingCondition(packagingCondition.id)
      setPackagingConditions((current) =>
        current.map((item) => (item.id === packagingCondition.id ? { ...item, ...updated } : item))
      )
      loadStats()
    } catch (error) {
      setActionErrors((current) => ({ ...current, [packagingCondition.id]: errorMessage(error, 'packaging_condition') }))
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

  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1
  const rangeEnd = Math.min(page * perPage, total)

  return (
    <div className="flex flex-col gap-4">
      <CatalogPageHeader
        title="Estados del Embalaje"
        description="Condiciones físicas utilizadas para inspeccionar y clasificar embalajes."
        colorVariant="orange"
        actions={<Button onClick={() => router.push('/admin/catalogs/packaging-conditions/new')}>+ Crear Estado</Button>}
      />

      <ProvisionalDataNotice />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CatalogStatCard value={totalCount} label="Total" colorVariant="orange" icon={<ShieldAlert className="size-5" />} />
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
              aria-label="Buscar estados del embalaje"
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
                    <TableHead>Nivel de Riesgo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packagingConditions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No hay estados del embalaje que coincidan con los filtros.
                      </TableCell>
                    </TableRow>
                  )}
                  {packagingConditions.map((packagingCondition) => (
                    <TableRow key={packagingCondition.id}>
                      <TableCell className="text-muted-foreground">{packagingCondition.code}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          onClick={() => router.push(`/admin/catalogs/packaging-conditions/${packagingCondition.id}`)}
                        >
                          {packagingCondition.name}
                        </button>
                      </TableCell>
                      <TableCell>
                        <ConditionRiskLevelBadge riskLevel={packagingCondition.risk_level} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={packagingCondition.is_active ? 'default' : 'secondary'}>
                          {packagingCondition.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button variant="outline" size="sm" aria-label={`Acciones para ${packagingCondition.name}`}>
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => router.push(`/admin/catalogs/packaging-conditions/${packagingCondition.id}`)}
                              >
                                Ver
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => router.push(`/admin/catalogs/packaging-conditions/${packagingCondition.id}`)}
                              >
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={busyId === packagingCondition.id}
                                onClick={() => handleToggleActive(packagingCondition)}
                              >
                                {packagingCondition.is_active ? 'Inactivar' : 'Activar'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {actionErrors[packagingCondition.id] && (
                            <p className="max-w-56 text-right text-xs text-destructive" role="alert">
                              {actionErrors[packagingCondition.id]}
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
                Mostrando {rangeStart}–{rangeEnd} de {total} estados del embalaje
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
          <CatalogSidebarSection title="Resumen del Catálogo" colorVariant="orange" icon={<ShieldAlert className="size-4" />}>
            <CatalogSidebarStat label="Total" value={totalCount} colorVariant="orange" />
            <CatalogSidebarStat label="Activos" value={activeCount} colorVariant="green" />
            <CatalogSidebarStat label="Inactivos" value={inactiveCount} colorVariant="red" withDivider={false} />
          </CatalogSidebarSection>
        </div>
      </div>
    </div>
  )
}
