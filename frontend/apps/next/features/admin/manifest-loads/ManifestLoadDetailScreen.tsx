'use client'

import { useEffect, useState } from 'react'
import { FileSignatureIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  cancelManifestLoad,
  fetchManifestLoad,
  generateManifestLoad,
  signManifestLoad,
  startManifestLoadTransit,
  type AdminManifestLoadDetail,
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
  IN_TRANSIT: 'default',
  CANCELLED: 'destructive',
}

// Estados desde los que `ManifestLoadSignatureService::sign()` acepta una
// firma nueva -- mismo valor exacto que `SIGNABLE_STATUSES` del backend, ver
// docblock de la clase.
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

/**
 * Detalle de `manifest_loads` (Módulo Manifiesto de Cargue, Fase 3 -- backend
 * cerrado, 1247 tests Pest, hallazgo de seguridad ya cerrado). Diseño
 * PROPUESTO (2026-07-19, sin frame de Figma -- ver resumen del lote): mismo
 * lenguaje visual ya usado en `TransportScheduleDetailScreen.tsx` (cabecera
 * con badge de estado + botones de transición, secciones de datos generales
 * + tabla de ítems), agregando un panel de firmas nuevo (2 tarjetas
 * Generador/Conductor) propio de este dominio.
 *
 * Acceso DUAL NO SIMÉTRICO (ver `ManifestLoadPolicy`): el lado transportador
 * (`carrier_organization_id`) puede generar/cancelar/iniciar tránsito; el
 * lado Generador (dueño de `generator_branch_id`) solo lee + firma como
 * GENERATOR. El frontend oculta cada botón de transición/firma según la
 * organización del actor -- confía en los 403/422 del backend
 * (`ManifestLoadPolicy`/`ManifestLoadSignatureService::assertActorCanSign()`)
 * como defensa final, sin duplicar esa lógica de autorización aquí.
 */
export function ManifestLoadDetailScreen({ manifestLoadId }: { manifestLoadId: number | string }) {
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('manifest_loads.read')

  const [detail, setDetail] = useState<AdminManifestLoadDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [transitionError, setTransitionError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isStartingTransit, setIsStartingTransit] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [signingAs, setSigningAs] = useState<'GENERATOR' | 'DRIVER' | null>(null)

  function reload() {
    return fetchManifestLoad(manifestLoadId).then((result) => {
      setDetail(result.manifest_load)
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
  }, [isAuthorized, manifestLoadId])

  async function handleGenerate() {
    setTransitionError(null)
    setIsGenerating(true)
    try {
      await generateManifestLoad(manifestLoadId)
      await reload()
    } catch (error) {
      setTransitionError(errorMessage(error, 'manifest_status'))
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleStartTransit() {
    setTransitionError(null)
    setIsStartingTransit(true)
    try {
      await startManifestLoadTransit(manifestLoadId)
      await reload()
    } catch (error) {
      setTransitionError(errorMessage(error, 'manifest_status'))
    } finally {
      setIsStartingTransit(false)
    }
  }

  async function handleCancel() {
    setTransitionError(null)
    setIsCancelling(true)
    try {
      await cancelManifestLoad(manifestLoadId)
      await reload()
    } catch (error) {
      setTransitionError(errorMessage(error, 'manifest_status'))
    } finally {
      setIsCancelling(false)
    }
  }

  async function handleSign(signerType: 'GENERATOR' | 'DRIVER') {
    setTransitionError(null)
    setSigningAs(signerType)
    try {
      await signManifestLoad(manifestLoadId, { signer_type: signerType })
      await reload()
    } catch (error) {
      setTransitionError(errorMessage(error, 'signer_type'))
    } finally {
      setSigningAs(null)
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
        {loadError ?? 'No se encontró el manifiesto de cargue.'}
      </p>
    )
  }

  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const permissions = user?.permissions ?? []
  const isCarrierOwner = isPlatformStaff || detail.carrier_organization_id === user?.tenant_organization_id
  const isGeneratorOwner = isPlatformStaff || detail.generator_branch.organization_id === user?.tenant_organization_id
  const statusCode = detail.manifest_status.code
  const isFinal = detail.manifest_status.is_final
  const isSignable = SIGNABLE_STATUSES.includes(statusCode)

  const canManage = isCarrierOwner && permissions.includes('manifest_loads.update') && !isFinal
  const canGenerate = canManage && statusCode === 'DRAFT'
  const canStartTransit = canManage && statusCode === 'SIGNED'
  const canCancel =
    isCarrierOwner &&
    permissions.includes('manifest_loads.cancel') &&
    !isFinal &&
    (statusCode === 'GENERATED' || statusCode === 'PARTIALLY_SIGNED')

  const canSignAsGenerator =
    isGeneratorOwner && permissions.includes('manifest_loads.sign') && !detail.generator_signed_at && isSignable
  const canSignAsDriver =
    isCarrierOwner && permissions.includes('manifest_loads.sign') && !detail.driver_signed_at && isSignable

  const statusBadgeVariant = STATUS_BADGE_VARIANT[statusCode] || 'outline'

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              <FileSignatureIcon className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{detail.manifest_number}</CardTitle>
                <Badge variant={statusBadgeVariant}>{detail.manifest_status.name}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {detail.carrier_organization.legal_name} · {detail.transport_schedule.schedule_number}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canGenerate && (
              <Button size="sm" disabled={isGenerating} onClick={handleGenerate}>
                {isGenerating ? 'Generando…' : 'Generar'}
              </Button>
            )}
            {canStartTransit && (
              <Button size="sm" disabled={isStartingTransit} onClick={handleStartTransit}>
                {isStartingTransit ? 'Iniciando…' : 'Iniciar Tránsito'}
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
            <InfoField label="Sede Generadora">{detail.generator_branch.name}</InfoField>
            <InfoField label="Vehículo">
              {detail.vehicle.plate_number} {detail.vehicle.brand ? `· ${detail.vehicle.brand} ${detail.vehicle.model ?? ''}` : ''}
            </InfoField>
            <InfoField label="Conductor">
              {detail.transport_personnel.person.first_name} {detail.transport_personnel.person.last_name} ·{' '}
              {detail.transport_personnel.license_number ?? '—'}
            </InfoField>
            <InfoField label="Fecha de Cargue">{formatDate(detail.load_date)}</InfoField>
            <InfoField label="Última Actualización">{formatDate(detail.updated_at)}</InfoField>
          </div>
          {detail.observations && <InfoField label="Observaciones">{detail.observations}</InfoField>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SignaturePanel
          title="Generador"
          personName={`${detail.generator_signer_person.first_name} ${detail.generator_signer_person.last_name}`}
          signedAt={detail.generator_signed_at}
          canSign={canSignAsGenerator}
          isSigning={signingAs === 'GENERATOR'}
          onSign={() => handleSign('GENERATOR')}
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
          <h3 className="border-b border-border pb-3 text-sm font-semibold">Ítems Cargados</h3>
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Residuo</TableHead>
                  <TableHead>Cantidad Declarada</TableHead>
                  <TableHead>Peso Real</TableHead>
                  <TableHead>Transporte Aprobado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
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
                      {item.declared_quantity} {item.unit_of_measure}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.actual_weight_kg ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={item.transport_approved ? 'default' : 'destructive'}>
                        {item.transport_approved ? 'Sí' : 'No'}
                      </Badge>
                    </TableCell>
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
