'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { fetchUnloadRequests, type AdminUnloadRequest } from 'app/features/admin/api'
import { useRequireAuth } from 'app/provider/auth'

const PER_PAGE = 15
const SEARCH_DEBOUNCE_MS = 300
const allFilterValue = 'all'

// `unload_request_statuses.code` reales sembrados (`UnloadRequestStatusSeeder`,
// D-PRG-02) -- grafo grueso de 4 estados, sin agregado por ítems.
const STATUS_FILTER_OPTIONS = [
  { value: allFilterValue, label: 'Todos' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'SUBMITTED', label: 'Enviada' },
  { value: 'APPROVED', label: 'Aprobada' },
  { value: 'REJECTED', label: 'Rechazada' },
]

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  SUBMITTED: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
}

function statusBadgeVariant(code: string | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  return (code && STATUS_BADGE_VARIANT[code]) || 'outline'
}

/**
 * Listado de `unload_requests` (Fase 4 "Cita de Recepción en Planta
 * (bilateral)"). Sin frame de Figma propio para el LISTADO (el frame
 * confirmado -- node 991:14128/991:14338 -- cubre la Agenda semanal y el
 * formulario de "Programar Recepción", ver `PlantReceptionAgendaScreen.tsx`/
 * `ProposeReceptionScheduleForm.tsx`) -- diseño PROPUESTO, mismo lenguaje
 * visual ya usado en `ManifestLoadsListScreen.tsx` (filtros Búsqueda/Estado +
 * tabla + badges de estado por color).
 *
 * `index()` solo acepta `search`/`status` como filtros -- SIN
 * `organization_id` (a diferencia de `ManifestLoadsListScreen`, ver AVISO en
 * `fetchUnloadRequests()`): el acceso DUAL NO simétrico ya lo resuelve el
 * backend por `carrier_organization_id`/`receivingBranch.organization_id`
 * del propio actor (`UnloadRequestPolicy`).
 */
export function UnloadRequestsListScreen() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('unload_requests.read')

  const [unloadRequests, setUnloadRequests] = useState<AdminUnloadRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
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
    fetchUnloadRequests({
      page,
      perPage: PER_PAGE,
      search: search || undefined,
      status: statusFilter === allFilterValue ? undefined : statusFilter,
    })
      .then((result) => {
        if (cancelled) return
        setUnloadRequests(result.data)
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
  }, [isAuthorized, page, search, statusFilter])

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
            placeholder="Buscar por número de solicitud…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar solicitudes de descargue"
          />
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
                <TableHead>Sede Receptora</TableHead>
                <TableHead>Transportador</TableHead>
                <TableHead>Programación</TableHead>
                <TableHead>Modalidad</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unloadRequests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No hay solicitudes de descargue que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {unloadRequests.map((unloadRequest) => (
                <TableRow key={unloadRequest.id}>
                  <TableCell>
                    <Button
                      variant="link"
                      className="h-auto p-0"
                      onClick={() => router.push(`/admin/unload-requests/${unloadRequest.id}`)}
                    >
                      {unloadRequest.request_number}
                    </Button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{unloadRequest.receiving_branch?.name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {unloadRequest.carrier_organization?.legal_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {unloadRequest.transport_schedule?.schedule_number ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {unloadRequest.service_modality === 'SELF_TRANSPORT' ? 'Autotransporte' : 'Recolección'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(unloadRequest.unload_request_status?.code)}>
                      {unloadRequest.unload_request_status?.name ?? '—'}
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
          Mostrando {rangeStart}–{rangeEnd} de {total} solicitudes
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
