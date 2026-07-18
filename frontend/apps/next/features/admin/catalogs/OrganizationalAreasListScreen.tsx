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
  activateOrganizationalArea,
  deactivateOrganizationalArea,
  fetchOrganizationalAreas,
  type AdminOrganizationalArea,
} from 'app/features/admin/api'
import { useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'

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

/**
 * Catálogo Maestro "Áreas Organizacionales" (Batch 1/3, backend cerrado --
 * ver OrganizationalAreaController). A diferencia de los 5 catálogos
 * hermanos de este lote, NO es un catálogo global: `organization_id` es
 * NOT NULL, cada fila pertenece a UNA organización concreta.
 *
 * Criterio de aislamiento -- replicado EXACTO del backend, no inventado
 * aquí (ver docblock de OrganizationalAreaController): un actor
 * `is_platform_staff` (mismo campo de `AuthUser` ya usado por
 * InvitationRequestsListScreen/useRequireAuth `requirePlatformStaff`,
 * criterio reutilizado tal cual, no uno nuevo) puede elegir cualquier
 * organización -- el backend YA NO exige `organization_id` en el query para
 * ese actor (cierre de brecha de UX 2026-07-18): si se omite, la lista
 * devuelve áreas de TODAS las organizaciones, cada fila con `organization`
 * eager-cargada. Cualquier otro actor queda SIEMPRE forzado a su propio
 * tenant: el selector ni se muestra (mandarlo igual no cambiaría nada, el
 * backend lo ignora).
 *
 * Selector "Organización" -- combo de búsqueda con debounce
 * (`OrganizationSearchSelect`, mismo componente EXACTO que
 * BranchesListScreen.tsx), OPCIONAL: sin selección, se pide la lista
 * completa (todas las organizaciones); al elegir una, se acota igual que
 * antes. Cuando la respuesta mezcla organizaciones (actor platform staff sin
 * filtro), se agrega la columna "Organización" con
 * `area.organization?.legal_name ?? '—'` -- mismo patrón de fallback que la
 * columna Organización/Ciudad de BranchesListScreen.tsx. La columna se
 * muestra siempre para un actor platform staff (con o sin filtro
 * seleccionado) para evitar que aparezca/desaparezca al cambiar el filtro.
 */
export function OrganizationalAreasListScreen() {
  const router = useRouter()
  const { isAuthorized, user } = useRequireAuth('organizational_areas.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [organizationLabel, setOrganizationLabel] = useState<string | null>(null)

  const [areas, setAreas] = useState<AdminOrganizationalArea[]>([])
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

  const [allAreas, setAllAreas] = useState<AdminOrganizationalArea[]>([])

  const loadStats = useCallback(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchOrganizationalAreas({
      organizationId: isPlatformStaff && organizationId ? organizationId : undefined,
      perPage: 100,
    }).then((result) => {
      if (cancelled) return
      setAllAreas(result.data)
    })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, isPlatformStaff, organizationId])

  useEffect(() => loadStats(), [loadStats])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const load = useCallback(() => {
    if (!isAuthorized) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    setIsLoading(true)
    fetchOrganizationalAreas({
      organizationId: isPlatformStaff && organizationId ? organizationId : undefined,
      page,
      perPage,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
    })
      .then((result) => {
        if (cancelled) return
        setAreas(result.data)
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
  }, [isAuthorized, isPlatformStaff, organizationId, page, perPage, search, statusFilter])

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

  async function handleToggleActive(area: AdminOrganizationalArea) {
    setBusyId(area.id)
    setActionErrors((current) => ({ ...current, [area.id]: '' }))
    try {
      const { organizational_area: updated } = area.is_active
        ? await deactivateOrganizationalArea(area.id)
        : await activateOrganizationalArea(area.id)
      setAreas((current) => current.map((item) => (item.id === area.id ? { ...item, ...updated } : item)))
      loadStats()
    } catch (error) {
      setActionErrors((current) => ({ ...current, [area.id]: errorMessage(error, 'organizational_area') }))
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

  const totalCount = allAreas.length
  const activeCount = allAreas.filter((item) => item.is_active).length
  const inactiveCount = totalCount - activeCount
  const directionCount = allAreas.filter((item) => item.level === 'Dirección').length
  const managementCount = allAreas.filter((item) => item.level === 'Gerencia').length
  const coordinationCount = allAreas.filter((item) => item.level === 'Coordinación').length

  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1
  const rangeEnd = Math.min(page * perPage, total)

  return (
    <div className="flex flex-col gap-4">
      <CatalogPageHeader
        title="Áreas Organizacionales"
        description="Estructura jerárquica de áreas por organización -- cada área pertenece a una sola organización."
        colorVariant="blue"
        actions={
          <Button onClick={() => router.push('/admin/catalogs/organizational-areas/new')}>+ Crear Área</Button>
        }
      />

      {isPlatformStaff && (
        <div className="sm:w-72">
          <OrganizationSearchSelect
            label="Organización"
            htmlId="organizationalAreasOrganizationFilter"
            selectedId={organizationId}
            selectedLabel={organizationLabel}
            onSelect={(result) => {
              setOrganizationId(result.id)
              setOrganizationLabel(result.legal_name)
              setPage(1)
            }}
            onClear={() => {
              setOrganizationId(null)
              setOrganizationLabel(null)
              setPage(1)
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <CatalogStatCard value={totalCount} label="Total" colorVariant="blue" icon={<Building2 className="size-5" />} />
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
                  aria-label="Buscar áreas organizacionales"
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
                        {isPlatformStaff && <TableHead>Organización</TableHead>}
                        <TableHead>Nivel</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {areas.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={isPlatformStaff ? 6 : 5} className="text-center text-muted-foreground">
                            No hay áreas organizacionales que coincidan con los filtros.
                          </TableCell>
                        </TableRow>
                      )}
                      {areas.map((area) => (
                        <TableRow key={area.id}>
                          <TableCell className="text-muted-foreground">{area.code}</TableCell>
                          <TableCell>
                            <button
                              type="button"
                              className="text-left font-medium hover:underline"
                              onClick={() => router.push(`/admin/catalogs/organizational-areas/${area.id}`)}
                            >
                              {area.name}
                            </button>
                          </TableCell>
                          {isPlatformStaff && (
                            <TableCell className="text-muted-foreground">
                              {area.organization?.legal_name ?? '—'}
                            </TableCell>
                          )}
                          <TableCell className="text-muted-foreground">{area.level}</TableCell>
                          <TableCell>
                            <Badge variant={area.is_active ? 'default' : 'secondary'}>
                              {area.is_active ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-1">
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  render={
                                    <Button variant="outline" size="sm" aria-label={`Acciones para ${area.name}`}>
                                      <MoreHorizontal className="size-4" />
                                    </Button>
                                  }
                                />
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/admin/catalogs/organizational-areas/${area.id}`)}
                                  >
                                    Ver
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => router.push(`/admin/catalogs/organizational-areas/${area.id}`)}
                                  >
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={busyId === area.id}
                                    onClick={() => handleToggleActive(area)}
                                  >
                                    {area.is_active ? 'Inactivar' : 'Activar'}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              {actionErrors[area.id] && (
                                <p className="max-w-56 text-right text-xs text-destructive" role="alert">
                                  {actionErrors[area.id]}
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
                    Mostrando {rangeStart}–{rangeEnd} de {total} áreas
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
              <CatalogSidebarSection title="Resumen del Catálogo" colorVariant="blue" icon={<Building2 className="size-4" />}>
                <CatalogSidebarStat label="Total" value={totalCount} colorVariant="blue" />
                <CatalogSidebarStat label="Activos" value={activeCount} colorVariant="green" />
                <CatalogSidebarStat label="Inactivos" value={inactiveCount} colorVariant="red" withDivider={false} />
              </CatalogSidebarSection>

              <CatalogSidebarSection title="Distribución por Nivel">
                <CatalogSidebarStat label="Dirección" value={directionCount} colorVariant="purple" />
                <CatalogSidebarStat label="Gerencia" value={managementCount} colorVariant="blue" />
                <CatalogSidebarStat label="Coordinación" value={coordinationCount} colorVariant="orange" withDivider={false} />
              </CatalogSidebarSection>
            </div>
          </div>
    </div>
  )
}
