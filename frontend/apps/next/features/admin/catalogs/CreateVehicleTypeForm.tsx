'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ProvisionalDataNotice } from '@/components/catalog/ProvisionalDataNotice'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiValidationError, createVehicleType } from 'app/features/admin/api'
import { createVehicleTypeSchema } from 'app/features/admin/schemas'
import { useRequireAuth } from 'app/provider/auth'

type FieldErrors = Partial<Record<'code' | 'name' | 'category', string>>

// Formulario de creación de un Tipo de Vehículo (Batch 3/3, último) -- mismo
// patrón EXACTO que CreateBranchTypeForm.tsx, pero SIN los 4 checkboxes de
// capacidad -- `category` es texto libre OPCIONAL (a diferencia de
// AdminBranchType.category, que es obligatorio). ProvisionalDataNotice
// visible (ver AVISO en VehicleTypeSeeder.php).
export function CreateVehicleTypeForm() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('vehicle_types.manage')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = createVehicleTypeSchema.safeParse({ code, name, category })

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
      const { vehicle_type: created } = await createVehicleType({
        code: parsed.data.code,
        name: parsed.data.name,
        category: parsed.data.category || undefined,
      })
      router.push(`/admin/catalogs/vehicle-types/${created.id}`)
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
        <CardTitle className="text-xl">Crear Tipo de Vehículo</CardTitle>
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
              <Label htmlFor="category">
                Categoría <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                aria-invalid={Boolean(fieldErrors.category)}
              />
              {fieldErrors.category && (
                <p className="text-xs text-destructive" role="alert">
                  {fieldErrors.category}
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
            <Button type="button" variant="outline" onClick={() => router.push('/admin/catalogs/vehicle-types')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Tipo de Vehículo'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
