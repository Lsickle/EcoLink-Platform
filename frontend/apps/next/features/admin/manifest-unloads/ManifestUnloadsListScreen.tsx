'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { fetchManifestUnloads, type AdminManifestUnload } from 'app/features/admin/api'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'

const PER_PAGE = 15
const SEARCH_DEBOUNCE_MS = 300
const allFilterValue = 'all'

// `manifest_statuses.code` reales ALCANZABLES por este controller (ver
// docblock de `ManifestUnloadWorkflowSeeder`): a diferencia de
// `ManifestLoadsListScreen.tsx` (que se detiene en `IN_TRANSIT`), este ciclo
// SÍ cierra hasta `CLOSED` -- `IN_TRANSIT`/`RECEIVED` (vocabulario
// compartido del catálogo) nunca aparecen en un `manifest_unload`.
const STATUS_FILTER_OPTIONS = [
  { value: allFilterValue, label: 'Todos' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'GENERATED', label: 'Generado' },
  { value: 'PARTIALLY_SIGNED', label: 'Parcialmente Firmado' },
  { value: 'SIGNED', label: 'Firmado' },
  { value: 'CLOSED', label: 'Cerrado' },
  { value: 'CANCELLED', label: 'Cancelado' },
]

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  GENERATED: 'outline',
  PARTIALLY_SIGNED: 'outline',
  SIGNED: 'default',
  CLOSED: 'default',
  CANCELLED: 'destructive',
}

function statusBadgeVariant(code: string | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  return (code && STATUS_BADGE_VARIANT[code]) || 'outline'
}

/**
 * Listado de `manifest_unloads` (Módulo Manifiesto de Descargue, Fase 5 --
 * ÚLTIMA fase del plan, backend cerrado). Sin frame de Figma confirmado para
 * esta pantalla en esta sesión -- ver AVISO completo en el docblock de
 * `AdminManifestUnload` (types.ts) sobre el GAP de diseño original (entidades
 * separadas `vehicle_checkins`/`weight_tickets`/etc. que no se construyeron).
 * Diseño PROPUESTO: mismo lenguaje visual EXACTO que
 * `ManifestLoadsListScreen.tsx` (filtros Organización/Búsqueda/Estado +
 * tabla + badges de estado por color), con la columna "Sede Receptora" en
 * vez de "Sede Generadora" (propia de este dominio, lado INVERTIDO).
 *
 * Acceso DUAL NO SIMÉTRICO INVERTIDO respecto a `ManifestLoadsListScreen`
 * (mismo criterio que `ServiceRequestsListScreen`): platform staff ve todos,
 * un actor de tenant normal ve los manifiestos donde su organización es la
 * RECEPTORA (`receiving_organization_id`) O el lado transportador de la
 * `unload_request` asociada (ver
 * `ManifestUnload::isAccessibleBy()`/`ManifestUnloadController::index()`) --
 * el filtro "Organización" (solo platform staff) filtra por
 * `receiving_organization_id`, mismo criterio que el backend.
 */
export function ManifestUnloadsListScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('manifest_unloads.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [manifestUnloads, setManifestUnloads] = useState<AdminManifestUnload[]>([])
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
    fetchManifestUnloads({
      page,
      perPage: PER_PAGE,
      search: search || undefined,
      organizationId: isPlatformStaff && organizationFilterId ? organizationFilterId : undefined,
      status: statusFilter === allFilterValue ? undefined : statusFilter,
    })
      .then((result) => {
        if (cancelled) return
        setManifestUnloads(result.data)
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
            aria-label="Buscar manifiestos de descargue"
          />
          {isPlatformStaff && (
            <div className="sm:w-64">
              <OrganizationSearchSelect
                label="Organización"
                htmlId="manifestUnloadOrganizationFilter"
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
                <TableHead>Solicitud</TableHead>
                {isPlatformStaff && <TableHead>Organización</TableHead>}
                <TableHead>Sede Receptora</TableHead>
                <TableHead>Vehículo</TableHead>
                <TableHead>Fecha de Descargue</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {manifestUnloads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isPlatformStaff ? 7 : 6} className="text-center text-muted-foreground">
                    No hay manifiestos de descargue que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {manifestUnloads.map((manifestUnload) => (
                <TableRow key={manifestUnload.id}>
                  <TableCell>
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => router.push(`/admin/manifest-unloads/${manifestUnload.id}`)}
                    >
                      {manifestUnload.manifest_number}
                    </Button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {manifestUnload.unload_request?.request_number ?? '—'}
                  </TableCell>
                  {isPlatformStaff && (
                    <TableCell className="text-muted-foreground">
                      {manifestUnload.receiving_organization?.legal_name ?? '—'}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground">{manifestUnload.receiving_branch?.name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{manifestUnload.vehicle?.plate_number ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{manifestUnload.unload_date}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(manifestUnload.manifest_status?.code)}>
                      {manifestUnload.manifest_status?.name ?? '—'}
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
