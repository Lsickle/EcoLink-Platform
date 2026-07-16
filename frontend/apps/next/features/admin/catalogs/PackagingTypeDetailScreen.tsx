'use client'

import { useEffect, useState } from 'react'
import { PackageIcon } from 'lucide-react'
import { CatalogSidebarSection } from '@/components/catalog/CatalogSidebarSection'
import { CatalogSidebarStat } from '@/components/catalog/CatalogSidebarStat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ApiValidationError,
  activatePackagingType,
  deactivatePackagingType,
  fetchPackagingType,
  updatePackagingType,
  type AdminPackagingType,
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

// Detalle de un Tipo de Embalaje (Batch 3/3, último -- ver
// PackagingTypeController): mismo patrón EXACTO que
// PhysicalStateDetailScreen.tsx (edición inline sin modo separado, solo
// code/name). Datos REALES confirmados -- sin ProvisionalDataNotice.
export function PackagingTypeDetailScreen({ packagingTypeId }: { packagingTypeId: number | string }) {
  const { isAuthorized } = useRequireAuth('packaging_types.read')
  const [packagingType, setPackagingType] = useState<AdminPackagingType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchPackagingType(packagingTypeId)
      .then((result) => {
        if (cancelled) return
        setPackagingType(result.packaging_type)
        setEditCode(result.packaging_type.code)
        setEditName(result.packaging_type.name)
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
  }, [isAuthorized, packagingTypeId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!packagingType) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { packaging_type: updated } = await updatePackagingType(packagingType.id, {
        code: editCode,
        name: editName,
      })
      setPackagingType((current) => (current ? { ...current, ...updated } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!packagingType) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { packaging_type: updated } = packagingType.is_active
        ? await deactivatePackagingType(packagingType.id)
        : await activatePackagingType(packagingType.id)
      setPackagingType((current) => (current ? { ...current, ...updated } : current))
    } catch (error) {
      setToggleError(errorMessage(error, 'packaging_type'))
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

  if (loadError || !packagingType) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el tipo de embalaje.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <PackageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-xl">{packagingType.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{packagingType.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={packagingType.is_active ? 'default' : 'secondary'}>
              {packagingType.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
              {packagingType.is_active ? 'Inactivar' : 'Activar'}
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Información General</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editCode">Código</Label>
                <Input id="editCode" value={editCode} onChange={(event) => setEditCode(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editName">Nombre</Label>
                <Input id="editName" value={editName} onChange={(event) => setEditName(event.target.value)} />
              </div>

              <InfoField label="Fecha de Creación">{formatDate(packagingType.created_at)}</InfoField>
              <InfoField label="Última Actualización">{formatDate(packagingType.updated_at)}</InfoField>

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

        <div className="flex flex-col gap-4">
          <CatalogSidebarSection title="Detalle" colorVariant="blue" icon={<PackageIcon className="size-4" />}>
            <CatalogSidebarStat label="Estado" value={packagingType.is_active ? 'Activo' : 'Inactivo'} withDivider={false} />
          </CatalogSidebarSection>
        </div>
      </div>
    </div>
  )
}
