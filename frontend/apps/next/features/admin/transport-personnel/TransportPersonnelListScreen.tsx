'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchTransportPersonnel, type AdminTransportPersonnel } from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'

const PER_PAGE = 15
const SEARCH_DEBOUNCE_MS = 300
const allFilterValue = 'all'

const statusFilterOptions = [
  { value: allFilterValue, label: 'Todos' },
  { value: 'true', label: 'Activo' },
  { value: 'false', label: 'Inactivo' },
]

/**
 * CRUD de Conductores (`transport_personnel`, cierre del GAP DE CONTRATO
 * señalado en el lote anterior de Programación Logística, 2026-07-19 -- ver
 * docblock completo de `TransportPersonnelController`/`TransportPersonnelPolicy`).
 * "Un conductor es una `Person` YA existente como contacto de la
 * organización con cargo Conductor" (decisión de negocio verbatim) -- no
 * hay alta de persona aquí, ver `CreateTransportPersonnelForm.tsx`.
 *
 * Acceso DUAL, mismo mecanismo EXACTO que `VehiclesListScreen.tsx`: platform
 * staff ve/gestiona los conductores de CUALQUIER organización (con filtro y
 * columna "Organización"); un admin de tenant (o LOGÍSTICA, solo lectura vía
 * `transport_personnel.read`) ve solo los de la suya. Sin KPIs -- a
 * diferencia de `VehiclesListScreen.tsx`, `TransportPersonnelController::index()`
 * NO calcula un bloque `kpis` (ver docblock del controller), mismo criterio
 * ya aplicado en `ContactsListScreen.tsx` para no inventar datos que la API
 * no devuelve.
 */
export function TransportPersonnelListScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('transport_personnel.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [personnel, setPersonnel] = useState<AdminTransportPersonnel[]>([])
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
    fetchTransportPersonnel({
      page,
      perPage: PER_PAGE,
      search: search || undefined,
      organizationId: isPlatformStaff && organizationFilterId ? organizationFilterId : undefined,
      isActive: statusFilter === allFilterValue ? undefined : statusFilter === 'true',
    })
      .then((result) => {
        if (cancelled) return
        setPersonnel(result.data)
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
            placeholder="Buscar por nombre, documento o licencia…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar conductores"
          />
          {isPlatformStaff && (
            <div className="sm:w-64">
              <OrganizationSearchSelect
                label="Organización"
                htmlId="transportPersonnelOrganizationFilter"
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
            items={statusFilterOptions}
            value={statusFilter}
            onValueChange={(value) => {
              if (!value) return
              setStatusFilter(value as string)
              setPage(1)
            }}
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
        <Button onClick={() => router.push('/admin/transport-personnel/new')}>+ Registrar Conductor</Button>
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
                <TableHead>Contacto</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Licencia</TableHead>
                <TableHead>Mercancías Peligrosas</TableHead>
                <TableHead>Estado</TableHead>
                {isPlatformStaff && <TableHead>Organización</TableHead>}
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {personnel.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isPlatformStaff ? 7 : 6} className="text-center text-muted-foreground">
                    No hay conductores que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {personnel.map((driver) => (
                <TableRow key={driver.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => router.push(`/admin/transport-personnel/${driver.id}`)}
                    >
                      <div className="font-medium">{driver.person?.full_name ?? `Conductor #${driver.id}`}</div>
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{driver.person?.document_number ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {driver.license_number ?? '—'}
                    {driver.license_category ? ` · ${driver.license_category}` : ''}
                    {driver.license_expiration_date ? ` · vence ${formatDate(driver.license_expiration_date)}` : ''}
                  </TableCell>
                  <TableCell>
                    <Badge variant={driver.has_hazmat_permit ? 'default' : 'secondary'}>
                      {driver.has_hazmat_permit ? 'Sí' : 'No'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={driver.is_active ? 'default' : 'secondary'}>
                      {driver.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  {isPlatformStaff && (
                    <TableCell className="text-muted-foreground">{driver.organization?.legal_name ?? '—'}</TableCell>
                  )}
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/admin/transport-personnel/${driver.id}`)}
                    >
                      Ver detalle
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="text-sm text-muted-foreground">
          Mostrando {rangeStart}–{rangeEnd} de {total} conductores
        </span>
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
  )
}
