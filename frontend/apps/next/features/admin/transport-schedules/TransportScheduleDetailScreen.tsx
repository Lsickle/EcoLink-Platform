'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TruckIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  cancelTransportSchedule,
  confirmTransportSchedule,
  createManifestLoad,
  fetchTransportSchedule,
  submitTransportSchedule,
  type AdminTransportScheduleDetail,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { createManifestLoadSchema } from 'app/features/admin/schemas'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { ContactSearchSelect } from '../ContactSearchSelect'

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
 *
 * Punto de entrada de Manifiesto de Cargue, Fase 3 (2026-07-19, sin frame de
 * Figma -- diseño PROPUESTO, ver resumen del lote): "Generar Manifiesto de
 * Cargue" gateado por `manifest_loads.create` + ser dueño de la programación
 * (mismo criterio `isOwner` de arriba) + `transport_status.code === 'CONF'`.
 * Esta precondición de estado es una DECISIÓN DE ESTE LOTE, no impuesta por
 * el backend (`ManifestLoadPolicy::create()` no valida el estado de la
 * programación) -- se eligió "Confirmada" porque es el primer estado con
 * vehículo/conductor ya fijos en firme, evitando manifiestos huérfanos si la
 * programación se reprograma después. El backend igual protege contra
 * duplicados (`manifest_loads_active_unique`) si se intenta generar más de
 * uno para la misma programación.
 *
 * `ContactSearchSelect` recibe `transportScheduleId={scheduleId}` (lote
 * 2026-07-19, cierre del gap "0 resultados" señalado en un lote anterior):
 * `OrganizationController::searchContacts()` ahora acota la búsqueda del
 * firmante a la organización Generadora real de ESTA programación (en vez de
 * la organización del actor), para que un actor de tenant normal (Gestor/
 * transportador, no platform staff) también pueda encontrar contactos del
 * Generador al crear el manifiesto.
 */
export function TransportScheduleDetailScreen({ scheduleId }: { scheduleId: number | string }) {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('transport_schedules.read')

  const [detail, setDetail] = useState<AdminTransportScheduleDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [transitionError, setTransitionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const [manifestDialogOpen, setManifestDialogOpen] = useState(false)
  const [generatorSignerPersonId, setGeneratorSignerPersonId] = useState<number | null>(null)
  const [generatorSignerPersonLabel, setGeneratorSignerPersonLabel] = useState<string | null>(null)
  const [manifestLoadDate, setManifestLoadDate] = useState('')
  const [manifestObservations, setManifestObservations] = useState('')
  const [manifestFormError, setManifestFormError] = useState<string | null>(null)
  const [isCreatingManifest, setIsCreatingManifest] = useState(false)

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

  function resetManifestForm() {
    setGeneratorSignerPersonId(null)
    setGeneratorSignerPersonLabel(null)
    setManifestLoadDate('')
    setManifestObservations('')
    setManifestFormError(null)
  }

  function handleManifestDialogOpenChange(open: boolean) {
    setManifestDialogOpen(open)
    if (!open) resetManifestForm()
  }

  async function handleCreateManifest(event: React.FormEvent) {
    event.preventDefault()
    setManifestFormError(null)

    const parsed = createManifestLoadSchema.safeParse({
      transportScheduleId: Number(scheduleId),
      generatorSignerPersonId: generatorSignerPersonId ?? 0,
      loadDate: manifestLoadDate,
      observations: manifestObservations,
    })

    if (!parsed.success) {
      setManifestFormError(parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario.')
      return
    }

    setIsCreatingManifest(true)
    try {
      const { manifest_load: created } = await createManifestLoad({
        transport_schedule_id: parsed.data.transportScheduleId,
        generator_signer_person_id: parsed.data.generatorSignerPersonId,
        load_date: parsed.data.loadDate || undefined,
        observations: parsed.data.observations || undefined,
      })
      handleManifestDialogOpenChange(false)
      router.push(`/admin/manifest-loads/${created.id}`)
    } catch (error) {
      setManifestFormError(errorMessage(error, 'generator_signer_person_id'))
    } finally {
      setIsCreatingManifest(false)
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
  // Ver AVISO completo en el docblock del componente -- precondición de
  // estado (`CONF`) decidida en este lote, no impuesta por el backend.
  const canCreateManifest = isOwner && permissions.includes('manifest_loads.create') && statusCode === 'CONF'

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
            {canCreateManifest && (
              <Dialog open={manifestDialogOpen} onOpenChange={handleManifestDialogOpenChange}>
                <DialogTrigger render={<Button size="sm" variant="outline">Generar Manifiesto de Cargue</Button>} />
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Generar Manifiesto de Cargue</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateManifest} className="flex flex-col gap-4" noValidate>
                    <ContactSearchSelect
                      label="Firmante del Generador"
                      htmlId="manifestGeneratorSignerPersonId"
                      selectedId={generatorSignerPersonId}
                      selectedLabel={generatorSignerPersonLabel}
                      transportScheduleId={scheduleId}
                      onSelect={(result) => {
                        setGeneratorSignerPersonId(result.id)
                        setGeneratorSignerPersonLabel(`${result.first_name} ${result.last_name} (${result.document_number})`)
                      }}
                      onClear={() => {
                        setGeneratorSignerPersonId(null)
                        setGeneratorSignerPersonLabel(null)
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Debe ser un contacto de la organización Generadora dueña de la sede de origen ({detail.source_branch.name}),
                      no de tu propia organización.
                    </p>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="manifestLoadDate">
                        Fecha de Cargue <span className="text-muted-foreground">(opcional)</span>
                      </Label>
                      <Input
                        id="manifestLoadDate"
                        type="date"
                        value={manifestLoadDate}
                        onChange={(event) => setManifestLoadDate(event.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="manifestObservations">
                        Observaciones <span className="text-muted-foreground">(opcional)</span>
                      </Label>
                      <Input
                        id="manifestObservations"
                        value={manifestObservations}
                        onChange={(event) => setManifestObservations(event.target.value)}
                      />
                    </div>
                    {manifestFormError && (
                      <p className="text-sm text-destructive" role="alert">
                        {manifestFormError}
                      </p>
                    )}
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => handleManifestDialogOpenChange(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" disabled={isCreatingManifest}>
                        {isCreatingManifest ? 'Generando…' : 'Generar Manifiesto'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
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
