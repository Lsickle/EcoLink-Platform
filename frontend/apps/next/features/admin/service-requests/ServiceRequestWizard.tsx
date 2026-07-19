'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  createServiceRequest,
  fetchBranches,
  fetchMeasurementUnits,
  fetchPackagingTypes,
  fetchPhysicalStates,
  fetchWastes,
  fetchWasteTreatmentApprovals,
  submitServiceRequest,
  updateServiceRequest,
  type AdminBranch,
  type AdminMeasurementUnit,
  type AdminPackagingType,
  type AdminPhysicalState,
  type AdminTreatmentApprovalForWaste,
  type AdminWaste,
} from 'app/features/admin/api'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationQuickSelect } from '../OrganizationQuickSelect'

const TOTAL_STEPS = 6

const STEP_TITLES: Record<number, string> = {
  1: 'Información General',
  2: 'Selección de Residuos',
  3: 'Logística del Servicio',
  4: 'Requerimientos Especiales',
  5: 'Evidencias y Documentos',
  6: 'Confirmación y Envío',
}

// Prioridad -- ver AVISO en `ServiceRequestPriority`/`AdminServiceRequest`
// (types.ts): `priority` es VARCHAR(20) libre en el backend, SIN catálogo ni
// whitelist. Estas 4 opciones (código/etiqueta/subtítulo) se tomaron
// LITERALMENTE del Figma "Solicitud de Servicio" (fileKey
// pX6vqXxnJ66YSIYpE7v9pV, node 635:5846) -- no confirmadas contra un
// catálogo canónico, señalado como flag en el resumen del lote.
const PRIORITY_OPTIONS: { value: string; label: string; sublabel: string }[] = [
  { value: 'LOW', label: 'Baja', sublabel: 'No urgente' },
  { value: 'MEDIUM', label: 'Media', sublabel: 'Rutinaria' },
  { value: 'HIGH', label: 'Alta', sublabel: 'Prioritaria' },
  { value: 'CRITICAL', label: 'Crítica', sublabel: 'Urgente/RESPEL' },
]

// `request_source` -- mismo tipo de AVISO que `priority` (VARCHAR(30) libre,
// default real del backend 'PORTAL'). Opciones no confirmadas contra
// catálogo, solo la primera ("Portal Cliente") viene literal del Figma.
const REQUEST_SOURCE_OPTIONS = [
  { value: 'PORTAL', label: 'Portal Cliente' },
  { value: 'PHONE', label: 'Teléfono' },
  { value: 'EMAIL', label: 'Correo Electrónico' },
  { value: 'MANUAL', label: 'Registro Manual' },
]

// "Tipo de Acceso al Sitio" (Paso 3) -- NO existe columna dedicada en
// `waste_service_requests` (ver esquema-bd, punto 15) para este campo ni
// para "Ubicación de Carga"/"Instrucciones de Ingreso": se persisten en
// `metadata` (JSONB genérico ya pensado para extensiones no confirmadas
// como columna propia), nunca inventados como columnas reales. Mismo
// tratamiento para "Requiere Acta de Servicio"/"Requiere Certificado
// Prioritario" del Paso 4 -- ver `buildCreatePayload()` más abajo.
const SITE_ACCESS_OPTIONS = [
  { value: 'EASY', label: 'Fácil — Acceso directo' },
  { value: 'MODERATE', label: 'Moderado — Requiere coordinación previa' },
  { value: 'DIFFICULT', label: 'Difícil — Requiere permisos especiales' },
]

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

function Textarea({
  id,
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
}) {
  return (
    <textarea
      id={id}
      value={value}
      rows={rows}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
    />
  )
}

type ChecklistItem = { label: string; complete: boolean }

function ChecklistList({ items }: { items: ChecklistItem[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-xs">
          <span className={item.complete ? 'text-emerald-600' : 'text-muted-foreground'}>{item.complete ? '✓' : '○'}</span>
          <span className={item.complete ? '' : 'text-muted-foreground'}>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}

// Residuo elegible para Solicitud de Servicio -- Paso 2. Cierre del GAP DE
// CONTRATO señalado en el resumen del lote anterior (2026-07-19):
// `WasteController::index()` ahora acepta `with_viable_treatment=1`
// (reutiliza `Waste::scopeWithViableTreatment()`, ver `fetchWastes()` en
// api.ts) -- el filtrado de elegibilidad YA NO se hace en cliente, una sola
// llamada trae exactamente los residuos con al menos un tratamiento con
// AMBOS ejes `APPROVED`. La llamada restante por residuo a
// `fetchWasteTreatmentApprovals()` sigue siendo NECESARIA (no es el
// workaround de filtrado eliminado): el filtro del backend solo determina
// elegibilidad (booleano), pero `index()` no embebe las aprobaciones -- el
// selector "Tratamiento" de cada ítem necesita el id/nombre real de cada
// aprobación viable, que solo existe en ese endpoint dedicado.
type EligibleWaste = {
  waste: AdminWaste
  approvals: AdminTreatmentApprovalForWaste[]
}

async function loadEligibleWastes(organizationId?: number | string): Promise<EligibleWaste[]> {
  const { data: wastes } = await fetchWastes({ perPage: 100, organizationId, withViableTreatment: true })
  const results: EligibleWaste[] = []
  for (const waste of wastes) {
    try {
      const { data: approvals } = await fetchWasteTreatmentApprovals(waste.id, { perPage: 50 })
      const viable = approvals.filter((a) => a.technical_status === 'APPROVED' && a.commercial_status === 'APPROVED')
      if (viable.length > 0) {
        results.push({ waste, approvals: viable })
      }
    } catch {
      // Residuo sin acceso o sin evaluaciones -- se omite en silencio, igual
      // que el resto del wizard trata catálogos opcionales.
    }
  }
  return results
}

type ItemState = {
  key: string
  wasteId: number
  wasteName: string
  wasteCode: string | null
  approvals: AdminTreatmentApprovalForWaste[]
  wasteTreatmentApprovalId: number | null
  estimatedQuantity: string
  measurementUnitId: number | null
  packagingType: string
  physicalStateId: number | null
  requiresForklift: boolean
  requiresIsolation: boolean
}

function approvalLabel(approval: AdminTreatmentApprovalForWaste): string {
  return `${approval.branch_treatment.treatment.name} · ${approval.organization.legal_name}`
}

type WizardState = {
  organizationId: number | null
  organizationLabel: string | null
  branchId: number | null
  requestedCollectionDate: string
  estimatedReadyDate: string
  priority: string
  requestSource: string
  observations: string
  siteAccessType: string
  requiresLiftPlatform: boolean
  requiresContainerReturn: boolean
  estimatedHeight: string
  estimatedWidth: string
  estimatedLength: string
  loadingLocation: string
  entryInstructions: string
  requiresAudit: boolean
  requiresPhotoRecord: boolean
  requiresServiceReport: boolean
  requiresPriorityCertificate: boolean
  operationalNotes: string
}

const initialState: WizardState = {
  organizationId: null,
  organizationLabel: null,
  branchId: null,
  requestedCollectionDate: '',
  estimatedReadyDate: '',
  priority: 'MEDIUM',
  requestSource: 'PORTAL',
  observations: '',
  siteAccessType: '',
  requiresLiftPlatform: false,
  requiresContainerReturn: false,
  estimatedHeight: '',
  estimatedWidth: '',
  estimatedLength: '',
  loadingLocation: '',
  entryInstructions: '',
  requiresAudit: false,
  requiresPhotoRecord: false,
  requiresServiceReport: false,
  requiresPriorityCertificate: false,
  operationalNotes: '',
}

/**
 * Wizard de 6 pasos (Figma fileKey pX6vqXxnJ66YSIYpE7v9pV, node 635:5846 en
 * adelante -- Información General/Residuos/Logística/Requerimientos/
 * Evidencias/Confirmación), CU-014 (Solicitudes de Servicio, Fase 1b).
 *
 * DIFERENCIA DELIBERADA vs. el patrón de `WasteWizard.tsx` (persistencia
 * progresiva por paso): `ServiceRequestController::store()` exige `items`
 * desde la PRIMERA creación (`required|array|min:1`) y `update()` NO expone
 * sync de ítems (solo campos de cabecera, ver docblock del controller) --
 * por eso este wizard es 100% estado local hasta que el usuario llega al
 * Paso 6 y hace clic en "Guardar Borrador"/"Enviar Solicitud". Una vez
 * creada la solicitud (`serviceRequestId` fijado), el Paso 2 pasa a
 * SOLO LECTURA -- los ítems ya no se pueden modificar desde este asistente
 * (el backend no lo permite); ediciones posteriores de cabecera se hacen
 * desde `ServiceRequestDetailScreen.tsx` mientras el estado siga en DRAFT.
 * Por el mismo motivo, este wizard es SOLO DE CREACIÓN -- no soporta
 * retomar un borrador existente (a diferencia de `WasteWizard`).
 */
export function ServiceRequestWizard() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('service_requests.create')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [serviceRequestId, setServiceRequestId] = useState<number | string | null>(null)
  const [step, setStep] = useState(1)
  const [state, setStateRaw] = useState<WizardState>(initialState)
  const [items, setItems] = useState<ItemState[]>([])

  const [branches, setBranches] = useState<AdminBranch[]>([])
  const [measurementUnits, setMeasurementUnits] = useState<AdminMeasurementUnit[]>([])
  const [physicalStates, setPhysicalStates] = useState<AdminPhysicalState[]>([])
  const [packagingTypes, setPackagingTypes] = useState<AdminPackagingType[]>([])

  const [eligibleWastes, setEligibleWastes] = useState<EligibleWaste[]>([])
  const [isLoadingWastes, setIsLoadingWastes] = useState(false)
  const [wastesSearch, setWastesSearch] = useState('')

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const itemsLocked = serviceRequestId !== null

  function setState(patch: Partial<WizardState>) {
    setStateRaw((current) => ({ ...current, ...patch }))
  }

  // Catálogos de referencia -- todos de solo lectura.
  useEffect(() => {
    if (!isAuthorized) return
    Promise.all([
      fetchMeasurementUnits({ perPage: 100, status: 'active' }).then((result) => setMeasurementUnits(result.data)),
      fetchPhysicalStates({ perPage: 100, status: 'active' }).then((result) => setPhysicalStates(result.data)),
      fetchPackagingTypes({ perPage: 100, status: 'active' }).then((result) => setPackagingTypes(result.data)),
    ]).catch(() => {})
  }, [isAuthorized])

  // Sedes de la organización -- mismo criterio que WasteWizard.tsx: para
  // tenant users, fetchBranches() ya acota por su propia organización
  // server-side; para platform staff, se filtra por la organización elegida
  // en el Paso 1.
  useEffect(() => {
    if (!isAuthorized) return
    if (isPlatformStaff && !state.organizationId) {
      setBranches([])
      return
    }
    fetchBranches({ perPage: 100, organizationId: isPlatformStaff ? state.organizationId! : undefined })
      .then((result) => setBranches(result.data))
      .catch(() => setBranches([]))
  }, [isAuthorized, isPlatformStaff, state.organizationId])

  // Residuos elegibles (ver AVISO completo en `loadEligibleWastes()` arriba)
  // -- se cargan al entrar al Paso 2, mientras la solicitud no se haya
  // creado todavía.
  useEffect(() => {
    if (!isAuthorized || step !== 2 || itemsLocked) return
    if (isPlatformStaff && !state.organizationId) return
    let cancelled = false
    setIsLoadingWastes(true)
    loadEligibleWastes(isPlatformStaff ? state.organizationId! : undefined)
      .then((result) => {
        if (!cancelled) setEligibleWastes(result)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingWastes(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, step, itemsLocked, isPlatformStaff, state.organizationId])

  function toggleWasteSelected(entry: EligibleWaste, checked: boolean) {
    if (itemsLocked) return
    setItems((current) => {
      if (!checked) {
        return current.filter((item) => item.wasteId !== entry.waste.id)
      }
      if (current.some((item) => item.wasteId === entry.waste.id)) return current
      const defaultApproval = entry.approvals.length === 1 ? entry.approvals[0].id : null
      return [
        ...current,
        {
          key: `waste-${entry.waste.id}`,
          wasteId: entry.waste.id,
          wasteName: entry.waste.name,
          wasteCode: entry.waste.code,
          approvals: entry.approvals,
          wasteTreatmentApprovalId: defaultApproval,
          estimatedQuantity: '',
          measurementUnitId: null,
          packagingType: '',
          physicalStateId: null,
          requiresForklift: false,
          requiresIsolation: false,
        },
      ]
    })
  }

  function updateItem(wasteId: number, patch: Partial<ItemState>) {
    if (itemsLocked) return
    setItems((current) => current.map((item) => (item.wasteId === wasteId ? { ...item, ...patch } : item)))
  }

  function removeItem(wasteId: number) {
    if (itemsLocked) return
    setItems((current) => current.filter((item) => item.wasteId !== wasteId))
  }

  const totalEstimatedQuantity = useMemo(
    () => items.reduce((sum, item) => sum + (Number(item.estimatedQuantity) || 0), 0),
    [items]
  )

  // Volumen de carga (m³) -- fórmula simple Alto × Ancho × Largo (cm) /
  // 1.000.000, sin validación adicional contra el Figma (que muestra un
  // valor de ejemplo no necesariamente derivado de la misma fórmula).
  const calculatedVolume = useMemo(() => {
    const h = Number(state.estimatedHeight)
    const w = Number(state.estimatedWidth)
    const l = Number(state.estimatedLength)
    if (!h || !w || !l) return null
    return Math.round(((h * w * l) / 1_000_000) * 100) / 100
  }, [state.estimatedHeight, state.estimatedWidth, state.estimatedLength])

  function buildHeaderPayload() {
    return {
      branch_id: state.branchId ?? undefined,
      requested_collection_date: state.requestedCollectionDate || undefined,
      estimated_ready_date: state.estimatedReadyDate || undefined,
      estimated_total_weight: totalEstimatedQuantity > 0 ? totalEstimatedQuantity : undefined,
      estimated_total_volume: calculatedVolume ?? undefined,
      requires_lift_platform: state.requiresLiftPlatform,
      requires_audit: state.requiresAudit,
      requires_photo_record: state.requiresPhotoRecord,
      requires_container_return: state.requiresContainerReturn,
      estimated_height: state.estimatedHeight ? Number(state.estimatedHeight) : undefined,
      estimated_width: state.estimatedWidth ? Number(state.estimatedWidth) : undefined,
      estimated_length: state.estimatedLength ? Number(state.estimatedLength) : undefined,
      observations: state.observations || undefined,
      request_source: state.requestSource,
      priority: state.priority,
      metadata: {
        site_access_type: state.siteAccessType || undefined,
        loading_location: state.loadingLocation || undefined,
        entry_instructions: state.entryInstructions || undefined,
        requires_service_report: state.requiresServiceReport,
        requires_priority_certificate: state.requiresPriorityCertificate,
        operational_notes: state.operationalNotes || undefined,
      },
    }
  }

  function buildItemsPayload() {
    return items.map((item) => ({
      waste_id: item.wasteId,
      waste_treatment_approval_id: item.wasteTreatmentApprovalId ?? undefined,
      estimated_quantity: item.estimatedQuantity ? Number(item.estimatedQuantity) : undefined,
      measurement_unit_id: item.measurementUnitId ?? undefined,
      packaging_type: item.packagingType || undefined,
      physical_state_id: item.physicalStateId ?? undefined,
      requires_forklift: item.requiresForklift,
      requires_isolation: item.requiresIsolation,
    }))
  }

  async function persist(): Promise<number | string | null> {
    setSaveError(null)
    setIsSaving(true)
    try {
      if (!serviceRequestId) {
        if (items.length === 0) {
          setSaveError('Debe seleccionar al menos un residuo (Paso 2) antes de guardar.')
          return null
        }
        if (!state.branchId) {
          setSaveError('Debe seleccionar la Sede Solicitante (Paso 1) antes de guardar.')
          return null
        }
        if (isPlatformStaff && !state.organizationId) {
          setSaveError('Selecciona la organización dueña de la solicitud.')
          return null
        }
        const { service_request: created } = await createServiceRequest({
          ...buildHeaderPayload(),
          branch_id: state.branchId,
          organization_id: isPlatformStaff ? state.organizationId! : undefined,
          items: buildItemsPayload(),
        })
        setServiceRequestId(created.id)
        return created.id
      }
      await updateServiceRequest(serviceRequestId, buildHeaderPayload())
      return serviceRequestId
    } catch (error) {
      setSaveError(errorMessage(error, 'branch_id'))
      return null
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveDraft() {
    setSaveMessage(null)
    const id = await persist()
    if (id) setSaveMessage('Borrador guardado.')
  }

  async function handleNext() {
    setStep((current) => Math.min(TOTAL_STEPS, current + 1))
  }

  function handlePrevious() {
    setSaveError(null)
    setSaveMessage(null)
    setStep((current) => Math.max(1, current - 1))
  }

  async function handleSubmitRequest() {
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      const id = await persist()
      if (!id) return
      await submitServiceRequest(id)
      router.push(`/admin/service-requests/${id}`)
    } catch (error) {
      setSubmitError(errorMessage(error, 'items'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const itemsWithApproval = items.filter((item) => item.wasteTreatmentApprovalId != null)
  const itemsFullyReady = items.every(
    (item) => item.wasteTreatmentApprovalId != null && item.estimatedQuantity.trim().length > 0 && item.measurementUnitId != null
  )

  const finalChecklist: ChecklistItem[] = useMemo(
    () => [
      { label: 'Sede solicitante seleccionada', complete: state.branchId != null },
      { label: 'Al menos un residuo seleccionado', complete: items.length > 0 },
      { label: 'Todos los ítems con tratamiento asignado', complete: items.length > 0 && itemsWithApproval.length === items.length },
      { label: 'Todos los ítems con cantidad y unidad', complete: items.length > 0 && itemsFullyReady },
    ],
    [state.branchId, items, itemsWithApproval.length, itemsFullyReady]
  )

  const isReadyToSubmit = finalChecklist.every((item) => item.complete)

  const stepChecklist: ChecklistItem[] = useMemo(() => {
    if (step === 1) {
      return [
        { label: 'Sede Solicitante', complete: state.branchId != null },
        { label: 'Fecha Deseada de Recolección', complete: state.requestedCollectionDate.trim().length > 0 },
        { label: 'Prioridad', complete: state.priority.trim().length > 0 },
      ]
    }
    if (step === 2) {
      return [
        { label: 'Residuos seleccionados', complete: items.length > 0 },
        { label: 'Tratamiento por ítem', complete: items.length > 0 && itemsWithApproval.length === items.length },
      ]
    }
    if (step === 3) {
      return [{ label: 'Dimensiones de carga', complete: calculatedVolume != null }]
    }
    return finalChecklist
  }, [step, state, items, itemsWithApproval.length, calculatedVolume, finalChecklist])

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const filteredWastes = wastesSearch.trim()
    ? eligibleWastes.filter((entry) => {
        const haystack = `${entry.waste.name} ${entry.waste.code ?? ''}`.toLowerCase()
        return haystack.includes(wastesSearch.trim().toLowerCase())
      })
    : eligibleWastes

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-sm font-semibold">
              Paso {step} de {TOTAL_STEPS} — {STEP_TITLES[step]}
            </h2>
            <Badge variant="outline">{step}/6</Badge>
          </div>

          {step === 1 && (
            <div className="flex flex-col gap-4">
              {isPlatformStaff && (
                <OrganizationQuickSelect
                  label="Organización"
                  htmlId="serviceRequestOrganizationId"
                  capability="can_generate_waste"
                  selectedId={state.organizationId}
                  selectedLabel={state.organizationLabel}
                  onSelect={(result) => setState({ organizationId: result.id, organizationLabel: result.legal_name })}
                  onClear={() => setState({ organizationId: null, organizationLabel: null })}
                />
              )}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="branchId">Sede Solicitante *</Label>
                <Select
                  items={branches.map((b) => ({ value: String(b.id), label: b.name }))}
                  value={state.branchId !== null ? String(state.branchId) : null}
                  onValueChange={(value) => setState({ branchId: value !== null ? Number(value) : null })}
                >
                  <SelectTrigger id="branchId">
                    <SelectValue placeholder="Selecciona una sede" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={String(branch.id)}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 border-t border-border pt-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="requestedCollectionDate">Fecha Deseada de Recolección *</Label>
                  <Input
                    id="requestedCollectionDate"
                    type="date"
                    value={state.requestedCollectionDate}
                    onChange={(event) => setState({ requestedCollectionDate: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="estimatedReadyDate">
                    Fecha Disponibilidad de Residuos <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="estimatedReadyDate"
                    type="date"
                    value={state.estimatedReadyDate}
                    onChange={(event) => setState({ estimatedReadyDate: event.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <span className="text-xs font-semibold text-muted-foreground">PRIORIDAD *</span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  {PRIORITY_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer flex-col gap-1 rounded-lg border-2 p-3 ${
                        state.priority === option.value ? 'border-primary bg-primary/5' : 'border-border'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <input
                          type="radio"
                          name="priority"
                          checked={state.priority === option.value}
                          onChange={() => setState({ priority: option.value })}
                          aria-label={option.label}
                        />
                        {option.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{option.sublabel}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border pt-3">
                <Label htmlFor="requestSource">Origen de Solicitud</Label>
                <Select
                  items={REQUEST_SOURCE_OPTIONS}
                  value={state.requestSource}
                  onValueChange={(value) => value && setState({ requestSource: value as string })}
                >
                  <SelectTrigger id="requestSource">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REQUEST_SOURCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="observations">
                  Observaciones Generales <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Textarea
                  id="observations"
                  value={state.observations}
                  onChange={(value) => setState({ observations: value })}
                  placeholder="Contexto general de la solicitud…"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              {itemsLocked && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Esta solicitud ya fue guardada -- los ítems no se pueden modificar desde este asistente (el backend
                  solo permite editar campos de cabecera tras la creación). Para evaluarlos, use el detalle de la
                  solicitud.
                </div>
              )}

              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground">RESIDUOS DISPONIBLES PARA SOLICITAR</span>
                <p className="text-xs text-muted-foreground">
                  Solo se listan residuos con al menos un tratamiento aprobado (técnico y comercial) vigente.
                </p>
                <Input
                  placeholder="Buscar por nombre o código…"
                  value={wastesSearch}
                  onChange={(event) => setWastesSearch(event.target.value)}
                  aria-label="Buscar residuos disponibles"
                  disabled={itemsLocked}
                />
              </div>

              {isLoadingWastes ? (
                <p className="text-sm text-muted-foreground" role="status">
                  Cargando residuos disponibles…
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead />
                        <TableHead>Código</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Tratamiento Aprobado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredWastes.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No hay residuos con tratamiento viable disponibles.
                          </TableCell>
                        </TableRow>
                      )}
                      {filteredWastes.map((entry) => {
                        const checked = items.some((item) => item.wasteId === entry.waste.id)
                        return (
                          <TableRow key={entry.waste.id}>
                            <TableCell>
                              <Checkbox
                                aria-label={`Seleccionar ${entry.waste.name}`}
                                checked={checked}
                                disabled={itemsLocked}
                                onCheckedChange={(next) => toggleWasteSelected(entry, next === true)}
                              />
                            </TableCell>
                            <TableCell>{entry.waste.code ?? '—'}</TableCell>
                            <TableCell className="font-medium">{entry.waste.name}</TableCell>
                            <TableCell className="text-muted-foreground">{entry.waste.waste_category?.name ?? '—'}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {entry.approvals.map((approval) => approvalLabel(approval)).join(' · ')}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <span className="text-xs font-semibold text-muted-foreground">
                  RESIDUOS SELECCIONADOS · {items.length} seleccionado(s)
                </span>
                {items.length === 0 && <p className="text-sm text-muted-foreground">Sin residuos seleccionados todavía.</p>}
                {items.map((item) => (
                  <div key={item.key} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{item.wasteName}</span>
                      {!itemsLocked && (
                        <button
                          type="button"
                          aria-label={`Quitar ${item.wasteName}`}
                          className="text-xs text-destructive hover:underline"
                          onClick={() => removeItem(item.wasteId)}
                        >
                          ✕ Quitar
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`treatment-${item.wasteId}`}>Tratamiento</Label>
                        {item.approvals.length > 1 ? (
                          <Select
                            items={item.approvals.map((a) => ({ value: String(a.id), label: approvalLabel(a) }))}
                            value={item.wasteTreatmentApprovalId !== null ? String(item.wasteTreatmentApprovalId) : null}
                            onValueChange={(value) =>
                              updateItem(item.wasteId, { wasteTreatmentApprovalId: value !== null ? Number(value) : null })
                            }
                          >
                            <SelectTrigger id={`treatment-${item.wasteId}`} disabled={itemsLocked}>
                              <SelectValue placeholder="Selecciona un tratamiento" />
                            </SelectTrigger>
                            <SelectContent>
                              {item.approvals.map((approval) => (
                                <SelectItem key={approval.id} value={String(approval.id)}>
                                  {approvalLabel(approval)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input id={`treatment-${item.wasteId}`} value={approvalLabel(item.approvals[0])} disabled />
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`quantity-${item.wasteId}`}>Cantidad</Label>
                        <Input
                          id={`quantity-${item.wasteId}`}
                          type="number"
                          min={0}
                          disabled={itemsLocked}
                          value={item.estimatedQuantity}
                          onChange={(event) => updateItem(item.wasteId, { estimatedQuantity: event.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`unit-${item.wasteId}`}>Unidad</Label>
                        <Select
                          items={measurementUnits.map((u) => ({ value: String(u.id), label: u.code }))}
                          value={item.measurementUnitId !== null ? String(item.measurementUnitId) : null}
                          onValueChange={(value) => updateItem(item.wasteId, { measurementUnitId: value !== null ? Number(value) : null })}
                        >
                          <SelectTrigger id={`unit-${item.wasteId}`} disabled={itemsLocked}>
                            <SelectValue placeholder="Unidad" />
                          </SelectTrigger>
                          <SelectContent>
                            {measurementUnits.map((unit) => (
                              <SelectItem key={unit.id} value={String(unit.id)}>
                                {unit.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`packaging-${item.wasteId}`}>Empaque</Label>
                        <Select
                          items={packagingTypes.map((p) => ({ value: p.name, label: p.name }))}
                          value={item.packagingType || null}
                          onValueChange={(value) => updateItem(item.wasteId, { packagingType: (value as string) ?? '' })}
                        >
                          <SelectTrigger id={`packaging-${item.wasteId}`} disabled={itemsLocked}>
                            <SelectValue placeholder="Empaque" />
                          </SelectTrigger>
                          <SelectContent>
                            {packagingTypes.map((packaging) => (
                              <SelectItem key={packaging.id} value={packaging.name}>
                                {packaging.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`physicalState-${item.wasteId}`}>Estado Físico</Label>
                        <Select
                          items={physicalStates.map((p) => ({ value: String(p.id), label: p.name }))}
                          value={item.physicalStateId !== null ? String(item.physicalStateId) : null}
                          onValueChange={(value) => updateItem(item.wasteId, { physicalStateId: value !== null ? Number(value) : null })}
                        >
                          <SelectTrigger id={`physicalState-${item.wasteId}`} disabled={itemsLocked}>
                            <SelectValue placeholder="Estado físico" />
                          </SelectTrigger>
                          <SelectContent>
                            {physicalStates.map((physicalState) => (
                              <SelectItem key={physicalState.id} value={String(physicalState.id)}>
                                {physicalState.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <Checkbox
                          id={`forklift-${item.wasteId}`}
                          disabled={itemsLocked}
                          checked={item.requiresForklift}
                          onCheckedChange={(checked) => updateItem(item.wasteId, { requiresForklift: checked === true })}
                        />
                        <Label htmlFor={`forklift-${item.wasteId}`} className="font-normal">
                          Montacarga
                        </Label>
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <Checkbox
                          id={`isolation-${item.wasteId}`}
                          disabled={itemsLocked}
                          checked={item.requiresIsolation}
                          onCheckedChange={(checked) => updateItem(item.wasteId, { requiresIsolation: checked === true })}
                        />
                        <Label htmlFor={`isolation-${item.wasteId}`} className="font-normal">
                          Aislamiento
                        </Label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 border-t border-border pt-3 text-sm sm:grid-cols-3">
                <p>
                  <span className="text-muted-foreground">Total Residuos: </span>
                  <span className="font-medium">{items.length}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Cantidad Estimada: </span>
                  <span className="font-medium">{totalEstimatedQuantity > 0 ? totalEstimatedQuantity : '—'}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Volumen Estimado: </span>
                  <span className="font-medium">{calculatedVolume != null ? `${calculatedVolume} m³` : 'Se calcula en el Paso 3'}</span>
                </p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 border-b border-border pb-4">
                <Label htmlFor="siteAccessType">Tipo de Acceso al Sitio</Label>
                <Select
                  items={SITE_ACCESS_OPTIONS}
                  value={state.siteAccessType || null}
                  onValueChange={(value) => setState({ siteAccessType: (value as string) ?? '' })}
                >
                  <SelectTrigger id="siteAccessType">
                    <SelectValue placeholder="Selecciona el tipo de acceso" />
                  </SelectTrigger>
                  <SelectContent>
                    {SITE_ACCESS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 border-b border-border pb-4 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor="requiresLiftPlatform" className="font-medium">
                      Requiere Plataforma Hidráulica
                    </Label>
                    <p className="text-xs text-muted-foreground">Para carga/descarga de contenedores pesados</p>
                  </div>
                  <Checkbox
                    id="requiresLiftPlatform"
                    checked={state.requiresLiftPlatform}
                    onCheckedChange={(checked) => setState({ requiresLiftPlatform: checked === true })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor="requiresContainerReturn" className="font-medium">
                      Requiere Retorno de Recipientes
                    </Label>
                    <p className="text-xs text-muted-foreground">Devolución de canecas o tambores vacíos</p>
                  </div>
                  <Checkbox
                    id="requiresContainerReturn"
                    checked={state.requiresContainerReturn}
                    onCheckedChange={(checked) => setState({ requiresContainerReturn: checked === true })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 border-b border-border pb-4">
                <span className="text-xs font-semibold text-muted-foreground">DIMENSIONES APROXIMADAS DE CARGA</span>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="estimatedHeight">Alto (cm)</Label>
                    <Input
                      id="estimatedHeight"
                      type="number"
                      min={0}
                      value={state.estimatedHeight}
                      onChange={(event) => setState({ estimatedHeight: event.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="estimatedWidth">Ancho (cm)</Label>
                    <Input
                      id="estimatedWidth"
                      type="number"
                      min={0}
                      value={state.estimatedWidth}
                      onChange={(event) => setState({ estimatedWidth: event.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="estimatedLength">Largo (cm)</Label>
                    <Input
                      id="estimatedLength"
                      type="number"
                      min={0}
                      value={state.estimatedLength}
                      onChange={(event) => setState({ estimatedLength: event.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Volumen calculado automáticamente: <span className="font-medium">{calculatedVolume != null ? `${calculatedVolume} m³` : '—'}</span>
                </p>
              </div>

              <div className="flex flex-col gap-1.5 border-b border-border pb-4">
                <Label htmlFor="loadingLocation">Ubicación de Carga</Label>
                <Textarea
                  id="loadingLocation"
                  rows={2}
                  value={state.loadingLocation}
                  onChange={(value) => setState({ loadingLocation: value })}
                  placeholder="Patio, bodega, puerta de acceso…"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entryInstructions">Instrucciones de Ingreso</Label>
                <Textarea
                  id="entryInstructions"
                  value={state.entryInstructions}
                  onChange={(value) => setState({ entryInstructions: value })}
                  placeholder="Portería, contacto en sitio, identificación requerida…"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 border-b border-border pb-4">
                <span className="text-xs font-semibold text-muted-foreground">CONTROLES Y CERTIFICACIONES</span>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor="requiresAudit" className="font-medium">
                      Requiere Auditoría
                    </Label>
                    <p className="text-xs text-muted-foreground">Verificación presencial por inspector certificado</p>
                  </div>
                  <Checkbox
                    id="requiresAudit"
                    checked={state.requiresAudit}
                    onCheckedChange={(checked) => setState({ requiresAudit: checked === true })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor="requiresPhotoRecord" className="font-medium">
                      Requiere Evidencia Fotográfica
                    </Label>
                    <p className="text-xs text-muted-foreground">Registro fotográfico antes, durante y después del servicio</p>
                  </div>
                  <Checkbox
                    id="requiresPhotoRecord"
                    checked={state.requiresPhotoRecord}
                    onCheckedChange={(checked) => setState({ requiresPhotoRecord: checked === true })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor="requiresServiceReport" className="font-medium">
                      Requiere Acta de Servicio
                    </Label>
                    <p className="text-xs text-muted-foreground">Documento firmado por el representante del generador</p>
                  </div>
                  <Checkbox
                    id="requiresServiceReport"
                    checked={state.requiresServiceReport}
                    onCheckedChange={(checked) => setState({ requiresServiceReport: checked === true })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <Label htmlFor="requiresPriorityCertificate" className="font-medium">
                      Requiere Certificado Prioritario
                    </Label>
                    <p className="text-xs text-muted-foreground">Emisión de certificado en 24h (aplica costo adicional)</p>
                  </div>
                  <Checkbox
                    id="requiresPriorityCertificate"
                    checked={state.requiresPriorityCertificate}
                    onCheckedChange={(checked) => setState({ requiresPriorityCertificate: checked === true })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="operationalNotes">
                  Observaciones Operativas <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Textarea
                  id="operationalNotes"
                  value={state.operationalNotes}
                  onChange={(value) => setState({ operationalNotes: value })}
                  placeholder="Condiciones operativas especiales, restricciones normativas o alertas internas…"
                />
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                📎 Carga de evidencias -- próximamente
              </div>
              <p className="text-xs text-muted-foreground">
                GAP DE CONTRATO: el repositorio de archivos genérico (`files`) todavía no registra
                `SERVICE_REQUEST` como `entity_type` habilitado (`File::ENTITY_MODELS` solo incluye `WASTE` hoy) --
                no es posible adjuntar fotografías ni documentos de soporte a una solicitud de servicio hasta que el
                backend lo agregue. Reportado como gap explícito, no se implementa el cargue aquí para no simular
                una capacidad inexistente.
              </p>
            </div>
          )}

          {step === 6 && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-2 border-b border-border pb-4 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Sede: </span>
                  <span className="font-medium">{branches.find((b) => b.id === state.branchId)?.name ?? '—'}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Fecha Deseada: </span>
                  <span className="font-medium">{state.requestedCollectionDate || '—'}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Prioridad: </span>
                  <span className="font-medium">{PRIORITY_OPTIONS.find((p) => p.value === state.priority)?.label ?? '—'}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Origen: </span>
                  <span className="font-medium">{REQUEST_SOURCE_OPTIONS.find((o) => o.value === state.requestSource)?.label ?? '—'}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Total Residuos: </span>
                  <span className="font-medium">{items.length}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Volumen Est.: </span>
                  <span className="font-medium">{calculatedVolume != null ? `${calculatedVolume} m³` : '—'}</span>
                </p>
              </div>

              <div className="flex flex-col gap-2 border-b border-border pb-4">
                <span className="text-xs font-semibold text-muted-foreground">RESIDUOS INCLUIDOS</span>
                <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Residuo</TableHead>
                        <TableHead>Tratamiento</TableHead>
                        <TableHead>Cantidad</TableHead>
                        <TableHead>Empaque</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.key}>
                          <TableCell>{item.wasteName}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.approvals.find((a) => a.id === item.wasteTreatmentApprovalId)?.branch_treatment.treatment.name ?? '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.estimatedQuantity || '—'}{' '}
                            {measurementUnits.find((u) => u.id === item.measurementUnitId)?.code ?? ''}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.packagingType || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-b border-border pb-4">
                <span className="text-xs font-semibold text-muted-foreground">REQUERIMIENTOS</span>
                <div className="flex flex-wrap gap-2">
                  {state.requiresPhotoRecord && <Badge variant="outline">📷 Evidencia Fotográfica</Badge>}
                  {state.requiresServiceReport && <Badge variant="outline">📋 Acta de Servicio</Badge>}
                  {state.requiresLiftPlatform && <Badge variant="outline">🚛 Plataforma Hidráulica</Badge>}
                  {state.requiresAudit && <Badge variant="outline">🔍 Auditoría</Badge>}
                  {state.requiresContainerReturn && <Badge variant="outline">♻️ Retorno de Recipientes</Badge>}
                  {state.requiresPriorityCertificate && <Badge variant="outline">⚡ Certificado Prioritario</Badge>}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground">VALIDACIÓN FINAL</span>
                <ChecklistList items={finalChecklist} />
              </div>

              {submitError && (
                <p className="text-sm text-destructive" role="alert">
                  {submitError}
                </p>
              )}
            </div>
          )}

          {saveError && (
            <p className="text-sm text-destructive" role="alert">
              {saveError}
            </p>
          )}
          {saveMessage && (
            <p className="text-sm text-muted-foreground" role="status">
              {saveMessage}
            </p>
          )}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" disabled={step === 1} onClick={handlePrevious}>
                ← Anterior
              </Button>
              <Button type="button" variant="ghost" onClick={() => router.push('/admin/service-requests')}>
                Cancelar
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" disabled={isSaving} onClick={handleSaveDraft}>
                Guardar Borrador
              </Button>
              {step < TOTAL_STEPS ? (
                <Button type="button" onClick={handleNext}>
                  Siguiente →
                </Button>
              ) : (
                <Button type="button" disabled={!isReadyToSubmit || isSubmitting} onClick={handleSubmitRequest}>
                  {isSubmitting ? 'Enviando…' : '✓ Enviar Solicitud'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-semibold">Resumen de Solicitud</h3>
            <Badge variant="secondary">Borrador</Badge>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">PROGRESO</span>
            <p className="text-sm">
              Paso {step} de {TOTAL_STEPS} — {STEP_TITLES[step]}
            </p>
            <Progress value={(step / TOTAL_STEPS) * 100} />
            <span className="text-xs text-muted-foreground">{Math.round((step / TOTAL_STEPS) * 100)}% completado</span>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <span className="text-xs font-semibold text-muted-foreground">VALIDACIÓN DEL PASO ACTUAL</span>
            <ChecklistList items={stepChecklist} />
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-xs">
            <span className="text-xs font-semibold text-muted-foreground">INFORMACIÓN DE LA SOLICITUD</span>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sede</span>
              <span className="font-medium">{branches.find((b) => b.id === state.branchId)?.name ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Residuos</span>
              <span className="font-medium">{items.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cantidad</span>
              <span className="font-medium">{totalEstimatedQuantity > 0 ? totalEstimatedQuantity : 'Por ingresar'}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
