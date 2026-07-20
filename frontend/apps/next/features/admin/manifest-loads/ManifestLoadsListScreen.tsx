'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { fetchManifestLoads, type AdminManifestLoad } from 'app/features/admin/api'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'

const PER_PAGE = 15
const SEARCH_DEBOUNCE_MS = 300
const allFilterValue = 'all'

// `manifest_statuses.code` reales sembrados (D-MAN-01, ver docblock de
// `AdminManifestStatus` en types.ts) -- solo los 6 alcanzables por
// `ManifestLoadController` (`Received`/`Closed` pertenecen al futuro
// `manifest_unloads`, Fase 5, nunca aparecen en un `manifest_load`).
const STATUS_FILTER_OPTIONS = [
  { value: allFilterValue, label: 'Todos' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'GENERATED', label: 'Generado' },
  { value: 'PARTIALLY_SIGNED', label: 'Parcialmente Firmado' },
  { value: 'SIGNED', label: 'Firmado' },
  { value: 'IN_TRANSIT', label: 'En Tránsito' },
  { value: 'CANCELLED', label: 'Cancelado' },
]

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  GENERATED: 'outline',
  PARTIALLY_SIGNED: 'outline',
  SIGNED: 'default',
  IN_TRANSIT: 'default',
  CANCELLED: 'destructive',
}

function statusBadgeVariant(code: string | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  return (code && STATUS_BADGE_VARIANT[code]) || 'outline'
}

/**
 * Listado de `manifest_loads` (Módulo Manifiesto de Cargue, Fase 3 -- backend
 * cerrado, 1247 tests Pest, hallazgo de seguridad ya cerrado). Diseño
 * PROPUESTO (2026-07-19, sin frame de Figma para este módulo -- ver resumen
 * del lote): mismo lenguaje visual ya usado en `TransportSchedulesListScreen.tsx`
 * (filtros Organización/Búsqueda/Estado + tabla + badges de estado por
 * color), extendido con la columna "Sede Generadora" (propia de este
 * dominio).
 *
 * Acceso DUAL NO SIMÉTRICO (a diferencia de `TransportSchedulesListScreen`,
 * mismo criterio que `ServiceRequestsListScreen`): platform staff ve todos,
 * un actor de tenant normal ve los manifiestos donde su organización es
 * `carrier_organization_id` O la dueña de `generator_branch_id` (ver
 * `ManifestLoad::isAccessibleBy()`/`ManifestLoadController::index()`) -- el
 * filtro "Organización" (solo platform staff) filtra por
 * `carrier_organization_id`, mismo criterio que el backend.
 */
export function ManifestLoadsListScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('manifest_loads.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [manifestLoads, setManifestLoads] = useState<AdminManifestLoad[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [organizationFilterId, setOrganizationFilterId] = useState<number | null>(null)
  const [organizationFilterLabel, setOrganizationFilterLabel] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState(allFilterValue)

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

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
    fetchManifestLoads({
      page,
      perPage: PER_PAGE,
      search: search || undefined,
      organizationId: isPlatformStaff && organizationFilterId ? organizationFilterId : undefined,
      status: statusFilter === allFilterValue ? undefined : statusFilter,
    })
      .then((result) => {
        if (cancelled) return
        setManifestLoads(result.data)
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
  }, [isAuthorized, page, search, isPlatformStaff, organizationFilterId, statusFilter])

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Buscar por número de manifiesto…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar manifiestos de cargue"
          />
          {isPlatformStaff && (
            <div className="sm:w-64">
              <OrganizationSearchSelect
                label="Organización"
                htmlId="manifestLoadOrganizationFilter"
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
            items={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onValueChange={(value) => {
              if (!value) return
              setStatusFilter(value as string)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por estado" className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
                <TableHead>Número</TableHead>
                <TableHead>Programación</TableHead>
                {isPlatformStaff && <TableHead>Organización</TableHead>}
                <TableHead>Sede Generadora</TableHead>
                <TableHead>Vehículo</TableHead>
                <TableHead>Fecha de Cargue</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {manifestLoads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isPlatformStaff ? 7 : 6} className="text-center text-muted-foreground">
                    No hay manifiestos de cargue que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {manifestLoads.map((manifestLoad) => (
                <TableRow key={manifestLoad.id}>
                  <TableCell>
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => router.push(`/admin/manifest-loads/${manifestLoad.id}`)}
                    >
                      {manifestLoad.manifest_number}
                    </Button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {manifestLoad.transport_schedule?.schedule_number ?? '—'}
                  </TableCell>
                  {isPlatformStaff && (
                    <TableCell className="text-muted-foreground">
                      {manifestLoad.carrier_organization?.legal_name ?? '—'}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground">{manifestLoad.generator_branch?.name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{manifestLoad.vehicle?.plate_number ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{manifestLoad.load_date}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(manifestLoad.manifest_status?.code)}>
                      {manifestLoad.manifest_status?.name ?? '—'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="text-sm text-muted-foreground">
          Mostrando {rangeStart}–{rangeEnd} de {total} manifiestos
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {lastPage}
          </span>
          <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => setPage((current) => current + 1)}>
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}
