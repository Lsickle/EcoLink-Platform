'use client'

import { useEffect, useState } from 'react'
import { PackageCheckIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  cancelManifestUnload,
  completeManifestUnload,
  deleteFile,
  fetchManifestUnload,
  fetchManifestUnloadFiles,
  generateManifestUnload,
  getFileDownloadUrl,
  inspectManifestUnloadItems,
  signManifestUnload,
  uploadFile,
  type AdminFile,
  type AdminManifestUnloadDetail,
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
  DRAFT: 'secondary',
  GENERATED: 'outline',
  PARTIALLY_SIGNED: 'outline',
  SIGNED: 'default',
  CLOSED: 'default',
  CANCELLED: 'destructive',
}

// Estados desde los que `ManifestUnloadSignatureService::sign()` acepta una
// firma nueva -- mismo valor exacto que `SIGNABLE_STATUSES` del backend.
const SIGNABLE_STATUSES = ['GENERATED', 'PARTIALLY_SIGNED']

function SignaturePanel({
  title,
  personName,
  signedAt,
  canSign,
  isSigning,
  onSign,
}: {
  title: string
  personName: string
  signedAt: string | null
  canSign: boolean
  isSigning: boolean
  onSign: () => void
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">{title}</h4>
          <Badge variant={signedAt ? 'default' : 'outline'}>{signedAt ? 'Firmado' : 'Pendiente'}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{personName}</p>
        {signedAt ? (
          <p className="text-xs text-muted-foreground">Firmado el {formatDate(signedAt)}</p>
        ) : canSign ? (
          <Button size="sm" disabled={isSigning} onClick={onSign}>
            {isSigning ? 'Firmando…' : `Firmar como ${title}`}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Falta esta firma.</p>
        )}
      </CardContent>
    </Card>
  )
}

type ItemDraft = {
  id: number
  received_quantity: string
  rejected_quantity: string
  reception_condition: string
}

/**
 * Detalle de `manifest_unloads` (Módulo Manifiesto de Descargue, Fase 5 --
 * ÚLTIMA fase del plan, backend cerrado). Sin frame de Figma confirmado en
 * esta sesión (ver AVISO completo en el docblock de `AdminManifestUnload`,
 * types.ts, sobre el GAP de diseño original -- entidades separadas
 * `vehicle_checkins`/`weight_tickets`/`reception_inspections`/
 * `difference_tickets` que NO se construyeron). Diseño PROPUESTO: mismo
 * lenguaje visual EXACTO que `ManifestLoadDetailScreen.tsx` (cabecera con
 * badge de estado + botones de transición, panel de firmas, tabla de
 * ítems), con 2 secciones propias de este dominio que Fase 3 no tenía:
 *   - Inspección de ítems editable (SOLO en Draft, SOLO el receptor) --
 *     colapsa lo que el diseño original habría llamado "inspección física"
 *     en una edición directa de `manifest_unload_items` + totales agregados
 *     de cabecera (RN-107/108), sin un formulario de "ticket de peso"
 *     independiente (esa tabla nunca se construyó).
 *   - Evidencias fotográficas (subsistema transversal `files`,
 *     `entity_type=MANIFEST_UNLOAD`/`PHOTO_EVIDENCE`) -- mismo componente de
 *     subida ya usado en el wizard de Residuos (`uploadFile()`/`deleteFile()`).
 *     El listado de evidencias ya subidas usa `fetchManifestUnloadFiles()`,
 *     un endpoint agregado en este mismo lote (ver docblock de
 *     `ManifestUnloadController::files()`) -- cierre de un gap de contrato
 *     análogo al que `WasteController::files()` ya resolvía para `WASTE`.
 *
 * Acceso DUAL NO SIMÉTRICO INVERTIDO respecto a `ManifestLoadDetailScreen`
 * (ver `ManifestUnloadPolicy`): el lado RECEPTOR (`receiving_organization_id`,
 * dueño de la planta) inspecciona/genera/completa/cancela; el lado
 * transportador (`unload_request.carrier_organization_id`) solo lee + firma
 * como DRIVER.
 */
export function ManifestUnloadDetailScreen({ manifestUnloadId }: { manifestUnloadId: number | string }) {
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('manifest_unloads.read')

  const [detail, setDetail] = useState<AdminManifestUnloadDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [transitionError, setTransitionError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [signingAs, setSigningAs] = useState<'RECEIVER' | 'DRIVER' | null>(null)

  const [itemsDraft, setItemsDraft] = useState<ItemDraft[]>([])
  const [inspectedReceivedWeight, setInspectedReceivedWeight] = useState('')
  const [inspectedRejectedWeight, setInspectedRejectedWeight] = useState('')
  const [inspectionError, setInspectionError] = useState<string | null>(null)
  const [isInspecting, setIsInspecting] = useState(false)

  const [files, setFiles] = useState<AdminFile[]>([])
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)

  function reload() {
    return fetchManifestUnload(manifestUnloadId).then((result) => {
      setDetail(result.manifest_unload)
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
  }, [isAuthorized, manifestUnloadId])

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchManifestUnloadFiles(manifestUnloadId)
      .then((result) => {
        if (!cancelled) setFiles(result.files)
      })
      .catch(() => {
        if (!cancelled) setFiles([])
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, manifestUnloadId])

  useEffect(() => {
    if (!detail) return
    setItemsDraft(
      detail.items.map((item) => ({
        id: item.id,
        received_quantity: String(item.received_quantity ?? 0),
        rejected_quantity: String(item.rejected_quantity ?? 0),
        reception_condition: item.reception_condition ?? '',
      }))
    )
    setInspectedReceivedWeight(detail.received_total_weight_kg != null ? String(detail.received_total_weight_kg) : '')
    setInspectedRejectedWeight(detail.rejected_total_weight_kg != null ? String(detail.rejected_total_weight_kg) : '')
  }, [detail])

  async function handleGenerate() {
    setTransitionError(null)
    setIsGenerating(true)
    try {
      await generateManifestUnload(manifestUnloadId)
      await reload()
    } catch (error) {
      setTransitionError(errorMessage(error, 'received_total_weight_kg'))
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleComplete() {
    setTransitionError(null)
    setIsCompleting(true)
    try {
      await completeManifestUnload(manifestUnloadId)
      await reload()
    } catch (error) {
      setTransitionError(errorMessage(error, 'manifest_status'))
    } finally {
      setIsCompleting(false)
    }
  }

  async function handleCancel() {
    setTransitionError(null)
    setIsCancelling(true)
    try {
      await cancelManifestUnload(manifestUnloadId)
      await reload()
    } catch (error) {
      setTransitionError(errorMessage(error, 'manifest_status'))
    } finally {
      setIsCancelling(false)
    }
  }

  async function handleSign(signerType: 'RECEIVER' | 'DRIVER') {
    setTransitionError(null)
    setSigningAs(signerType)
    try {
      await signManifestUnload(manifestUnloadId, { signer_type: signerType })
      await reload()
    } catch (error) {
      setTransitionError(errorMessage(error, 'signer_type'))
    } finally {
      setSigningAs(null)
    }
  }

  function updateItemDraft(id: number, patch: Partial<ItemDraft>) {
    setItemsDraft((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  async function handleSaveInspection(event: React.FormEvent) {
    event.preventDefault()
    setInspectionError(null)
    if (!inspectedReceivedWeight.trim()) {
      setInspectionError('El peso total recibido es obligatorio (RN-107/108).')
      return
    }
    setIsInspecting(true)
    try {
      await inspectManifestUnloadItems(manifestUnloadId, {
        received_total_weight_kg: Number(inspectedReceivedWeight),
        rejected_total_weight_kg: inspectedRejectedWeight.trim() ? Number(inspectedRejectedWeight) : undefined,
        items: itemsDraft.map((item) => ({
          id: item.id,
          received_quantity: Number(item.received_quantity || 0),
          rejected_quantity: Number(item.rejected_quantity || 0),
          reception_condition: item.reception_condition.trim() || undefined,
        })),
      })
      await reload()
    } catch (error) {
      setInspectionError(errorMessage(error, 'received_total_weight_kg'))
    } finally {
      setIsInspecting(false)
    }
  }

  async function handleUploadEvidence(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return
    setEvidenceError(null)
    setIsUploadingEvidence(true)
    try {
      const { file: uploaded } = await uploadFile({
        file,
        entityType: 'MANIFEST_UNLOAD',
        entityId: manifestUnloadId,
        fileCategory: 'PHOTO_EVIDENCE',
      })
      setFiles((current) => [uploaded, ...current])
    } catch (error) {
      setEvidenceError(error instanceof Error ? error.message : 'Error al subir la evidencia.')
    } finally {
      setIsUploadingEvidence(false)
    }
  }

  async function handleDeleteEvidence(id: number) {
    setEvidenceError(null)
    try {
      await deleteFile(id)
      setFiles((current) => current.filter((file) => file.id !== id))
    } catch (error) {
      setEvidenceError(error instanceof Error ? error.message : 'Error al eliminar la evidencia.')
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
        {loadError ?? 'No se encontró el manifiesto de descargue.'}
      </p>
    )
  }

  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const permissions = user?.permissions ?? []
  const isReceivingOwner = isPlatformStaff || detail.receiving_organization.id === user?.tenant_organization_id
  const isCarrierOwner =
    isPlatformStaff ||
    (detail.unload_request.carrier_organization_id !== null &&
      detail.unload_request.carrier_organization_id === user?.tenant_organization_id)
  const statusCode = detail.manifest_status.code
  const isFinal = detail.manifest_status.is_final
  const isSignable = SIGNABLE_STATUSES.includes(statusCode)

  const canManage = isReceivingOwner && permissions.includes('manifest_unloads.update') && !isFinal
  const canInspect = canManage && statusCode === 'DRAFT'
  const canGenerate = canManage && statusCode === 'DRAFT'
  const canComplete = canManage && statusCode === 'SIGNED'
  const canCancel =
    isReceivingOwner &&
    permissions.includes('manifest_unloads.cancel') &&
    !isFinal &&
    (statusCode === 'GENERATED' || statusCode === 'PARTIALLY_SIGNED')

  const canSignAsReceiver =
    isReceivingOwner && permissions.includes('manifest_unloads.sign') && !detail.receiver_signed_at && isSignable
  const canSignAsDriver =
    isCarrierOwner && permissions.includes('manifest_unloads.sign') && !detail.driver_signed_at && isSignable

  const statusBadgeVariant = STATUS_BADGE_VARIANT[statusCode] || 'outline'

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              <PackageCheckIcon className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{detail.manifest_number}</CardTitle>
                <Badge variant={statusBadgeVariant}>{detail.manifest_status.name}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {detail.receiving_organization.legal_name} · {detail.unload_request.request_number}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canGenerate && (
              <Button size="sm" disabled={isGenerating} onClick={handleGenerate}>
                {isGenerating ? 'Generando…' : 'Generar'}
              </Button>
            )}
            {canComplete && (
              <Button size="sm" disabled={isCompleting} onClick={handleComplete}>
                {isCompleting ? 'Cerrando…' : 'Completar'}
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
            <InfoField label="Sede Receptora">{detail.receiving_branch.name}</InfoField>
            <InfoField label="Manifiesto de Cargue">{detail.manifest_load?.manifest_number ?? '—'}</InfoField>
            <InfoField label="Vehículo">
              {detail.vehicle.plate_number} {detail.vehicle.brand ? `· ${detail.vehicle.brand} ${detail.vehicle.model ?? ''}` : ''}
            </InfoField>
            <InfoField label="Conductor">
              {detail.transport_personnel.person.first_name} {detail.transport_personnel.person.last_name} ·{' '}
              {detail.transport_personnel.license_number ?? '—'}
            </InfoField>
            <InfoField label="Fecha de Descargue">{formatDate(detail.unload_date)}</InfoField>
            <InfoField label="Última Actualización">{formatDate(detail.updated_at)}</InfoField>
          </div>
          {detail.incidents && <InfoField label="Incidentes">{detail.incidents}</InfoField>}
          {detail.observations && <InfoField label="Observaciones">{detail.observations}</InfoField>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SignaturePanel
          title="Receptor"
          personName={`${detail.receiver_person.first_name} ${detail.receiver_person.last_name}`}
          signedAt={detail.receiver_signed_at}
          canSign={canSignAsReceiver}
          isSigning={signingAs === 'RECEIVER'}
          onSign={() => handleSign('RECEIVER')}
        />
        <SignaturePanel
          title="Conductor"
          personName={`${detail.driver_signer_person.first_name} ${detail.driver_signer_person.last_name}`}
          signedAt={detail.driver_signed_at}
          canSign={canSignAsDriver}
          isSigning={signingAs === 'DRIVER'}
          onSign={() => handleSign('DRIVER')}
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h3 className="border-b border-border pb-3 text-sm font-semibold">
            Inspección de Ítems {canInspect ? '(editable -- Borrador)' : ''}
          </h3>
          <form onSubmit={handleSaveInspection} className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Residuo</TableHead>
                    <TableHead>Cant. Recibida</TableHead>
                    <TableHead>Cant. Rechazada</TableHead>
                    <TableHead>Condición</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsDraft.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Sin ítems asociados.
                      </TableCell>
                    </TableRow>
                  )}
                  {detail.items.map((item, index) => {
                    const draft = itemsDraft[index]
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.waste?.name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{item.waste?.code ?? '—'}</div>
                        </TableCell>
                        <TableCell>
                          {canInspect && draft ? (
                            <Input
                              type="number"
                              step="0.001"
                              min={0}
                              aria-label={`Cantidad recibida — ${item.waste?.name ?? item.id}`}
                              value={draft.received_quantity}
                              onChange={(event) => updateItemDraft(item.id, { received_quantity: event.target.value })}
                              className="w-28"
                            />
                          ) : (
                            <span className="text-muted-foreground">
                              {item.received_quantity} {item.unit_of_measure}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {canInspect && draft ? (
                            <Input
                              type="number"
                              step="0.001"
                              min={0}
                              aria-label={`Cantidad rechazada — ${item.waste?.name ?? item.id}`}
                              value={draft.rejected_quantity}
                              onChange={(event) => updateItemDraft(item.id, { rejected_quantity: event.target.value })}
                              className="w-28"
                            />
                          ) : (
                            <span className="text-muted-foreground">
                              {item.rejected_quantity} {item.unit_of_measure}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {canInspect && draft ? (
                            <Input
                              aria-label={`Condición de recepción — ${item.waste?.name ?? item.id}`}
                              value={draft.reception_condition}
                              onChange={(event) => updateItemDraft(item.id, { reception_condition: event.target.value })}
                              className="w-36"
                            />
                          ) : (
                            <span className="text-muted-foreground">{item.reception_condition ?? '—'}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {canInspect && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="receivedTotalWeightKg">Peso Total Recibido (kg)</Label>
                  <Input
                    id="receivedTotalWeightKg"
                    type="number"
                    step="0.001"
                    min={0}
                    value={inspectedReceivedWeight}
                    onChange={(event) => setInspectedReceivedWeight(event.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rejectedTotalWeightKg">
                    Peso Total Rechazado (kg) <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="rejectedTotalWeightKg"
                    type="number"
                    step="0.001"
                    min={0}
                    value={inspectedRejectedWeight}
                    onChange={(event) => setInspectedRejectedWeight(event.target.value)}
                    className="w-40"
                  />
                </div>
                <Button type="submit" size="sm" disabled={isInspecting}>
                  {isInspecting ? 'Guardando…' : 'Guardar Inspección'}
                </Button>
              </div>
            )}
            {!canInspect && detail.received_total_weight_kg != null && (
              <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
                <span>Peso Total Recibido: {detail.received_total_weight_kg} kg</span>
                <span>Peso Total Rechazado: {detail.rejected_total_weight_kg ?? 0} kg</span>
              </div>
            )}
            {inspectionError && (
              <p className="text-sm text-destructive" role="alert">
                {inspectionError}
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h3 className="border-b border-border pb-3 text-sm font-semibold">Evidencias Fotográficas</h3>
          {canManage && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evidenceUpload">Subir evidencia (jpg, jpeg, png, webp)</Label>
              <input
                id="evidenceUpload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={isUploadingEvidence}
                onChange={(event) => handleUploadEvidence(event.target.files)}
              />
            </div>
          )}
          {evidenceError && (
            <p className="text-sm text-destructive" role="alert">
              {evidenceError}
            </p>
          )}
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin evidencias fotográficas cargadas.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {files.map((file) => (
                <li key={file.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <a
                    href={getFileDownloadUrl(file.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {file.original_filename}
                  </a>
                  {canManage && (
                    <Button size="sm" variant="outline" onClick={() => handleDeleteEvidence(file.id)}>
                      Eliminar
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
