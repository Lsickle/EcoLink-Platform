'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Recycle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ApiValidationError,
  activateWaste,
  classifyWaste,
  createWasteTreatmentApprovalRequest,
  deactivateWaste,
  fetchAvailableBranchTreatments,
  fetchBranchTreatments,
  fetchWaste,
  fetchWasteActivity,
  fetchWasteFiles,
  fetchWastePreapprovedMatches,
  fetchWasteTreatmentApprovals,
  getFileDownloadUrl,
  reactivateWaste,
  rejectWaste,
  startReviewWaste,
  suspendWaste,
  usePreapprovedTreatmentMatch,
  type AdminTreatmentApprovalForWaste,
  type AdminWasteDetail,
  type AvailableBranchTreatment,
  type PreapprovedTreatmentMatch,
  type RoleActivityEvent,
  type TreatmentApprovalCommercialStatus,
  type TreatmentApprovalTechnicalStatus,
  type WasteFilesByCategory,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { HAZARD_RISK_LEVEL_LABELS, hazardRiskLevel } from 'app/features/admin/hazardRiskLevel'
import { HazardRiskLevelInfo } from '../HazardRiskLevelInfo'
import {
  isWasteEditableByOwner,
  WASTE_STATUS_BADGE_VARIANT,
  WASTE_STATUS_LABELS,
} from 'app/features/admin/wasteStatus'
import { useAuth, useRequireAuth } from 'app/provider/auth'

const FILE_CATEGORY_LABELS: Record<string, string> = {
  WASTE_PHOTO: 'Fotografías',
  SDS: 'Ficha de Seguridad (SDS)',
  ADDITIONAL_DOCUMENT: 'Documentos Adicionales',
}

// "Evaluación del Gestor" (waste_treatment_approvals) -- ejes
// technical_status/commercial_status INDEPENDIENTES, ver docblock de
// WasteTreatmentApprovalController en el backend.
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

function treatmentApprovalPrice(approval: { unit_price: string | null; currency: string; billing_unit: string }): string {
  return approval.unit_price != null ? `${approval.unit_price} ${approval.currency}/${approval.billing_unit}` : '—'
}

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

// "Solicitar Evaluación" -- explora tratamientos de sede de Gestores
// compatibles (GET /admin/branch-treatments/available, filtrado por las
// corrientes Y/A y códigos UN ya asignados al residuo) y confirma la
// elección, que ES la invitación (POST .../treatment-approvals).
function TreatmentApprovalRequestDialog({
  open,
  onOpenChange,
  wasteId,
  wasteStreamIds,
  unCodeIds,
  onCreated,
  mode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  wasteId: number | string
  wasteStreamIds: number[]
  unCodeIds: number[]
  onCreated: () => void
  // Cadena Generador -> Subgestor -> Gestor (2026-08-09) + Gestor con
  // relación comercial activa ofreciendo su propio tratamiento
  // (2026-08-12, ver `Waste::treatment_approval_mode`): mismo diálogo/
  // mismo endpoint (POST .../treatment-approvals) -- solo cambia el
  // título/descripción/botón, y en el caso 'offer' además la FUENTE de
  // opciones (catálogo propio del Gestor vía `fetchBranchTreatments()` en
  // vez del catálogo cruzado de cualquier Gestor vía
  // `fetchAvailableBranchTreatments()`).
  mode: 'owner' | 'forward' | 'offer'
}) {
  const [options, setOptions] = useState<AvailableBranchTreatment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setIsLoading(true)
    setError(null)
    if (mode === 'offer') {
      fetchBranchTreatments({ perPage: 100 })
        .then((result) =>
          setOptions(
            result.data
              .filter((branchTreatment) => branchTreatment.is_active)
              .map((branchTreatment) => ({
                id: branchTreatment.id,
                treatment_name: branchTreatment.treatment?.name ?? '—',
                organization_name: branchTreatment.organization?.legal_name ?? '—',
                branch_name: branchTreatment.branch?.name ?? '—',
                max_capacity: branchTreatment.max_capacity,
                capacity_unit: branchTreatment.capacity_unit,
              }))
          )
        )
        .catch(() => setOptions([]))
        .finally(() => setIsLoading(false))
      return
    }
    fetchAvailableBranchTreatments({ wasteStreamIds, unCodeIds })
      .then((result) => setOptions(result.branch_treatments))
      .catch(() => setOptions([]))
      .finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode])

  async function handleConfirm() {
    if (!selectedId) return
    setIsSubmitting(true)
    setError(null)
    try {
      await createWasteTreatmentApprovalRequest(wasteId, { branch_treatment_id: selectedId })
      setSelectedId(null)
      onCreated()
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err, 'branch_treatment_id'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const dialogTitle =
    mode === 'forward'
      ? 'Reenviar Residuo a un Gestor'
      : mode === 'offer'
        ? 'Ofrecer mi Tratamiento'
        : 'Solicitar Evaluación de Tratamiento'
  const dialogDescription =
    mode === 'forward'
      ? 'Elige un tratamiento de sede de un Gestor compatible con las corrientes/códigos UN de este residuo. Estás reenviando en nombre de tu Generador cliente -- el Gestor evaluará la solicitud sin conocer su identidad.'
      : mode === 'offer'
        ? 'Estás ofreciendo uno de tus propios tratamientos habilitados para este residuo del Generador vinculado.'
        : 'Elige un tratamiento de sede de un Gestor compatible con las corrientes/códigos UN de este residuo. Esta elección es la invitación -- el Gestor evaluará la solicitud.'
  const confirmLabel = isSubmitting ? 'Enviando…' : mode === 'forward' ? 'Confirmar Reenvío' : mode === 'offer' ? 'Confirmar Oferta' : 'Confirmar Solicitud'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground" role="status">
            Cargando…
          </p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay tratamientos de sede compatibles con las corrientes/códigos UN de este residuo.
          </p>
        ) : (
          <ul role="listbox" className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {options.map((option) => {
              const isSelected = selectedId === option.id
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`flex w-full flex-col items-start rounded-lg border p-2 text-left text-sm hover:bg-muted ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                    onClick={() => setSelectedId(option.id)}
                  >
                    <span className="font-medium">{option.treatment_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {option.organization_name} · {option.branch_name}
                      {option.max_capacity != null ? ` · ${option.max_capacity} ${option.capacity_unit}` : ''}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!selectedId || isSubmitting} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Núcleo del Módulo Residuos -- detalle (Figma fileKey pX6vqXxnJ66YSIYpE7v9pV).
// Mismo patrón de layout que VehicleDetailScreen.tsx/BranchTreatmentDetailScreen.tsx:
// header con badges + acciones, tabs (General/Evidencias/Tratamientos/
// Actividad). DECISIÓN PROPIA de este lote: la edición de los campos del
// residuo mientras `status` es BR NO se duplica aquí como un formulario
// inline -- se reutiliza el mismo wizard de 5 pasos (`/admin/wastes/{id}/edit`,
// WasteWizard.tsx) que ya sabe retomar un Borrador, evitando dos superficies
// de edición divergentes para el mismo conjunto de campos.
//
// Tab "Tratamientos" ("Evaluación del Gestor", waste_treatment_approvals) --
// perspectiva del DUEÑO DEL RESIDUO: lista las evaluaciones ya solicitadas
// (`fetchWasteTreatmentApprovals`), permite solicitar una nueva eligiendo un
// tratamiento de sede de un Gestor compatible (diálogo
// `TreatmentApprovalRequestDialog`, esa elección ES la invitación) y muestra
// sugerencias de "Tratamiento Preaprobado Detectado" cuando existen matches
// sin solicitar todavía para este residuo.
//
// `waste.has_viable_treatment`/`waste.treatment_approval_mode` (2026-08-12):
// `WasteController::show()` ya agrega ambos campos a la respuesta JSON.
// `treatment_approval_mode` gobierna directamente el texto de los botones/
// diálogo de esta pantalla (ver `treatmentApprovalMode` abajo). NO se agrega
// una badge de "Tratamiento Viable" en el header con `has_viable_treatment`
// -- fuera de alcance de este lote, el campo queda disponible en el tipo
// para cuando se pida.
export function WasteDetailScreen({ wasteId }: { wasteId: number | string }) {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('wastes.read')

  const [waste, setWaste] = useState<AdminWasteDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'general' | 'evidencias' | 'tratamientos' | 'auditoria'>('general')

  const [transitionError, setTransitionError] = useState<string | null>(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isTogglingActive, setIsTogglingActive] = useState(false)

  const [isRejecting, setIsRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const [isSuspending, setIsSuspending] = useState(false)
  const [suspendReason, setSuspendReason] = useState('')

  const [files, setFiles] = useState<WasteFilesByCategory>({})
  const [filesLoaded, setFilesLoaded] = useState(false)
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)

  const [activityEvents, setActivityEvents] = useState<RoleActivityEvent[]>([])
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  const [treatmentApprovals, setTreatmentApprovals] = useState<AdminTreatmentApprovalForWaste[]>([])
  const [preapprovedMatches, setPreapprovedMatches] = useState<PreapprovedTreatmentMatch[]>([])
  const [approvalsLoaded, setApprovalsLoaded] = useState(false)
  const [approvalsLoading, setApprovalsLoading] = useState(false)
  const [approvalsError, setApprovalsError] = useState<string | null>(null)

  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false)
  const [isUsingMatch, setIsUsingMatch] = useState(false)
  const [useMatchMessage, setUseMatchMessage] = useState<string | null>(null)
  const [useMatchError, setUseMatchError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchWaste(wasteId)
      .then((result) => {
        if (cancelled) return
        setWaste(result.waste)
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
  }, [isAuthorized, wasteId])

  useEffect(() => {
    if (activeTab !== 'evidencias' || filesLoaded || !isAuthorized) return
    let cancelled = false
    setFilesLoading(true)
    fetchWasteFiles(wasteId)
      .then((result) => {
        if (cancelled) return
        setFiles(result.files)
        setFilesLoaded(true)
        setFilesError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setFilesError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthorized, wasteId])

  useEffect(() => {
    if (activeTab !== 'auditoria' || activityLoaded || !isAuthorized) return
    let cancelled = false
    setActivityLoading(true)
    fetchWasteActivity(wasteId, { perPage: 15 })
      .then((result) => {
        if (cancelled) return
        setActivityEvents(result.data)
        setActivityLoaded(true)
        setActivityError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setActivityError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthorized, wasteId])

  const canViewTreatmentApprovals = (user?.permissions ?? []).includes('treatment_approvals.read')

  useEffect(() => {
    if (activeTab !== 'tratamientos' || approvalsLoaded || !isAuthorized || !canViewTreatmentApprovals) return
    let cancelled = false
    setApprovalsLoading(true)
    Promise.all([fetchWasteTreatmentApprovals(wasteId, { perPage: 50 }), fetchWastePreapprovedMatches(wasteId)])
      .then(([approvalsResult, matchesResult]) => {
        if (cancelled) return
        setTreatmentApprovals(approvalsResult.data)
        setPreapprovedMatches(matchesResult.matches)
        setApprovalsLoaded(true)
        setApprovalsError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setApprovalsError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setApprovalsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthorized, wasteId, canViewTreatmentApprovals])

  // Tambien refresca el RESIDUO, no solo sus evaluaciones: solicitar/ofrecer
  // una evaluacion mueve el residuo a En Revision (2026-08-14), y sin esto el
  // badge de estado se quedaba en "Declarado" hasta recargar a mano.
  // El motivo es obligatorio y queda en la trazabilidad: suspender retira de
  // circulacion un residuo que ya puede arrastrar solicitudes y certificados,
  // asi que "por que" tiene que quedar registrado.
  async function handleConfirmSuspend() {
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      const { waste: updated } = await suspendWaste(wasteId, { reason: suspendReason })
      setWaste((current) => (current ? { ...current, status: updated.status } : current))
      setIsSuspending(false)
      setSuspendReason('')
    } catch (error) {
      setTransitionError(errorMessage(error, 'reason'))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function handleReactivate() {
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      const { waste: updated } = await reactivateWaste(wasteId)
      setWaste((current) => (current ? { ...current, status: updated.status } : current))
    } catch (error) {
      setTransitionError(errorMessage(error, 'status'))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function refreshTreatmentApprovals() {
    try {
      const [approvalsResult, matchesResult, wasteResult] = await Promise.all([
        fetchWasteTreatmentApprovals(wasteId, { perPage: 50 }),
        fetchWastePreapprovedMatches(wasteId),
        fetchWaste(wasteId),
      ])
      setTreatmentApprovals(approvalsResult.data)
      setPreapprovedMatches(matchesResult.matches)
      setWaste((current) => (current ? { ...current, status: wasteResult.waste.status } : current))
    } catch (error) {
      setApprovalsError(error instanceof Error ? error.message : 'Error inesperado.')
    }
  }

  async function handleUsePreapprovedMatch(matchId: number) {
    setUseMatchError(null)
    setUseMatchMessage(null)
    setIsUsingMatch(true)
    try {
      await usePreapprovedTreatmentMatch(wasteId, matchId)
      setUseMatchMessage(
        'Se creó una solicitud pre-completada con los términos del match preaprobado -- el Gestor debe confirmarla, todavía no queda aprobada.'
      )
      await refreshTreatmentApprovals()
    } catch (error) {
      setUseMatchError(errorMessage(error, 'treatment_approval_id'))
    } finally {
      setIsUsingMatch(false)
    }
  }

  async function handleStartReview() {
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      const { waste: updated } = await startReviewWaste(wasteId)
      setWaste((current) => (current ? { ...current, status: updated.status } : current))
    } catch (error) {
      setTransitionError(errorMessage(error, 'status'))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function handleClassify() {
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      const { waste: updated } = await classifyWaste(wasteId)
      setWaste((current) => (current ? { ...current, status: updated.status } : current))
    } catch (error) {
      setTransitionError(errorMessage(error, 'status'))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function handleConfirmReject() {
    setTransitionError(null)
    setIsTransitioning(true)
    try {
      const { waste: updated } = await rejectWaste(wasteId, { reason: rejectReason })
      setWaste((current) => (current ? { ...current, status: updated.status } : current))
      setIsRejecting(false)
      setRejectReason('')
    } catch (error) {
      setTransitionError(errorMessage(error, 'reason'))
    } finally {
      setIsTransitioning(false)
    }
  }

  async function handleToggleActive() {
    if (!waste) return
    setIsTogglingActive(true)
    try {
      const { waste: updated } = waste.is_active ? await deactivateWaste(wasteId) : await activateWaste(wasteId)
      setWaste((current) => (current ? { ...current, is_active: updated.is_active } : current))
    } catch (error) {
      setTransitionError(errorMessage(error, 'waste'))
    } finally {
      setIsTogglingActive(false)
    }
  }

  if (!isAuthorized || isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (loadError || !waste) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el residuo.'}
      </p>
    )
  }

  const permissions = user?.permissions ?? []
  const isPlatformStaff = Boolean(user?.is_platform_staff)
  // Cadena Generador -> Subgestor -> Gestor + Gestor con relación comercial
  // activa (confirmado por stakeholders reales, 2026-08-09/2026-08-12): si
  // esta pantalla cargó (200), el actor es el dueño, platform staff, un
  // Subgestor autorizado, o un Gestor vinculado -- `WastePolicy::view()` ya
  // lo garantiza en el backend. `canEditWaste` distingue solo
  // dueño/platform staff: cualquier otro actor con acceso de lectura puede
  // VER pero nunca editar/clasificar/rechazar/(des)activar el residuo de su
  // Generador cliente. Cuál acción de evaluación puede tomar ese actor (si
  // alguna) lo determina `treatmentApprovalMode`, no `canEditWaste`.
  const isOwner = waste.organization_id === user?.tenant_organization_id
  const canEditWaste = isOwner || isPlatformStaff
  // 'owner' (dueño/platform staff), 'forward' (Subgestor reenviando a un
  // Gestor externo), 'offer' (Gestor con relación comercial activa
  // ofreciendo uno de sus propios tratamientos habilitados), null (el
  // actor puede VER el residuo pero no solicitar evaluación) -- ver
  // `WasteController::show()`/`WastePolicy::requestEvaluation()`. El
  // backend YA gatea el permiso `treatment_approvals.create` al calcularlo.
  const treatmentApprovalMode = waste.treatment_approval_mode
  const canReview = canEditWaste && permissions.includes('wastes.review')
  const canClassify = canEditWaste && permissions.includes('wastes.classify')
  const canReject = canEditWaste && permissions.includes('wastes.reject')
  // Solo en Borrador. Antes también aceptaba `RCH`, un estado que ninguna
  // transición del backend produce. Y una vez Aprobado la correccion va por
  // soporte de EcoLink, porque el residuo ya arrastra solicitudes y
  // certificados que quedarian describiendo algo distinto.
  const canEditDraft = canEditWaste && permissions.includes('wastes.update') && isWasteEditableByOwner(waste.status)
  const canRequestTreatmentApproval = treatmentApprovalMode !== null
  // APR <-> SUS: exclusivo del staff de EcoLink CON el permiso. Doble barrera,
  // igual que en el backend (`assertPlatformStaffCanSuspend()`): un
  // ADMINISTRADOR de organizacion tiene `wastes.suspend` en el catalogo base y
  // aun asi no debe poder retirar de circulacion un residuo aprobado.
  const canSuspend = isPlatformStaff && permissions.includes('wastes.suspend')
  const canToggleActive =
    canEditWaste &&
    (waste.is_active ? permissions.includes('wastes.deactivate') : permissions.includes('wastes.activate'))

  const streamsY = waste.waste_stream_assignments.filter((assignment) => assignment.waste_stream.tipo === 'Y')
  const streamsA = waste.waste_stream_assignments.filter((assignment) => assignment.waste_stream.tipo === 'A')

  const wasteStreamIds = waste.waste_stream_assignments.map((assignment) => assignment.waste_stream_id)
  const unCodeIds = waste.waste_un_codes.map((assignment) => assignment.un_code_id)

  // Se omite la sugerencia si el residuo YA tiene una evaluación (de
  // cualquier estado) para ese `branch_treatment_id` -- evita duplicar la
  // tarjeta de un match ya solicitado.
  const requestedBranchTreatmentIds = new Set(treatmentApprovals.map((approval) => approval.branch_treatment_id))
  const visiblePreapprovedMatches = preapprovedMatches.filter(
    (match) => !requestedBranchTreatmentIds.has(match.branch_treatment_id)
  )

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              <Recycle className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{waste.name}</CardTitle>
                <Badge variant={WASTE_STATUS_BADGE_VARIANT[waste.status]}>{WASTE_STATUS_LABELS[waste.status]}</Badge>
                {waste.waste_danger && (
                  <Badge variant="destructive">{waste.waste_danger_characteristic?.name ?? waste.waste_danger}</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {waste.code ?? '—'} · {waste.organization.legal_name}
                {waste.branch ? ` · ${waste.branch.name}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEditDraft && (
              <Button variant="outline" size="sm" onClick={() => router.push(`/admin/wastes/${waste.id}/edit`)}>
                Editar en el Asistente
              </Button>
            )}
            {waste.status === 'DEC' && canReview && (
              <Button size="sm" disabled={isTransitioning} onClick={handleStartReview}>
                Enviar a Revisión
              </Button>
            )}
            {waste.status === 'REV' && canClassify && (
              <Button size="sm" disabled={isTransitioning} onClick={handleClassify}>
                Clasificar
              </Button>
            )}
            {(waste.status === 'DEC' || waste.status === 'REV') && canReject && !isRejecting && (
              <Button variant="outline" size="sm" disabled={isTransitioning} onClick={() => setIsRejecting(true)}>
                Rechazar
              </Button>
            )}
            {canToggleActive && (
              <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
                {waste.is_active ? 'Inactivar' : 'Activar'}
              </Button>
            )}
            {canSuspend && waste.status === 'APR' && !isSuspending && (
              <Button variant="outline" size="sm" disabled={isTransitioning} onClick={() => setIsSuspending(true)}>
                Suspender
              </Button>
            )}
            {canSuspend && waste.status === 'SUS' && (
              <Button size="sm" disabled={isTransitioning} onClick={handleReactivate}>
                Reactivar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pb-4">
          {!canEditWaste && (
            <p className="rounded-lg border border-border bg-muted/40 p-2.5 text-sm text-muted-foreground" role="status">
              {treatmentApprovalMode === 'offer'
                ? 'Estás viendo el residuo de un Generador cliente vinculado. Solo puedes consultarlo y ofrecer uno de tus propios tratamientos -- no puedes editarlo, clasificarlo ni rechazarlo.'
                : 'Estás viendo el residuo de un Generador cliente. Solo puedes consultarlo y reenviarlo a un Gestor -- no puedes editarlo, clasificarlo ni rechazarlo.'}
            </p>
          )}
          {waste.status === 'SUS' && (
            <p className="rounded-lg bg-destructive/10 p-2.5 text-sm" role="status">
              Residuo <span className="font-semibold">Suspendido</span>: retirado de circulación, no puede usarse en
              Solicitudes de Servicio. Conserva toda su trazabilidad y solo EcoLink puede reactivarlo.
            </p>
          )}
          {isSuspending && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="suspendReason">Motivo de la suspensión</Label>
                <Input
                  id="suspendReason"
                  value={suspendReason}
                  onChange={(event) => setSuspendReason(event.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={isTransitioning || !suspendReason.trim()} onClick={handleConfirmSuspend}>
                  Confirmar Suspensión
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsSuspending(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
          {isRejecting && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="rejectReason">Motivo del rechazo</Label>
                <Input id="rejectReason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={isTransitioning || !rejectReason.trim()} onClick={handleConfirmReject}>
                  Confirmar Rechazo
                </Button>
                <Button variant="outline" size="sm" onClick={() => setIsRejecting(false)}>
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
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="evidencias">Evidencias</TabsTrigger>
              <TabsTrigger value="tratamientos">Tratamientos</TabsTrigger>
              <TabsTrigger value="auditoria">Actividad</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="flex flex-col gap-4 pt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InfoField label="Categoría de Residuo">{waste.waste_category?.name ?? '—'}</InfoField>
                <InfoField label="Tipo de Residuo">{waste.waste_type.name}</InfoField>
                <InfoField label="Estado Físico">{waste.physical_state?.name ?? '—'}</InfoField>
                <InfoField label="Cantidad">
                  {waste.quantity != null ? `${waste.quantity} ${waste.measurement_unit.code}` : '—'}
                </InfoField>
                <InfoField label="Frecuencia de Generación">{waste.generation_frequency?.name ?? '—'}</InfoField>
                <InfoField label="Fecha de Generación">
                  {waste.generation_date ? formatDate(waste.generation_date) : '—'}
                </InfoField>
                <InfoField label="Peso Promedio">
                  {waste.average_weight != null ? `${waste.average_weight} ${waste.measurement_unit.code}` : '—'}
                </InfoField>
                <InfoField label="Referencia Interna">{waste.internal_reference ?? '—'}</InfoField>
                <InfoField label="Descripción Técnica">{waste.description ?? '—'}</InfoField>
                <InfoField label="Observaciones Operativas">{waste.operational_notes ?? '—'}</InfoField>
              </div>

              <div className="flex flex-wrap gap-2">
                {waste.requires_sds && <Badge variant="outline">Requiere SDS</Badge>}
                {waste.requires_characterization && <Badge variant="outline">Requiere Caracterización Química</Badge>}
                {waste.requires_special_transport && <Badge variant="outline">Transporte Especial RESPEL</Badge>}
                {waste.requires_special_ppe && <Badge variant="outline">Requiere EPP Especial</Badge>}
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Corrientes y Códigos UN Asignados</span>
                <div className="flex flex-wrap gap-2">
                  {streamsY.length === 0 && streamsA.length === 0 && waste.waste_un_codes.length === 0 && (
                    <span className="text-sm text-muted-foreground">Sin corrientes ni códigos UN asignados.</span>
                  )}
                  {streamsY.map((assignment) => (
                    <Badge key={`y-${assignment.id}`} variant="outline">
                      {assignment.waste_stream.code} · {assignment.waste_stream.name}
                    </Badge>
                  ))}
                  {streamsA.map((assignment) => (
                    <Badge key={`a-${assignment.id}`} variant="outline">
                      {assignment.waste_stream.code} · {assignment.waste_stream.name}
                    </Badge>
                  ))}
                  {waste.waste_un_codes.map((assignment) => (
                    <Badge key={`un-${assignment.id}`} variant="outline">
                      {assignment.un_code.code} · {assignment.un_code.name}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  Características de Peligrosidad
                  <HazardRiskLevelInfo />
                </span>
                <div className="flex flex-wrap gap-2">
                  {waste.waste_hazard_characteristics.length === 0 && (
                    <span className="text-sm text-muted-foreground">Sin características asignadas.</span>
                  )}
                  {waste.waste_hazard_characteristics.map((assignment) => (
                    <Badge key={assignment.id} variant="outline">
                      {assignment.hazard_characteristic.name} ·{' '}
                      {HAZARD_RISK_LEVEL_LABELS[hazardRiskLevel(assignment.hazard_characteristic.risk_level)]}
                    </Badge>
                  ))}
                </div>
              </div>

              <InfoField label="Fecha de Creación">{formatDate(waste.created_at)}</InfoField>
            </TabsContent>

            <TabsContent value="evidencias" className="flex flex-col gap-4 pt-4">
              {filesError && (
                <p className="text-sm text-destructive" role="alert">
                  {filesError}
                </p>
              )}
              {filesLoading && !filesLoaded ? (
                <p className="text-sm text-muted-foreground" role="status">
                  Cargando…
                </p>
              ) : Object.keys(files).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin archivos adjuntos.</p>
              ) : (
                Object.entries(files).map(([category, categoryFiles]) => (
                  <div key={category} className="flex flex-col gap-2">
                    <span className="text-sm font-semibold">{FILE_CATEGORY_LABELS[category] ?? category}</span>
                    <ul className="flex flex-col gap-1">
                      {(categoryFiles ?? []).map((file) => (
                        <li key={file.id} className="flex items-center justify-between rounded-lg border border-border p-2 text-sm">
                          <span>{file.original_filename}</span>
                          <a
                            href={getFileDownloadUrl(file.id)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            Descargar
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="tratamientos" className="flex flex-col gap-4 pt-4">
              {!canViewTreatmentApprovals ? (
                <p className="text-sm text-muted-foreground">No tiene permiso para consultar evaluaciones de tratamiento.</p>
              ) : (
                <>
                  {visiblePreapprovedMatches.length > 0 && (
                    <div className="flex flex-col gap-2 rounded-lg border border-blue-300 bg-blue-50 p-3 dark:bg-blue-950/20">
                      <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                        Tratamientos Preaprobados Detectados
                      </span>
                      {visiblePreapprovedMatches.map((match) => (
                        <div
                          key={match.id}
                          className="flex flex-col items-start justify-between gap-2 rounded-lg border border-blue-200 bg-background p-2 sm:flex-row sm:items-center dark:border-blue-900"
                        >
                          <div className="text-sm">
                            <p className="font-medium">
                              {match.branch_treatment.treatment.name} · {match.organization.legal_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {match.branch_treatment.branch.name} · {treatmentApprovalPrice(match)}
                              {match.restrictions ? ` · ${match.restrictions}` : ''}
                            </p>
                          </div>
                          {canRequestTreatmentApproval && (
                            <Button size="sm" disabled={isUsingMatch} onClick={() => handleUsePreapprovedMatch(match.id)}>
                              {treatmentApprovalMode === 'forward'
                                ? 'Reenviar con este tratamiento'
                                : treatmentApprovalMode === 'offer'
                                  ? 'Ofrecer con este tratamiento'
                                  : 'Usar este tratamiento'}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {useMatchMessage && (
                    <p className="text-sm text-muted-foreground" role="status">
                      {useMatchMessage}
                    </p>
                  )}
                  {useMatchError && (
                    <p className="text-sm text-destructive" role="alert">
                      {useMatchError}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Evaluaciones de Tratamiento</h3>
                    {canRequestTreatmentApproval && (
                      <Button size="sm" onClick={() => setIsRequestDialogOpen(true)}>
                        {treatmentApprovalMode === 'forward'
                          ? 'Reenviar a Gestor'
                          : treatmentApprovalMode === 'offer'
                            ? 'Ofrecer mi Tratamiento'
                            : 'Solicitar Evaluación'}
                      </Button>
                    )}
                  </div>

                  {approvalsError && (
                    <p className="text-sm text-destructive" role="alert">
                      {approvalsError}
                    </p>
                  )}

                  {approvalsLoading && !approvalsLoaded ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      Cargando…
                    </p>
                  ) : treatmentApprovals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin evaluaciones de tratamiento para este residuo.</p>
                  ) : (
                    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Gestor</TableHead>
                            <TableHead>Tratamiento</TableHead>
                            <TableHead>Estado Técnico</TableHead>
                            <TableHead>Estado Comercial</TableHead>
                            <TableHead>Precio</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {treatmentApprovals.map((approval) => (
                            <TableRow
                              key={approval.id}
                              className="cursor-pointer"
                              onClick={() => router.push(`/admin/treatment-approvals/${approval.id}`)}
                            >
                              <TableCell>{approval.organization.legal_name}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {approval.branch_treatment.treatment.name}
                              </TableCell>
                              <TableCell>
                                <Badge variant={TECHNICAL_STATUS_BADGE_VARIANT[approval.technical_status]}>
                                  {TECHNICAL_STATUS_LABELS[approval.technical_status]}
                                </Badge>
                                {/* El motivo del rechazo tiene que llegar a quien
                                    declaró el residuo: sin esto solo veía el badge
                                    "Rechazado" y no sabía qué corregir. El backend lo
                                    exige obligatorio al rechazar. */}
                                {approval.technical_status === 'REJECTED' && approval.technical_notes && (
                                  <p className="mt-1 max-w-xs text-xs text-muted-foreground">{approval.technical_notes}</p>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={COMMERCIAL_STATUS_BADGE_VARIANT[approval.commercial_status]}>
                                  {COMMERCIAL_STATUS_LABELS[approval.commercial_status]}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{treatmentApprovalPrice(approval)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <TreatmentApprovalRequestDialog
                    open={isRequestDialogOpen}
                    onOpenChange={setIsRequestDialogOpen}
                    wasteId={wasteId}
                    wasteStreamIds={wasteStreamIds}
                    unCodeIds={unCodeIds}
                    onCreated={refreshTreatmentApprovals}
                    mode={treatmentApprovalMode ?? 'owner'}
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="auditoria" className="flex flex-col gap-3 pt-4">
              {activityError && (
                <p className="text-sm text-destructive" role="alert">
                  {activityError}
                </p>
              )}
              {activityLoading && activityEvents.length === 0 && !activityLoaded ? (
                <p className="text-sm text-muted-foreground" role="status">
                  Cargando…
                </p>
              ) : activityEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>
              ) : (
                <ol className="flex flex-col gap-4 border-l border-border pl-4">
                  {activityEvents.map((event, index) => (
                    <li key={`${event.created_at}-${index}`} className="relative">
                      <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-primary" aria-hidden="true" />
                      <p className="text-sm">{event.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(event.created_at)}
                        {event.actor ? ` · ${event.actor.username}` : ''}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
