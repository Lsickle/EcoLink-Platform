'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiValidationError, createUnCode } from 'app/features/admin/api'
import { createUnCodeSchema } from 'app/features/admin/schemas'
import { useRequireAuth } from 'app/provider/auth'

type FieldErrors = Partial<Record<'code' | 'name', string>>

// Formulario de creación de un Código UN -- mismo patrón simple que
// CreateWasteStreamForm.tsx (sin wizard, la cantidad real de campos es
// mínima).
export function CreateUnCodeForm() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('un_codes.read')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [hazardClass, setHazardClass] = useState('')
  const [packingGroup, setPackingGroup] = useState('')

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = createUnCodeSchema.safeParse({ code, name, hazardClass, packingGroup })

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
      const { un_code: created } = await createUnCode({
        code: parsed.data.code,
        name: parsed.data.name,
        hazard_class: parsed.data.hazardClass || undefined,
        packing_group: parsed.data.packingGroup || undefined,
      })
      router.push(`/admin/un-codes/${created.id}`)
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
        <CardTitle className="text-xl">Crear Código UN</CardTitle>
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
              <Label htmlFor="hazardClass">
                Clase de Riesgo <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input id="hazardClass" value={hazardClass} onChange={(event) => setHazardClass(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="packingGroup">
                Grupo de Embalaje <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="packingGroup"
                value={packingGroup}
                onChange={(event) => setPackingGroup(event.target.value)}
              />
            </div>
          </div>

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/un-codes')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Código UN'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
