'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Map } from 'lucide-react'
import { CatalogPageHeader } from '@/components/catalog/CatalogPageHeader'
import { CatalogSidebarSection } from '@/components/catalog/CatalogSidebarSection'
import { CatalogSidebarStat } from '@/components/catalog/CatalogSidebarStat'
import { CatalogStatCard } from '@/components/catalog/CatalogStatCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ApiValidationError,
  activateDepartment,
  deactivateDepartment,
  fetchCountries,
  fetchDepartments,
  type AdminCountry,
  type AdminDepartment,
} from 'app/features/admin/api'
import { useRequireAuth } from 'app/provider/auth'

type StatusFilter = 'all' | 'active' | 'inactive'

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
]

const countryFilterAllValue = 'all'
const perPageOptions = [10, 25, 50] as const
const SEARCH_DEBOUNCE_MS = 300

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// Catálogo Maestro "Departamentos" (Batch 1/3, backend cerrado -- ver
// DepartmentController): mismo patrón EXACTO que CountriesListScreen.tsx
// (solo lectura, KPIs de catálogo completo, layout "Catálogos Maestros"),
// con el filtro adicional `country_id` (cascada D-P01) -- el select se
// puebla con `fetchCountries({perPage: 300})` una sola vez, no hay endpoint
// de "países con departamentos" dedicado.
export function DepartmentsListScreen() {
  const { isAuthorized } = useRequireAuth('geography.read')

  const [departments, setDepartments] = useState<AdminDepartment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [countries, setCountries] = useState<AdminCountry[]>([])

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [countryFilter, setCountryFilter] = useState<string>(countryFilterAllValue)

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number>(perPageOptions[0])
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [busyId, setBusyId] = useState<number | null>(null)
  const [actionErrors, setActionErrors] = useState<Record<number, string>>({})

  const [totalCount, setTotalCount] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [inactiveCount, setInactiveCount] = useState(0)

  useEffect(() => {
    if (!isAuthorized) return
    fetchCountries({ perPage: 300, status: 'active' }).then((result) => setCountries(result.data))
  }, [isAuthorized])

  // El Select necesita `items` para resolver la etiqueta visible del valor
  // seleccionado en el trigger -- sin esto muestra el `value` crudo
  // ("all"/el id numérico) en vez del label traducido (mismo bug ya
  // encontrado y corregido antes en RolesListScreen/PermissionsMatrixScreen).
  const countryFilterItems = useMemo(
    () => [
      { value: countryFilterAllValue, label: 'Todos los países' },
      ...countries.map((country) => ({ value: String(country.id), label: country.name })),
    ],
    [countries]
  )

  const loadStats = useCallback(() => {
    if (!isAuthorized) return
    fetchDepartments({ perPage: 1 }).then((result) => setTotalCount(result.total))
    fetchDepartments({ status: 'active', perPage: 1 }).then((result) => setActiveCount(result.total))
    fetchDepartments({ status: 'inactive', perPage: 1 }).then((result) => setInactiveCount(result.total))
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
    fetchDepartments({
      page,
      perPage,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      countryId: countryFilter === countryFilterAllValue ? undefined : countryFilter,
    })
      .then((result) => {
        if (cancelled) return
        setDepartments(result.data)
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
  }, [isAuthorized, page, perPage, search, statusFilter, countryFilter])

  useEffect(() => load(), [load])

  function handleStatusFilterChange(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleCountryFilterChange(value: string | null) {
    if (!value) return
    setCountryFilter(value)
    setPage(1)
  }

  function handlePerPageChange(value: string | null) {
    if (!value) return
    setPerPage(Number(value))
    setPage(1)
  }

  async function handleToggleActive(department: AdminDepartment) {
    setBusyId(department.id)
    setActionErrors((current) => ({ ...current, [department.id]: '' }))
    try {
      const { department: updated } = department.is_active
        ? await deactivateDepartment(department.id)
        : await activateDepartment(department.id)
      setDepartments((current) => current.map((item) => (item.id === department.id ? { ...item, ...updated } : item)))
      loadStats()
    } catch (error) {
      setActionErrors((current) => ({ ...current, [department.id]: errorMessage(error, 'department') }))
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
        title="Departamentos"
        description="Departamentos DANE, en cascada bajo el país -- solo lectura."
        colorVariant="blue"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CatalogStatCard value={totalCount} label="Total" colorVariant="blue" icon={<Map className="size-5" />} />
        <CatalogStatCard value={activeCount} label="Activos" colorVariant="green" />
        <CatalogStatCard value={inactiveCount} label="Inactivos" colorVariant="red" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Input
              placeholder="Buscar por código DANE o nombre…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="sm:max-w-xs"
              aria-label="Buscar departamentos"
            />
            <Select
              items={countryFilterItems}
              value={countryFilter}
              onValueChange={handleCountryFilterChange}
            >
              <SelectTrigger aria-label="Filtrar por país" className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={countryFilterAllValue}>Todos los países</SelectItem>
                {countries.map((country) => (
                  <SelectItem key={country.id} value={String(country.id)}>
                    {country.name}
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
                    <TableHead>Código DANE</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No hay departamentos que coincidan con los filtros.
                      </TableCell>
                    </TableRow>
                  )}
                  {departments.map((department) => (
                    <TableRow key={department.id}>
                      <TableCell className="text-muted-foreground">{department.dane_code ?? '—'}</TableCell>
                      <TableCell className="font-medium">{department.name}</TableCell>
                      <TableCell>
                        <Badge variant={department.is_active ? 'default' : 'secondary'}>
                          {department.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === department.id}
                            onClick={() => handleToggleActive(department)}
                          >
                            {department.is_active ? 'Inactivar' : 'Activar'}
                          </Button>
                          {actionErrors[department.id] && (
                            <p className="max-w-56 text-right text-xs text-destructive" role="alert">
                              {actionErrors[department.id]}
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
                Mostrando {rangeStart}–{rangeEnd} de {total} departamentos
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
          <CatalogSidebarSection title="Resumen del Catálogo" colorVariant="blue" icon={<Map className="size-4" />}>
            <CatalogSidebarStat label="Total" value={totalCount} colorVariant="blue" />
            <CatalogSidebarStat label="Activos" value={activeCount} colorVariant="green" />
            <CatalogSidebarStat label="Inactivos" value={inactiveCount} colorVariant="red" withDivider={false} />
          </CatalogSidebarSection>

          <CatalogSidebarSection title="Acciones Rápidas">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button variant="outline" className="w-full justify-start gap-2" disabled>
                    <Download className="size-4" aria-hidden="true" />
                    Exportar
                  </Button>
                }
              />
              <TooltipContent>Próximamente</TooltipContent>
            </Tooltip>
          </CatalogSidebarSection>
        </div>
      </div>
    </div>
  )
}
