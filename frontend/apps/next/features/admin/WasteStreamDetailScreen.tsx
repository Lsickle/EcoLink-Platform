'use client'

import { useEffect, useState } from 'react'
import { Recycle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ApiValidationError,
  activateWasteStream,
  deactivateWasteStream,
  fetchWasteStream,
  updateWasteStream,
  type AdminWasteStreamDetail,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'

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

// Detalle de una corriente Y/A (plan aprobado, primer módulo real del
// dominio Residuos): Información General editable inline (mismo patrón "sin
// modo edición separado" ya usado en RoleDetailScreen.tsx/UserDetailScreen.tsx)
// + auditoría (creado/actualizado por, fechas). Campos reales ÚNICAMENTE
// (sin peligrosidad/estado físico -- fuera de alcance, ver plan). `tipo` es
// INMUTABLE tras crear (solo se ve, nunca se edita aquí); `code` solo es
// editable si is_system=false (el backend rechaza el cambio con 422 en caso
// contrario, la UI deshabilita el campo para no depender de ese 422).
export function WasteStreamDetailScreen({ wasteStreamId }: { wasteStreamId: number | string }) {
  const { isAuthorized } = useRequireAuth('waste_streams.read')
  const [wasteStream, setWasteStream] = useState<AdminWasteStreamDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editRequiresManifest, setEditRequiresManifest] = useState(true)
  const [editRequiresSpecialTransport, setEditRequiresSpecialTransport] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const canEditCode = wasteStream ? !wasteStream.is_system : false

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchWasteStream(wasteStreamId)
      .then((result) => {
        if (cancelled) return
        setWasteStream(result.waste_stream)
        setEditCode(result.waste_stream.code)
        setEditName(result.waste_stream.name)
        setEditDescription(result.waste_stream.description ?? '')
        setEditRequiresManifest(result.waste_stream.requires_manifest)
        setEditRequiresSpecialTransport(result.waste_stream.requires_special_transport)
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
  }, [isAuthorized, wasteStreamId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!wasteStream) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { waste_stream: updated } = await updateWasteStream(wasteStream.id, {
        code: canEditCode ? editCode : undefined,
        name: editName,
        description: editDescription || null,
        requires_manifest: editRequiresManifest,
        requires_special_transport: editRequiresSpecialTransport,
      })
      setWasteStream((current) => (current ? { ...current, ...updated } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!wasteStream) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { waste_stream: updated } = wasteStream.is_active
        ? await deactivateWasteStream(wasteStream.id)
        : await activateWasteStream(wasteStream.id)
      setWasteStream((current) => (current ? { ...current, ...updated } : current))
    } catch (error) {
      setToggleError(errorMessage(error, 'waste_stream'))
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

  if (loadError || !wasteStream) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró la corriente.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Recycle className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{wasteStream.name}</CardTitle>
                <Badge variant="outline">{wasteStream.tipo}</Badge>
                <Badge variant={wasteStream.is_system ? 'secondary' : 'outline'}>
                  {wasteStream.is_system ? 'Sistema' : 'Personalizado'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{wasteStream.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={wasteStream.is_active ? 'default' : 'secondary'}>
              {wasteStream.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
              {wasteStream.is_active ? 'Inactivar' : 'Activar'}
            </Button>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Información General</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editCode">Código</Label>
              <Input
                id="editCode"
                value={editCode}
                disabled={!canEditCode}
                onChange={(event) => setEditCode(event.target.value)}
              />
              {!canEditCode && (
                <p className="text-xs text-muted-foreground">
                  No se puede modificar el código de una corriente de sistema.
                </p>
              )}
            </div>
            <InfoField label="Tipo (Y/A)">
              <Badge variant="outline">{wasteStream.tipo}</Badge>
              <p className="mt-1 text-xs text-muted-foreground">
                No se puede modificar una vez creada la corriente.
              </p>
            </InfoField>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="editName">Nombre</Label>
              <textarea
                id="editName"
                className="min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
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

            <div className="flex items-center gap-2">
              <Checkbox
                id="editRequiresManifest"
                checked={editRequiresManifest}
                onCheckedChange={(checked) => setEditRequiresManifest(checked === true)}
              />
              <Label htmlFor="editRequiresManifest" className="font-normal">
                Requiere manifiesto
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

            <InfoField label="Fecha de Creación">{formatDate(wasteStream.created_at)}</InfoField>
            <InfoField label="Creado Por">{wasteStream.created_by?.username ?? '—'}</InfoField>
            <InfoField label="Última Actualización">{formatDate(wasteStream.updated_at)}</InfoField>
            <InfoField label="Actualizado Por">{wasteStream.updated_by?.username ?? '—'}</InfoField>

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
        </CardContent>
      </Card>
    </div>
  )
}
