'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FlaskConical, MoreHorizontal } from 'lucide-react'
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
  activateTreatment,
  deactivateTreatment,
  fetchTreatments,
  type AdminTreatment,
  type TreatmentRiskLevel,
  type TreatmentType,
} from 'app/features/admin/api'
import { TREATMENT_TYPES } from 'app/features/admin/types'
import { useAuth, useRequireAuth } from 'app/provider/auth'

type StatusFilter = 'all' | 'active' | 'inactive'

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
]

const TREATMENT_TYPE_LABELS: Record<TreatmentType, string> = {
  THERMAL: 'Térmico',
  PHYSICOCHEMICAL: 'Fisicoquímico',
  BIOLOGICAL: 'Biológico',
  STABILIZATION: 'Estabilización',
  DISPOSAL: 'Disposición Final',
  RECOVERY: 'Aprovechamiento',
  CHEMICAL: 'Químico',
  LIQUID: 'Líquido',
  SLUDGE: 'Lodos',
  PHYSICAL: 'Físico',
}

const RISK_LEVEL_LABELS: Record<TreatmentRiskLevel, string> = {
  LOW: 'Bajo',
  MEDIUM: 'Medio',
  HIGH: 'Alto',
}

const RISK_LEVEL_BADGE_VARIANT: Record<TreatmentRiskLevel, 'default' | 'secondary' | 'destructive'> = {
  LOW: 'secondary',
  MEDIUM: 'default',
  HIGH: 'destructive',
}

const allFilterValue = 'all'
const perPageOptions = [10, 25, 50] as const
const SEARCH_DEBOUNCE_MS = 300

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// Catálogo GLOBAL "Tratamientos" (RN-063/D-R02) -- disponible para
// consultar (`treatments.read`) a cualquier actor con el permiso (los
// Gestores lo necesitan para configurar sus `branch_treatments`), pero la
// escritura (crear/editar/activar/inactivar) está OCULTA -- no solo
// deshabilitada -- si `!user.is_platform_staff`, mismo criterio ya usado en
// ContactDetailScreen.tsx (el backend además rechaza con 403 vía
// `TreatmentPolicy`, esto es defensa en profundidad de UI).
export function TreatmentsListScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('treatments.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [treatments, setTreatments] = useState<AdminTreatment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [treatmentTypeFilter, setTreatmentTypeFilter] = useState<string>(allFilterValue)

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
    fetchTreatments({ perPage: 1 }).then((result) => setTotalCount(result.total))
    fetchTreatments({ status: 'active', perPage: 1 }).then((result) => setActiveCount(result.total))
    fetchTreatments({ status: 'inactive', perPage: 1 }).then((result) => setInactiveCount(result.total))
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
    fetchTreatments({
      page,
      perPage,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      treatmentType: treatmentTypeFilter === allFilterValue ? undefined : treatmentTypeFilter,
    })
      .then((result) => {
        if (cancelled) return
        setTreatments(result.data)
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
  }, [isAuthorized, page, perPage, search, statusFilter, treatmentTypeFilter])

  useEffect(() => load(), [load])

  function handleStatusFilterChange(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleTypeFilterChange(value: string) {
    setTreatmentTypeFilter(value)
    setPage(1)
  }

  function handlePerPageChange(value: string | null) {
    if (!value) return
    setPerPage(Number(value))
    setPage(1)
  }

  async function handleToggleActive(treatment: AdminTreatment) {
    setBusyId(treatment.id)
    setActionErrors((current) => ({ ...current, [treatment.id]: '' }))
    try {
      const { treatment: updated } = treatment.is_active
        ? await deactivateTreatment(treatment.id)
        : await activateTreatment(treatment.id)
      setTreatments((current) => current.map((item) => (item.id === treatment.id ? { ...item, ...updated } : item)))
      loadStats()
    } catch (error) {
      setActionErrors((current) => ({ ...current, [treatment.id]: errorMessage(error, 'treatment') }))
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

  const typeFilterItems = [
    { value: allFilterValue, label: 'Todos los tipos' },
    ...TREATMENT_TYPES.map((type) => ({ value: type, label: TREATMENT_TYPE_LABELS[type] })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <CatalogPageHeader
        title="Tratamientos"
        description="Catálogo global de tipos de tratamiento ambiental (Decreto 1076 de 2015)."
        colorVariant="purple"
        actions={
          isPlatformStaff && (
            <Button onClick={() => router.push('/admin/catalogs/treatments/new')}>+ Crear Tratamiento</Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CatalogStatCard value={totalCount} label="Total" colorVariant="purple" icon={<FlaskConical className="size-5" />} />
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
              aria-label="Buscar tratamientos"
            />
            <Select
              items={typeFilterItems}
              value={treatmentTypeFilter}
              onValueChange={(value) => {
                if (!value) return
                handleTypeFilterChange(value as string)
              }}
            >
              <SelectTrigger aria-label="Filtrar por tipo de tratamiento" className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeFilterItems.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                    <TableHead>Tipo</TableHead>
                    <TableHead>Riesgo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treatments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No hay tratamientos que coincidan con los filtros.
                      </TableCell>
                    </TableRow>
                  )}
                  {treatments.map((treatment) => (
                    <TableRow key={treatment.id}>
                      <TableCell className="text-muted-foreground">{treatment.code}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          onClick={() => router.push(`/admin/catalogs/treatments/${treatment.id}`)}
                        >
                          {treatment.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {TREATMENT_TYPE_LABELS[treatment.treatment_type]}
                      </TableCell>
                      <TableCell>
                        <Badge variant={RISK_LEVEL_BADGE_VARIANT[treatment.risk_level]}>
                          {RISK_LEVEL_LABELS[treatment.risk_level]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={treatment.is_active ? 'default' : 'secondary'}>
                          {treatment.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button variant="outline" size="sm" aria-label={`Acciones para ${treatment.name}`}>
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => router.push(`/admin/catalogs/treatments/${treatment.id}`)}>
                                Ver
                              </DropdownMenuItem>
                              {isPlatformStaff && (
                                <DropdownMenuItem
                                  disabled={busyId === treatment.id}
                                  onClick={() => handleToggleActive(treatment)}
                                >
                                  {treatment.is_active ? 'Inactivar' : 'Activar'}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {actionErrors[treatment.id] && (
                            <p className="max-w-56 text-right text-xs text-destructive" role="alert">
                              {actionErrors[treatment.id]}
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
                Mostrando {rangeStart}–{rangeEnd} de {total} tratamientos
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
          <CatalogSidebarSection title="Resumen del Catálogo" colorVariant="purple" icon={<FlaskConical className="size-4" />}>
            <CatalogSidebarStat label="Total" value={totalCount} colorVariant="purple" />
            <CatalogSidebarStat label="Activos" value={activeCount} colorVariant="green" />
            <CatalogSidebarStat label="Inactivos" value={inactiveCount} colorVariant="red" withDivider={false} />
          </CatalogSidebarSection>
        </div>
      </div>
    </div>
  )
}
