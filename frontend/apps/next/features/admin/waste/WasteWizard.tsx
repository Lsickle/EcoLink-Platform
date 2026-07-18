'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ApiValidationError,
  createWaste,
  fetchBranches,
  fetchGenerationFrequencies,
  fetchHazardCharacteristics,
  fetchMeasurementUnits,
  fetchPhysicalStates,
  fetchUnCodes,
  fetchWaste,
  fetchWasteCategories,
  fetchWasteFiles,
  fetchWastePreapprovedMatches,
  fetchWasteStreams,
  submitWaste,
  syncWasteHazardCharacteristics,
  syncWasteUnCodes,
  syncWasteWasteStreams,
  updateWaste,
  uploadFile,
  usePreapprovedTreatmentMatch,
  deleteFile,
  type AdminBranch,
  type AdminFile,
  type AdminGenerationFrequency,
  type AdminHazardCharacteristic,
  type AdminMeasurementUnit,
  type AdminPhysicalState,
  type AdminUnCode,
  type AdminWasteCategory,
  type AdminWasteDetail,
  type AdminWasteStream,
  type PreapprovedTreatmentMatch,
} from 'app/features/admin/api'
import { HAZARD_RISK_LEVEL_CLASSES, HAZARD_RISK_LEVEL_LABELS, hazardRiskLevel } from 'app/features/admin/hazardRiskLevel'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { MultiChipPicker } from './MultiChipPicker'
import { OrganizationQuickSelect } from '../OrganizationQuickSelect'

const TOTAL_STEPS = 5
const MAX_PHOTOS = 5

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
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      id={id}
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
    />
  )
}

type WizardState = {
  organizationId: number | null
  organizationLabel: string | null
  name: string
  description: string
  wasteCategoryId: number | null
  physicalStateId: number | null
  streamYIds: number[]
  streamAIds: number[]
  unCodeIds: number[]
  hazardCharacteristicIds: number[]
  requiresSds: boolean
  requiresCharacterization: boolean
  requiresSpecialTransport: boolean
  requiresSpecialPpe: boolean
  branchId: number | null
  quantity: string
  measurementUnitId: number | null
  generationFrequencyId: number | null
  generationDate: string
  averageWeight: string
  internalReference: string
  operationalNotes: string
}

const initialState: WizardState = {
  organizationId: null,
  organizationLabel: null,
  name: '',
  description: '',
  wasteCategoryId: null,
  physicalStateId: null,
  streamYIds: [],
  streamAIds: [],
  unCodeIds: [],
  hazardCharacteristicIds: [],
  requiresSds: false,
  requiresCharacterization: false,
  requiresSpecialTransport: false,
  requiresSpecialPpe: false,
  branchId: null,
  quantity: '',
  measurementUnitId: null,
  generationFrequencyId: null,
  generationDate: '',
  averageWeight: '',
  internalReference: '',
  operationalNotes: '',
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

// Núcleo del Módulo Residuos -- WIZARD de 5 pasos (Figma fileKey
// pX6vqXxnJ66YSIYpE7v9pV, nodeId 777:9186). Ajustes deliberados vs. el mock
// (documentados en el encargo de este lote, NO reabrir):
//   1. El select simple "Peligrosidad" del Paso 1 se elimina -- reemplazado
//      por el multi-select real de Características de Peligrosidad en el
//      Paso 2 (`waste_hazard_characteristics`), con `waste_danger` derivado
//      de solo lectura.
//   2. El select "Tipo de Residuo: RESPEL" del Paso 1 se reemplaza por el
//      selector real de Categoría de Residuo (`waste_category_id`). El
//      banner "RESPEL detectado" pasa a ser dinámico en el Paso 2 (según si
//      ya hay alguna corriente Y/A o código UN asignado), no en el Paso 1.
//
// Funciona tanto para crear un residuo nuevo (sin `wasteId`) como para
// retomar un Borrador existente (`wasteId` -- navegación
// `/admin/wastes/{id}/edit`, solo mientras `status` sea BR). El residuo se
// crea (`createWaste`) en el primer "Guardar"/"Siguiente" del Paso 1 --
// pasos posteriores usan `updateWaste(wasteId, ...)`.
export function WasteWizard({ wasteId: initialWasteId }: { wasteId?: number | string } = {}) {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth(initialWasteId ? 'wastes.update' : 'wastes.create')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [wasteId, setWasteId] = useState<number | string | null>(initialWasteId ?? null)
  const [step, setStep] = useState(1)
  const [state, setStateRaw] = useState<WizardState>(initialState)
  const [wasteDanger, setWasteDanger] = useState<string | null>(null)
  const [isLoadingDraft, setIsLoadingDraft] = useState(Boolean(initialWasteId))
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [wasteCategories, setWasteCategories] = useState<AdminWasteCategory[]>([])
  const [physicalStates, setPhysicalStates] = useState<AdminPhysicalState[]>([])
  const [wasteStreamsY, setWasteStreamsY] = useState<AdminWasteStream[]>([])
  const [wasteStreamsA, setWasteStreamsA] = useState<AdminWasteStream[]>([])
  const [unCodes, setUnCodes] = useState<AdminUnCode[]>([])
  const [hazardCharacteristics, setHazardCharacteristics] = useState<AdminHazardCharacteristic[]>([])
  const [branches, setBranches] = useState<AdminBranch[]>([])
  const [measurementUnits, setMeasurementUnits] = useState<AdminMeasurementUnit[]>([])
  const [generationFrequencies, setGenerationFrequencies] = useState<AdminGenerationFrequency[]>([])

  const [photos, setPhotos] = useState<AdminFile[]>([])
  const [sdsFile, setSdsFile] = useState<AdminFile | null>(null)
  const [additionalDocuments, setAdditionalDocuments] = useState<AdminFile[]>([])
  const [filesError, setFilesError] = useState<string | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // "Tratamiento Preaprobado Detectado" (Paso 2) -- se revisa UNA SOLA VEZ
  // por sesión de wizard, al agregar la PRIMERA corriente/código. `useRef`
  // (no `useState`) A PROPÓSITO: si fuera estado y estuviera en las
  // dependencias del efecto de abajo, marcarlo synchrónicamente DENTRO del
  // mismo efecto dispara su propia limpieza (cleanup, `cancelled = true`)
  // antes de que el `persist()`/`persistClassification()` en vuelo
  // terminen -- un ref evita ese falso "cancelado" sin causar un re-render
  // extra. `fetchWastePreapprovedMatches()` consulta la clasificación YA
  // GUARDADA en el servidor, por eso el efecto de abajo primero
  // persiste/sincroniza (mismo trabajo que "Guardar Borrador") antes de
  // consultar.
  const [preapprovedMatches, setPreapprovedMatches] = useState<PreapprovedTreatmentMatch[]>([])
  const preapprovedCheckedRef = useRef(false)
  const [isUsingPreapprovedMatch, setIsUsingPreapprovedMatch] = useState(false)
  const [usePreapprovedMessage, setUsePreapprovedMessage] = useState<string | null>(null)
  const [usePreapprovedError, setUsePreapprovedError] = useState<string | null>(null)

  const hasClassification = state.streamYIds.length > 0 || state.streamAIds.length > 0 || state.unCodeIds.length > 0

  function setState(patch: Partial<WizardState>) {
    setStateRaw((current) => ({ ...current, ...patch }))
  }

  // Catálogos del wizard -- todos de solo lectura (ya sembrados).
  useEffect(() => {
    if (!isAuthorized) return
    Promise.all([
      fetchWasteCategories({ perPage: 100, status: 'active' }).then((result) => setWasteCategories(result.data)),
      fetchPhysicalStates({ perPage: 100, status: 'active' }).then((result) => setPhysicalStates(result.data)),
      fetchWasteStreams({ perPage: 200, status: 'active', tipo: 'Y' }).then((result) => setWasteStreamsY(result.data)),
      fetchWasteStreams({ perPage: 200, status: 'active', tipo: 'A' }).then((result) => setWasteStreamsA(result.data)),
      fetchUnCodes({ perPage: 200, status: 'active' }).then((result) => setUnCodes(result.data)),
      fetchHazardCharacteristics({ perPage: 100, status: 'active' }).then((result) => setHazardCharacteristics(result.data)),
      fetchMeasurementUnits({ perPage: 100, status: 'active' }).then((result) => setMeasurementUnits(result.data)),
      fetchGenerationFrequencies({ perPage: 100, status: 'active' }).then((result) => setGenerationFrequencies(result.data)),
    ]).catch(() => {})
  }, [isAuthorized])

  // Sedes de la organización -- para tenant users, `fetchBranches()` ya
  // acota por su propia organización server-side (acceso dual); para
  // platform staff, se filtra por la organización elegida en el Paso 1.
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

  // Retomar un Borrador existente.
  useEffect(() => {
    if (!isAuthorized || !initialWasteId) return
    let cancelled = false
    Promise.all([fetchWaste(initialWasteId), fetchWasteFiles(initialWasteId)])
      .then(([wasteResult, filesResult]) => {
        if (cancelled) return
        const waste: AdminWasteDetail = wasteResult.waste
        setStateRaw({
          organizationId: waste.organization_id,
          organizationLabel: waste.organization.legal_name,
          name: waste.name,
          description: waste.description ?? '',
          wasteCategoryId: waste.waste_category_id,
          physicalStateId: waste.physical_state_id,
          streamYIds: waste.waste_stream_assignments.filter((a) => a.waste_stream.tipo === 'Y').map((a) => a.waste_stream_id),
          streamAIds: waste.waste_stream_assignments.filter((a) => a.waste_stream.tipo === 'A').map((a) => a.waste_stream_id),
          unCodeIds: waste.waste_un_codes.map((a) => a.un_code_id),
          hazardCharacteristicIds: waste.waste_hazard_characteristics.map((a) => a.hazard_characteristic_id),
          requiresSds: waste.requires_sds,
          requiresCharacterization: waste.requires_characterization,
          requiresSpecialTransport: waste.requires_special_transport,
          requiresSpecialPpe: waste.requires_special_ppe,
          branchId: waste.branch_id,
          quantity: waste.quantity != null ? String(waste.quantity) : '',
          measurementUnitId: waste.measurement_unit_id,
          generationFrequencyId: waste.generation_frequency_id,
          generationDate: waste.generation_date ?? '',
          averageWeight: waste.average_weight != null ? String(waste.average_weight) : '',
          internalReference: waste.internal_reference ?? '',
          operationalNotes: waste.operational_notes ?? '',
        })
        setWasteDanger(waste.waste_danger)
        setPhotos(filesResult.files.WASTE_PHOTO ?? [])
        setSdsFile((filesResult.files.SDS ?? [])[0] ?? null)
        setAdditionalDocuments(filesResult.files.ADDITIONAL_DOCUMENT ?? [])
        setLoadError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDraft(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, initialWasteId])

  function buildPayload() {
    return {
      waste_category_id: state.wasteCategoryId ?? undefined,
      name: state.name,
      description: state.description || undefined,
      physical_state_id: state.physicalStateId ?? undefined,
      requires_sds: state.requiresSds,
      requires_characterization: state.requiresCharacterization,
      requires_special_transport: state.requiresSpecialTransport,
      requires_special_ppe: state.requiresSpecialPpe,
      branch_id: state.branchId ?? undefined,
      quantity: state.quantity ? Number(state.quantity) : undefined,
      measurement_unit_id: state.measurementUnitId ?? undefined,
      generation_frequency_id: state.generationFrequencyId ?? undefined,
      generation_date: state.generationDate || undefined,
      average_weight: state.averageWeight ? Number(state.averageWeight) : undefined,
      internal_reference: state.internalReference || undefined,
      operational_notes: state.operationalNotes || undefined,
    }
  }

  // Persiste el estado actual -- crea el residuo en el primer guardado
  // (Paso 1), actualiza en cualquier paso posterior. Retorna el id del
  // residuo (nuevo o existente), o null si falló.
  // Núcleo de `persist()` SIN tocar `isSaving` -- usado también por el
  // chequeo silencioso de "Tratamiento Preaprobado Detectado" en segundo
  // plano (ver efecto de abajo), que NO debe deshabilitar "Siguiente"/
  // "Guardar Borrador" mientras corre (bug real detectado en TDD: si
  // reutiliza `isSaving`, una carrera entre el auto-guardado en segundo
  // plano y el click del usuario en "Siguiente" deja el botón deshabilitado
  // justo cuando el usuario intenta avanzar).
  async function persistCore(): Promise<number | string | null> {
    setSaveError(null)
    try {
      if (!wasteId) {
        if (isPlatformStaff && !state.organizationId) {
          setSaveError('Selecciona la organización dueña del residuo.')
          return null
        }
        const { waste: created } = await createWaste({
          ...buildPayload(),
          organization_id: isPlatformStaff ? state.organizationId! : undefined,
        })
        setWasteId(created.id)
        return created.id
      }
      await updateWaste(wasteId, buildPayload())
      return wasteId
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
      return null
    }
  }

  async function persist(): Promise<number | string | null> {
    setIsSaving(true)
    try {
      return await persistCore()
    } finally {
      setIsSaving(false)
    }
  }

  async function persistClassification(id: number | string) {
    const { waste: streamsResult } = await syncWasteWasteStreams(id, [...state.streamYIds, ...state.streamAIds])
    await syncWasteUnCodes(id, state.unCodeIds)
    const { waste: hazardResult } = await syncWasteHazardCharacteristics(id, state.hazardCharacteristicIds)
    setWasteDanger((hazardResult as { waste_danger?: string | null }).waste_danger ?? (streamsResult as { waste_danger?: string | null }).waste_danger ?? null)
  }

  // "Tratamiento Preaprobado Detectado" -- al agregar la PRIMERA corriente/
  // código (Y, A o UN), guarda automáticamente el Borrador (si el residuo
  // aún no existe) y sincroniza la clasificación (si aún no se ha guardado),
  // igual que "Guardar Borrador", para que `fetchWastePreapprovedMatches()`
  // -- que consulta la clasificación YA guardada en el servidor -- pueda
  // encontrar matches reales. Se revisa una única vez por sesión de wizard
  // (`preapprovedChecked`).
  useEffect(() => {
    if (!isAuthorized || step !== 2 || preapprovedCheckedRef.current || !hasClassification) return
    preapprovedCheckedRef.current = true
    let cancelled = false
    ;(async () => {
      const id = await persistCore()
      if (!id || cancelled) return
      try {
        await persistClassification(id)
        const { matches } = await fetchWastePreapprovedMatches(id)
        if (!cancelled) setPreapprovedMatches(matches)
      } catch {
        if (!cancelled) setPreapprovedMatches([])
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized, step, hasClassification])

  // POST .../preapproved-matches/{id}/use -- SIEMPRE nace PENDING/DRAFT
  // (nunca auto-aprobada), el mensaje de confirmación lo deja explícito
  // para no dar a entender que la solicitud ya quedó aprobada.
  async function handleUsePreapprovedMatch(matchId: number) {
    if (!wasteId) return
    setUsePreapprovedError(null)
    setIsUsingPreapprovedMatch(true)
    try {
      await usePreapprovedTreatmentMatch(wasteId, matchId)
      setUsePreapprovedMessage(
        'Se creó una solicitud pre-completada con los términos del match preaprobado -- el Gestor debe confirmarla, todavía no queda aprobada.'
      )
    } catch (error) {
      setUsePreapprovedError(errorMessage(error, 'treatment_approval_id'))
    } finally {
      setIsUsingPreapprovedMatch(false)
    }
  }

  async function handleSaveDraft() {
    const id = await persist()
    if (!id) return
    if (step === 2) {
      await persistClassification(id).catch((error) => setSaveError(errorMessage(error, 'waste_stream_ids')))
    }
    setSaveMessage('Borrador guardado.')
  }

  async function handleNext() {
    setSaveMessage(null)
    const id = await persist()
    if (!id) return
    if (step === 2) {
      try {
        await persistClassification(id)
      } catch (error) {
        setSaveError(errorMessage(error, 'waste_stream_ids'))
        return
      }
    }
    setStep((current) => Math.min(TOTAL_STEPS, current + 1))
  }

  function handlePrevious() {
    setSaveMessage(null)
    setSaveError(null)
    setStep((current) => Math.max(1, current - 1))
  }

  async function handleUploadPhotos(fileList: FileList | null) {
    if (!fileList || !wasteId) return
    const remaining = MAX_PHOTOS - photos.length
    const toUpload = Array.from(fileList).slice(0, Math.max(0, remaining))
    for (const file of toUpload) {
      try {
        const { file: uploaded } = await uploadFile({ file, entityType: 'WASTE', entityId: wasteId, fileCategory: 'WASTE_PHOTO' })
        setPhotos((current) => [...current, uploaded])
        setFilesError(null)
      } catch (error) {
        setFilesError(errorMessage(error, 'file'))
      }
    }
  }

  async function handleUploadSds(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file || !wasteId) return
    try {
      const { file: uploaded } = await uploadFile({ file, entityType: 'WASTE', entityId: wasteId, fileCategory: 'SDS' })
      setSdsFile(uploaded)
      setFilesError(null)
    } catch (error) {
      setFilesError(errorMessage(error, 'file'))
    }
  }

  async function handleUploadAdditionalDocument(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file || !wasteId) return
    try {
      const { file: uploaded } = await uploadFile({ file, entityType: 'WASTE', entityId: wasteId, fileCategory: 'ADDITIONAL_DOCUMENT' })
      setAdditionalDocuments((current) => [...current, uploaded])
      setFilesError(null)
    } catch (error) {
      setFilesError(errorMessage(error, 'file'))
    }
  }

  async function handleRemovePhoto(id: number) {
    try {
      await deleteFile(id)
      setPhotos((current) => current.filter((photo) => photo.id !== id))
    } catch (error) {
      setFilesError(errorMessage(error, 'file'))
    }
  }

  async function handleSubmitDeclaration() {
    if (!wasteId) return
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      await submitWaste(wasteId)
      router.push(`/admin/wastes/${wasteId}`)
    } catch (error) {
      setSubmitError(errorMessage(error, 'status'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const isRespelDetected = hasClassification

  const finalChecklist: ChecklistItem[] = useMemo(
    () => [
      { label: 'Residuo identificado y clasificado', complete: state.name.trim().length > 0 && state.wasteCategoryId != null },
      { label: 'Corrientes regulatorias asignadas (Y/A/UN)', complete: hasClassification },
      { label: 'Cantidad y unidad declaradas', complete: state.quantity.trim().length > 0 && state.measurementUnitId != null },
      { label: 'Sede generadora confirmada', complete: state.branchId != null },
      { label: 'Fecha y frecuencia registradas', complete: state.generationDate.trim().length > 0 && state.generationFrequencyId != null },
      { label: 'Fotografías adjuntas', complete: photos.length > 0 },
      { label: 'Ficha de seguridad SDS cargada', complete: !state.requiresSds || sdsFile != null },
    ],
    [state, hasClassification, photos.length, sdsFile]
  )

  const isReadyToSubmit = finalChecklist.every((item) => item.complete)

  const stepChecklist: ChecklistItem[] = useMemo(() => {
    if (step === 1) {
      return [
        { label: 'Tipo de declaración', complete: true },
        { label: 'Nombre del residuo', complete: state.name.trim().length > 0 },
        { label: 'Descripción técnica', complete: state.description.trim().length > 0 },
        { label: 'Categoría de Residuo', complete: state.wasteCategoryId != null },
        { label: 'Estado físico', complete: state.physicalStateId != null },
      ]
    }
    if (step === 2) {
      return [
        { label: 'Corrientes/UN asignados', complete: hasClassification },
        { label: 'Características de Peligrosidad', complete: state.hazardCharacteristicIds.length > 0 },
      ]
    }
    if (step === 3) {
      return [
        { label: 'Sede generadora', complete: state.branchId != null },
        { label: 'Cantidad y unidad', complete: state.quantity.trim().length > 0 && state.measurementUnitId != null },
        { label: 'Frecuencia de generación', complete: state.generationFrequencyId != null },
        { label: 'Fecha de generación', complete: state.generationDate.trim().length > 0 },
      ]
    }
    if (step === 4) {
      return [
        { label: 'Fotografías (mín. 1)', complete: photos.length > 0 },
        { label: 'Ficha de seguridad SDS', complete: !state.requiresSds || sdsFile != null },
      ]
    }
    return finalChecklist
  }, [step, state, hasClassification, photos.length, sdsFile, finalChecklist])

  if (!isAuthorized || isLoadingDraft) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (loadError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError}
      </p>
    )
  }

  const streamYItems = wasteStreamsY.map((s) => ({ id: s.id, label: s.code, sublabel: s.name }))
  const streamAItems = wasteStreamsA.map((s) => ({ id: s.id, label: s.code, sublabel: s.name }))
  const unCodeItems = unCodes.map((c) => ({ id: c.id, label: c.code, sublabel: c.name }))

  const stepTitles: Record<number, string> = {
    1: 'Identificación',
    2: 'Caracterización',
    3: 'Información de Generación',
    4: 'Evidencias y Documentos',
    5: 'Confirmación y Envío',
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-sm font-semibold">
              Paso {step} de {TOTAL_STEPS} — {stepTitles[step]}
            </h2>
            <Badge variant="outline">{step}/5</Badge>
          </div>

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground">TIPO DE DECLARACIÓN</span>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="flex cursor-pointer flex-col gap-1 rounded-lg border-2 border-primary bg-primary/5 p-3">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <input type="radio" name="declarationType" checked readOnly aria-label="Residuo Nuevo" />
                      Residuo Nuevo
                    </span>
                    <span className="text-xs text-muted-foreground">Declaración desde cero</span>
                  </label>
                  <label
                    className="flex cursor-not-allowed flex-col gap-1 rounded-lg border border-border p-3 opacity-60"
                    title="Próximamente"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <input type="radio" name="declarationType" disabled aria-label="Residuo Existente" />
                      Residuo Existente
                    </span>
                    <span className="text-xs text-muted-foreground">Usar registro previo</span>
                  </label>
                  <label
                    className="flex cursor-not-allowed flex-col gap-1 rounded-lg border border-border p-3 opacity-60"
                    title="Próximamente"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <input type="radio" name="declarationType" disabled aria-label="Residuo Preaprobado" />
                      Residuo Preaprobado
                    </span>
                    <span className="text-xs text-muted-foreground">Tratamiento aprobado</span>
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <span className="text-xs font-semibold text-muted-foreground">INFORMACIÓN BÁSICA</span>
                {isPlatformStaff && (
                  // Catálogo de organizaciones acotado (mercado colombiano
                  // regulado) -- se reemplaza el selector con debounce+red
                  // (`OrganizationSearchSelect`) por uno que carga el
                  // catálogo completo una vez y filtra en memoria (ver
                  // docblock de `OrganizationQuickSelect`), este selector
                  // solo lo usa platform staff.
                  <OrganizationQuickSelect
                    label="Organización"
                    htmlId="wasteOrganizationId"
                    selectedId={state.organizationId}
                    selectedLabel={state.organizationLabel}
                    onSelect={(result) => setState({ organizationId: result.id, organizationLabel: result.legal_name })}
                    onClear={() => setState({ organizationId: null, organizationLabel: null })}
                  />
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wasteCode">Código Interno</Label>
                    <Input id="wasteCode" value="Auto-generado" disabled />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wasteName">Nombre del Residuo *</Label>
                    <Input id="wasteName" value={state.name} onChange={(event) => setState({ name: event.target.value })} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wasteDescription">Descripción Técnica</Label>
                  <Textarea
                    id="wasteDescription"
                    value={state.description}
                    onChange={(value) => setState({ description: value })}
                    placeholder="Descripción técnica del residuo, proceso generador, características…"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="wasteCategoryId">Categoría de Residuo *</Label>
                    <Select
                      items={wasteCategories.map((c) => ({ value: String(c.id), label: c.name }))}
                      value={state.wasteCategoryId !== null ? String(state.wasteCategoryId) : null}
                      onValueChange={(value) => setState({ wasteCategoryId: value !== null ? Number(value) : null })}
                    >
                      <SelectTrigger id="wasteCategoryId">
                        <SelectValue placeholder="Selecciona una categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {wasteCategories.map((category) => (
                          <SelectItem key={category.id} value={String(category.id)}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="physicalStateId">Estado Físico</Label>
                    <Select
                      items={physicalStates.map((p) => ({ value: String(p.id), label: p.name }))}
                      value={state.physicalStateId !== null ? String(state.physicalStateId) : null}
                      onValueChange={(value) => setState({ physicalStateId: value !== null ? Number(value) : null })}
                    >
                      <SelectTrigger id="physicalStateId">
                        <SelectValue placeholder="Selecciona un estado" />
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
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 border-b border-border pb-4">
                <span className="text-xs font-semibold text-muted-foreground">CORRIENTES REGULATORIAS</span>
                <MultiChipPicker
                  label="Corrientes Y"
                  addLabel="+ Agregar Y"
                  items={streamYItems}
                  selectedIds={state.streamYIds}
                  onChange={(ids) => setState({ streamYIds: ids })}
                />
                <MultiChipPicker
                  label="Corrientes A"
                  addLabel="+ Agregar A"
                  items={streamAItems}
                  selectedIds={state.streamAIds}
                  onChange={(ids) => setState({ streamAIds: ids })}
                />
                <MultiChipPicker
                  label="Códigos UN"
                  addLabel="+ Agregar UN"
                  items={unCodeItems}
                  selectedIds={state.unCodeIds}
                  onChange={(ids) => setState({ unCodeIds: ids })}
                />
                {isRespelDetected && (
                  <div className="rounded-lg border border-blue-300 bg-blue-50 p-2 text-xs text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                    ℹ Residuo RESPEL detectado · Se requerirán documentos técnicos en el Paso 4
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 border-b border-border pb-4">
                <span className="text-xs font-semibold text-muted-foreground">CARACTERÍSTICAS ESPECIALES</span>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="requiresSds" className="font-medium">
                      Requiere Hoja de Seguridad (SDS)
                    </Label>
                    <p className="text-xs text-muted-foreground">Documento técnico obligatorio para RESPEL</p>
                  </div>
                  <Checkbox
                    id="requiresSds"
                    checked={state.requiresSds}
                    onCheckedChange={(checked) => setState({ requiresSds: checked === true })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="requiresCharacterization" className="font-medium">
                      Requiere Caracterización Química
                    </Label>
                    <p className="text-xs text-muted-foreground">Análisis físico-químico del residuo</p>
                  </div>
                  <Checkbox
                    id="requiresCharacterization"
                    checked={state.requiresCharacterization}
                    onCheckedChange={(checked) => setState({ requiresCharacterization: checked === true })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="requiresSpecialTransport" className="font-medium">
                      Transporte Especial RESPEL
                    </Label>
                    <p className="text-xs text-muted-foreground">Vehículo habilitado y conductor certificado</p>
                  </div>
                  <Checkbox
                    id="requiresSpecialTransport"
                    checked={state.requiresSpecialTransport}
                    onCheckedChange={(checked) => setState({ requiresSpecialTransport: checked === true })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="requiresSpecialPpe" className="font-medium">
                      Requiere EPP Especial
                    </Label>
                    <p className="text-xs text-muted-foreground">Equipo de protección personal adicional</p>
                  </div>
                  <Checkbox
                    id="requiresSpecialPpe"
                    checked={state.requiresSpecialPpe}
                    onCheckedChange={(checked) => setState({ requiresSpecialPpe: checked === true })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 border-b border-border pb-4">
                <span className="text-xs font-semibold text-muted-foreground">CARACTERÍSTICAS DE PELIGROSIDAD</span>
                <div className="flex flex-col gap-2">
                  {hazardCharacteristics.map((characteristic) => {
                    const checked = state.hazardCharacteristicIds.includes(characteristic.id)
                    const level = hazardRiskLevel(characteristic.risk_level)
                    return (
                      <label key={characteristic.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
                        <span className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => {
                              const ids = next === true
                                ? [...state.hazardCharacteristicIds, characteristic.id]
                                : state.hazardCharacteristicIds.filter((id) => id !== characteristic.id)
                              setState({ hazardCharacteristicIds: ids })
                            }}
                          />
                          {characteristic.name}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${HAZARD_RISK_LEVEL_CLASSES[level]}`}>
                          {HAZARD_RISK_LEVEL_LABELS[level]}
                        </span>
                      </label>
                    )
                  })}
                </div>
                {wasteDanger && (
                  <p className="text-xs text-muted-foreground">
                    Peligrosidad derivada: <Badge variant="destructive">{wasteDanger}</Badge>
                  </p>
                )}
              </div>

              {preapprovedMatches.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-blue-300 bg-blue-50 p-3 dark:bg-blue-950/20">
                  <span className="text-xs font-semibold text-blue-900 dark:text-blue-200">Tratamiento Preaprobado Detectado</span>
                  {preapprovedMatches.map((match) => (
                    <div
                      key={match.id}
                      className="flex flex-col items-start justify-between gap-2 rounded-lg border border-blue-200 bg-background p-2 sm:flex-row sm:items-center dark:border-blue-900"
                    >
                      <div className="text-xs">
                        <p className="font-medium">
                          {match.branch_treatment.treatment.name} · {match.organization.legal_name}
                        </p>
                        <p className="text-muted-foreground">
                          {match.branch_treatment.branch.name}
                          {match.unit_price != null ? ` · ${match.unit_price} ${match.currency}/${match.billing_unit}` : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={isUsingPreapprovedMatch}
                        onClick={() => handleUsePreapprovedMatch(match.id)}
                      >
                        Usar este tratamiento
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {usePreapprovedMessage && (
                <p className="text-xs text-muted-foreground" role="status">
                  {usePreapprovedMessage}
                </p>
              )}
              {usePreapprovedError && (
                <p className="text-xs text-destructive" role="alert">
                  {usePreapprovedError}
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5 border-b border-border pb-4">
                <Label htmlFor="branchId">Sede Generadora *</Label>
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

              <div className="grid grid-cols-1 gap-4 border-b border-border pb-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="quantity">Cantidad *</Label>
                  <Input id="quantity" type="number" min={0} value={state.quantity} onChange={(event) => setState({ quantity: event.target.value })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="measurementUnitId">Unidad *</Label>
                  <Select
                    items={measurementUnits.map((u) => ({ value: String(u.id), label: u.name }))}
                    value={state.measurementUnitId !== null ? String(state.measurementUnitId) : null}
                    onValueChange={(value) => setState({ measurementUnitId: value !== null ? Number(value) : null })}
                  >
                    <SelectTrigger id="measurementUnitId">
                      <SelectValue placeholder="Selecciona una unidad" />
                    </SelectTrigger>
                    <SelectContent>
                      {measurementUnits.map((unit) => (
                        <SelectItem key={unit.id} value={String(unit.id)}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 border-b border-border pb-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="generationFrequencyId">Frecuencia de Generación *</Label>
                  <Select
                    items={generationFrequencies.map((f) => ({ value: String(f.id), label: f.name }))}
                    value={state.generationFrequencyId !== null ? String(state.generationFrequencyId) : null}
                    onValueChange={(value) => setState({ generationFrequencyId: value !== null ? Number(value) : null })}
                  >
                    <SelectTrigger id="generationFrequencyId">
                      <SelectValue placeholder="Selecciona una frecuencia" />
                    </SelectTrigger>
                    <SelectContent>
                      {generationFrequencies.map((frequency) => (
                        <SelectItem key={frequency.id} value={String(frequency.id)}>
                          {frequency.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="generationDate">Fecha de Generación *</Label>
                  <Input
                    id="generationDate"
                    type="date"
                    value={state.generationDate}
                    onChange={(event) => setState({ generationDate: event.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 border-b border-border pb-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="averageWeight">
                    Peso Promedio <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="averageWeight"
                    type="number"
                    min={0}
                    value={state.averageWeight}
                    onChange={(event) => setState({ averageWeight: event.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="internalReference">
                    Referencia Interna <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="internalReference"
                    value={state.internalReference}
                    onChange={(event) => setState({ internalReference: event.target.value })}
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
                  placeholder="Contexto de la generación, almacenamiento temporal, condiciones especiales…"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 border-b border-border pb-4">
                <span className="text-xs font-semibold text-muted-foreground">FOTOGRAFÍAS DEL RESIDUO</span>
                <p className="text-xs text-muted-foreground">Obligatorio · Mínimo 1 foto, máximo {MAX_PHOTOS}</p>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/40 p-4 text-center dark:bg-blue-950/10">
                  <span className="text-sm font-medium">Arrastra fotos aquí o haz clic para seleccionar</span>
                  <span className="text-xs text-muted-foreground">JPG, PNG · Máx. 10 MB</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="sr-only"
                    aria-label="Seleccionar fotos"
                    disabled={photos.length >= MAX_PHOTOS}
                    onChange={(event) => handleUploadPhotos(event.target.files)}
                  />
                </label>
                {photos.length > 0 && (
                  <p className="text-xs font-medium text-emerald-700">{photos.length} foto(s) cargada(s)</p>
                )}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative rounded-lg border border-border p-2 text-center">
                      <p className="truncate text-xs">{photo.original_filename}</p>
                      <button
                        type="button"
                        aria-label={`Eliminar ${photo.original_filename}`}
                        className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground"
                        onClick={() => handleRemovePhoto(photo.id)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {state.requiresSds && (
                <div className="flex flex-col gap-2 border-b border-border pb-4">
                  <span className="text-xs font-semibold text-muted-foreground">FICHA DE SEGURIDAD (SDS)</span>
                  <p className="text-xs text-muted-foreground">Requerido para RESPEL · Formato PDF</p>
                  {sdsFile ? (
                    <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm dark:bg-emerald-950/20">
                      <span>{sdsFile.original_filename}</span>
                      <label className="cursor-pointer text-xs font-medium text-primary hover:underline">
                        Reemplazar
                        <input type="file" accept="application/pdf" className="sr-only" onChange={(event) => handleUploadSds(event.target.files)} />
                      </label>
                    </div>
                  ) : (
                    <label className="cursor-pointer rounded-lg border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
                      📎 Adjuntar Ficha de Seguridad (PDF)
                      <input
                        type="file"
                        accept="application/pdf"
                        className="sr-only"
                        aria-label="Adjuntar Ficha de Seguridad"
                        onChange={(event) => handleUploadSds(event.target.files)}
                      />
                    </label>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-muted-foreground">DOCUMENTOS ADICIONALES</span>
                <p className="text-xs text-muted-foreground">Manifiestos, permisos, autorizaciones (Opcional)</p>
                <label className="cursor-pointer rounded-lg border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
                  📎 Adjuntar documento adicional
                  <input
                    type="file"
                    className="sr-only"
                    aria-label="Adjuntar documento adicional"
                    onChange={(event) => handleUploadAdditionalDocument(event.target.files)}
                  />
                </label>
                <ul className="flex flex-col gap-1">
                  {additionalDocuments.map((document) => (
                    <li key={document.id} className="rounded-lg border border-border p-2 text-xs">
                      {document.original_filename}
                    </li>
                  ))}
                </ul>
              </div>

              {filesError && (
                <p className="text-sm text-destructive" role="alert">
                  {filesError}
                </p>
              )}

              <div className="rounded-lg border border-blue-300 bg-blue-50 p-2 text-xs text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                📁 {photos.length + (sdsFile ? 1 : 0) + additionalDocuments.length} archivos adjuntos
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-2 border-b border-border pb-4 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Residuo: </span>
                  <span className="font-medium">{state.name}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Categoría: </span>
                  <span className="font-medium">
                    {wasteCategories.find((c) => c.id === state.wasteCategoryId)?.name ?? '—'}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Sede: </span>
                  <span className="font-medium">{branches.find((b) => b.id === state.branchId)?.name ?? '—'}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Cantidad: </span>
                  <span className="font-medium">
                    {state.quantity || '—'} {measurementUnits.find((u) => u.id === state.measurementUnitId)?.code ?? ''}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Frecuencia: </span>
                  <span className="font-medium">
                    {generationFrequencies.find((f) => f.id === state.generationFrequencyId)?.name ?? '—'}
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Fecha Gen.: </span>
                  <span className="font-medium">{state.generationDate || '—'}</span>
                </p>
              </div>

              <div className="flex flex-col gap-2 border-b border-border pb-4">
                <span className="text-xs font-semibold text-muted-foreground">CORRIENTES REGULATORIAS</span>
                <div className="flex flex-wrap gap-2">
                  {[...streamYItems.filter((i) => state.streamYIds.includes(i.id)), ...streamAItems.filter((i) => state.streamAIds.includes(i.id)), ...unCodeItems.filter((i) => state.unCodeIds.includes(i.id))].map((item) => (
                    <Badge key={item.label} variant="outline">
                      {item.label} · {item.sublabel}
                    </Badge>
                  ))}
                  {!hasClassification && <span className="text-sm text-muted-foreground">Sin corrientes asignadas.</span>}
                </div>
                {wasteDanger && (
                  <p className="text-xs text-muted-foreground">
                    Peligrosidad: <Badge variant="destructive">{wasteDanger}</Badge>
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 border-b border-border pb-4">
                <span className="text-xs font-semibold text-muted-foreground">DOCUMENTOS Y TRATAMIENTO</span>
                <p className="text-sm text-muted-foreground">
                  {photos.length + (sdsFile ? 1 : 0) + additionalDocuments.length} archivos adjuntos
                </p>
              </div>

              <div className="flex flex-col gap-2 border-b border-border pb-4">
                <span className="text-xs font-semibold text-muted-foreground">VALIDACIÓN FINAL</span>
                <ChecklistList items={finalChecklist} />
              </div>

              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Declaro bajo juramento que la información consignada en este formulario es verídica y completa, conforme a
                los requisitos del Decreto 1076 de 2015 y las normas concordantes. Entiendo que la falsedad en la
                declaración conlleva sanciones administrativas y penales según la legislación colombiana vigente.
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
            <Button type="button" variant="outline" disabled={step === 1} onClick={handlePrevious}>
              ← Anterior
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" disabled={isSaving} onClick={handleSaveDraft}>
                Guardar Borrador
              </Button>
              {step < TOTAL_STEPS ? (
                <Button type="button" disabled={isSaving} onClick={handleNext}>
                  Siguiente →
                </Button>
              ) : (
                <Button type="button" disabled={!isReadyToSubmit || isSubmitting} onClick={handleSubmitDeclaration}>
                  {isSubmitting ? 'Enviando…' : '✓ Enviar Declaración'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-semibold">Resumen de Declaración</h3>
            <Badge variant="secondary">Borrador</Badge>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">PROGRESO</span>
            <p className="text-sm">
              Paso {step} de {TOTAL_STEPS} — {stepTitles[step]}
            </p>
            <Progress value={(step / TOTAL_STEPS) * 100} />
            <span className="text-xs text-muted-foreground">{Math.round((step / TOTAL_STEPS) * 100)}% completado</span>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <span className="text-xs font-semibold text-muted-foreground">VALIDACIÓN DEL PASO ACTUAL</span>
            <ChecklistList items={stepChecklist} />
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-xs">
            <span className="text-xs font-semibold text-muted-foreground">INFORMACIÓN DEL RESIDUO</span>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nombre</span>
              <span className="font-medium">{state.name || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tipo</span>
              <span className="font-medium">{isRespelDetected ? 'RESPEL' : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Corrientes</span>
              <span className="font-medium">{hasClassification ? `${state.streamYIds.length + state.streamAIds.length + state.unCodeIds.length} asignadas` : 'Sin seleccionar'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cantidad</span>
              <span className="font-medium">{state.quantity ? `${state.quantity}` : 'Por ingresar'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Archivos</span>
              <span className="font-medium">{photos.length + (sdsFile ? 1 : 0) + additionalDocuments.length} cargados</span>
            </div>
          </div>

          {isRespelDetected && (
            <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
              <p className="font-semibold">💡 Residuo RESPEL</p>
              <p>Requiere corrientes Y/A/UN obligatorias y documentos técnicos para cumplimiento normativo.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
