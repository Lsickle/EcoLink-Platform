'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  fetchVehicleTypes,
  fetchVehicles,
  type AdminVehicle,
  type AdminVehicleType,
  type VehicleKpis,
  type VehicleOperationalStatus,
} from 'app/features/admin/api'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from './OrganizationSearchSelect'

const PER_PAGE = 15
const SEARCH_DEBOUNCE_MS = 300
const allFilterValue = 'all'

// RN-VEH: `operational_status` es lista cerrada de texto (no catálogo FK) --
// ver `VehicleController::OPERATIONAL_STATUSES`. Etiquetas del wireframe
// CU-051.1 ("Gestión de Vehículos"): Operativo/Fuera de Servicio/En
// Mantenimiento.
const OPERATIONAL_STATUSES: VehicleOperationalStatus[] = ['ACTIVE', 'OUT_OF_SERVICE', 'MAINTENANCE']

const STATUS_LABELS: Record<VehicleOperationalStatus, string> = {
  ACTIVE: 'Operativo',
  OUT_OF_SERVICE: 'Fuera de Servicio',
  MAINTENANCE: 'En Mantenimiento',
}

const STATUS_BADGE_VARIANT: Record<VehicleOperationalStatus, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  OUT_OF_SERVICE: 'destructive',
  MAINTENANCE: 'secondary',
}

const statusFilterOptions = [
  { value: allFilterValue, label: 'Todos' },
  ...OPERATIONAL_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
]

const booleanFilterOptions = [
  { value: allFilterValue, label: 'Todos' },
  { value: 'true', label: 'Sí' },
  { value: 'false', label: 'No' },
]

const emptyKpis: VehicleKpis = { total: 0, active: 0, inactive: 0 }

// CU-051.1 (Gestión de Vehículos) -- acceso DUAL, mismo mecanismo EXACTO que
// BranchesListScreen.tsx: platform staff ve/gestiona TODOS los vehículos de
// cualquier organización; un admin de tenant (o un usuario con permiso
// `vehicles.read` sin ser platform staff) solo ve los de su propia
// organización. 3 KPIs reales (objeto PLANO {total,active,inactive}, no los
// 6 KPIs del wireframe -- SOAT/Tecno. Próx. Vencer y Vehículos RESPEL no
// tienen endpoint que los calcule, se recortan a lo que el backend
// realmente devuelve, ver `VehicleController::statusKpis()`) + filtros
// (búsqueda, Organización [solo platform staff], Tipo de Vehículo, Estado
// Operativo, RESPEL, GPS) + tabla, mismo patrón de debounce/paginación
// server-side que BranchesListScreen.tsx.
export function VehiclesListScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('vehicles.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [vehicles, setVehicles] = useState<AdminVehicle[]>([])
  const [kpis, setKpis] = useState<VehicleKpis>(emptyKpis)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [organizationFilterId, setOrganizationFilterId] = useState<number | null>(null)
  const [organizationFilterLabel, setOrganizationFilterLabel] = useState<string | null>(null)
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState(allFilterValue)
  const [statusFilter, setStatusFilter] = useState(allFilterValue)
  const [hazmatFilter, setHazmatFilter] = useState(allFilterValue)
  const [gpsFilter, setGpsFilter] = useState(allFilterValue)

  const [vehicleTypes, setVehicleTypes] = useState<AdminVehicleType[]>([])

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!isAuthorized) return
    fetchVehicleTypes({ perPage: 100, status: 'active' })
      .then((result) => setVehicleTypes(result.data))
      .catch(() => {})
  }, [isAuthorized])

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
    fetchVehicles({
      page,
      perPage: PER_PAGE,
      search: search || undefined,
      organizationId: isPlatformStaff && organizationFilterId ? organizationFilterId : undefined,
      vehicleTypeId: vehicleTypeFilter === allFilterValue ? undefined : vehicleTypeFilter,
      operationalStatus: statusFilter === allFilterValue ? undefined : statusFilter,
      supportsHazmat: hazmatFilter === allFilterValue ? undefined : hazmatFilter === 'true',
      hasGps: gpsFilter === allFilterValue ? undefined : gpsFilter === 'true',
    })
      .then((result) => {
        if (cancelled) return
        setVehicles(result.data)
        setKpis(result.kpis)
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
  }, [isAuthorized, page, search, isPlatformStaff, organizationFilterId, vehicleTypeFilter, statusFilter, hazmatFilter, gpsFilter])

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  const vehicleTypeFilterItems = [
    { value: allFilterValue, label: 'Todos los tipos' },
    ...vehicleTypes.map((type) => ({ value: String(type.id), label: type.name })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-t-4 border-t-foreground/20 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="text-2xl font-semibold">{kpis.total}</span>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Activos</span>
            <span className="text-2xl font-semibold">{kpis.active}</span>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-muted-foreground/40 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Inactivos</span>
            <span className="text-2xl font-semibold">{kpis.inactive}</span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Buscar por placa, código o marca…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar vehículos"
          />
          {isPlatformStaff && (
            <div className="sm:w-64">
              <OrganizationSearchSelect
                label="Organización"
                htmlId="vehicleOrganizationFilter"
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
            items={vehicleTypeFilterItems}
            value={vehicleTypeFilter}
            onValueChange={(value) => {
              if (!value) return
              setVehicleTypeFilter(value as string)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por tipo de vehículo" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {vehicleTypeFilterItems.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={statusFilterOptions}
            value={statusFilter}
            onValueChange={(value) => {
              if (!value) return
              setStatusFilter(value as string)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por estado operativo" className="w-full sm:w-44">
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
          <Select
            items={booleanFilterOptions}
            value={hazmatFilter}
            onValueChange={(value) => {
              if (!value) return
              setHazmatFilter(value as string)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por RESPEL" className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {booleanFilterOptions.map((option) => (
                <SelectItem key={`hazmat-${option.value}`} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={booleanFilterOptions}
            value={gpsFilter}
            onValueChange={(value) => {
              if (!value) return
              setGpsFilter(value as string)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por GPS" className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {booleanFilterOptions.map((option) => (
                <SelectItem key={`gps-${option.value}`} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => router.push('/admin/vehicles/new')}>+ Crear Vehículo</Button>
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
                <TableHead>Placa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Marca / Modelo</TableHead>
                <TableHead>Capacidad</TableHead>
                <TableHead>RESPEL</TableHead>
                <TableHead>GPS</TableHead>
                <TableHead>Estado</TableHead>
                {isPlatformStaff && <TableHead>Organización</TableHead>}
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isPlatformStaff ? 8 : 7} className="text-center text-muted-foreground">
                    No hay vehículos que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {vehicles.map((vehicle) => (
                <TableRow key={vehicle.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => router.push(`/admin/vehicles/${vehicle.id}`)}
                    >
                      <div className="font-medium">{vehicle.plate_number}</div>
                      <div className="text-xs text-muted-foreground">{vehicle.code ?? '—'}</div>
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{vehicle.vehicle_type?.name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {vehicle.brand ?? '—'}
                    {vehicle.model ? ` ${vehicle.model}` : ''}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {vehicle.max_load_capacity != null ? `${vehicle.max_load_capacity} ${vehicle.capacity_unit}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={vehicle.supports_hazmat ? 'default' : 'secondary'}>
                      {vehicle.supports_hazmat ? 'Sí' : 'No'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={vehicle.has_gps ? 'default' : 'secondary'}>{vehicle.has_gps ? 'Sí' : 'No'}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[vehicle.operational_status]}>
                      {STATUS_LABELS[vehicle.operational_status]}
                    </Badge>
                  </TableCell>
                  {isPlatformStaff && (
                    <TableCell className="text-muted-foreground">{vehicle.organization?.legal_name ?? '—'}</TableCell>
                  )}
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="outline" size="sm" aria-label={`Acciones para ${vehicle.plate_number}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/admin/vehicles/${vehicle.id}`)}>
                          Ver detalle
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="text-sm text-muted-foreground">
          Mostrando {rangeStart}–{rangeEnd} de {total} vehículos
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
