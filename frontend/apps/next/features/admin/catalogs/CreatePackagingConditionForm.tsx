'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProvisionalDataNotice } from '@/components/catalog/ProvisionalDataNotice'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiValidationError, createPackagingCondition } from 'app/features/admin/api'
import { HAZARD_RISK_LEVEL_LABELS, hazardRiskLevel } from 'app/features/admin/hazardRiskLevel'
import { createPackagingConditionSchema } from 'app/features/admin/schemas'
import { useRequireAuth } from 'app/provider/auth'

type FieldErrors = Partial<Record<'code' | 'name' | 'riskLevel', string>>

// Formulario de creación de un Estado del Embalaje (Batch 3/3, último) --
// mismo patrón EXACTO que CreateHazardCharacteristicForm.tsx, con
// `riskLevel` OPCIONAL (a diferencia de ese formulario, aquí el backend
// valida `nullable`) y ProvisionalDataNotice visible (ver AVISO en
// PackagingConditionSeeder.php).
export function CreatePackagingConditionForm() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('packaging_conditions.manage')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [riskLevel, setRiskLevel] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = createPackagingConditionSchema.safeParse({
      code,
      name,
      riskLevel: riskLevel === '' ? undefined : Number(riskLevel),
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
      const { packaging_condition: created } = await createPackagingCondition({
        code: parsed.data.code,
        name: parsed.data.name,
        risk_level: parsed.data.riskLevel,
      })
      router.push(`/admin/catalogs/packaging-conditions/${created.id}`)
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
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-xl">Crear Estado del Embalaje</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ProvisionalDataNotice />
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
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
              <Label htmlFor="riskLevel">Nivel de Riesgo (1-9, opcional)</Label>
              <Input
                id="riskLevel"
                type="number"
                min={1}
                max={9}
                value={riskLevel}
                onChange={(event) => setRiskLevel(event.target.value)}
                aria-invalid={Boolean(fieldErrors.riskLevel)}
              />
              <span className="text-xs text-muted-foreground">
                {riskLevel === ''
                  ? 'Sin definir'
                  : `Equivale a "${HAZARD_RISK_LEVEL_LABELS[hazardRiskLevel(Number(riskLevel))]}"`}
              </span>
              {fieldErrors.riskLevel && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.riskLevel}
                </p>
              )}
            </div>
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

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/catalogs/packaging-conditions')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Estado'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
