'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { CatalogSidebarSection } from '@/components/catalog/CatalogSidebarSection'
import { CatalogSidebarStat } from '@/components/catalog/CatalogSidebarStat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ApiValidationError,
  activateBranchType,
  deactivateBranchType,
  fetchBranchType,
  updateBranchType,
  type AdminBranchType,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'
import { CapabilityBadges } from './BranchTypesListScreen'

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

// Detalle de un Tipo de Sede (Batch 1/3, backend cerrado -- ver
// BranchTypeController): mismo patrón "edición inline sin modo separado"
// que WasteStreamDetailScreen.tsx, con el layout de sidebar del patrón
// "Catálogos Maestros" (CatalogSidebarSection con los 4 badges de
// capacidad, reutilizando CapabilityBadges de BranchTypesListScreen.tsx
// para no duplicar la lógica de qué badges mostrar). La vista se gatea por
// `branch_types.read` (ver BranchTypePolicy::view()) -- el guardado/toggle
// exige `branch_types.manage` en el backend, la UI no repite el gate en
// esos botones (mismo criterio que WasteStreamDetailScreen.tsx, el 403 del
// backend se muestra tal cual si el actor solo tiene `.read`).
export function BranchTypeDetailScreen({ branchTypeId }: { branchTypeId: number | string }) {
  const { isAuthorized } = useRequireAuth('branch_types.read')
  const [branchType, setBranchType] = useState<AdminBranchType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editIsLogistics, setEditIsLogistics] = useState(false)
  const [editIsStorage, setEditIsStorage] = useState(false)
  const [editIsTreatment, setEditIsTreatment] = useState(false)
  const [editIsDispatch, setEditIsDispatch] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchBranchType(branchTypeId)
      .then((result) => {
        if (cancelled) return
        setBranchType(result.branch_type)
        setEditCode(result.branch_type.code)
        setEditName(result.branch_type.name)
        setEditCategory(result.branch_type.category)
        setEditIsLogistics(result.branch_type.is_logistics)
        setEditIsStorage(result.branch_type.is_storage)
        setEditIsTreatment(result.branch_type.is_treatment)
        setEditIsDispatch(result.branch_type.is_dispatch)
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
  }, [isAuthorized, branchTypeId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!branchType) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { branch_type: updated } = await updateBranchType(branchType.id, {
        code: editCode,
        name: editName,
        category: editCategory,
        is_logistics: editIsLogistics,
        is_storage: editIsStorage,
        is_treatment: editIsTreatment,
        is_dispatch: editIsDispatch,
      })
      setBranchType((current) => (current ? { ...current, ...updated } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!branchType) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { branch_type: updated } = branchType.is_active
        ? await deactivateBranchType(branchType.id)
        : await activateBranchType(branchType.id)
      setBranchType((current) => (current ? { ...current, ...updated } : current))
    } catch (error) {
      setToggleError(errorMessage(error, 'branch_type'))
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

  if (loadError || !branchType) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el tipo de sede.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Building2 className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{branchType.name}</CardTitle>
                <Badge variant="outline">{branchType.category}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{branchType.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={branchType.is_active ? 'default' : 'secondary'}>
              {branchType.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
              {branchType.is_active ? 'Inactivar' : 'Activar'}
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
                <Label htmlFor="editCategory">Categoría</Label>
                <Input id="editCategory" value={editCategory} onChange={(event) => setEditCategory(event.target.value)} />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="editName">Nombre</Label>
                <Input id="editName" value={editName} onChange={(event) => setEditName(event.target.value)} />
              </div>

              <div className="flex flex-col gap-2 sm:col-span-2">
                <span className="text-sm font-medium">Capacidades</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="editIsLogistics"
                      checked={editIsLogistics}
                      onCheckedChange={(checked) => setEditIsLogistics(checked === true)}
                    />
                    <Label htmlFor="editIsLogistics" className="font-normal">
                      Logística
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="editIsStorage"
                      checked={editIsStorage}
                      onCheckedChange={(checked) => setEditIsStorage(checked === true)}
                    />
                    <Label htmlFor="editIsStorage" className="font-normal">
                      Almacenamiento
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="editIsTreatment"
                      checked={editIsTreatment}
                      onCheckedChange={(checked) => setEditIsTreatment(checked === true)}
                    />
                    <Label htmlFor="editIsTreatment" className="font-normal">
                      Tratamiento
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="editIsDispatch"
                      checked={editIsDispatch}
                      onCheckedChange={(checked) => setEditIsDispatch(checked === true)}
                    />
                    <Label htmlFor="editIsDispatch" className="font-normal">
                      Despacho
                    </Label>
                  </div>
                </div>
              </div>

              <InfoField label="Fecha de Creación">{formatDate(branchType.created_at)}</InfoField>
              <InfoField label="Última Actualización">{formatDate(branchType.updated_at)}</InfoField>

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
          <CatalogSidebarSection title="Capacidades" colorVariant="purple" icon={<Building2 className="size-4" />}>
            <CapabilityBadges branchType={branchType} />
          </CatalogSidebarSection>

          <CatalogSidebarSection title="Detalle">
            <CatalogSidebarStat label="Orden" value={branchType.sort_order} />
            <CatalogSidebarStat label="Estado" value={branchType.is_active ? 'Activo' : 'Inactivo'} withDivider={false} />
          </CatalogSidebarSection>
        </div>
      </div>
    </div>
  )
}
