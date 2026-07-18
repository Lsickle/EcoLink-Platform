'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ApiValidationError,
  createPreapprovedWaste,
  fetchBranchTreatments,
  fetchGenerationFrequencies,
  fetchMeasurementUnits,
  fetchPhysicalStates,
  fetchUnCodes,
  fetchWasteCategories,
  fetchWasteStreams,
  type AdminBranchTreatment,
  type AdminGenerationFrequency,
  type AdminMeasurementUnit,
  type AdminPhysicalState,
  type AdminUnCode,
  type AdminWasteCategory,
  type AdminWasteStream,
} from 'app/features/admin/api'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { MultiChipPicker } from './MultiChipPicker'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>
}

type FieldErrors = Partial<Record<'name' | 'branchTreatmentId' | 'classification', string>>

// Formulario de creación de un "Residuo Preaprobado" (`wastes.waste_type_id=
// PREAPPROVED`, RN-191, ver docblock completo de `PreapprovedWasteController`).
// Sin validación con zod (a diferencia de CreateOrganizationalAreaForm.tsx) --
// mismo criterio manual que WasteWizard.tsx, más simple dado el volumen de
// campos y los 2 selectores multi-chip.
//
// Organización -- `OrganizationSearchSelect` (NO `OrganizationQuickSelect`,
// que es específico del wizard de residuos declarados: este catálogo lo
// pueden usar organizaciones nuevas en el futuro), acotada a
// `capability="can_treat_waste"` (el backend revalida esto siempre en
// `store()`), OBLIGATORIA solo para `is_platform_staff` -- para cualquier
// otro actor el backend fuerza su propia organización server-side.
//
// Clasificación -- mismos 3 `MultiChipPicker` EXACTOS que WasteWizard.tsx
// (Corrientes Y, Corrientes A, Códigos UN), el backend exige al menos una
// corriente O un código UN (422 en `waste_stream_ids` si ambos vienen
// vacíos) -- se replica esa validación en cliente antes de enviar.
//
// `branch_treatment_id` -- `<Select>` simple (no combobox de búsqueda, un
// Gestor típico tiene pocos `branch_treatments` propios) SCOPED a la
// organización elegida arriba, filtrado a `operationalStatus: 'ACTIVE'`.
//
// Términos comerciales -- mismo bloque de campos EXACTO que
// TreatmentApprovalDetailScreen.tsx (precio unitario, moneda, unidad de
// facturación, cantidades mínima/máxima, requiere análisis de laboratorio,
// requiere SDS, restricciones), anidados bajo `approval.*` en el payload
// (ver docblock de `CreatePreapprovedWastePayload` en types.ts).
export function CreatePreapprovedWasteForm() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('preapproved_wastes.manage')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [organizationLabel, setOrganizationLabel] = useState<string | null>(null)

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
  const [catalogsError, setCatalogsError] = useState<string | null>(null)

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Catálogos de solo lectura -- mismo Promise.all que WasteWizard.tsx.
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
    ]).catch((error) => setCatalogsError(error instanceof Error ? error.message : 'Error inesperado.'))
  }, [isAuthorized])

  // Tratamientos de sede -- SOLO los de la organización elegida (para
  // platform staff) o los de la propia organización (tenant admin, el
  // backend ya acota `fetchBranchTreatments()` sin necesidad de
  // `organizationId`). RN-191: `approval.branch_treatment_id` DEBE
  // pertenecer a la MISMA organización del residuo preaprobado.
  useEffect(() => {
    if (!isAuthorized) return
    if (isPlatformStaff && !organizationId) {
      setBranchTreatments([])
      return
    }
    let cancelled = false
    fetchBranchTreatments({
      organizationId: isPlatformStaff ? organizationId ?? undefined : undefined,
      operationalStatus: 'ACTIVE',
      perPage: 100,
    })
      .then((result) => {
        if (cancelled) return
        setBranchTreatments(result.data)
      })
      .catch((error) => {
        if (cancelled) return
        setCatalogsError(error instanceof Error ? error.message : 'Error inesperado.')
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized, isPlatformStaff, organizationId])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const errors: FieldErrors = {}
    if (!name.trim()) errors.name = 'El nombre es obligatorio.'
    if (!branchTreatmentId) errors.branchTreatmentId = 'Selecciona el tratamiento de sede.'
    if (streamYIds.length === 0 && streamAIds.length === 0 && unCodeIds.length === 0) {
      errors.classification = 'Asigna al menos una corriente Y/A o un código UN.'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }

    if (isPlatformStaff && !organizationId) {
      setFormError('Selecciona la organización dueña del residuo preaprobado.')
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const { waste: created } = await createPreapprovedWaste({
        organization_id: isPlatformStaff ? organizationId! : undefined,
        name: name.trim(),
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
          branch_treatment_id: branchTreatmentId!,
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
      router.push(`/admin/preapproved-wastes/${created.id}`)
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFormError(
          error.firstError('name') ??
            error.firstError('organization_id') ??
            error.firstError('waste_stream_ids') ??
            error.firstError('approval.branch_treatment_id') ??
            error.message
        )
      } else {
        setFormError(error instanceof Error ? error.message : 'Error inesperado.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const streamYItems = wasteStreamsY.map((s) => ({ id: s.id, label: s.code, sublabel: s.name }))
  const streamAItems = wasteStreamsA.map((s) => ({ id: s.id, label: s.code, sublabel: s.name }))
  const unCodeItems = unCodes.map((c) => ({ id: c.id, label: c.code, sublabel: c.name }))

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="text-xl">Crear Residuo Preaprobado</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-4">
            <SectionHeading>Identificación</SectionHeading>
            {isPlatformStaff && (
              <OrganizationSearchSelect
                label="Organización"
                htmlId="preapprovedWasteOrganizationId"
                capability="can_treat_waste"
                selectedId={organizationId}
                selectedLabel={organizationLabel}
                onSelect={(result) => {
                  setOrganizationId(result.id)
                  setOrganizationLabel(result.legal_name)
                  setBranchTreatmentId(null)
                }}
                onClear={() => {
                  setOrganizationId(null)
                  setOrganizationLabel(null)
                  setBranchTreatmentId(null)
                }}
              />
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nombre</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.name)}
                />
                {fieldErrors.name && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">
                  Código <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="code" value={code} onChange={(event) => setCode(event.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">
                Descripción <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <textarea
                id="description"
                className="min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wasteCategoryId">
                  Categoría de Residuo <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Select
                  items={wasteCategories.map((c) => ({ value: String(c.id), label: c.name }))}
                  value={wasteCategoryId !== null ? String(wasteCategoryId) : null}
                  onValueChange={(value) => setWasteCategoryId(value !== null ? Number(value) : null)}
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
                <Label htmlFor="physicalStateId">
                  Estado Físico <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Select
                  items={physicalStates.map((p) => ({ value: String(p.id), label: p.name }))}
                  value={physicalStateId !== null ? String(physicalStateId) : null}
                  onValueChange={(value) => setPhysicalStateId(value !== null ? Number(value) : null)}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="measurementUnitId">
                  Unidad de Medida <span className="text-muted-foreground">(opcional, por defecto KG)</span>
                </Label>
                <Select
                  items={measurementUnits.map((u) => ({ value: String(u.id), label: u.name }))}
                  value={measurementUnitId !== null ? String(measurementUnitId) : null}
                  onValueChange={(value) => setMeasurementUnitId(value !== null ? Number(value) : null)}
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="averageWeight">
                  Peso Promedio <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="averageWeight"
                  type="number"
                  min={0}
                  value={averageWeight}
                  onChange={(event) => setAverageWeight(event.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="generationFrequencyId">
                Frecuencia de Generación <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Select
                items={generationFrequencies.map((f) => ({ value: String(f.id), label: f.name }))}
                value={generationFrequencyId !== null ? String(generationFrequencyId) : null}
                onValueChange={(value) => setGenerationFrequencyId(value !== null ? Number(value) : null)}
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresSpecialTransport"
                  checked={requiresSpecialTransport}
                  onCheckedChange={(checked) => setRequiresSpecialTransport(checked === true)}
                />
                <Label htmlFor="requiresSpecialTransport" className="font-normal">
                  Requiere transporte especial
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresSpecialPpe"
                  checked={requiresSpecialPpe}
                  onCheckedChange={(checked) => setRequiresSpecialPpe(checked === true)}
                />
                <Label htmlFor="requiresSpecialPpe" className="font-normal">
                  Requiere EPP especial
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresCharacterization"
                  checked={requiresCharacterization}
                  onCheckedChange={(checked) => setRequiresCharacterization(checked === true)}
                />
                <Label htmlFor="requiresCharacterization" className="font-normal">
                  Requiere caracterización química
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="wasteRequiresSds"
                  checked={wasteRequiresSds}
                  onCheckedChange={(checked) => setWasteRequiresSds(checked === true)}
                />
                <Label htmlFor="wasteRequiresSds" className="font-normal">
                  Requiere ficha de seguridad (SDS)
                </Label>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <SectionHeading>Clasificación</SectionHeading>
            <MultiChipPicker
              label="Corrientes Y"
              addLabel="+ Agregar Y"
              items={streamYItems}
              selectedIds={streamYIds}
              onChange={setStreamYIds}
            />
            <MultiChipPicker
              label="Corrientes A"
              addLabel="+ Agregar A"
              items={streamAItems}
              selectedIds={streamAIds}
              onChange={setStreamAIds}
            />
            <MultiChipPicker
              label="Códigos UN"
              addLabel="+ Agregar UN"
              items={unCodeItems}
              selectedIds={unCodeIds}
              onChange={setUnCodeIds}
            />
            {fieldErrors.classification && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.classification}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <SectionHeading>Tratamiento de Sede</SectionHeading>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="branchTreatmentId">Tratamiento de Sede</Label>
              <Select
                items={branchTreatments.map((bt) => ({
                  value: String(bt.id),
                  label: bt.operational_name ?? bt.internal_code ?? `Tratamiento de sede #${bt.id}`,
                }))}
                value={branchTreatmentId !== null ? String(branchTreatmentId) : null}
                disabled={isPlatformStaff && !organizationId}
                onValueChange={(value) => setBranchTreatmentId(value !== null ? Number(value) : null)}
              >
                <SelectTrigger id="branchTreatmentId" aria-invalid={Boolean(fieldErrors.branchTreatmentId)}>
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
              {fieldErrors.branchTreatmentId && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.branchTreatmentId}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <SectionHeading>Términos Comerciales</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="unitPrice">
                  Precio Unitario <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="unitPrice" type="number" min={0} value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="currency">Moneda</Label>
                  <Input id="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="billingUnit">Unidad de Facturación</Label>
                  <Input id="billingUnit" value={billingUnit} onChange={(event) => setBillingUnit(event.target.value)} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="minimumQuantity">
                  Cantidad Mínima <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="minimumQuantity"
                  type="number"
                  min={0}
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
                  value={maximumQuantity}
                  onChange={(event) => setMaximumQuantity(event.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresLabAnalysis"
                  checked={requiresLabAnalysis}
                  onCheckedChange={(checked) => setRequiresLabAnalysis(checked === true)}
                />
                <Label htmlFor="requiresLabAnalysis" className="font-normal">
                  Requiere análisis de laboratorio
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="approvalRequiresSds"
                  checked={approvalRequiresSds}
                  onCheckedChange={(checked) => setApprovalRequiresSds(checked === true)}
                />
                <Label htmlFor="approvalRequiresSds" className="font-normal">
                  Esta evaluación requiere ficha de seguridad (SDS)
                </Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="validFrom">
                  Vigente Desde <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="validFrom" type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="validUntil">
                  Vigente Hasta <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input id="validUntil" type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="restrictions">
                Restricciones <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <textarea
                id="restrictions"
                className="min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={restrictions}
                onChange={(event) => setRestrictions(event.target.value)}
              />
            </div>
          </div>

          {catalogsError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              No se pudieron cargar los catálogos: {catalogsError}
            </p>
          )}

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/preapproved-wastes')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Residuo Preaprobado'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
