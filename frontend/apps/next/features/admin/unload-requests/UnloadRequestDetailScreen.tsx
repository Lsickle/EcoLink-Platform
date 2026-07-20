'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PackageSearchIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  approveUnloadRequest,
  createManifestUnload,
  fetchUnloadRequest,
  rejectUnloadRequest,
  submitUnloadRequest,
  type AdminUnloadRequestDetail,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { createManifestUnloadSchema } from 'app/features/admin/schemas'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { ContactSearchSelect } from '../ContactSearchSelect'
import { PlantReceptionSchedulePanel } from './PlantReceptionSchedulePanel'

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
  DRAFT: 'secondary',
  SUBMITTED: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
}

/**
 * Detalle de `unload_requests` (Fase 4 "Cita de Recepción en Planta
 * (bilateral)"). Sin frame de Figma propio para esta pantalla (el frame
 * confirmado cubre la Agenda semanal y "Programar Recepción" -- ver
 * `PlantReceptionAgendaScreen.tsx`) -- diseño PROPUESTO, mismo lenguaje
 * visual ya usado en `ManifestLoadDetailScreen.tsx` (cabecera con badge de
 * estado + botones de transición, tabla de ítems), agregando el panel de
 * negociación bilateral de franja (`PlantReceptionSchedulePanel.tsx`, propio
 * de este dominio).
 *
 * Acceso DUAL NO SIMÉTRICO (ver `UnloadRequestPolicy`): el lado
 * TRANSPORTADOR (`carrier_organization_id`) envía (`submit`); el lado
 * RECEPTOR (dueño de `receiving_branch_id`) decide (`approve`/`reject`).
 * Ambos lados participan en la negociación de franja (delegado a
 * `PlantReceptionSchedulePanel`).
 *
 * Punto de entrada de Manifiesto de Descargue, Fase 5 -- ÚLTIMA fase del
 * plan (2026-07-20, sin frame de Figma confirmado para esta acción propia --
 * ver resumen del lote): "Generar Manifiesto de Descargue" gateado por
 * `manifest_unloads.create` + ser dueño de la sede Receptora (mismo criterio
 * `isReceivingOwner` de abajo) + la solicitud `APPROVED` + la franja de
 * recepción activa ya `CONFIRMED` (ver
 * `ManifestUnloadController::assertUnloadRequestReadyForUnload()` -- esta SÍ
 * es una precondición impuesta por el backend, a diferencia del `CONF` de
 * "Generar Manifiesto de Cargue" en `TransportScheduleDetailScreen.tsx`, que
 * era una decisión propia de aquel lote).
 *
 * `ContactSearchSelect` se usa SIN `transportScheduleId` -- a diferencia de
 * Fase 3, aquí el firmante Receptor pertenece a la MISMA organización del
 * actor que crea el manifiesto (no hace falta acotar la búsqueda a una
 * organización cruzada), el backend ya auto-limita la búsqueda de contactos
 * al tenant del actor.
 */
export function UnloadRequestDetailScreen({ unloadRequestId }: { unloadRequestId: number | string }) {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('unload_requests.read')

  const [detail, setDetail] = useState<AdminUnloadRequestDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [transitionError, setTransitionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isApproving, setIsApproving] = useState(false)

  const [rejecting, setRejecting] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [isRejecting, setIsRejecting] = useState(false)

  const [manifestDialogOpen, setManifestDialogOpen] = useState(false)
  const [receiverPersonId, setReceiverPersonId] = useState<number | null>(null)
  const [receiverPersonLabel, setReceiverPersonLabel] = useState<string | null>(null)
  const [manifestUnloadDate, setManifestUnloadDate] = useState('')
  const [manifestObservations, setManifestObservations] = useState('')
  const [manifestFormError, setManifestFormError] = useState<string | null>(null)
  const [isCreatingManifest, setIsCreatingManifest] = useState(false)

  function reload() {
    return fetchUnloadRequest(unloadRequestId).then((result) => {
      setDetail(result.unload_request)
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
  }, [isAuthorized, unloadRequestId])

  async function handleSubmit() {
    setTransitionError(null)
    setIsSubmitting(true)
    try {
      await submitUnloadRequest(unloadRequestId)
      await reload()
    } catch (error) {
      setTransitionError(errorMessage(error, 'unload_request_status'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleApprove() {
    setTransitionError(null)
    setIsApproving(true)
    try {
      await approveUnloadRequest(unloadRequestId)
      await reload()
    } catch (error) {
      setTransitionError(errorMessage(error, 'unload_request_status'))
    } finally {
      setIsApproving(false)
    }
  }

  async function handleConfirmReject() {
    setRejectError(null)
    if (!rejectionReason.trim()) {
      setRejectError('El motivo de rechazo es obligatorio.')
      return
    }
    setIsRejecting(true)
    try {
      await rejectUnloadRequest(unloadRequestId, { rejection_reason: rejectionReason.trim() })
      setRejecting(false)
      setRejectionReason('')
      await reload()
    } catch (error) {
      setRejectError(errorMessage(error, 'rejection_reason'))
    } finally {
      setIsRejecting(false)
    }
  }

  function resetManifestForm() {
    setReceiverPersonId(null)
    setReceiverPersonLabel(null)
    setManifestUnloadDate('')
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

    const parsed = createManifestUnloadSchema.safeParse({
      unloadRequestId: Number(unloadRequestId),
      receiverPersonId: receiverPersonId ?? 0,
      unloadDate: manifestUnloadDate,
      observations: manifestObservations,
    })

    if (!parsed.success) {
      setManifestFormError(parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario.')
      return
    }

    setIsCreatingManifest(true)
    try {
      const { manifest_unload: created } = await createManifestUnload({
        unload_request_id: parsed.data.unloadRequestId,
        receiver_person_id: parsed.data.receiverPersonId,
        unload_date: parsed.data.unloadDate || undefined,
        observations: parsed.data.observations || undefined,
      })
      handleManifestDialogOpenChange(false)
      router.push(`/admin/manifest-unloads/${created.id}`)
    } catch (error) {
      setManifestFormError(errorMessage(error, 'receiver_person_id'))
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
        {loadError ?? 'No se encontró la solicitud de descargue.'}
      </p>
    )
  }

  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const permissions = user?.permissions ?? []
  const isCarrierOwner = isPlatformStaff || (detail.carrier_organization_id !== null && detail.carrier_organization_id === user?.tenant_organization_id)
  const isReceivingOwner = isPlatformStaff || detail.receiving_branch.organization_id === user?.tenant_organization_id
  const statusCode = detail.unload_request_status.code

  const canSubmit = isCarrierOwner && permissions.includes('unload_requests.update') && statusCode === 'DRAFT'
  const canDecide = isReceivingOwner && permissions.includes('unload_requests.decide') && statusCode === 'SUBMITTED'

  const statusBadgeVariant = STATUS_BADGE_VARIANT[statusCode] || 'outline'
  const canManageSchedule = permissions.includes('plant_reception_schedules.manage')
  // Ver AVISO completo en el docblock del componente -- a diferencia del
  // `CONF` de "Generar Manifiesto de Cargue" (decisión propia de aquel
  // lote), esta precondición SÍ la impone el backend
  // (`assertUnloadRequestReadyForUnload()`).
  const canCreateManifestUnload =
    isReceivingOwner &&
    permissions.includes('manifest_unloads.create') &&
    statusCode === 'APPROVED' &&
    detail.active_reception_schedule?.status === 'CONFIRMED'

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              <PackageSearchIcon className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{detail.request_number}</CardTitle>
                <Badge variant={statusBadgeVariant}>{detail.unload_request_status.name}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {detail.receiving_branch.name}
                {detail.carrier_organization ? ` · ${detail.carrier_organization.legal_name}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canSubmit && (
              <Button size="sm" disabled={isSubmitting} onClick={handleSubmit}>
                {isSubmitting ? 'Enviando…' : 'Enviar'}
              </Button>
            )}
            {canDecide && (
              <>
                <Button size="sm" disabled={isApproving} onClick={handleApprove}>
                  {isApproving ? 'Aprobando…' : 'Aprobar'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
                  Rechazar
                </Button>
              </>
            )}
            {canCreateManifestUnload && (
              <Dialog open={manifestDialogOpen} onOpenChange={handleManifestDialogOpenChange}>
                <DialogTrigger render={<Button size="sm" variant="outline">Generar Manifiesto de Descargue</Button>} />
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Generar Manifiesto de Descargue</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateManifest} className="flex flex-col gap-4" noValidate>
                    <ContactSearchSelect
                      label="Firmante del Receptor"
                      htmlId="manifestUnloadReceiverPersonId"
                      selectedId={receiverPersonId}
                      selectedLabel={receiverPersonLabel}
                      onSelect={(result) => {
                        setReceiverPersonId(result.id)
                        setReceiverPersonLabel(`${result.first_name} ${result.last_name} (${result.document_number})`)
                      }}
                      onClear={() => {
                        setReceiverPersonId(null)
                        setReceiverPersonLabel(null)
                      }}
                    />
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="manifestUnloadDate">
                        Fecha de Descargue <span className="text-muted-foreground">(opcional)</span>
                      </Label>
                      <Input
                        id="manifestUnloadDate"
                        type="date"
                        value={manifestUnloadDate}
                        onChange={(event) => setManifestUnloadDate(event.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="manifestUnloadObservations">
                        Observaciones <span className="text-muted-foreground">(opcional)</span>
                      </Label>
                      <Input
                        id="manifestUnloadObservations"
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
            <InfoField label="Sede Receptora">{detail.receiving_branch.name}</InfoField>
            <InfoField label="Modalidad">
              {detail.service_modality === 'SELF_TRANSPORT' ? 'Autotransporte' : 'Recolección'}
            </InfoField>
            <InfoField label="Programación de Transporte">{detail.transport_schedule?.schedule_number ?? '—'}</InfoField>
            <InfoField label="Vehículo">{detail.vehicle?.plate_number ?? '—'}</InfoField>
            <InfoField label="Fecha Estimada de Llegada">
              {detail.estimated_arrival_at ? formatDate(detail.estimated_arrival_at) : '—'}
            </InfoField>
            <InfoField label="Última Actualización">{formatDate(detail.updated_at)}</InfoField>
          </div>
          {detail.rejection_reason && <InfoField label="Motivo de Rechazo">{detail.rejection_reason}</InfoField>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h3 className="border-b border-border pb-3 text-sm font-semibold">Ítems Solicitados</h3>
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Residuo</TableHead>
                  <TableHead>Cantidad Solicitada</TableHead>
                  <TableHead>Empaque</TableHead>
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
                      {item.requested_quantity} {item.unit_of_measure}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.packaging_type ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PlantReceptionSchedulePanel
        unloadRequestId={unloadRequestId}
        unloadRequestStatusCode={statusCode}
        receivingBranchId={detail.receiving_branch.id}
        schedule={detail.active_reception_schedule}
        canManage={canManageSchedule}
        onChanged={() => {
          reload()
        }}
      />

      <AlertDialog open={rejecting} onOpenChange={(open) => !open && setRejecting(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechazar solicitud {detail.request_number}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rejectionReason">Motivo de Rechazo</Label>
            <textarea
              id="rejectionReason"
              className="min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
            />
            {rejectError && (
              <p className="text-sm text-destructive" role="alert">
                {rejectError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <Button variant="outline" disabled={isRejecting} onClick={() => setRejecting(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={isRejecting} onClick={handleConfirmReject}>
              {isRejecting ? 'Rechazando…' : 'Confirmar rechazo'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
