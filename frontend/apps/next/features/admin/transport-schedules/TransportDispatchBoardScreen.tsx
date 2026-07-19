'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  assignTransportScheduleToRoute,
  createTransportRoute,
  fetchTransportRoute,
  fetchTransportRoutes,
  fetchTransportSchedules,
  type AdminTransportRoute,
  type AdminTransportSchedule,
} from 'app/features/admin/api'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  BOR: 'secondary',
  PEND: 'outline',
  PROG: 'outline',
  CONF: 'default',
  EJEC: 'default',
  FIN: 'default',
  CANC: 'destructive',
}

// Estados considerados NO operativos/finales -- una vez ahí, la
// programación ya no tiene sentido agrupar en una ruta (mismo criterio que
// `TransportScheduleWorkflowSeeder::NON_OPERATIONAL_STATUSES` que el
// backend ya usa para decidir qué transiciones a CANC son válidas).
const EXCLUDED_STATUS_CODES = new Set(['FIN', 'CANC'])

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

/**
 * "Dispatch board" simplificado (CU-059 "Agrupar por Zona/Ruta") -- cierre
 * del GAP DE CONTRATO de `TransportRouteController` señalado en el lote
 * anterior. Alcance deliberadamente MÍNIMO (instrucción explícita: "sin
 * drag-and-drop, lista + selects"): lista de `transport_schedules` SIN ruta
 * asignada + selector para agruparlas en una ruta ya existente o crear una
 * nueva inline, disparando `assignTransportScheduleToRoute()`
 * (`TransportScheduleController::assignToRoute()`, ya existente desde Fase
 * 2a). Sin optimización de rutas real -- ya descartada explícitamente en
 * esta sesión (agrupación manual simple, D-PRG/CU-059).
 *
 * GAP DE CONTRATO residual, documentado en vez de asumido en silencio: NO
 * existe un filtro server-side de "programaciones sin ruta asignada" --
 * `TransportScheduleController::index()` no expone ese filtro, y su fila NO
 * trae la relación `routeStop` (solo `show()` la carga, ver
 * `AdminTransportScheduleDetail.route_stop`). Enfoque elegido: (1) listar
 * las rutas ACTIVAS de la organización (`fetchTransportRoutes()`), (2)
 * pedir el detalle de CADA una (`fetchTransportRoute()`, número de rutas
 * normalmente pequeño en este alcance MVP) para conocer los
 * `transport_schedule_id` YA agrupados (`stops[].transport_schedule.id`), y
 * (3) listar TODAS las programaciones no finales de la organización
 * (`fetchTransportSchedules()`) excluyendo las que aparecen en ese conjunto
 * -- mismo espíritu de "filtrar en cliente sobre index()" ya aplicado a
 * `eligibleItems` en `CreateTransportScheduleForm.tsx`.
 */
export function TransportDispatchBoardScreen() {
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('transport_routes.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const permissions = user?.permissions ?? []
  const canAssign = permissions.includes('transport_schedules.update')
  const canCreateRoute = permissions.includes('transport_routes.create')

  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [organizationLabel, setOrganizationLabel] = useState<string | null>(null)
  const effectiveOrganizationId = isPlatformStaff ? organizationId : (user?.tenant_organization_id ?? null)

  const [routes, setRoutes] = useState<AdminTransportRoute[]>([])
  const [unassignedSchedules, setUnassignedSchedules] = useState<AdminTransportSchedule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedRouteByScheduleId, setSelectedRouteByScheduleId] = useState<Record<number, number | null>>({})
  const [assigningScheduleId, setAssigningScheduleId] = useState<number | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)

  const [showNewRouteForm, setShowNewRouteForm] = useState(false)
  const [newRouteName, setNewRouteName] = useState('')
  const [isCreatingRoute, setIsCreatingRoute] = useState(false)
  const [createRouteError, setCreateRouteError] = useState<string | null>(null)

  function reload() {
    if (effectiveOrganizationId == null && isPlatformStaff) {
      setRoutes([])
      setUnassignedSchedules([])
      return Promise.resolve()
    }
    return Promise.all([
      fetchTransportRoutes({ organizationId: effectiveOrganizationId ?? undefined, perPage: 100, isActive: true }),
      fetchTransportSchedules({ organizationId: effectiveOrganizationId ?? undefined, perPage: 100 }),
    ]).then(async ([routesResult, schedulesResult]) => {
      const activeRoutes = routesResult.data
      const routeDetails = await Promise.all(activeRoutes.map((route) => fetchTransportRoute(route.id)))
      const assignedScheduleIds = new Set<number>()
      for (const { transport_route: detail } of routeDetails) {
        for (const stop of detail.stops) {
          assignedScheduleIds.add(stop.transport_schedule_id)
        }
      }

      setRoutes(activeRoutes)
      setUnassignedSchedules(
        schedulesResult.data.filter(
          (schedule) =>
            !assignedScheduleIds.has(schedule.id) && !EXCLUDED_STATUS_CODES.has(schedule.transport_status?.code ?? '')
        )
      )
      setLoadError(null)
    })
  }

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    setIsLoading(true)
    reload()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized, effectiveOrganizationId])

  async function handleAssign(scheduleId: number) {
    const routeId = selectedRouteByScheduleId[scheduleId]
    if (!routeId) return
    setAssignError(null)
    setAssigningScheduleId(scheduleId)
    try {
      await assignTransportScheduleToRoute(scheduleId, { transport_route_id: routeId })
      await reload()
    } catch (error) {
      setAssignError(errorMessage(error, 'transport_route_id'))
    } finally {
      setAssigningScheduleId(null)
    }
  }

  async function handleCreateRoute() {
    setCreateRouteError(null)
    if (!newRouteName.trim()) {
      setCreateRouteError('Ingresa un nombre para la ruta.')
      return
    }
    setIsCreatingRoute(true)
    try {
      const { transport_route: created } = await createTransportRoute({
        organization_id: isPlatformStaff ? (organizationId ?? undefined) : undefined,
        name: newRouteName.trim(),
      })
      setRoutes((current) => [created, ...current])
      setNewRouteName('')
      setShowNewRouteForm(false)
    } catch (error) {
      setCreateRouteError(errorMessage(error, 'name'))
    } finally {
      setIsCreatingRoute(false)
    }
  }

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {isPlatformStaff && (
        <Card>
          <CardContent className="pt-4">
            <OrganizationSearchSelect
              label="Organización"
              htmlId="dispatchBoardOrganizationId"
              capability="can_transport_waste"
              selectedId={organizationId}
              selectedLabel={organizationLabel}
              onSelect={(result) => {
                setOrganizationId(result.id)
                setOrganizationLabel(result.legal_name)
              }}
              onClear={() => {
                setOrganizationId(null)
                setOrganizationLabel(null)
              }}
            />
          </CardContent>
        </Card>
      )}

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Cargando…
        </p>
      ) : isPlatformStaff && effectiveOrganizationId == null ? (
        <p className="text-sm text-muted-foreground">Selecciona una organización para ver su tablero de despacho.</p>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Programaciones Sin Ruta Asignada</CardTitle>
              {canCreateRoute && !showNewRouteForm && (
                <Button size="sm" variant="outline" onClick={() => setShowNewRouteForm(true)}>
                  + Nueva Ruta
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {showNewRouteForm && (
                <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <Label htmlFor="newRouteName">Nombre de la Nueva Ruta</Label>
                  <div className="flex gap-2">
                    <Input
                      id="newRouteName"
                      value={newRouteName}
                      onChange={(event) => setNewRouteName(event.target.value)}
                      placeholder="Ej. Ruta Zona Norte"
                    />
                    <Button size="sm" disabled={isCreatingRoute} onClick={handleCreateRoute}>
                      {isCreatingRoute ? 'Creando…' : 'Crear'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isCreatingRoute}
                      onClick={() => {
                        setShowNewRouteForm(false)
                        setNewRouteName('')
                        setCreateRouteError(null)
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                  {createRouteError && (
                    <p className="text-sm text-destructive" role="alert">
                      {createRouteError}
                    </p>
                  )}
                </div>
              )}

              {assignError && (
                <p className="text-sm text-destructive" role="alert">
                  {assignError}
                </p>
              )}

              <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Vehículo</TableHead>
                      <TableHead>Estado</TableHead>
                      {canAssign && <TableHead className="text-right">Asignar a Ruta</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unassignedSchedules.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canAssign ? 4 : 3} className="text-center text-muted-foreground">
                          No hay programaciones pendientes de agrupar en una ruta.
                        </TableCell>
                      </TableRow>
                    )}
                    {unassignedSchedules.map((schedule) => (
                      <TableRow key={schedule.id}>
                        <TableCell className="font-medium">{schedule.schedule_number}</TableCell>
                        <TableCell className="text-muted-foreground">{schedule.vehicle?.plate_number ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE_VARIANT[schedule.transport_status?.code ?? ''] ?? 'outline'}>
                            {schedule.transport_status?.name ?? '—'}
                          </Badge>
                        </TableCell>
                        {canAssign && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Select
                                items={routes.map((route) => ({ value: String(route.id), label: route.name }))}
                                value={
                                  selectedRouteByScheduleId[schedule.id] != null
                                    ? String(selectedRouteByScheduleId[schedule.id])
                                    : null
                                }
                                onValueChange={(value) =>
                                  setSelectedRouteByScheduleId((current) => ({
                                    ...current,
                                    [schedule.id]: value !== null ? Number(value) : null,
                                  }))
                                }
                              >
                                <SelectTrigger aria-label={`Ruta para ${schedule.schedule_number}`} className="w-48">
                                  <SelectValue placeholder="Selecciona una ruta" />
                                </SelectTrigger>
                                <SelectContent>
                                  {routes.map((route) => (
                                    <SelectItem key={route.id} value={String(route.id)}>
                                      {route.name} ({route.route_code})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                size="sm"
                                disabled={!selectedRouteByScheduleId[schedule.id] || assigningScheduleId === schedule.id}
                                onClick={() => handleAssign(schedule.id)}
                              >
                                {assigningScheduleId === schedule.id ? 'Asignando…' : 'Asignar'}
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rutas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Paradas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routes.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Sin rutas creadas todavía.
                        </TableCell>
                      </TableRow>
                    )}
                    {routes.map((route) => (
                      <TableRow key={route.id}>
                        <TableCell className="font-medium">{route.route_code}</TableCell>
                        <TableCell>{route.name}</TableCell>
                        <TableCell className="text-muted-foreground">{route.route_date ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{route.stops_count ?? 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
