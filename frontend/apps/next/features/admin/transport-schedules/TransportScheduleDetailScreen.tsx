'use client'

import { useEffect, useState } from 'react'
import { TruckIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  cancelTransportSchedule,
  confirmTransportSchedule,
  fetchTransportSchedule,
  submitTransportSchedule,
  type AdminTransportScheduleDetail,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useAuth, useRequireAuth } from 'app/provider/auth'

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  BOR: 'secondary',
  PEND: 'outline',
  PROG: 'outline',
  CONF: 'default',
  EJEC: 'default',
  FIN: 'default',
  CANC: 'destructive',
}

/**
 * Detalle de `transport_schedules` (CU-026 en adelante, Módulo Programación
 * Logística Fase 2a). Acciones de transición ("Enviar"/"Confirmar"/
 * "Cancelar") visibles solo para quien tenga acceso Y el permiso granular
 * correspondiente -- mismo criterio EXACTO que
 * `ServiceRequestDetailScreen.tsx` (`TransportSchedulePolicy::update()`/
 * `::cancel()`, ambos exigen además que el estado actual no sea final).
 *
 * Sin acción "Asignar a Ruta" (CU-059, `assignToRoute()`) -- GAP DE CONTRATO
 * explícito: NO existe todavía un `TransportRouteController` para listar/
 * crear `transport_routes`, ver AVISO completo en
 * `AssignTransportScheduleToRoutePayload` (types.ts). Se señala en vez de
 * adivinar un contrato de rutas.
 */
export function TransportScheduleDetailScreen({ scheduleId }: { scheduleId: number | string }) {
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('transport_schedules.read')

  const [detail, setDetail] = useState<AdminTransportScheduleDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [transitionError, setTransitionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  function reload() {
    return fetchTransportSchedule(scheduleId).then((result) => {
      setDetail(result.transport_schedule)
      setLoadError(null)
    })
  }

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
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
  }, [isAuthorized, scheduleId])

  async function handleSubmit() {
    setTransitionError(null)
    setIsSubmitting(true)
    try {
      await submitTransportSchedule(scheduleId)
      await reload()
    } catch (error) {
      setTransitionError(errorMessage(error, 'transport_status'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleConfirm() {
    setTransitionError(null)
    setIsConfirming(true)
    try {
      await confirmTransportSchedule(scheduleId)
      await reload()
    } catch (error) {
      setTransitionError(errorMessage(error, 'transport_status'))
    } finally {
      setIsConfirming(false)
    }
  }

  async function handleCancel() {
    setTransitionError(null)
    setIsCancelling(true)
    try {
      await cancelTransportSchedule(scheduleId)
      await reload()
    } catch (error) {
      setTransitionError(errorMessage(error, 'transport_status'))
    } finally {
      setIsCancelling(false)
    }
  }

  if (!isAuthorized || isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (loadError || !detail) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró la programación de transporte.'}
      </p>
    )
  }

  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const permissions = user?.permissions ?? []
  const isOwner = isPlatformStaff || detail.organization_id === user?.tenant_organization_id
  const statusCode = detail.transport_status?.code
  const isFinal = detail.transport_status?.is_final === true

  const canUpdate = isOwner && permissions.includes('transport_schedules.update') && !isFinal
  const canSubmit = canUpdate && statusCode === 'BOR'
  const canConfirm = canUpdate && (statusCode === 'PEND' || statusCode === 'PROG')
  const canCancel = isOwner && permissions.includes('transport_schedules.cancel') && !isFinal

  const statusBadgeVariant = (statusCode && STATUS_BADGE_VARIANT[statusCode]) || 'outline'

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              <TruckIcon className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{detail.schedule_number}</CardTitle>
                <Badge variant={statusBadgeVariant}>{detail.transport_status?.name ?? '—'}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {detail.organization.legal_name} · {detail.waste_service_request.request_code}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canSubmit && (
              <Button size="sm" disabled={isSubmitting} onClick={handleSubmit}>
                {isSubmitting ? 'Enviando…' : 'Enviar'}
              </Button>
            )}
            {canConfirm && (
              <Button size="sm" disabled={isConfirming} onClick={handleConfirm}>
                {isConfirming ? 'Confirmando…' : 'Confirmar'}
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="outline" disabled={isCancelling} onClick={handleCancel}>
                {isCancelling ? 'Cancelando…' : 'Cancelar'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {transitionError && (
            <p className="text-sm text-destructive" role="alert">
              {transitionError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 border-b border-border pb-4 sm:grid-cols-2">
            <InfoField label="Vehículo">
              {detail.vehicle.plate_number} {detail.vehicle.brand ? `· ${detail.vehicle.brand} ${detail.vehicle.model ?? ''}` : ''}
            </InfoField>
            <InfoField label="Conductor">
              {detail.transport_personnel.person.first_name} {detail.transport_personnel.person.last_name} ·{' '}
              {detail.transport_personnel.license_number}
            </InfoField>
            <InfoField label="Sede de Origen">{detail.source_branch.name}</InfoField>
            <InfoField label="Sede de Destino">{detail.destination_branch.name}</InfoField>
            <InfoField label="Fecha Programada de Recolección">{formatDate(detail.scheduled_pickup_at)}</InfoField>
            <InfoField label="Prioridad">{detail.priority}</InfoField>
            {detail.route_stop && (
              <InfoField label="Ruta Asignada">
                {detail.route_stop.transport_route.route_code} (parada #{detail.route_stop.stop_sequence})
              </InfoField>
            )}
            <InfoField label="Última Actualización">{formatDate(detail.updated_at)}</InfoField>
          </div>
          {detail.observations && <InfoField label="Observaciones">{detail.observations}</InfoField>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h3 className="border-b border-border pb-3 text-sm font-semibold">Ítems Programados</h3>
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Residuo</TableHead>
                  <TableHead>Cantidad Programada</TableHead>
                  <TableHead>Peso Estimado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Sin ítems asociados.
                    </TableCell>
                  </TableRow>
                )}
                {detail.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.waste?.name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{item.waste?.code ?? '—'}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.scheduled_quantity} {item.measurement_unit?.code ?? ''}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.estimated_weight_kg ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
