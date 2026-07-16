'use client'

import { useEffect, useState } from 'react'
import { Layers } from 'lucide-react'
import { CatalogSidebarSection } from '@/components/catalog/CatalogSidebarSection'
import { CatalogSidebarStat } from '@/components/catalog/CatalogSidebarStat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ApiValidationError,
  activateWasteCategory,
  deactivateWasteCategory,
  fetchWasteCategory,
  updateWasteCategory,
  type AdminWasteCategory,
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

// Detalle de una Categoría de Residuo (Batch 2/3 RESPEL, backend cerrado --
// ver WasteCategoryController): mismo patrón EXACTO que
// BranchTypeDetailScreen.tsx (edición inline sin modo separado), sin
// particularidades (catálogo simple, sin flags ni número derivado).
export function WasteCategoryDetailScreen({ wasteCategoryId }: { wasteCategoryId: number | string }) {
  const { isAuthorized } = useRequireAuth('waste_categories.read')
  const [wasteCategory, setWasteCategory] = useState<AdminWasteCategory | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchWasteCategory(wasteCategoryId)
      .then((result) => {
        if (cancelled) return
        setWasteCategory(result.waste_category)
        setEditCode(result.waste_category.code)
        setEditName(result.waste_category.name)
        setEditDescription(result.waste_category.description ?? '')
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
  }, [isAuthorized, wasteCategoryId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!wasteCategory) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { waste_category: updated } = await updateWasteCategory(wasteCategory.id, {
        code: editCode,
        name: editName,
        description: editDescription,
      })
      setWasteCategory((current) => (current ? { ...current, ...updated } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!wasteCategory) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { waste_category: updated } = wasteCategory.is_active
        ? await deactivateWasteCategory(wasteCategory.id)
        : await activateWasteCategory(wasteCategory.id)
      setWasteCategory((current) => (current ? { ...current, ...updated } : current))
    } catch (error) {
      setToggleError(errorMessage(error, 'waste_category'))
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

  if (loadError || !wasteCategory) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró la categoría de residuo.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Layers className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-xl">{wasteCategory.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{wasteCategory.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={wasteCategory.is_active ? 'default' : 'secondary'}>
              {wasteCategory.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
              {wasteCategory.is_active ? 'Inactivar' : 'Activar'}
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

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="editDescription">Descripción</Label>
                <textarea
                  id="editDescription"
                  className="min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                />
              </div>

              <InfoField label="Fecha de Creación">{formatDate(wasteCategory.created_at)}</InfoField>
              <InfoField label="Última Actualización">{formatDate(wasteCategory.updated_at)}</InfoField>

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
          <CatalogSidebarSection title="Detalle" colorVariant="orange" icon={<Layers className="size-4" />}>
            <CatalogSidebarStat label="Estado" value={wasteCategory.is_active ? 'Activo' : 'Inactivo'} withDivider={false} />
          </CatalogSidebarSection>
        </div>
      </div>
    </div>
  )
}
