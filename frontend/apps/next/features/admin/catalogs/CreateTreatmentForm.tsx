'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ApiValidationError,
  createTreatment,
  type TreatmentRiskLevel,
  type TreatmentType,
} from 'app/features/admin/api'
import { createTreatmentSchema } from 'app/features/admin/schemas'
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>
}

type FieldErrors = Partial<
  Record<'code' | 'name' | 'treatmentType' | 'riskLevel' | 'temperatureUnit' | 'maxTemperature', string>
>

// Formulario de creación del catálogo GLOBAL "Tratamientos" (RN-063/D-R02) --
// EXCLUSIVO de platform staff (`useRequireAuth('treatments.create', {
// requirePlatformStaff: true })`, mismo criterio combinado permiso+gate ya
// usado en InvitationRequestsListScreen.tsx). Sección "Temperatura"
// (min/max) colapsada por defecto -- solo tiene sentido para tratamientos
// térmicos, nunca obligatoria (ver docblock de TreatmentController).
export function CreateTreatmentForm() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('treatments.create', { requirePlatformStaff: true })

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [treatmentType, setTreatmentType] = useState<TreatmentType>('DISPOSAL')
  const [riskLevel, setRiskLevel] = useState<TreatmentRiskLevel>('MEDIUM')
  const [requiresEnvironmentalLicense, setRequiresEnvironmentalLicense] = useState(true)
  const [requiresSpecialTransport, setRequiresSpecialTransport] = useState(false)
  const [allowsRecovery, setAllowsRecovery] = useState(false)
  const [requiresCertificate, setRequiresCertificate] = useState(true)
  const [requiresWeightControl, setRequiresWeightControl] = useState(true)
  const [estimatedProcessingTimeHours, setEstimatedProcessingTimeHours] = useState('')

  const [showTemperature, setShowTemperature] = useState(false)
  const [minTemperature, setMinTemperature] = useState('')
  const [maxTemperature, setMaxTemperature] = useState('')
  const [temperatureUnit, setTemperatureUnit] = useState('C')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = createTreatmentSchema.safeParse({
      code,
      name,
      description,
      treatmentType,
      requiresEnvironmentalLicense,
      requiresSpecialTransport,
      allowsRecovery,
      requiresCertificate,
      requiresWeightControl,
      minTemperature: minTemperature ? Number(minTemperature) : undefined,
      maxTemperature: maxTemperature ? Number(maxTemperature) : undefined,
      temperatureUnit,
      riskLevel,
      estimatedProcessingTimeHours: estimatedProcessingTimeHours ? Number(estimatedProcessingTimeHours) : undefined,
    })

    if (!parsed.success) {
      const errors: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors
        errors[key] ??= issue.message
      }
      setFieldErrors(errors)
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      const { treatment: created } = await createTreatment({
        code: parsed.data.code,
        name: parsed.data.name,
        description: parsed.data.description || undefined,
        treatment_type: parsed.data.treatmentType,
        requires_environmental_license: parsed.data.requiresEnvironmentalLicense,
        requires_special_transport: parsed.data.requiresSpecialTransport,
        allows_recovery: parsed.data.allowsRecovery,
        requires_certificate: parsed.data.requiresCertificate,
        requires_weight_control: parsed.data.requiresWeightControl,
        min_temperature: parsed.data.minTemperature,
        max_temperature: parsed.data.maxTemperature,
        temperature_unit: parsed.data.temperatureUnit,
        risk_level: parsed.data.riskLevel,
        estimated_processing_time_hours: parsed.data.estimatedProcessingTimeHours,
      })
      router.push(`/admin/catalogs/treatments/${created.id}`)
    } catch (error) {
      if (error instanceof ApiValidationError) {
        setFormError(error.firstError('code') ?? error.firstError('name') ?? error.message)
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

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle className="text-xl">Crear Tratamiento</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <div className="flex flex-col gap-4">
            <SectionHeading>Identificación</SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="code">Código</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.code)}
                />
                {fieldErrors.code && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.code}
                  </p>
                )}
              </div>
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
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="treatmentType">Tipo de Tratamiento</Label>
                <Select
                  items={TREATMENT_TYPES.map((type) => ({ value: type, label: TREATMENT_TYPE_LABELS[type] }))}
                  value={treatmentType}
                  onValueChange={(value) => setTreatmentType(value as TreatmentType)}
                >
                  <SelectTrigger id="treatmentType">
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
                <Label htmlFor="riskLevel">Nivel de Riesgo</Label>
                <Select
                  items={TREATMENT_RISK_LEVELS.map((level) => ({ value: level, label: RISK_LEVEL_LABELS[level] }))}
                  value={riskLevel}
                  onValueChange={(value) => setRiskLevel(value as TreatmentRiskLevel)}
                >
                  <SelectTrigger id="riskLevel">
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
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">
                Descripción <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <textarea
                id="description"
                className="min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <SectionHeading>Configuración</SectionHeading>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresEnvironmentalLicense"
                  checked={requiresEnvironmentalLicense}
                  onCheckedChange={(checked) => setRequiresEnvironmentalLicense(checked === true)}
                />
                <Label htmlFor="requiresEnvironmentalLicense" className="font-normal">
                  Requiere licencia ambiental
                </Label>
              </div>
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
                  id="allowsRecovery"
                  checked={allowsRecovery}
                  onCheckedChange={(checked) => setAllowsRecovery(checked === true)}
                />
                <Label htmlFor="allowsRecovery" className="font-normal">
                  Permite aprovechamiento
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresCertificate"
                  checked={requiresCertificate}
                  onCheckedChange={(checked) => setRequiresCertificate(checked === true)}
                />
                <Label htmlFor="requiresCertificate" className="font-normal">
                  Requiere certificado de disposición
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="requiresWeightControl"
                  checked={requiresWeightControl}
                  onCheckedChange={(checked) => setRequiresWeightControl(checked === true)}
                />
                <Label htmlFor="requiresWeightControl" className="font-normal">
                  Requiere control de peso
                </Label>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 sm:w-64">
              <Label htmlFor="estimatedProcessingTimeHours">
                Tiempo Estimado de Proceso (horas) <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="estimatedProcessingTimeHours"
                type="number"
                min={0}
                value={estimatedProcessingTimeHours}
                onChange={(event) => setEstimatedProcessingTimeHours(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setShowTemperature((current) => !current)}>
              {showTemperature ? 'Ocultar campos de temperatura' : 'Mostrar campos de temperatura (solo térmicos)'}
            </Button>
            {showTemperature && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="minTemperature">Temperatura Mínima</Label>
                  <Input
                    id="minTemperature"
                    type="number"
                    value={minTemperature}
                    onChange={(event) => setMinTemperature(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="maxTemperature">Temperatura Máxima</Label>
                  <Input
                    id="maxTemperature"
                    type="number"
                    value={maxTemperature}
                    onChange={(event) => setMaxTemperature(event.target.value)}
                    aria-invalid={Boolean(fieldErrors.maxTemperature)}
                  />
                  {fieldErrors.maxTemperature && (
                    <p className="text-xs text-destructive" role="alert">
                      {fieldErrors.maxTemperature}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="temperatureUnit">Unidad</Label>
                  <Input
                    id="temperatureUnit"
                    value={temperatureUnit}
                    onChange={(event) => setTemperatureUnit(event.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/catalogs/treatments')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Tratamiento'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
