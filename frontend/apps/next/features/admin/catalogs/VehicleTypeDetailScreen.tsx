'use client'

import { useEffect, useState } from 'react'
import { TruckIcon } from 'lucide-react'
import { CatalogSidebarSection } from '@/components/catalog/CatalogSidebarSection'
import { CatalogSidebarStat } from '@/components/catalog/CatalogSidebarStat'
import { ProvisionalDataNotice } from '@/components/catalog/ProvisionalDataNotice'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ApiValidationError,
  activateVehicleType,
  deactivateVehicleType,
  fetchVehicleType,
  updateVehicleType,
  type AdminVehicleType,
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

// Detalle de un Tipo de Vehículo (Batch 3/3, último -- ver
// VehicleTypeController): mismo patrón EXACTO que BranchTypeDetailScreen.tsx
// (edición inline sin modo separado), pero SIN los 4 checkboxes de
// capacidad -- `category` es texto libre opcional (ver AdminVehicleType en
// types.ts). AVISO -- PROVISIONAL (ver ProvisionalDataNotice).
export function VehicleTypeDetailScreen({ vehicleTypeId }: { vehicleTypeId: number | string }) {
  const { isAuthorized } = useRequireAuth('vehicle_types.read')
  const [vehicleType, setVehicleType] = useState<AdminVehicleType | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchVehicleType(vehicleTypeId)
      .then((result) => {
        if (cancelled) return
        setVehicleType(result.vehicle_type)
        setEditCode(result.vehicle_type.code)
        setEditName(result.vehicle_type.name)
        setEditCategory(result.vehicle_type.category ?? '')
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
  }, [isAuthorized, vehicleTypeId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!vehicleType) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { vehicle_type: updated } = await updateVehicleType(vehicleType.id, {
        code: editCode,
        name: editName,
        category: editCategory,
      })
      setVehicleType((current) => (current ? { ...current, ...updated } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!vehicleType) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { vehicle_type: updated } = vehicleType.is_active
        ? await deactivateVehicleType(vehicleType.id)
        : await activateVehicleType(vehicleType.id)
      setVehicleType((current) => (current ? { ...current, ...updated } : current))
    } catch (error) {
      setToggleError(errorMessage(error, 'vehicle_type'))
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

  if (loadError || !vehicleType) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el tipo de vehículo.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ProvisionalDataNotice />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <TruckIcon className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{vehicleType.name}</CardTitle>
                {vehicleType.category && <Badge variant="outline">{vehicleType.category}</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{vehicleType.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={vehicleType.is_active ? 'default' : 'secondary'}>
              {vehicleType.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
              {vehicleType.is_active ? 'Inactivar' : 'Activar'}
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

              <InfoField label="Fecha de Creación">{formatDate(vehicleType.created_at)}</InfoField>
              <InfoField label="Última Actualización">{formatDate(vehicleType.updated_at)}</InfoField>

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
          <CatalogSidebarSection title="Detalle" colorVariant="purple" icon={<TruckIcon className="size-4" />}>
            <CatalogSidebarStat label="Categoría" value={vehicleType.category ?? 'Sin categoría'} />
            <CatalogSidebarStat label="Estado" value={vehicleType.is_active ? 'Activo' : 'Inactivo'} withDivider={false} />
          </CatalogSidebarSection>
        </div>
      </div>
    </div>
  )
}
