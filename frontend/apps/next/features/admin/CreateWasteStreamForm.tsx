'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiValidationError, createWasteStream, type WasteStreamTipo } from 'app/features/admin/api'
import { createWasteStreamSchema } from 'app/features/admin/schemas'
import { useRequireAuth } from 'app/provider/auth'

type FieldErrors = Partial<Record<'code' | 'name' | 'tipo', string>>

const tipoOptions: { value: WasteStreamTipo; label: string }[] = [
  { value: 'Y', label: 'Y' },
  { value: 'A', label: 'A' },
]

// Formulario de creación de una Corriente Y/A (plan aprobado, catálogo
// simple -- no requiere el wizard de varios pasos de RoleWizard.tsx, la
// cantidad real de campos es mucho menor). `tipo` SOLO se pide aquí -- es
// inmutable tras crear, WasteStreamDetailScreen.tsx nunca lo edita.
export function CreateWasteStreamForm() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('waste_streams.read')

  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [tipo, setTipo] = useState<WasteStreamTipo>('Y')
  const [description, setDescription] = useState('')
  const [requiresManifest, setRequiresManifest] = useState(true)
  const [requiresSpecialTransport, setRequiresSpecialTransport] = useState(false)

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const parsed = createWasteStreamSchema.safeParse({
      code,
      name,
      tipo,
      description,
      requiresManifest,
      requiresSpecialTransport,
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
      const { waste_stream: created } = await createWasteStream({
        code: parsed.data.code,
        name: parsed.data.name,
        tipo: parsed.data.tipo,
        description: parsed.data.description || undefined,
        requires_manifest: parsed.data.requiresManifest,
        requires_special_transport: parsed.data.requiresSpecialTransport,
      })
      router.push(`/admin/waste-streams/${created.id}`)
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
        <CardTitle className="text-xl">Crear Corriente Y/A</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
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
              <Label htmlFor="tipo">Tipo (Y/A)</Label>
              <Select items={tipoOptions} value={tipo} onValueChange={(value) => setTipo(value as WasteStreamTipo)}>
                <SelectTrigger id="tipo" className="w-full sm:w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tipoOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">No se puede modificar después.</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nombre</Label>
            <textarea
              id="name"
              className="min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
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

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="requiresManifest"
                checked={requiresManifest}
                onCheckedChange={(checked) => setRequiresManifest(checked === true)}
              />
              <Label htmlFor="requiresManifest" className="font-normal">
                Requiere manifiesto
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
          </div>

          {formError && (
            <p className="text-sm text-destructive" role="alert" aria-live="polite">
              {formError}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/admin/waste-streams')}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando…' : 'Crear Corriente'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
