'use client'

import { useEffect, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { CatalogSidebarSection } from '@/components/catalog/CatalogSidebarSection'
import { CatalogSidebarStat } from '@/components/catalog/CatalogSidebarStat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ApiValidationError,
  activateTreatment,
  deactivateTreatment,
  fetchTreatment,
  updateTreatment,
  type AdminTreatmentDetail,
  type TreatmentRiskLevel,
  type TreatmentType,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { TREATMENT_RISK_LEVELS, TREATMENT_TYPES } from 'app/features/admin/types'
import { useRequireAuth } from 'app/provider/auth'

const TREATMENT_TYPE_LABELS: Record<TreatmentType, string> = {
  THERMAL: 'Térmico',
  PHYSICOCHEMICAL: 'Fisicoquímico',
  BIOLOGICAL: 'Biológico',
  STABILIZATION: 'Estabilización',
  DISPOSAL: 'Disposición Final',
  RECOVERY: 'Aprovechamiento',
  CHEMICAL: 'Químico',
  LIQUID: 'Líquido',
  SLUDGE: 'Lodos',
  PHYSICAL: 'Físico',
}

const RISK_LEVEL_LABELS: Record<TreatmentRiskLevel, string> = {
  LOW: 'Bajo',
  MEDIUM: 'Medio',
  HIGH: 'Alto',
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// Detalle del catálogo GLOBAL "Tratamientos" (RN-063/D-R02). Acceso a la
// pantalla vía `treatments.read` (disponible para cualquier actor con el
// permiso), pero la edición y Activar/Inactivar son EXCLUSIVAS de platform
// staff -- mismo criterio EXACTO que ContactDetailScreen.tsx (gate de
// edición de datos de Persona): para cualquier otro actor se renderiza una
// vista de solo lectura, sin formulario ni botones de escritura (el backend
// además rechaza con 403 vía `TreatmentPolicy`, esto es defensa en
// profundidad de UI).
export function TreatmentDetailScreen({ treatmentId }: { treatmentId: number | string }) {
  const { isAuthorized, user } = useRequireAuth('treatments.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [treatment, setTreatment] = useState<AdminTreatmentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editTreatmentType, setEditTreatmentType] = useState<TreatmentType>('DISPOSAL')
  const [editRiskLevel, setEditRiskLevel] = useState<TreatmentRiskLevel>('MEDIUM')
  const [editRequiresEnvironmentalLicense, setEditRequiresEnvironmentalLicense] = useState(true)
  const [editRequiresSpecialTransport, setEditRequiresSpecialTransport] = useState(false)
  const [editAllowsRecovery, setEditAllowsRecovery] = useState(false)
  const [editRequiresCertificate, setEditRequiresCertificate] = useState(true)
  const [editRequiresWeightControl, setEditRequiresWeightControl] = useState(true)
  const [editEstimatedProcessingTimeHours, setEditEstimatedProcessingTimeHours] = useState('')
  const [editMinTemperature, setEditMinTemperature] = useState('')
  const [editMaxTemperature, setEditMaxTemperature] = useState('')
  const [editTemperatureUnit, setEditTemperatureUnit] = useState('C')

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchTreatment(treatmentId)
      .then((result) => {
        if (cancelled) return
        const t = result.treatment
        setTreatment(t)
        setEditCode(t.code)
        setEditName(t.name)
        setEditDescription(t.description ?? '')
        setEditTreatmentType(t.treatment_type)
        setEditRiskLevel(t.risk_level)
        setEditRequiresEnvironmentalLicense(t.requires_environmental_license)
        setEditRequiresSpecialTransport(t.requires_special_transport)
        setEditAllowsRecovery(t.allows_recovery)
        setEditRequiresCertificate(t.requires_certificate)
        setEditRequiresWeightControl(t.requires_weight_control)
        setEditEstimatedProcessingTimeHours(
          t.estimated_processing_time_hours != null ? String(t.estimated_processing_time_hours) : ''
        )
        setEditMinTemperature(t.min_temperature != null ? String(t.min_temperature) : '')
        setEditMaxTemperature(t.max_temperature != null ? String(t.max_temperature) : '')
        setEditTemperatureUnit(t.temperature_unit)
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
  }, [isAuthorized, treatmentId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!treatment) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { treatment: updated } = await updateTreatment(treatment.id, {
        code: editCode,
        name: editName,
        description: editDescription || undefined,
        treatment_type: editTreatmentType,
        risk_level: editRiskLevel,
        requires_environmental_license: editRequiresEnvironmentalLicense,
        requires_special_transport: editRequiresSpecialTransport,
        allows_recovery: editAllowsRecovery,
        requires_certificate: editRequiresCertificate,
        requires_weight_control: editRequiresWeightControl,
        estimated_processing_time_hours: editEstimatedProcessingTimeHours
          ? Number(editEstimatedProcessingTimeHours)
          : undefined,
        min_temperature: editMinTemperature ? Number(editMinTemperature) : undefined,
        max_temperature: editMaxTemperature ? Number(editMaxTemperature) : undefined,
        temperature_unit: editTemperatureUnit,
      })
      setTreatment((current) => (current ? { ...current, ...updated } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!treatment) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { treatment: updated } = treatment.is_active
        ? await deactivateTreatment(treatment.id)
        : await activateTreatment(treatment.id)
      setTreatment((current) => (current ? { ...current, ...updated } : current))
    } catch (error) {
      setToggleError(errorMessage(error, 'treatment'))
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

  if (loadError || !treatment) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el tratamiento.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <FlaskConical className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{treatment.name}</CardTitle>
                <Badge variant="outline">{TREATMENT_TYPE_LABELS[treatment.treatment_type]}</Badge>
                <Badge variant={treatment.is_system ? 'secondary' : 'outline'}>
                  {treatment.is_system ? 'Sistema' : 'Personalizado'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{treatment.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={treatment.is_active ? 'default' : 'secondary'}>
              {treatment.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            {isPlatformStaff && (
              <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
                {treatment.is_active ? 'Inactivar' : 'Activar'}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Información General</CardTitle>
          </CardHeader>
          <CardContent>
            {isPlatformStaff ? (
              <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editCode">Código</Label>
                  <Input id="editCode" value={editCode} onChange={(event) => setEditCode(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editName">Nombre</Label>
                  <Input id="editName" value={editName} onChange={(event) => setEditName(event.target.value)} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editTreatmentType">Tipo de Tratamiento</Label>
                  <Select
                    items={TREATMENT_TYPES.map((type) => ({ value: type, label: TREATMENT_TYPE_LABELS[type] }))}
                    value={editTreatmentType}
                    onValueChange={(value) => setEditTreatmentType(value as TreatmentType)}
                  >
                    <SelectTrigger id="editTreatmentType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TREATMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {TREATMENT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editRiskLevel">Nivel de Riesgo</Label>
                  <Select
                    items={TREATMENT_RISK_LEVELS.map((level) => ({ value: level, label: RISK_LEVEL_LABELS[level] }))}
                    value={editRiskLevel}
                    onValueChange={(value) => setEditRiskLevel(value as TreatmentRiskLevel)}
                  >
                    <SelectTrigger id="editRiskLevel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TREATMENT_RISK_LEVELS.map((level) => (
                        <SelectItem key={level} value={level}>
                          {RISK_LEVEL_LABELS[level]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="editDescription">
                    Descripción <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <textarea
                    id="editDescription"
                    className="min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="editRequiresEnvironmentalLicense"
                      checked={editRequiresEnvironmentalLicense}
                      onCheckedChange={(checked) => setEditRequiresEnvironmentalLicense(checked === true)}
                    />
                    <Label htmlFor="editRequiresEnvironmentalLicense" className="font-normal">
                      Requiere licencia ambiental
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="editRequiresSpecialTransport"
                      checked={editRequiresSpecialTransport}
                      onCheckedChange={(checked) => setEditRequiresSpecialTransport(checked === true)}
                    />
                    <Label htmlFor="editRequiresSpecialTransport" className="font-normal">
                      Requiere transporte especial
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="editAllowsRecovery"
                      checked={editAllowsRecovery}
                      onCheckedChange={(checked) => setEditAllowsRecovery(checked === true)}
                    />
                    <Label htmlFor="editAllowsRecovery" className="font-normal">
                      Permite aprovechamiento
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="editRequiresCertificate"
                      checked={editRequiresCertificate}
                      onCheckedChange={(checked) => setEditRequiresCertificate(checked === true)}
                    />
                    <Label htmlFor="editRequiresCertificate" className="font-normal">
                      Requiere certificado de disposición
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="editRequiresWeightControl"
                      checked={editRequiresWeightControl}
                      onCheckedChange={(checked) => setEditRequiresWeightControl(checked === true)}
                    />
                    <Label htmlFor="editRequiresWeightControl" className="font-normal">
                      Requiere control de peso
                    </Label>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editEstimatedProcessingTimeHours">
                    Tiempo Estimado de Proceso (horas) <span className="text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="editEstimatedProcessingTimeHours"
                    type="number"
                    min={0}
                    value={editEstimatedProcessingTimeHours}
                    onChange={(event) => setEditEstimatedProcessingTimeHours(event.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="editMinTemperature">
                      Temperatura Mínima <span className="text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      id="editMinTemperature"
                      type="number"
                      value={editMinTemperature}
                      onChange={(event) => setEditMinTemperature(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="editMaxTemperature">
                      Temperatura Máxima <span className="text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      id="editMaxTemperature"
                      type="number"
                      value={editMaxTemperature}
                      onChange={(event) => setEditMaxTemperature(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="editTemperatureUnit">Unidad</Label>
                    <Input
                      id="editTemperatureUnit"
                      value={editTemperatureUnit}
                      onChange={(event) => setEditTemperatureUnit(event.target.value)}
                    />
                  </div>
                </div>

                <InfoField label="Fecha de Creación">{formatDate(treatment.created_at)}</InfoField>
                <InfoField label="Creado Por">{treatment.created_by?.username ?? '—'}</InfoField>
                <InfoField label="Última Actualización">{formatDate(treatment.updated_at)}</InfoField>
                <InfoField label="Actualizado Por">{treatment.updated_by?.username ?? '—'}</InfoField>

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
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InfoField label="Código">{treatment.code}</InfoField>
                <InfoField label="Nombre">{treatment.name}</InfoField>
                <InfoField label="Tipo de Tratamiento">{TREATMENT_TYPE_LABELS[treatment.treatment_type]}</InfoField>
                <InfoField label="Nivel de Riesgo">{RISK_LEVEL_LABELS[treatment.risk_level]}</InfoField>
                <InfoField label="Descripción">{treatment.description ?? '—'}</InfoField>
                <InfoField label="Tiempo Estimado de Proceso">
                  {treatment.estimated_processing_time_hours != null
                    ? `${treatment.estimated_processing_time_hours} h`
                    : '—'}
                </InfoField>
                <InfoField label="Rango de Temperatura">
                  {treatment.min_temperature != null || treatment.max_temperature != null
                    ? `${treatment.min_temperature ?? '—'} a ${treatment.max_temperature ?? '—'} °${treatment.temperature_unit}`
                    : 'Sin registrar'}
                </InfoField>
                <InfoField label="Fecha de Creación">{formatDate(treatment.created_at)}</InfoField>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <CatalogSidebarSection title="Detalle" colorVariant="purple" icon={<FlaskConical className="size-4" />}>
            <CatalogSidebarStat label="Estado" value={treatment.is_active ? 'Activo' : 'Inactivo'} />
            <CatalogSidebarStat
              label="Licencia Ambiental"
              value={treatment.requires_environmental_license ? 'Requerida' : 'No requerida'}
            />
            <CatalogSidebarStat
              label="Transporte Especial"
              value={treatment.requires_special_transport ? 'Requerido' : 'No requerido'}
              withDivider={false}
            />
          </CatalogSidebarSection>
        </div>
      </div>
    </div>
  )
}
