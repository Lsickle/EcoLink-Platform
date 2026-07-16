'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiValidationError, createHazardCharacteristic } from 'app/features/admin/api'
import { HAZARD_RISK_LEVEL_LABELS, hazardRiskLevel } from 'app/features/admin/hazardRiskLevel'
import { createHazardCharacteristicSchema } from 'app/features/admin/schemas'
import { useRequireAuth } from 'app/provider/auth'

type FieldErrors = Partial<Record<'code' | 'name' | 'riskLevel', string>>

// Formulario de creación de una Característica de Peligrosidad (Batch 2/3
// RESPEL) -- mismo patrón EXACTO que CreateBranchTypeForm.tsx (catálogo
// simple, sin wizard). `riskLevel` se pide como número 1-9 (contrato real
// del backend) pero siempre muestra la etiqueta cualitativa derivada al lado
// para que el admin confirme visualmente el nivel que está creando.
export function CreateHazardCharacteristicForm() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('hazard_characteristics.manage')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [riskLevel, setRiskLevel] = useState(1)
  const [description, setDescription] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = createHazardCharacteristicSchema.safeParse({
      code,
      name,
      riskLevel,
      description,
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
      const { hazard_characteristic: created } = await createHazardCharacteristic({
        code: parsed.data.code,
        name: parsed.data.name,
        risk_level: parsed.data.riskLevel,
        description: parsed.data.description || undefined,
      })
      router.push(`/admin/catalogs/hazard-characteristics/${created.id}`)
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
        <CardTitle className="text-xl">Crear Característica</CardTitle>
      </CardHeader>
      <CardContent>
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
              <Label htmlFor="riskLevel">Nivel de Riesgo (1-9)</Label>
              <Input
                id="riskLevel"
                type="number"
                min={1}
                max={9}
                value={riskLevel}
                onChange={(event) => setRiskLevel(Number(event.target.value))}
                aria-invalid={Boolean(fieldErrors.riskLevel)}
              />
              <span className="text-xs text-muted-foreground">
                Equivale a &quot;{HAZARD_RISK_LEVEL_LABELS[hazardRiskLevel(riskLevel)]}&quot;
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

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/catalogs/hazard-characteristics')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Característica'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
