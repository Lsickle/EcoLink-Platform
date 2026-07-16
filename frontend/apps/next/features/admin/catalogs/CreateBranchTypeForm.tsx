'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiValidationError, createBranchType } from 'app/features/admin/api'
import { createBranchTypeSchema } from 'app/features/admin/schemas'
import { useRequireAuth } from 'app/provider/auth'

type FieldErrors = Partial<Record<'code' | 'name' | 'category', string>>

// Formulario de creación de un Tipo de Sede -- mismo patrón EXACTO que
// CreateWasteStreamForm.tsx (catálogo simple, sin wizard de varios pasos).
// Gateado por `branch_types.manage` (ver BranchTypePolicy::create()), NO
// `.read` -- a diferencia de CreateWasteStreamForm.tsx, que gatea por
// `waste_streams.read` (looseness pre-existente de esa pantalla, el backend
// igual exige `.manage` en el submit). Aquí se gatea con el permiso real
// desde el inicio para no depender de un 403 tardío.
export function CreateBranchTypeForm() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('branch_types.manage')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [isLogistics, setIsLogistics] = useState(false)
  const [isStorage, setIsStorage] = useState(false)
  const [isTreatment, setIsTreatment] = useState(false)
  const [isDispatch, setIsDispatch] = useState(false)

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = createBranchTypeSchema.safeParse({
      code,
      name,
      category,
      isLogistics,
      isStorage,
      isTreatment,
      isDispatch,
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
      const { branch_type: created } = await createBranchType({
        code: parsed.data.code,
        name: parsed.data.name,
        category: parsed.data.category,
        is_logistics: parsed.data.isLogistics,
        is_storage: parsed.data.isStorage,
        is_treatment: parsed.data.isTreatment,
        is_dispatch: parsed.data.isDispatch,
      })
      router.push(`/admin/catalogs/branch-types/${created.id}`)
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
        <CardTitle className="text-xl">Crear Tipo de Sede</CardTitle>
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
              <Label htmlFor="category">Categoría</Label>
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

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Capacidades</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Checkbox id="isLogistics" checked={isLogistics} onCheckedChange={(checked) => setIsLogistics(checked === true)} />
                <Label htmlFor="isLogistics" className="font-normal">
                  Logística
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="isStorage" checked={isStorage} onCheckedChange={(checked) => setIsStorage(checked === true)} />
                <Label htmlFor="isStorage" className="font-normal">
                  Almacenamiento
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="isTreatment" checked={isTreatment} onCheckedChange={(checked) => setIsTreatment(checked === true)} />
                <Label htmlFor="isTreatment" className="font-normal">
                  Tratamiento
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="isDispatch" checked={isDispatch} onCheckedChange={(checked) => setIsDispatch(checked === true)} />
                <Label htmlFor="isDispatch" className="font-normal">
                  Despacho
                </Label>
              </div>
            </div>
          </div>

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/catalogs/branch-types')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Tipo de Sede'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
