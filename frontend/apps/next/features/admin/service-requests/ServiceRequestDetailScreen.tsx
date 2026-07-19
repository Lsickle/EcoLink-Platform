'use client'

import { useEffect, useState } from 'react'
import { ClipboardListIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  approveServiceRequestItem,
  cancelServiceRequest,
  fetchCancellationReasons,
  fetchServiceRequest,
  rejectServiceRequestItem,
  submitServiceRequest,
  type AdminCancellationReason,
  type AdminServiceRequestDetail,
  type AdminServiceRequestItem,
  type AdminServiceRequestItemReduced,
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

// Discrimina entre la forma COMPLETA de un ítem y la REDUCIDA (ítem ajeno,
// visible solo para un Gestor sin acceso a él) -- ver AVISO completo en
// `AdminServiceRequestDetail` (types.ts). `waste_id` solo existe en la forma
// completa.
function isFullServiceRequestItem(
  item: AdminServiceRequestItem | AdminServiceRequestItemReduced
): item is AdminServiceRequestItem {
  return 'waste_id' in item
}

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

/**
 * Detalle de `waste_service_requests` (CU-014, Fase 1b). Renderiza los
 * ítems CONDICIONALMENTE según la forma real de la respuesta -- ver AVISO
 * de seguridad en el docblock de `ServiceRequestController::show()`: el
 * Generador dueño/platform staff ven TODOS los ítems completos; un Gestor
 * con al menos un ítem propio ve SOLO sus propios ítems completos, los
 * ajenos se reducen a `{id, item_sequence}` + `other_items_count` agregado.
 *
 * Acciones "Aprobar"/"Rechazar" por ítem: visibles SOLO para el Gestor
 * dueño de ESE ítem específico (`item.waste_treatment_approval.organization.id
 * === user.tenant_organization_id`) o platform staff, y solo mientras el
 * ítem siga `PENDING` (D-S25, `WasteServiceRequestItem::isEvaluableBy()`).
 * Acciones de cabecera "Enviar"/"Cancelar": visibles solo para el Generador
 * dueño (o platform staff).
 */
export function ServiceRequestDetailScreen({ serviceRequestId }: { serviceRequestId: number | string }) {
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('service_requests.read')

  const [detail, setDetail] = useState<AdminServiceRequestDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [isCancelling, setIsCancelling] = useState(false)
  const [cancellationReasons, setCancellationReasons] = useState<AdminCancellationReason[]>([])
  const [isLoadingCancellationReasons, setIsLoadingCancellationReasons] = useState(false)
  const [cancellationReasonId, setCancellationReasonId] = useState<number | null>(null)
  const [cancelDetails, setCancelDetails] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false)

  const [evaluatingItemId, setEvaluatingItemId] = useState<number | null>(null)
  const [rejectingItemId, setRejectingItemId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [itemActionError, setItemActionError] = useState<string | null>(null)

  function reload() {
    return fetchServiceRequest(serviceRequestId).then((result) => {
      setDetail(result.service_request)
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
  }, [isAuthorized, serviceRequestId])

  // Catálogo de motivos de cancelación -- se carga bajo demanda (solo al
  // abrir el panel "Cancelar Solicitud"), gap de contrato ya cerrado
  // (2026-07-19, ver `fetchCancellationReasons()` en api.ts).
  // `activeOnly: true` -- nunca se ofrece un motivo inactivo en el selector.
  useEffect(() => {
    if (!isCancelling) return
    let cancelled = false
    setIsLoadingCancellationReasons(true)
    fetchCancellationReasons({ activeOnly: true })
      .then((result) => {
        if (!cancelled) setCancellationReasons(result.data)
      })
      .catch(() => {
        if (!cancelled) setCancellationReasons([])
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCancellationReasons(false)
      })
    return () => {
      cancelled = true
    }
  }, [isCancelling])

  const selectedCancellationReason = cancellationReasons.find((reason) => reason.id === cancellationReasonId) ?? null
  // RN-SOL-009 (`ServiceRequestController::cancel()`): si el motivo es
  // `is_other=true`, el backend exige `cancellation_details` no vacío -- se
  // refleja aquí como validación de UI, no solo como el 422 del backend.
  const cancellationDetailsRequired = selectedCancellationReason?.is_other === true
  const canConfirmCancel =
    cancellationReasonId != null && (!cancellationDetailsRequired || cancelDetails.trim().length > 0)

  function closeCancelPanel() {
    setIsCancelling(false)
    setCancellationReasonId(null)
    setCancelDetails('')
    setCancelError(null)
  }

  async function handleSubmit() {
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      await submitServiceRequest(serviceRequestId)
      await reload()
    } catch (error) {
      setSubmitError(errorMessage(error, 'items'))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleConfirmCancel() {
    setCancelError(null)
    if (!cancellationReasonId) {
      setCancelError('Selecciona un motivo de cancelación.')
      return
    }
    setIsConfirmingCancel(true)
    try {
      await cancelServiceRequest(serviceRequestId, {
        cancellation_reason_id: cancellationReasonId,
        cancellation_details: cancelDetails || undefined,
      })
      await reload()
      closeCancelPanel()
    } catch (error) {
      setCancelError(errorMessage(error, 'cancellation_reason_id'))
    } finally {
      setIsConfirmingCancel(false)
    }
  }

  async function handleApproveItem(itemId: number) {
    setItemActionError(null)
    setEvaluatingItemId(itemId)
    try {
      await approveServiceRequestItem(itemId)
      await reload()
    } catch (error) {
      setItemActionError(errorMessage(error, 'notes'))
    } finally {
      setEvaluatingItemId(null)
    }
  }

  async function handleConfirmRejectItem(itemId: number) {
    setItemActionError(null)
    setEvaluatingItemId(itemId)
    try {
      await rejectServiceRequestItem(itemId, { notes: rejectReason })
      await reload()
      setRejectingItemId(null)
      setRejectReason('')
    } catch (error) {
      setItemActionError(errorMessage(error, 'notes'))
    } finally {
      setEvaluatingItemId(null)
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
        {loadError ?? 'No se encontró la solicitud de servicio.'}
      </p>
    )
  }

  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const permissions = user?.permissions ?? []
  const isOwnerGenerator = isPlatformStaff || detail.organization_id === user?.tenant_organization_id

  const canSubmit = isOwnerGenerator && permissions.includes('service_requests.update') && detail.service_status?.code === 'DRAFT'
  const canCancel =
    isOwnerGenerator && permissions.includes('service_requests.cancel') && !detail.service_status?.is_terminal_status

  const statusBadgeVariant = (detail.service_status?.code && STATUS_BADGE_VARIANT[detail.service_status.code]) || 'outline'

  function canEvaluateItem(item: AdminServiceRequestItem): boolean {
    if (!permissions.includes('service_requests.evaluate')) return false
    if (isPlatformStaff) return true
    return item.waste_treatment_approval?.organization?.id === user?.tenant_organization_id
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              <ClipboardListIcon className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{detail.request_code}</CardTitle>
                <Badge variant={statusBadgeVariant}>{detail.service_status?.name ?? '—'}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {detail.organization.legal_name} · {detail.branch.name}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canSubmit && (
              <Button size="sm" disabled={isSubmitting} onClick={handleSubmit}>
                {isSubmitting ? 'Enviando…' : 'Enviar Solicitud'}
              </Button>
            )}
            {canCancel && !isCancelling && (
              <Button size="sm" variant="outline" onClick={() => setIsCancelling(true)}>
                Cancelar Solicitud
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pb-4">
          {submitError && (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          )}

          {isCancelling && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cancellationReasonId">Motivo de Cancelación *</Label>
                <Select
                  items={cancellationReasons.map((reason) => ({ value: String(reason.id), label: reason.name }))}
                  value={cancellationReasonId !== null ? String(cancellationReasonId) : null}
                  onValueChange={(value) => setCancellationReasonId(value !== null ? Number(value) : null)}
                >
                  <SelectTrigger id="cancellationReasonId" disabled={isLoadingCancellationReasons}>
                    <SelectValue placeholder={isLoadingCancellationReasons ? 'Cargando motivos…' : 'Selecciona un motivo'} />
                  </SelectTrigger>
                  <SelectContent>
                    {cancellationReasons.map((reason) => (
                      <SelectItem key={reason.id} value={String(reason.id)}>
                        {reason.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cancelDetails">
                  Detalle de la cancelación{' '}
                  {cancellationDetailsRequired ? '*' : <span className="text-muted-foreground">(opcional)</span>}
                </Label>
                <Input id="cancelDetails" value={cancelDetails} onChange={(event) => setCancelDetails(event.target.value)} />
              </div>
              {cancelError && (
                <p className="text-sm text-destructive" role="alert">
                  {cancelError}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={!canConfirmCancel || isConfirmingCancel} onClick={handleConfirmCancel}>
                  Confirmar Cancelación
                </Button>
                <Button size="sm" variant="outline" onClick={closeCancelPanel} disabled={isConfirmingCancel}>
                  Volver
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 border-b border-border pb-4 sm:grid-cols-2">
            <InfoField label="Fecha Deseada de Recolección">{detail.requested_collection_date ?? '—'}</InfoField>
            <InfoField label="Fecha Disponibilidad de Residuos">{detail.estimated_ready_date ?? '—'}</InfoField>
            <InfoField label="Prioridad">{detail.priority}</InfoField>
            <InfoField label="Origen de Solicitud">{detail.request_source}</InfoField>
            <InfoField label="Peso Estimado Total">{detail.estimated_total_weight ?? '—'}</InfoField>
            <InfoField label="Volumen Estimado Total">{detail.estimated_total_volume != null ? `${detail.estimated_total_volume} m³` : '—'}</InfoField>
            <InfoField label="Fecha de Creación">{formatDate(detail.created_at)}</InfoField>
            <InfoField label="Última Actualización">{formatDate(detail.updated_at)}</InfoField>
          </div>
          {detail.observations && (
            <InfoField label="Observaciones Generales">{detail.observations}</InfoField>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-semibold">Ítems de la Solicitud</h3>
            {detail.other_items_count != null && detail.other_items_count > 0 && (
              <Badge variant="outline">+{detail.other_items_count} ítem(s) de otros Gestores</Badge>
            )}
          </div>

          {itemActionError && (
            <p className="text-sm text-destructive" role="alert">
              {itemActionError}
            </p>
          )}

          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Residuo</TableHead>
                  <TableHead>Tratamiento</TableHead>
                  <TableHead>Cantidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.items.map((item) => {
                  if (!isFullServiceRequestItem(item)) {
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{item.item_sequence}</TableCell>
                        <TableCell colSpan={5} className="text-muted-foreground">
                          Ítem de otro Gestor -- sin acceso al detalle.
                        </TableCell>
                      </TableRow>
                    )
                  }

                  const evaluable = canEvaluateItem(item) && item.item_status?.code === 'PENDING'

                  return (
                    <TableRow key={item.id}>
                      <TableCell>{item.item_sequence}</TableCell>
                      <TableCell>
                        <div className="font-medium">{item.waste_name_snapshot}</div>
                        <div className="text-xs text-muted-foreground">{item.waste_code_snapshot ?? '—'}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <div>{item.treatment_snapshot ?? '—'}</div>
                        <div className="text-xs">{item.waste_treatment_approval?.organization.legal_name ?? '—'}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.estimated_quantity ?? '—'} {item.measurement_unit?.code ?? ''}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.item_status?.name ?? '—'}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {evaluable && rejectingItemId !== item.id && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" disabled={evaluatingItemId === item.id} onClick={() => handleApproveItem(item.id)}>
                              Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={evaluatingItemId === item.id}
                              onClick={() => setRejectingItemId(item.id)}
                            >
                              Rechazar
                            </Button>
                          </div>
                        )}
                        {rejectingItemId === item.id && (
                          <div className="flex flex-col items-end gap-2">
                            <Input
                              placeholder="Motivo del rechazo"
                              value={rejectReason}
                              onChange={(event) => setRejectReason(event.target.value)}
                              aria-label={`Motivo del rechazo para el ítem ${item.item_sequence}`}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={evaluatingItemId === item.id || !rejectReason.trim()}
                                onClick={() => handleConfirmRejectItem(item.id)}
                              >
                                Confirmar Rechazo
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setRejectingItemId(null)}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
