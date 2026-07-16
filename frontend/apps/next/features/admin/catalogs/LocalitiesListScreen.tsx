'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, LandPlot } from 'lucide-react'
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
  activateLocality,
  deactivateLocality,
  fetchDepartments,
  fetchLocalities,
  fetchMunicipalities,
  type AdminDepartment,
  type AdminLocality,
  type AdminMunicipality,
} from 'app/features/admin/api'
import { useRequireAuth } from 'app/provider/auth'

type StatusFilter = 'all' | 'active' | 'inactive'

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
]

const allFilterValue = 'all'
const perPageOptions = [10, 25, 50] as const
const SEARCH_DEBOUNCE_MS = 300

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// Catálogo Maestro "Localidades" (Batch 1/3, backend cerrado -- ver
// LocalityController): mismo patrón EXACTO que MunicipalitiesListScreen.tsx
// (solo lectura, KPIs de catálogo completo), con una desviación deliberada
// del filtro pedido "dropdown de municipio": se implementa en CASCADA
// Departamento -> Municipio (el municipio solo se habilita tras elegir
// departamento) en vez de un único <Select> plano con los 1.119 municipios
// del país -- ese <Select> no soporta búsqueda (ver components/ui/select.tsx)
// y una lista plana de ese tamaño sería inutilizable. Declarado al hilo
// principal como mejora de UX, no una desviación silenciosa (solo Bogotá
// tiene localidades sembradas hoy, ver LocalitySeeder).
export function LocalitiesListScreen() {
  const { isAuthorized } = useRequireAuth('geography.read')

  const [localities, setLocalities] = useState<AdminLocality[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [departments, setDepartments] = useState<AdminDepartment[]>([])
  const [municipalities, setMunicipalities] = useState<AdminMunicipality[]>([])

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [departmentFilter, setDepartmentFilter] = useState<string>(allFilterValue)
  const [municipalityFilter, setMunicipalityFilter] = useState<string>(allFilterValue)

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
    fetchDepartments({ perPage: 40, status: 'active' }).then((result) => setDepartments(result.data))
  }, [isAuthorized])

  useEffect(() => {
    if (!isAuthorized || departmentFilter === allFilterValue) {
      setMunicipalities([])
      return
    }
    fetchMunicipalities({ departmentId: departmentFilter, perPage: 60, status: 'active' }).then((result) =>
      setMunicipalities(result.data)
    )
  }, [isAuthorized, departmentFilter])

  // Ver DepartmentsListScreen.tsx: el Select necesita `items` para resolver
  // la etiqueta visible del trigger, si no muestra el `value` crudo.
  const departmentFilterItems = useMemo(
    () => [
      { value: allFilterValue, label: 'Todos los departamentos' },
      ...departments.map((department) => ({ value: String(department.id), label: department.name })),
    ],
    [departments]
  )

  const municipalityFilterItems = useMemo(
    () => [
      { value: allFilterValue, label: 'Todos los municipios' },
      ...municipalities.map((municipality) => ({ value: String(municipality.id), label: municipality.name })),
    ],
    [municipalities]
  )

  const loadStats = useCallback(() => {
    if (!isAuthorized) return
    fetchLocalities({ perPage: 1 }).then((result) => setTotalCount(result.total))
    fetchLocalities({ status: 'active', perPage: 1 }).then((result) => setActiveCount(result.total))
    fetchLocalities({ status: 'inactive', perPage: 1 }).then((result) => setInactiveCount(result.total))
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
    fetchLocalities({
      page,
      perPage,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      municipalityId: municipalityFilter === allFilterValue ? undefined : municipalityFilter,
    })
      .then((result) => {
        if (cancelled) return
        setLocalities(result.data)
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
  }, [isAuthorized, page, perPage, search, statusFilter, municipalityFilter])

  useEffect(() => load(), [load])

  function handleStatusFilterChange(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleDepartmentFilterChange(value: string | null) {
    if (!value) return
    setDepartmentFilter(value)
    setMunicipalityFilter(allFilterValue)
    setPage(1)
  }

  function handleMunicipalityFilterChange(value: string | null) {
    if (!value) return
    setMunicipalityFilter(value)
    setPage(1)
  }

  function handlePerPageChange(value: string | null) {
    if (!value) return
    setPerPage(Number(value))
    setPage(1)
  }

  async function handleToggleActive(locality: AdminLocality) {
    setBusyId(locality.id)
    setActionErrors((current) => ({ ...current, [locality.id]: '' }))
    try {
      const { locality: updated } = locality.is_active ? await deactivateLocality(locality.id) : await activateLocality(locality.id)
      setLocalities((current) => current.map((item) => (item.id === locality.id ? { ...item, ...updated } : item)))
      loadStats()
    } catch (error) {
      setActionErrors((current) => ({ ...current, [locality.id]: errorMessage(error, 'locality') }))
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
        title="Localidades"
        description="Localidades (hoy solo Bogotá D.C.), en cascada bajo el municipio -- solo lectura."
        colorVariant="blue"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CatalogStatCard value={totalCount} label="Total" colorVariant="blue" icon={<LandPlot className="size-5" />} />
        <CatalogStatCard value={activeCount} label="Activos" colorVariant="green" />
        <CatalogStatCard value={inactiveCount} label="Inactivos" colorVariant="red" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Input
              placeholder="Buscar por nombre…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="sm:max-w-xs"
              aria-label="Buscar localidades"
            />
            <Select
              items={departmentFilterItems}
              value={departmentFilter}
              onValueChange={handleDepartmentFilterChange}
            >
              <SelectTrigger aria-label="Filtrar por departamento" className="w-full sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={allFilterValue}>Todos los departamentos</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department.id} value={String(department.id)}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={municipalityFilterItems}
              value={municipalityFilter}
              onValueChange={handleMunicipalityFilterChange}
              disabled={departmentFilter === allFilterValue}
            >
              <SelectTrigger aria-label="Filtrar por municipio" className="w-full sm:w-52">
                <SelectValue placeholder="Elige un departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={allFilterValue}>Todos los municipios</SelectItem>
                {municipalities.map((municipality) => (
                  <SelectItem key={municipality.id} value={String(municipality.id)}>
                    {municipality.name}
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
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localities.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No hay localidades que coincidan con los filtros.
                      </TableCell>
                    </TableRow>
                  )}
                  {localities.map((locality) => (
                    <TableRow key={locality.id}>
                      <TableCell className="font-medium">{locality.name}</TableCell>
                      <TableCell>
                        <Badge variant={locality.is_active ? 'default' : 'secondary'}>
                          {locality.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === locality.id}
                            onClick={() => handleToggleActive(locality)}
                          >
                            {locality.is_active ? 'Inactivar' : 'Activar'}
                          </Button>
                          {actionErrors[locality.id] && (
                            <p className="max-w-56 text-right text-xs text-destructive" role="alert">
                              {actionErrors[locality.id]}
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
                Mostrando {rangeStart}–{rangeEnd} de {total} localidades
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
          <CatalogSidebarSection title="Resumen del Catálogo" colorVariant="blue" icon={<LandPlot className="size-4" />}>
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
