'use client'

import { useEffect, useState } from 'react'
import { Truck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ApiValidationError,
  activateUnCode,
  deactivateUnCode,
  fetchUnCode,
  updateUnCode,
  type AdminUnCodeDetail,
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

// Detalle de un Código UN (catálogo independiente de Corrientes Y/A, plan
// aprobado -- ver UnCodeController). Mismo patrón EXACTO de edición inline +
// auditoría que WasteStreamDetailScreen.tsx. `code` solo es editable si
// is_system=false (mismo criterio que WasteStream).
export function UnCodeDetailScreen({ unCodeId }: { unCodeId: number | string }) {
  const { isAuthorized } = useRequireAuth('un_codes.read')
  const [unCode, setUnCode] = useState<AdminUnCodeDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editHazardClass, setEditHazardClass] = useState('')
  const [editPackingGroup, setEditPackingGroup] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const canEditCode = unCode ? !unCode.is_system : false

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchUnCode(unCodeId)
      .then((result) => {
        if (cancelled) return
        setUnCode(result.un_code)
        setEditCode(result.un_code.code)
        setEditName(result.un_code.name)
        setEditHazardClass(result.un_code.hazard_class ?? '')
        setEditPackingGroup(result.un_code.packing_group ?? '')
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
  }, [isAuthorized, unCodeId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!unCode) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { un_code: updated } = await updateUnCode(unCode.id, {
        code: canEditCode ? editCode : undefined,
        name: editName,
        hazard_class: editHazardClass || null,
        packing_group: editPackingGroup || null,
      })
      setUnCode((current) => (current ? { ...current, ...updated } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!unCode) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { un_code: updated } = unCode.is_active ? await deactivateUnCode(unCode.id) : await activateUnCode(unCode.id)
      setUnCode((current) => (current ? { ...current, ...updated } : current))
    } catch (error) {
      setToggleError(errorMessage(error, 'un_code'))
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

  if (loadError || !unCode) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el código UN.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Truck className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{unCode.name}</CardTitle>
                <Badge variant={unCode.is_system ? 'secondary' : 'outline'}>
                  {unCode.is_system ? 'Sistema' : 'Personalizado'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{unCode.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={unCode.is_active ? 'default' : 'secondary'}>
              {unCode.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
              {unCode.is_active ? 'Inactivar' : 'Activar'}
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
                  No se puede modificar el código de un código UN de sistema.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editName">Nombre</Label>
              <Input id="editName" value={editName} onChange={(event) => setEditName(event.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editHazardClass">
                Clase de Riesgo <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="editHazardClass"
                value={editHazardClass}
                onChange={(event) => setEditHazardClass(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editPackingGroup">
                Grupo de Embalaje <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="editPackingGroup"
                value={editPackingGroup}
                onChange={(event) => setEditPackingGroup(event.target.value)}
              />
            </div>

            <InfoField label="Fecha de Creación">{formatDate(unCode.created_at)}</InfoField>
            <InfoField label="Creado Por">{unCode.created_by?.username ?? '—'}</InfoField>
            <InfoField label="Última Actualización">{formatDate(unCode.updated_at)}</InfoField>
            <InfoField label="Actualizado Por">{unCode.updated_by?.username ?? '—'}</InfoField>

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
