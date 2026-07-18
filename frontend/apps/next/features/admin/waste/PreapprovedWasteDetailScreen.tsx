'use client'

import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ApiValidationError,
  activatePreapprovedWaste,
  deactivatePreapprovedWaste,
  fetchBranchTreatments,
  fetchGenerationFrequencies,
  fetchMeasurementUnits,
  fetchPhysicalStates,
  fetchPreapprovedWaste,
  fetchUnCodes,
  fetchWasteCategories,
  fetchWasteStreams,
  updatePreapprovedWaste,
  type AdminBranchTreatment,
  type AdminGenerationFrequency,
  type AdminMeasurementUnit,
  type AdminPhysicalState,
  type AdminPreapprovedWasteDetail,
  type AdminUnCode,
  type AdminWasteCategory,
  type AdminWasteStream,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { MultiChipPicker } from './MultiChipPicker'

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

// Detalle + edición de un "Residuo Preaprobado" (`wastes.waste_type_id=
// PREAPPROVED`, RN-191, ver docblock completo de `PreapprovedWasteController`).
// Gateado por `preapproved_wastes.read` -- el guardado/toggle exige
// `preapproved_wastes.manage` en el backend (`PreapprovedWastePolicy::
// update()`), la UI no repite el gate a nivel de pantalla completa (mismo
// criterio que OrganizationalAreaDetailScreen.tsx/BranchTypeDetailScreen.tsx),
// pero SÍ oculta el botón de guardar/Activar-Desactivar si el actor no tiene
// el permiso `.manage` (defensa en profundidad visual, el backend igual
// rechaza con 403).
//
// Edición inline sin modo separado, un único "Guardar cambios" que manda
// TODO en un solo `updatePreapprovedWaste()` (identificación + clasificación
// + `approval.*` anidado) -- a diferencia de WasteDetailScreen.tsx (que usa
// endpoints `sync*` separados para las 3 pivotes), aquí el backend acepta
// `waste_stream_ids`/`un_code_ids`/`approval` en el MISMO payload de
// `update()` (ver docblock de `PreapprovedWasteController::update()`).
// Tras guardar/activar/desactivar, se REFRESCA con `fetchPreapprovedWaste()`
// (show(), SIEMPRE completo) en vez de intentar mezclar la respuesta parcial
// de `update()`/`activate()`/`deactivate()` -- evita el GAP de contrato
// documentado en api.ts (esas 3 respuestas no traen todas las relaciones).
export function PreapprovedWasteDetailScreen({ preapprovedWasteId }: { preapprovedWasteId: number | string }) {
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('preapproved_wastes.read')
  const canManage = Boolean(user?.permissions?.includes('preapproved_wastes.manage'))

  const [waste, setWaste] = useState<AdminPreapprovedWasteDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [wasteCategoryId, setWasteCategoryId] = useState<number | null>(null)
  const [physicalStateId, setPhysicalStateId] = useState<number | null>(null)
  const [measurementUnitId, setMeasurementUnitId] = useState<number | null>(null)
  const [averageWeight, setAverageWeight] = useState('')
  const [generationFrequencyId, setGenerationFrequencyId] = useState<number | null>(null)
  const [requiresSpecialTransport, setRequiresSpecialTransport] = useState(false)
  const [requiresSpecialPpe, setRequiresSpecialPpe] = useState(false)
  const [requiresCharacterization, setRequiresCharacterization] = useState(false)
  const [wasteRequiresSds, setWasteRequiresSds] = useState(false)

  const [streamYIds, setStreamYIds] = useState<number[]>([])
  const [streamAIds, setStreamAIds] = useState<number[]>([])
  const [unCodeIds, setUnCodeIds] = useState<number[]>([])

  const [branchTreatmentId, setBranchTreatmentId] = useState<number | null>(null)
  const [unitPrice, setUnitPrice] = useState('')
  const [currency, setCurrency] = useState('COP')
  const [billingUnit, setBillingUnit] = useState('KG')
  const [minimumQuantity, setMinimumQuantity] = useState('')
  const [maximumQuantity, setMaximumQuantity] = useState('')
  const [requiresLabAnalysis, setRequiresLabAnalysis] = useState(false)
  const [approvalRequiresSds, setApprovalRequiresSds] = useState(false)
  const [restrictions, setRestrictions] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')

  const [wasteCategories, setWasteCategories] = useState<AdminWasteCategory[]>([])
  const [physicalStates, setPhysicalStates] = useState<AdminPhysicalState[]>([])
  const [measurementUnits, setMeasurementUnits] = useState<AdminMeasurementUnit[]>([])
  const [generationFrequencies, setGenerationFrequencies] = useState<AdminGenerationFrequency[]>([])
  const [wasteStreamsY, setWasteStreamsY] = useState<AdminWasteStream[]>([])
  const [wasteStreamsA, setWasteStreamsA] = useState<AdminWasteStream[]>([])
  const [unCodes, setUnCodes] = useState<AdminUnCode[]>([])
  const [branchTreatments, setBranchTreatments] = useState<AdminBranchTreatment[]>([])

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  function applyLoaded(loaded: AdminPreapprovedWasteDetail) {
    setWaste(loaded)
    setName(loaded.name)
    setCode(loaded.code ?? '')
    setDescription(loaded.description ?? '')
    setWasteCategoryId(loaded.waste_category_id)
    setPhysicalStateId(loaded.physical_state_id)
    setMeasurementUnitId(loaded.measurement_unit_id)
    setAverageWeight(loaded.average_weight != null ? String(loaded.average_weight) : '')
    setGenerationFrequencyId(loaded.generation_frequency_id)
    setRequiresSpecialTransport(loaded.requires_special_transport)
    setRequiresSpecialPpe(loaded.requires_special_ppe)
    setRequiresCharacterization(loaded.requires_characterization)
    setWasteRequiresSds(loaded.requires_sds)
    setStreamYIds(loaded.waste_stream_assignments.filter((a) => a.waste_stream.tipo === 'Y').map((a) => a.waste_stream_id))
    setStreamAIds(loaded.waste_stream_assignments.filter((a) => a.waste_stream.tipo === 'A').map((a) => a.waste_stream_id))
    setUnCodeIds(loaded.waste_un_codes.map((a) => a.un_code_id))

    const approval = loaded.treatment_approvals[0] ?? null
    setBranchTreatmentId(approval?.branch_treatment_id ?? null)
    setUnitPrice(approval?.unit_price ?? '')
    setCurrency(approval?.currency ?? 'COP')
    setBillingUnit(approval?.billing_unit ?? 'KG')
    setMinimumQuantity(approval?.minimum_quantity ?? '')
    setMaximumQuantity(approval?.maximum_quantity ?? '')
    setRequiresLabAnalysis(approval?.requires_lab_analysis ?? false)
    setApprovalRequiresSds(approval?.requires_sds ?? false)
    setRestrictions(approval?.restrictions ?? '')
    setValidFrom(approval?.valid_from ?? '')
    setValidUntil(approval?.valid_until ?? '')
  }

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchPreapprovedWaste(preapprovedWasteId)
      .then((result) => {
        if (cancelled) return
        applyLoaded(result.waste)
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
  }, [isAuthorized, preapprovedWasteId])

  // Catálogos de solo lectura -- mismo Promise.all que CreatePreapprovedWasteForm.tsx.
  useEffect(() => {
    if (!isAuthorized) return
    Promise.all([
      fetchWasteCategories({ perPage: 100, status: 'active' }).then((result) => setWasteCategories(result.data)),
      fetchPhysicalStates({ perPage: 100, status: 'active' }).then((result) => setPhysicalStates(result.data)),
      fetchMeasurementUnits({ perPage: 100, status: 'active' }).then((result) => setMeasurementUnits(result.data)),
      fetchGenerationFrequencies({ perPage: 100, status: 'active' }).then((result) => setGenerationFrequencies(result.data)),
      fetchWasteStreams({ perPage: 200, status: 'active', tipo: 'Y' }).then((result) => setWasteStreamsY(result.data)),
      fetchWasteStreams({ perPage: 200, status: 'active', tipo: 'A' }).then((result) => setWasteStreamsA(result.data)),
      fetchUnCodes({ perPage: 200, status: 'active' }).then((result) => setUnCodes(result.data)),
    ]).catch(() => {})
  }, [isAuthorized])

  // Tratamientos de sede -- SIEMPRE scoped a la organización DUEÑA del
  // residuo (`waste.organization_id`, inmutable tras crear -- RN-191).
  useEffect(() => {
    if (!isAuthorized || !waste) return
    let cancelled = false
    fetchBranchTreatments({ organizationId: waste.organization_id, operationalStatus: 'ACTIVE', perPage: 100 })
      .then((result) => {
        if (cancelled) return
        setBranchTreatments(result.data)
      })
      .catch(() => {
        if (cancelled) return
        setBranchTreatments([])
      })
    return () => {
      cancelled = true
    }
    // Solo `organization_id` debe disparar el refetch (inmutable tras crear)
    // -- referenciar `waste` completo re-consultaría en cada guardado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized, waste?.organization_id])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!waste) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      await updatePreapprovedWaste(waste.id, {
        name,
        code: code || undefined,
        description: description || undefined,
        waste_category_id: wasteCategoryId ?? undefined,
        physical_state_id: physicalStateId ?? undefined,
        measurement_unit_id: measurementUnitId ?? undefined,
        average_weight: averageWeight ? Number(averageWeight) : undefined,
        generation_frequency_id: generationFrequencyId ?? undefined,
        requires_special_transport: requiresSpecialTransport,
        requires_special_ppe: requiresSpecialPpe,
        requires_characterization: requiresCharacterization,
        requires_sds: wasteRequiresSds,
        waste_stream_ids: [...streamYIds, ...streamAIds],
        un_code_ids: unCodeIds,
        approval: {
          branch_treatment_id: branchTreatmentId ?? undefined,
          unit_price: unitPrice ? Number(unitPrice) : undefined,
          currency,
          billing_unit: billingUnit,
          minimum_quantity: minimumQuantity ? Number(minimumQuantity) : undefined,
          maximum_quantity: maximumQuantity ? Number(maximumQuantity) : undefined,
          requires_lab_analysis: requiresLabAnalysis,
          requires_sds: approvalRequiresSds,
          restrictions: restrictions || undefined,
          valid_from: validFrom || undefined,
          valid_until: validUntil || undefined,
        },
      })
      const refreshed = await fetchPreapprovedWaste(waste.id)
      applyLoaded(refreshed.waste)
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!waste) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      if (waste.is_active) {
        await deactivatePreapprovedWaste(waste.id)
      } else {
        await activatePreapprovedWaste(waste.id)
      }
      const refreshed = await fetchPreapprovedWaste(waste.id)
      applyLoaded(refreshed.waste)
    } catch (error) {
      setToggleError(errorMessage(error, 'waste'))
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
        {loadError ?? 'No se encontró el residuo preaprobado.'}
      </p>
    )
  }

  const streamYItems = wasteStreamsY.map((s) => ({ id: s.id, label: s.code, sublabel: s.name }))
  const streamAItems = wasteStreamsA.map((s) => ({ id: s.id, label: s.code, sublabel: s.name }))
  const unCodeItems = unCodes.map((c) => ({ id: c.id, label: c.code, sublabel: c.name }))

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <ClipboardCheck className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{waste.name}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                {waste.code ?? '—'} · {waste.organization.legal_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={waste.is_active ? 'default' : 'secondary'}>
              {waste.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            {canManage && (
              <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
                {waste.is_active ? 'Inactivar' : 'Activar'}
              </Button>
            )}
          </div>
        </CardHeader>
        {toggleError && (
          <CardContent>
            <p className="text-sm text-destructive" role="alert">
              {toggleError}
            </p>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={handleSave} className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold">Identificación</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editName">Nombre</Label>
                  <Input id="editName" disabled={!canManage} value={name} onChange={(event) => setName(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editCode">
                    Código <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input id="editCode" disabled={!canManage} value={code} onChange={(event) => setCode(event.target.value)} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editDescription">
                  Descripción <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <textarea
                  id="editDescription"
                  disabled={!canManage}
                  className="min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editWasteCategoryId">
                    Categoría de Residuo <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Select
                    items={wasteCategories.map((c) => ({ value: String(c.id), label: c.name }))}
                    value={wasteCategoryId !== null ? String(wasteCategoryId) : null}
                    disabled={!canManage}
                    onValueChange={(value) => setWasteCategoryId(value !== null ? Number(value) : null)}
                  >
                    <SelectTrigger id="editWasteCategoryId">
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
                  <Label htmlFor="editPhysicalStateId">
                    Estado Físico <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Select
                    items={physicalStates.map((p) => ({ value: String(p.id), label: p.name }))}
                    value={physicalStateId !== null ? String(physicalStateId) : null}
                    disabled={!canManage}
                    onValueChange={(value) => setPhysicalStateId(value !== null ? Number(value) : null)}
                  >
                    <SelectTrigger id="editPhysicalStateId">
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editMeasurementUnitId">Unidad de Medida</Label>
                  <Select
                    items={measurementUnits.map((u) => ({ value: String(u.id), label: u.name }))}
                    value={measurementUnitId !== null ? String(measurementUnitId) : null}
                    disabled={!canManage}
                    onValueChange={(value) => setMeasurementUnitId(value !== null ? Number(value) : null)}
                  >
                    <SelectTrigger id="editMeasurementUnitId">
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
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editAverageWeight">
                    Peso Promedio <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="editAverageWeight"
                    type="number"
                    min={0}
                    disabled={!canManage}
                    value={averageWeight}
                    onChange={(event) => setAverageWeight(event.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editGenerationFrequencyId">
                  Frecuencia de Generación <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Select
                  items={generationFrequencies.map((f) => ({ value: String(f.id), label: f.name }))}
                  value={generationFrequencyId !== null ? String(generationFrequencyId) : null}
                  disabled={!canManage}
                  onValueChange={(value) => setGenerationFrequencyId(value !== null ? Number(value) : null)}
                >
                  <SelectTrigger id="editGenerationFrequencyId">
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
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="editRequiresSpecialTransport"
                    disabled={!canManage}
                    checked={requiresSpecialTransport}
                    onCheckedChange={(checked) => setRequiresSpecialTransport(checked === true)}
                  />
                  <Label htmlFor="editRequiresSpecialTransport" className="font-normal">
                    Requiere transporte especial
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="editRequiresSpecialPpe"
                    disabled={!canManage}
                    checked={requiresSpecialPpe}
                    onCheckedChange={(checked) => setRequiresSpecialPpe(checked === true)}
                  />
                  <Label htmlFor="editRequiresSpecialPpe" className="font-normal">
                    Requiere EPP especial
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="editRequiresCharacterization"
                    disabled={!canManage}
                    checked={requiresCharacterization}
                    onCheckedChange={(checked) => setRequiresCharacterization(checked === true)}
                  />
                  <Label htmlFor="editRequiresCharacterization" className="font-normal">
                    Requiere caracterización química
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="editWasteRequiresSds"
                    disabled={!canManage}
                    checked={wasteRequiresSds}
                    onCheckedChange={(checked) => setWasteRequiresSds(checked === true)}
                  />
                  <Label htmlFor="editWasteRequiresSds" className="font-normal">
                    Requiere ficha de seguridad (SDS)
                  </Label>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">Clasificación</h3>
              <MultiChipPicker
                label="Corrientes Y"
                addLabel="+ Agregar Y"
                items={streamYItems}
                selectedIds={streamYIds}
                onChange={canManage ? setStreamYIds : () => {}}
              />
              <MultiChipPicker
                label="Corrientes A"
                addLabel="+ Agregar A"
                items={streamAItems}
                selectedIds={streamAIds}
                onChange={canManage ? setStreamAIds : () => {}}
              />
              <MultiChipPicker
                label="Códigos UN"
                addLabel="+ Agregar UN"
                items={unCodeItems}
                selectedIds={unCodeIds}
                onChange={canManage ? setUnCodeIds : () => {}}
              />
            </div>

            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">Tratamiento de Sede</h3>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editBranchTreatmentId">Tratamiento de Sede</Label>
                <Select
                  items={branchTreatments.map((bt) => ({
                    value: String(bt.id),
                    label: bt.operational_name ?? bt.internal_code ?? `Tratamiento de sede #${bt.id}`,
                  }))}
                  value={branchTreatmentId !== null ? String(branchTreatmentId) : null}
                  disabled={!canManage}
                  onValueChange={(value) => setBranchTreatmentId(value !== null ? Number(value) : null)}
                >
                  <SelectTrigger id="editBranchTreatmentId">
                    <SelectValue placeholder="Selecciona un tratamiento de sede" />
                  </SelectTrigger>
                  <SelectContent>
                    {branchTreatments.map((bt) => (
                      <SelectItem key={bt.id} value={String(bt.id)}>
                        {bt.operational_name ?? bt.internal_code ?? `Tratamiento de sede #${bt.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">Términos Comerciales</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editUnitPrice">
                    Precio Unitario <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="editUnitPrice"
                    type="number"
                    min={0}
                    disabled={!canManage}
                    value={unitPrice}
                    onChange={(event) => setUnitPrice(event.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="editCurrency">Moneda</Label>
                    <Input id="editCurrency" disabled={!canManage} value={currency} onChange={(event) => setCurrency(event.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="editBillingUnit">Unidad de Facturación</Label>
                    <Input
                      id="editBillingUnit"
                      disabled={!canManage}
                      value={billingUnit}
                      onChange={(event) => setBillingUnit(event.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editMinimumQuantity">
                    Cantidad Mínima <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="editMinimumQuantity"
                    type="number"
                    min={0}
                    disabled={!canManage}
                    value={minimumQuantity}
                    onChange={(event) => setMinimumQuantity(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editMaximumQuantity">
                    Cantidad Máxima <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="editMaximumQuantity"
                    type="number"
                    min={0}
                    disabled={!canManage}
                    value={maximumQuantity}
                    onChange={(event) => setMaximumQuantity(event.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="editRequiresLabAnalysis"
                    disabled={!canManage}
                    checked={requiresLabAnalysis}
                    onCheckedChange={(checked) => setRequiresLabAnalysis(checked === true)}
                  />
                  <Label htmlFor="editRequiresLabAnalysis" className="font-normal">
                    Requiere análisis de laboratorio
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="editApprovalRequiresSds"
                    disabled={!canManage}
                    checked={approvalRequiresSds}
                    onCheckedChange={(checked) => setApprovalRequiresSds(checked === true)}
                  />
                  <Label htmlFor="editApprovalRequiresSds" className="font-normal">
                    Esta evaluación requiere ficha de seguridad (SDS)
                  </Label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editValidFrom">
                    Vigente Desde <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="editValidFrom"
                    type="date"
                    disabled={!canManage}
                    value={validFrom}
                    onChange={(event) => setValidFrom(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editValidUntil">
                    Vigente Hasta <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="editValidUntil"
                    type="date"
                    disabled={!canManage}
                    value={validUntil}
                    onChange={(event) => setValidUntil(event.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editRestrictions">
                  Restricciones <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <textarea
                  id="editRestrictions"
                  disabled={!canManage}
                  className="min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={restrictions}
                  onChange={(event) => setRestrictions(event.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <InfoField label="Fecha de Creación">{formatDate(waste.created_at)}</InfoField>
              <InfoField label="Última Actualización">{formatDate(waste.updated_at)}</InfoField>
            </div>

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

            {canManage && (
              <div className="flex justify-end">
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
