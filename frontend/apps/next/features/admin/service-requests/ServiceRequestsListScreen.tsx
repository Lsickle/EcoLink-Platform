'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchServiceRequests, type AdminServiceRequest } from 'app/features/admin/api'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'

const PER_PAGE = 15
const SEARCH_DEBOUNCE_MS = 300
const allFilterValue = 'all'

// `service_statuses.code` reales sembrados (D-S02, esquema-bd punto 15) --
// catálogo GLOBAL (`is_system_status=true`), no un enum hardcodeado del
// frontend: se usan estos 9 códigos como filtro porque son los únicos
// confirmados por el seeder base, pero cada Gestor podría tener estados
// personalizados adicionales (`organization_id` seteado) que este filtro no
// lista -- limitación conocida, igual que el resto de filtros por catálogo
// personalizable del proyecto (ver `WorkflowsListScreen` para el mismo
// patrón).
const STATUS_FILTER_OPTIONS = [
  { value: allFilterValue, label: 'Todos' },
  { value: 'DRAFT', label: 'Borrador' },
  { value: 'SUBMITTED', label: 'Enviada' },
  { value: 'UNDER_REVIEW', label: 'En Revisión' },
  { value: 'APPROVED', label: 'Aprobada' },
  { value: 'REJECTED', label: 'Rechazada' },
  { value: 'SCHEDULED', label: 'Programada' },
  { value: 'IN_EXECUTION', label: 'En Ejecución' },
  { value: 'COMPLETED', label: 'Completada' },
  { value: 'CANCELLED', label: 'Cancelada' },
]

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  SUBMITTED: 'outline',
  UNDER_REVIEW: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
  SCHEDULED: 'default',
  IN_EXECUTION: 'default',
  COMPLETED: 'default',
  CANCELLED: 'destructive',
}

function statusBadgeVariant(code: string | undefined): 'default' | 'secondary' | 'destructive' | 'outline' {
  return (code && STATUS_BADGE_VARIANT[code]) || 'outline'
}

/**
 * Listado de `waste_service_requests` (CU-014, Fase 1b). Acceso NO
 * simétrico (ver docblock de `ServiceRequestPolicy`/
 * `ServiceRequestController::index()`): un Generador ve SUS solicitudes, un
 * Gestor ve las solicitudes donde tiene al menos un ítem asignado, platform
 * staff ve todas (filtro Organización opcional) -- una misma organización
 * con doble capacidad ve la UNIÓN de ambos criterios, el frontend no elige
 * cuál mostrar.
 */
export function ServiceRequestsListScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('service_requests.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [serviceRequests, setServiceRequests] = useState<AdminServiceRequest[]>([])
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
    fetchServiceRequests({
      page,
      perPage: PER_PAGE,
      search: search || undefined,
      organizationId: isPlatformStaff && organizationFilterId ? organizationFilterId : undefined,
      status: statusFilter === allFilterValue ? undefined : statusFilter,
    })
      .then((result) => {
        if (cancelled) return
        setServiceRequests(result.data)
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
            placeholder="Buscar por código de solicitud…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar solicitudes de servicio"
          />
          {isPlatformStaff && (
            <div className="sm:w-64">
              <OrganizationSearchSelect
                label="Organización"
                htmlId="serviceRequestOrganizationFilter"
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
            <SelectTrigger aria-label="Filtrar por estado" className="w-full sm:w-48">
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
        <Button onClick={() => router.push('/admin/service-requests/new')}>+ Nueva Solicitud</Button>
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
                <TableHead>Sede</TableHead>
                {isPlatformStaff && <TableHead>Organización</TableHead>}
                <TableHead>Fecha Deseada</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serviceRequests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isPlatformStaff ? 5 : 4} className="text-center text-muted-foreground">
                    No hay solicitudes de servicio que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {serviceRequests.map((serviceRequest) => (
                <TableRow key={serviceRequest.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => router.push(`/admin/service-requests/${serviceRequest.id}`)}
                    >
                      <span className="font-medium">{serviceRequest.request_code}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{serviceRequest.branch?.name ?? '—'}</TableCell>
                  {isPlatformStaff && (
                    <TableCell className="text-muted-foreground">{serviceRequest.organization?.legal_name ?? '—'}</TableCell>
                  )}
                  <TableCell className="text-muted-foreground">{serviceRequest.requested_collection_date ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(serviceRequest.service_status?.code)}>
                      {serviceRequest.service_status?.name ?? '—'}
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
