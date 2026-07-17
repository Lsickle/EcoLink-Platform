'use client'

import { useEffect, useState } from 'react'
import { FlaskRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ApiValidationError,
  approveTreatmentApprovalCommercial,
  approveTreatmentApprovalTechnical,
  cancelTreatmentApproval,
  fetchTreatmentApproval,
  negotiateTreatmentApproval,
  quoteTreatmentApproval,
  rejectTreatmentApprovalCommercial,
  rejectTreatmentApprovalTechnical,
  updateTreatmentApproval,
  type AdminTreatmentApproval,
  type AdminTreatmentApprovalDetail,
  type TreatmentApprovalCommercialStatus,
  type TreatmentApprovalTechnicalStatus,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { HAZARD_RISK_LEVEL_LABELS, hazardRiskLevel } from 'app/features/admin/hazardRiskLevel'
import { useAuth, useRequireAuth } from 'app/provider/auth'

const TECHNICAL_STATUS_LABELS: Record<TreatmentApprovalTechnicalStatus, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  RESTRICTED: 'Aprobado con Restricciones',
}

const TECHNICAL_STATUS_BADGE_VARIANT: Record<TreatmentApprovalTechnicalStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  APPROVED: 'default',
  REJECTED: 'destructive',
  RESTRICTED: 'outline',
}

const COMMERCIAL_STATUS_LABELS: Record<TreatmentApprovalCommercialStatus, string> = {
  DRAFT: 'Borrador',
  QUOTED: 'Cotizado',
  NEGOTIATING: 'En Negociación',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
}

const COMMERCIAL_STATUS_BADGE_VARIANT: Record<TreatmentApprovalCommercialStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  QUOTED: 'outline',
  NEGOTIATING: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
  CANCELLED: 'destructive',
}

const TERMINAL_COMMERCIAL_STATUSES: TreatmentApprovalCommercialStatus[] = ['APPROVED', 'REJECTED', 'CANCELLED']

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

// `update()`/las transiciones devuelven `treatmentApproval->fresh()` --
// SIN las relaciones eager-cargadas (`organization`/`waste`/
// `branch_treatment`/`technical_approved_by`/`commercial_approved_by`).
// Mezclar `{...current, ...updated}` a ciegas arriesgaría pisar esas
// relaciones ya cargadas con `undefined` si el shape cambiara -- se
// mezclan explícitamente solo los campos escalares que estas respuestas SÍ
// garantizan, preservando las relaciones de `current`.
function mergeScalarFields(
  current: AdminTreatmentApprovalDetail,
  updated: Partial<AdminTreatmentApproval>
): AdminTreatmentApprovalDetail {
  return {
    ...current,
    version: updated.version ?? current.version,
    commercial_status: updated.commercial_status ?? current.commercial_status,
    technical_status: updated.technical_status ?? current.technical_status,
    unit_price: updated.unit_price ?? current.unit_price,
    currency: updated.currency ?? current.currency,
    billing_unit: updated.billing_unit ?? current.billing_unit,
    minimum_quantity: updated.minimum_quantity ?? current.minimum_quantity,
    maximum_quantity: updated.maximum_quantity ?? current.maximum_quantity,
    requires_lab_analysis: updated.requires_lab_analysis ?? current.requires_lab_analysis,
    requires_sds: updated.requires_sds ?? current.requires_sds,
    restrictions: updated.restrictions ?? current.restrictions,
    commercial_notes: updated.commercial_notes ?? current.commercial_notes,
    technical_notes: updated.technical_notes ?? current.technical_notes,
    technical_approved_at: updated.technical_approved_at ?? current.technical_approved_at,
    commercial_approved_at: updated.commercial_approved_at ?? current.commercial_approved_at,
    valid_from: updated.valid_from ?? current.valid_from,
    valid_until: updated.valid_until ?? current.valid_until,
    detailed_notes: updated.detailed_notes ?? current.detailed_notes,
    is_active: updated.is_active ?? current.is_active,
    metadata: updated.metadata ?? current.metadata,
    updated_at: updated.updated_at ?? current.updated_at,
  }
}

// "Evaluación del Gestor" (waste_treatment_approvals) -- detalle, mismo
// layout de 2 columnas que BranchTreatmentDetailScreen.tsx/
// VehicleDetailScreen.tsx. Acceso CRUZADO controlado (DISTINTO del acceso
// dual habitual): `isEvaluatingGestor` (organization_id de la fila === la
// del actor, o platform staff) puede editar términos/transicionar;
// `isWasteOwnerSide` (waste.organization_id del actor) solo puede VER --
// ninguno de los dos edita el lado ajeno (ver `WasteTreatmentApprovalPolicy`).
//
// GAP de backend documentado (no se resuelve aquí, ver resumen del lote):
// `WasteTreatmentApprovalController::show()` NO eager-carga las corrientes/
// códigos UN/características de peligrosidad del residuo referenciado
// (`waste.wasteStreamAssignments`/`waste.wasteUnCodes`/
// `waste.wasteHazardCharacteristics`) -- y el Gestor evaluador NO tiene otra
// vía autorizada para consultarlas (`WastePolicy::view()` bloquea
// `GET /admin/wastes/{id}` para una organización distinta del dueño). El
// requerimiento del lote pide mostrar esa clasificación "para que el Gestor
// evalúe con contexto real" -- se deja un aviso explícito en vez de omitirlo
// en silencio.
export function TreatmentApprovalDetailScreen({ treatmentApprovalId }: { treatmentApprovalId: number | string }) {
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('treatment_approvals.read')

  const [detail, setDetail] = useState<AdminTreatmentApprovalDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [unitPrice, setUnitPrice] = useState('')
  const [currency, setCurrency] = useState('COP')
  const [billingUnit, setBillingUnit] = useState('KG')
  const [minimumQuantity, setMinimumQuantity] = useState('')
  const [maximumQuantity, setMaximumQuantity] = useState('')
  const [requiresLabAnalysis, setRequiresLabAnalysis] = useState(false)
  const [requiresSds, setRequiresSds] = useState(false)
  const [restrictions, setRestrictions] = useState('')
  const [commercialNotes, setCommercialNotes] = useState('')
  const [technicalNotes, setTechnicalNotes] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [detailedNotes, setDetailedNotes] = useState('')

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [transitionError, setTransitionError] = useState<string | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const [isRejectingTechnical, setIsRejectingTechnical] = useState(false)
  const [technicalRejectReason, setTechnicalRejectReason] = useState('')

  const [isRejectingCommercial, setIsRejectingCommercial] = useState(false)
  const [commercialRejectReason, setCommercialRejectReason] = useState('')

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchTreatmentApproval(treatmentApprovalId)
      .then((result) => {
        if (cancelled) return
        const ta = result.treatment_approval
        setDetail(ta)
        setUnitPrice(ta.unit_price ?? '')
        setCurrency(ta.currency)
        setBillingUnit(ta.billing_unit)
        setMinimumQuantity(ta.minimum_quantity ?? '')
        setMaximumQuantity(ta.maximum_quantity ?? '')
        setRequiresLabAnalysis(ta.requires_lab_analysis)
        setRequiresSds(ta.requires_sds)
        setRestrictions(ta.restrictions ?? '')
        setCommercialNotes(ta.commercial_notes ?? '')
        setTechnicalNotes(ta.technical_notes ?? '')
        setValidFrom(ta.valid_from ?? '')
        setValidUntil(ta.valid_until ?? '')
        setDetailedNotes(ta.detailed_notes ?? '')
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
  }, [isAuthorized, treatmentApprovalId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!detail) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { treatment_approval: updated } = await updateTreatmentApproval(detail.id, {
        unit_price: unitPrice ? Number(unitPrice) : undefined,
        currency,
        billing_unit: billingUnit,
        minimum_quantity: minimumQuantity ? Number(minimumQuantity) : undefined,
        maximum_quantity: maximumQuantity ? Number(maximumQuantity) : undefined,
        requires_lab_analysis: requiresLabAnalysis,
        requires_sds: requiresSds,
        restrictions: restrictions || undefined,
        commercial_notes: commercialNotes || undefined,
        technical_notes: technicalNotes || undefined,
        valid_from: validFrom || undefined,
        valid_until: validUntil || undefined,
        detailed_notes: detailedNotes || undefined,
      })
      setDetail((current) => (current ? mergeScalarFields(current, updated) : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'unit_price'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleApproveTechnical() {
    if (!detail) return
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      const { treatment_approval: updated } = await approveTreatmentApprovalTechnical(detail.id, {})
      setDetail((current) => (current ? mergeScalarFields(current, updated) : current))
    } catch (error) {
      setTransitionError(errorMessage(error, 'technical_status'))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function handleConfirmRejectTechnical() {
    if (!detail) return
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      const { treatment_approval: updated } = await rejectTreatmentApprovalTechnical(detail.id, {
        technical_notes: technicalRejectReason,
      })
      setDetail((current) => (current ? mergeScalarFields(current, updated) : current))
      setIsRejectingTechnical(false)
      setTechnicalRejectReason('')
    } catch (error) {
      setTransitionError(errorMessage(error, 'technical_notes'))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function handleQuote() {
    if (!detail) return
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      const { treatment_approval: updated } = await quoteTreatmentApproval(detail.id)
      setDetail((current) => (current ? mergeScalarFields(current, updated) : current))
    } catch (error) {
      setTransitionError(errorMessage(error, 'commercial_status'))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function handleNegotiate() {
    if (!detail) return
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      const { treatment_approval: updated } = await negotiateTreatmentApproval(detail.id)
      setDetail((current) => (current ? mergeScalarFields(current, updated) : current))
    } catch (error) {
      setTransitionError(errorMessage(error, 'commercial_status'))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function handleApproveCommercial() {
    if (!detail) return
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      const { treatment_approval: updated } = await approveTreatmentApprovalCommercial(detail.id)
      setDetail((current) => (current ? mergeScalarFields(current, updated) : current))
    } catch (error) {
      setTransitionError(errorMessage(error, 'unit_price'))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function handleConfirmRejectCommercial() {
    if (!detail) return
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      const { treatment_approval: updated } = await rejectTreatmentApprovalCommercial(detail.id, {
        commercial_notes: commercialRejectReason || undefined,
      })
      setDetail((current) => (current ? mergeScalarFields(current, updated) : current))
      setIsRejectingCommercial(false)
      setCommercialRejectReason('')
    } catch (error) {
      setTransitionError(errorMessage(error, 'commercial_status'))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function handleCancel() {
    if (!detail) return
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      const { treatment_approval: updated } = await cancelTreatmentApproval(detail.id)
      setDetail((current) => (current ? mergeScalarFields(current, updated) : current))
    } catch (error) {
      setTransitionError(errorMessage(error, 'commercial_status'))
    } finally {
      setIsTransitioning(false)
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
        {loadError ?? 'No se encontró la evaluación de tratamiento.'}
      </p>
    )
  }

  const permissions = user?.permissions ?? []
  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const isEvaluatingGestor = isPlatformStaff || detail.organization_id === user?.tenant_organization_id
  const isWasteOwnerSide = isPlatformStaff || detail.waste.organization_id === user?.tenant_organization_id

  const canEditTerms = isEvaluatingGestor && permissions.includes('treatment_approvals.update')
  const canEvaluate = isEvaluatingGestor && permissions.includes('treatment_approvals.evaluate')

  const commercialIsFinal = TERMINAL_COMMERCIAL_STATUSES.includes(detail.commercial_status)

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              <FlaskRound className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{detail.branch_treatment.treatment.name}</CardTitle>
                <Badge variant={TECHNICAL_STATUS_BADGE_VARIANT[detail.technical_status]}>
                  {TECHNICAL_STATUS_LABELS[detail.technical_status]}
                </Badge>
                <Badge variant={COMMERCIAL_STATUS_BADGE_VARIANT[detail.commercial_status]}>
                  {COMMERCIAL_STATUS_LABELS[detail.commercial_status]}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {detail.organization.legal_name} · {detail.branch_treatment.branch.name}
              </p>
            </div>
          </div>
          {!isEvaluatingGestor && isWasteOwnerSide && (
            <Badge variant="outline">Solo lectura -- dueño del residuo</Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pb-4">
          {canEvaluate && (
            <div className="flex flex-wrap items-center gap-2">
              {detail.technical_status === 'PENDING' && !isRejectingTechnical && (
                <>
                  <Button size="sm" disabled={isTransitioning} onClick={handleApproveTechnical}>
                    Aprobar Técnico
                  </Button>
                  <Button variant="outline" size="sm" disabled={isTransitioning} onClick={() => setIsRejectingTechnical(true)}>
                    Rechazar Técnico
                  </Button>
                </>
              )}
              {detail.commercial_status === 'DRAFT' && (
                <Button size="sm" variant="outline" disabled={isTransitioning} onClick={handleQuote}>
                  Cotizar
                </Button>
              )}
              {!commercialIsFinal && detail.commercial_status !== 'NEGOTIATING' && (
                <Button size="sm" variant="outline" disabled={isTransitioning} onClick={handleNegotiate}>
                  Negociar
                </Button>
              )}
              {!commercialIsFinal && detail.unit_price != null && (
                <Button size="sm" disabled={isTransitioning} onClick={handleApproveCommercial}>
                  Aprobar Comercial
                </Button>
              )}
              {!commercialIsFinal && !isRejectingCommercial && (
                <Button variant="outline" size="sm" disabled={isTransitioning} onClick={() => setIsRejectingCommercial(true)}>
                  Rechazar Comercial
                </Button>
              )}
              {detail.commercial_status !== 'CANCELLED' && (
                <Button variant="outline" size="sm" disabled={isTransitioning} onClick={handleCancel}>
                  Cancelar
                </Button>
              )}
            </div>
          )}

          {isRejectingTechnical && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="technicalRejectReason">Motivo del rechazo técnico</Label>
                <Input
                  id="technicalRejectReason"
                  value={technicalRejectReason}
                  onChange={(event) => setTechnicalRejectReason(event.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={isTransitioning || !technicalRejectReason.trim()} onClick={handleConfirmRejectTechnical}>
                  Confirmar Rechazo Técnico
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsRejectingTechnical(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {isRejectingCommercial && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="commercialRejectReason">
                  Motivo del rechazo comercial <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="commercialRejectReason"
                  value={commercialRejectReason}
                  onChange={(event) => setCommercialRejectReason(event.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={isTransitioning} onClick={handleConfirmRejectCommercial}>
                  Confirmar Rechazo Comercial
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsRejectingCommercial(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {transitionError && (
            <p className="text-sm text-destructive" role="alert">
              {transitionError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 border-b border-border pb-4">
            <h3 className="text-sm font-semibold">Residuo Referenciado (solo lectura)</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField label="Nombre">{detail.waste.name}</InfoField>
              <InfoField label="Código">{detail.waste.code ?? '—'}</InfoField>
              <InfoField label="Organización Generadora">{detail.waste.organization.legal_name}</InfoField>
              <InfoField label="Sede del Tratamiento">{detail.branch_treatment.branch.name}</InfoField>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Corrientes y Códigos UN Asignados</span>
              <div className="flex flex-wrap gap-2">
                {detail.waste.waste_stream_assignments.length === 0 && detail.waste.waste_un_codes.length === 0 && (
                  <span className="text-sm text-muted-foreground">Sin corrientes ni códigos UN asignados.</span>
                )}
                {detail.waste.waste_stream_assignments.map((assignment) => (
                  <Badge key={`stream-${assignment.id}`} variant="outline">
                    {assignment.waste_stream.code} · {assignment.waste_stream.name}
                  </Badge>
                ))}
                {detail.waste.waste_un_codes.map((assignment) => (
                  <Badge key={`un-${assignment.id}`} variant="outline">
                    {assignment.un_code.code} · {assignment.un_code.name}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Características de Peligrosidad</span>
              <div className="flex flex-wrap gap-2">
                {detail.waste.waste_hazard_characteristics.length === 0 && (
                  <span className="text-sm text-muted-foreground">Sin características asignadas.</span>
                )}
                {detail.waste.waste_hazard_characteristics.map((assignment) => (
                  <Badge key={assignment.id} variant="outline">
                    {assignment.hazard_characteristic.name} ·{' '}
                    {HAZARD_RISK_LEVEL_LABELS[hazardRiskLevel(assignment.hazard_characteristic.risk_level)]}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unitPrice">Precio Unitario</Label>
              <Input
                id="unitPrice"
                type="number"
                min={0}
                disabled={!canEditTerms}
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currency">Moneda</Label>
                <Input id="currency" disabled={!canEditTerms} value={currency} onChange={(event) => setCurrency(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="billingUnit">Unidad de Facturación</Label>
                <Input
                  id="billingUnit"
                  disabled={!canEditTerms}
                  value={billingUnit}
                  onChange={(event) => setBillingUnit(event.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="minimumQuantity">
                Cantidad Mínima <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="minimumQuantity"
                type="number"
                min={0}
                disabled={!canEditTerms}
                value={minimumQuantity}
                onChange={(event) => setMinimumQuantity(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="maximumQuantity">
                Cantidad Máxima <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="maximumQuantity"
                type="number"
                min={0}
                disabled={!canEditTerms}
                value={maximumQuantity}
                onChange={(event) => setMaximumQuantity(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresLabAnalysis"
                  disabled={!canEditTerms}
                  checked={requiresLabAnalysis}
                  onCheckedChange={(checked) => setRequiresLabAnalysis(checked === true)}
                />
                <Label htmlFor="requiresLabAnalysis" className="font-normal">
                  Requiere análisis de laboratorio
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresSdsTreatmentApproval"
                  disabled={!canEditTerms}
                  checked={requiresSds}
                  onCheckedChange={(checked) => setRequiresSds(checked === true)}
                />
                <Label htmlFor="requiresSdsTreatmentApproval" className="font-normal">
                  Requiere ficha de seguridad (SDS)
                </Label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="validFrom">
                  Vigente Desde <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="validFrom" type="date" disabled={!canEditTerms} value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="validUntil">
                  Vigente Hasta <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="validUntil" type="date" disabled={!canEditTerms} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="restrictions">
                Restricciones <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <textarea
                id="restrictions"
                disabled={!canEditTerms}
                className="min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={restrictions}
                onChange={(event) => setRestrictions(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="commercialNotes">
                Notas Comerciales <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <textarea
                id="commercialNotes"
                disabled={!canEditTerms}
                className="min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={commercialNotes}
                onChange={(event) => setCommercialNotes(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="technicalNotes">
                Notas Técnicas <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <textarea
                id="technicalNotes"
                disabled={!canEditTerms}
                className="min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={technicalNotes}
                onChange={(event) => setTechnicalNotes(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="detailedNotes">
                Descripción Detallada <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <textarea
                id="detailedNotes"
                disabled={!canEditTerms}
                className="min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={detailedNotes}
                onChange={(event) => setDetailedNotes(event.target.value)}
              />
            </div>

            <InfoField label="Fecha de Creación">{formatDate(detail.created_at)}</InfoField>
            <InfoField label="Última Actualización">{formatDate(detail.updated_at)}</InfoField>

            {saveError && (
              <p className="text-sm text-destructive sm:col-span-2" role="alert">
                {saveError}
              </p>
            )}
            {saveMessage && (
              <p className="text-sm text-muted-foreground sm:col-span-2" role="status">
                {saveMessage}
              </p>
            )}

            {canEditTerms && (
              <div className="flex justify-end sm:col-span-2">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
