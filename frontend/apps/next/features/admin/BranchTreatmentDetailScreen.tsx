'use client'

import { useEffect, useRef, useState } from 'react'
import { FlaskRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ApiValidationError,
  activateBranchTreatment,
  deactivateBranchTreatment,
  fetchBranchTreatment,
  fetchBranchTreatmentActivity,
  fetchUnCodes,
  fetchWasteStreams,
  syncBranchTreatmentAllowedUnCodes,
  syncBranchTreatmentAllowedWasteStreams,
  updateBranchTreatment,
  type AdminBranchTreatmentDetail,
  type AdminUnCode,
  type AdminWasteStream,
  type BranchTreatmentOperationalStatus,
  type RoleActivityEvent,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'

const STATUS_LABELS: Record<BranchTreatmentOperationalStatus, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  SUSPENDED: 'Suspendido',
}

const STATUS_BADGE_VARIANT: Record<BranchTreatmentOperationalStatus, 'default' | 'secondary' | 'destructive'> = {
  ACTIVE: 'default',
  INACTIVE: 'secondary',
  SUSPENDED: 'destructive',
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

// Detalle de "Tratamiento de Sucursal" (RN-063/D-R02) -- mismo layout de 2
// columnas que BranchDetailScreen.tsx/VehicleDetailScreen.tsx. Header con
// badge de Estado Operativo + Editar/Activar-Inactivar. Tabs General/
// Corrientes/Actividad: la tab "Corrientes" agrega el checklist multi-select
// de Corrientes Y/A permitidas (REEMPLAZA la lista completa al guardar, no
// es assign/revoke individual -- ver `syncBranchTreatmentAllowedWasteStreams()`)
// más una sección secundaria colapsable "Códigos UN Permitidos" con el mismo
// patrón. Ambos checklists se cargan de forma perezosa (mismo criterio
// `xLoaded` fuera de las dependencias del efecto que BranchDetailScreen.tsx).
export function BranchTreatmentDetailScreen({ branchTreatmentId }: { branchTreatmentId: number | string }) {
  const { isAuthorized } = useRequireAuth('branch_treatments.read')
  const [branchTreatment, setBranchTreatment] = useState<AdminBranchTreatmentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const infoCardRef = useRef<HTMLDivElement | null>(null)

  // Formulario de edición (sección "Información General")
  const [internalCode, setInternalCode] = useState('')
  const [operationalName, setOperationalName] = useState('')
  const [maxCapacity, setMaxCapacity] = useState('')
  const [capacityUnit, setCapacityUnit] = useState('KG')
  const [dailyCapacity, setDailyCapacity] = useState('')
  const [monthlyCapacity, setMonthlyCapacity] = useState('')
  const [environmentalLicenseNumber, setEnvironmentalLicenseNumber] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [requiresManualApproval, setRequiresManualApproval] = useState(false)
  const [allowsMixedWaste, setAllowsMixedWaste] = useState(false)
  const [requiresWeightValidation, setRequiresWeightValidation] = useState(true)
  const [observations, setObservations] = useState('')

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'general' | 'corrientes' | 'auditoria'>('general')

  // Checklist "Corrientes Y/A Permitidas"
  const [wasteStreams, setWasteStreams] = useState<AdminWasteStream[]>([])
  const [wasteStreamsLoaded, setWasteStreamsLoaded] = useState(false)
  const [wasteStreamsLoading, setWasteStreamsLoading] = useState(false)
  const [wasteStreamsError, setWasteStreamsError] = useState<string | null>(null)
  const [selectedWasteStreamIds, setSelectedWasteStreamIds] = useState<number[]>([])
  const [isSavingWasteStreams, setIsSavingWasteStreams] = useState(false)
  const [wasteStreamsSaveMessage, setWasteStreamsSaveMessage] = useState<string | null>(null)

  // Sección secundaria colapsable "Códigos UN Permitidos"
  const [showUnCodes, setShowUnCodes] = useState(false)
  const [unCodes, setUnCodes] = useState<AdminUnCode[]>([])
  const [unCodesLoaded, setUnCodesLoaded] = useState(false)
  const [unCodesLoading, setUnCodesLoading] = useState(false)
  const [unCodesError, setUnCodesError] = useState<string | null>(null)
  const [selectedUnCodeIds, setSelectedUnCodeIds] = useState<number[]>([])
  const [isSavingUnCodes, setIsSavingUnCodes] = useState(false)
  const [unCodesSaveMessage, setUnCodesSaveMessage] = useState<string | null>(null)

  const [activityEvents, setActivityEvents] = useState<RoleActivityEvent[]>([])
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchBranchTreatment(branchTreatmentId)
      .then((result) => {
        if (cancelled) return
        const bt = result.branch_treatment
        setBranchTreatment(bt)
        setInternalCode(bt.internal_code ?? '')
        setOperationalName(bt.operational_name ?? '')
        setMaxCapacity(bt.max_capacity != null ? String(bt.max_capacity) : '')
        setCapacityUnit(bt.capacity_unit)
        setDailyCapacity(bt.daily_capacity != null ? String(bt.daily_capacity) : '')
        setMonthlyCapacity(bt.monthly_capacity != null ? String(bt.monthly_capacity) : '')
        setEnvironmentalLicenseNumber(bt.environmental_license_number ?? '')
        setValidFrom(bt.valid_from ?? '')
        setValidUntil(bt.valid_until ?? '')
        setRequiresManualApproval(bt.requires_manual_approval)
        setAllowsMixedWaste(bt.allows_mixed_waste)
        setRequiresWeightValidation(bt.requires_weight_validation)
        setObservations(bt.observations ?? '')
        setSelectedWasteStreamIds(bt.allowed_waste_streams.map((item) => item.id))
        setSelectedUnCodeIds(bt.allowed_un_codes.map((item) => item.id))
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
  }, [isAuthorized, branchTreatmentId])

  useEffect(() => {
    if (activeTab !== 'corrientes' || wasteStreamsLoaded || !isAuthorized) return
    let cancelled = false
    setWasteStreamsLoading(true)
    fetchWasteStreams({ status: 'active', perPage: 300 })
      .then((result) => {
        if (cancelled) return
        setWasteStreams(result.data)
        setWasteStreamsLoaded(true)
        setWasteStreamsError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setWasteStreamsError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setWasteStreamsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthorized, branchTreatmentId])

  useEffect(() => {
    if (!showUnCodes || unCodesLoaded || !isAuthorized) return
    let cancelled = false
    setUnCodesLoading(true)
    fetchUnCodes({ status: 'active', perPage: 300 })
      .then((result) => {
        if (cancelled) return
        setUnCodes(result.data)
        setUnCodesLoaded(true)
        setUnCodesError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setUnCodesError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setUnCodesLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUnCodes, isAuthorized, branchTreatmentId])

  useEffect(() => {
    if (activeTab !== 'auditoria' || activityLoaded || !isAuthorized) return
    let cancelled = false
    setActivityLoading(true)
    fetchBranchTreatmentActivity(branchTreatmentId, { perPage: 15 })
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
  }, [activeTab, isAuthorized, branchTreatmentId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!branchTreatment) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { branch_treatment: updated } = await updateBranchTreatment(branchTreatment.id, {
        branch_id: branchTreatment.branch_id,
        treatment_id: branchTreatment.treatment_id,
        internal_code: internalCode || undefined,
        operational_name: operationalName || undefined,
        max_capacity: maxCapacity ? Number(maxCapacity) : undefined,
        capacity_unit: capacityUnit,
        daily_capacity: dailyCapacity ? Number(dailyCapacity) : undefined,
        monthly_capacity: monthlyCapacity ? Number(monthlyCapacity) : undefined,
        environmental_license_number: environmentalLicenseNumber || undefined,
        valid_from: validFrom || undefined,
        valid_until: validUntil || undefined,
        requires_manual_approval: requiresManualApproval,
        allows_mixed_waste: allowsMixedWaste,
        requires_weight_validation: requiresWeightValidation,
        observations: observations || undefined,
      })
      // updateBranchTreatment() devuelve organization/branch/treatment
      // recargados (fresh()) pero con el shape simplificado de
      // `AdminBranchTreatment` -- se preservan los objetos completos ya
      // cargados por fetchBranchTreatment()/show(), mismo criterio que
      // BranchDetailScreen.tsx/VehicleDetailScreen.tsx.
      setBranchTreatment((current) =>
        current
          ? {
              ...current,
              ...updated,
              organization: current.organization,
              branch: current.branch,
              treatment: current.treatment,
              allowed_waste_streams: current.allowed_waste_streams,
              allowed_un_codes: current.allowed_un_codes,
              created_by: current.created_by,
              updated_by: current.updated_by,
            }
          : current
      )
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'internal_code'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!branchTreatment) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { branch_treatment: updated } = branchTreatment.is_active
        ? await deactivateBranchTreatment(branchTreatment.id)
        : await activateBranchTreatment(branchTreatment.id)
      setBranchTreatment((current) =>
        current ? { ...current, is_active: updated.is_active, operational_status: updated.operational_status } : current
      )
    } catch (error) {
      setToggleError(errorMessage(error, 'branch_treatment'))
    } finally {
      setIsTogglingActive(false)
    }
  }

  function toggleWasteStream(id: number) {
    setSelectedWasteStreamIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function handleSaveWasteStreams() {
    if (!branchTreatment) return
    setWasteStreamsSaveMessage(null)
    setWasteStreamsError(null)
    setIsSavingWasteStreams(true)
    try {
      const { branch_treatment: updated } = await syncBranchTreatmentAllowedWasteStreams(
        branchTreatment.id,
        selectedWasteStreamIds
      )
      setBranchTreatment((current) => (current ? { ...current, allowed_waste_streams: updated.allowed_waste_streams } : current))
      setWasteStreamsSaveMessage('Corrientes guardadas.')
    } catch (error) {
      setWasteStreamsError(errorMessage(error, 'waste_stream_ids'))
    } finally {
      setIsSavingWasteStreams(false)
    }
  }

  function toggleUnCode(id: number) {
    setSelectedUnCodeIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  async function handleSaveUnCodes() {
    if (!branchTreatment) return
    setUnCodesSaveMessage(null)
    setUnCodesError(null)
    setIsSavingUnCodes(true)
    try {
      const { branch_treatment: updated } = await syncBranchTreatmentAllowedUnCodes(branchTreatment.id, selectedUnCodeIds)
      setBranchTreatment((current) => (current ? { ...current, allowed_un_codes: updated.allowed_un_codes } : current))
      setUnCodesSaveMessage('Códigos UN guardados.')
    } catch (error) {
      setUnCodesError(errorMessage(error, 'un_code_ids'))
    } finally {
      setIsSavingUnCodes(false)
    }
  }

  if (!isAuthorized || isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (loadError || !branchTreatment) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el tratamiento de sede.'}
      </p>
    )
  }

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
                <CardTitle className="text-xl">{branchTreatment.branch.name}</CardTitle>
                <Badge variant="outline">{branchTreatment.treatment.name}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {branchTreatment.internal_code ?? '—'} · {branchTreatment.organization.legal_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANT[branchTreatment.operational_status]}>
              {STATUS_LABELS[branchTreatment.operational_status]}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => infoCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Editar
            </Button>
            <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
              {branchTreatment.is_active ? 'Inactivar' : 'Activar'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {toggleError && (
            <p className="text-sm text-destructive" role="alert">
              {toggleError}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="corrientes">Corrientes</TabsTrigger>
              <TabsTrigger value="auditoria">Actividad</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="pt-4">
              <div ref={infoCardRef}>
                <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
                  <InfoField label="Organización">{branchTreatment.organization.legal_name}</InfoField>
                  <InfoField label="Sede">{branchTreatment.branch.name}</InfoField>
                  <InfoField label="Tratamiento">{branchTreatment.treatment.name}</InfoField>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="internalCode">
                      Código Interno <span className="text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input id="internalCode" value={internalCode} onChange={(event) => setInternalCode(event.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="operationalName">
                      Nombre Operativo <span className="text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      id="operationalName"
                      value={operationalName}
                      onChange={(event) => setOperationalName(event.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="maxCapacity">Capacidad Máxima</Label>
                      <Input
                        id="maxCapacity"
                        type="number"
                        min={0}
                        value={maxCapacity}
                        onChange={(event) => setMaxCapacity(event.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="capacityUnit">Unidad</Label>
                      <Input id="capacityUnit" value={capacityUnit} onChange={(event) => setCapacityUnit(event.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="dailyCapacity">
                        Capacidad Diaria <span className="text-muted-foreground">(opcional)</span>
                      </Label>
                      <Input
                        id="dailyCapacity"
                        type="number"
                        min={0}
                        value={dailyCapacity}
                        onChange={(event) => setDailyCapacity(event.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="monthlyCapacity">
                        Capacidad Mensual <span className="text-muted-foreground">(opcional)</span>
                      </Label>
                      <Input
                        id="monthlyCapacity"
                        type="number"
                        min={0}
                        value={monthlyCapacity}
                        onChange={(event) => setMonthlyCapacity(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="environmentalLicenseNumber">
                      Nº Licencia Ambiental <span className="text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      id="environmentalLicenseNumber"
                      value={environmentalLicenseNumber}
                      onChange={(event) => setEnvironmentalLicenseNumber(event.target.value)}
                    />
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

                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="requiresManualApproval"
                        checked={requiresManualApproval}
                        onCheckedChange={(checked) => setRequiresManualApproval(checked === true)}
                      />
                      <Label htmlFor="requiresManualApproval" className="font-normal">
                        Requiere aprobación manual
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="allowsMixedWaste"
                        checked={allowsMixedWaste}
                        onCheckedChange={(checked) => setAllowsMixedWaste(checked === true)}
                      />
                      <Label htmlFor="allowsMixedWaste" className="font-normal">
                        Permite mezcla de residuos
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="requiresWeightValidation"
                        checked={requiresWeightValidation}
                        onCheckedChange={(checked) => setRequiresWeightValidation(checked === true)}
                      />
                      <Label htmlFor="requiresWeightValidation" className="font-normal">
                        Requiere validación de peso
                      </Label>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor="observations">
                      Observaciones <span className="text-muted-foreground">(opcional)</span>
                    </Label>
                    <textarea
                      id="observations"
                      className="min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      value={observations}
                      onChange={(event) => setObservations(event.target.value)}
                    />
                  </div>

                  <InfoField label="Fecha de Creación">{formatDate(branchTreatment.created_at)}</InfoField>
                  <InfoField label="Creado Por">{branchTreatment.created_by?.username ?? '—'}</InfoField>

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

                  <div className="flex justify-end sm:col-span-2">
                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? 'Guardando…' : 'Guardar cambios'}
                    </Button>
                  </div>
                </form>
              </div>
            </TabsContent>

            <TabsContent value="corrientes" className="flex flex-col gap-4 pt-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    Corrientes Y/A Permitidas{' '}
                    <span className="font-normal text-muted-foreground">({selectedWasteStreamIds.length})</span>
                  </h3>
                  <Button size="sm" disabled={isSavingWasteStreams} onClick={handleSaveWasteStreams}>
                    {isSavingWasteStreams ? 'Guardando…' : 'Guardar Corrientes'}
                  </Button>
                </div>
                {wasteStreamsError && (
                  <p className="text-sm text-destructive" role="alert">
                    {wasteStreamsError}
                  </p>
                )}
                {wasteStreamsSaveMessage && (
                  <p className="text-sm text-muted-foreground" role="status">
                    {wasteStreamsSaveMessage}
                  </p>
                )}
                {wasteStreamsLoading && !wasteStreamsLoaded ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    Cargando…
                  </p>
                ) : (
                  <div className="max-h-96 overflow-y-auto overflow-x-hidden rounded-xl ring-1 ring-foreground/10">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10" />
                          <TableHead>Código</TableHead>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Tipo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {wasteStreams.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              No hay corrientes activas en el catálogo.
                            </TableCell>
                          </TableRow>
                        )}
                        {wasteStreams.map((wasteStream) => (
                          <TableRow key={wasteStream.id}>
                            <TableCell>
                              <Checkbox
                                aria-label={`${wasteStream.code} - ${wasteStream.name}`}
                                checked={selectedWasteStreamIds.includes(wasteStream.id)}
                                onCheckedChange={() => toggleWasteStream(wasteStream.id)}
                              />
                            </TableCell>
                            <TableCell className="text-muted-foreground">{wasteStream.code}</TableCell>
                            <TableCell>{wasteStream.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{wasteStream.tipo}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    Códigos UN Permitidos{' '}
                    <span className="font-normal text-muted-foreground">({selectedUnCodeIds.length})</span>
                  </h3>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowUnCodes((current) => !current)}>
                    {showUnCodes ? 'Ocultar' : 'Mostrar'}
                  </Button>
                </div>
                {showUnCodes && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-end">
                      <Button size="sm" disabled={isSavingUnCodes} onClick={handleSaveUnCodes}>
                        {isSavingUnCodes ? 'Guardando…' : 'Guardar Códigos UN'}
                      </Button>
                    </div>
                    {unCodesError && (
                      <p className="text-sm text-destructive" role="alert">
                        {unCodesError}
                      </p>
                    )}
                    {unCodesSaveMessage && (
                      <p className="text-sm text-muted-foreground" role="status">
                        {unCodesSaveMessage}
                      </p>
                    )}
                    {unCodesLoading && !unCodesLoaded ? (
                      <p className="text-sm text-muted-foreground" role="status">
                        Cargando…
                      </p>
                    ) : (
                      <div className="max-h-96 overflow-y-auto overflow-x-hidden rounded-xl ring-1 ring-foreground/10">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10" />
                              <TableHead>Código</TableHead>
                              <TableHead>Nombre</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {unCodes.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground">
                                  No hay códigos UN activos en el catálogo.
                                </TableCell>
                              </TableRow>
                            )}
                            {unCodes.map((unCode) => (
                              <TableRow key={unCode.id}>
                                <TableCell>
                                  <Checkbox
                                    aria-label={`${unCode.code} - ${unCode.name}`}
                                    checked={selectedUnCodeIds.includes(unCode.id)}
                                    onCheckedChange={() => toggleUnCode(unCode.id)}
                                  />
                                </TableCell>
                                <TableCell className="text-muted-foreground">{unCode.code}</TableCell>
                                <TableCell>{unCode.name}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
