'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { CatalogSidebarSection } from '@/components/catalog/CatalogSidebarSection'
import { CatalogSidebarStat } from '@/components/catalog/CatalogSidebarStat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ApiValidationError,
  activateHazardCharacteristic,
  deactivateHazardCharacteristic,
  fetchHazardCharacteristic,
  updateHazardCharacteristic,
  type AdminHazardCharacteristic,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { HAZARD_RISK_LEVEL_LABELS, hazardRiskLevel } from 'app/features/admin/hazardRiskLevel'
import { useRequireAuth } from 'app/provider/auth'
import { RiskLevelBadge } from './HazardCharacteristicsListScreen'

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

// Detalle de una Característica de Peligrosidad (Batch 2/3 RESPEL, backend
// cerrado -- ver HazardCharacteristicController): mismo patrón EXACTO que
// BranchTypeDetailScreen.tsx (edición inline sin modo separado). El campo
// `risk_level` se edita como número (1-9, contrato real del backend) pero
// SIEMPRE se muestra junto a su etiqueta cualitativa derivada (RiskLevelBadge,
// reutilizado de HazardCharacteristicsListScreen.tsx) para que el admin vea
// el efecto del número que está editando, no solo el dígito crudo.
export function HazardCharacteristicDetailScreen({
  hazardCharacteristicId,
}: {
  hazardCharacteristicId: number | string
}) {
  const { isAuthorized } = useRequireAuth('hazard_characteristics.read')
  const [hazardCharacteristic, setHazardCharacteristic] = useState<AdminHazardCharacteristic | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editRiskLevel, setEditRiskLevel] = useState(1)
  const [editDescription, setEditDescription] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchHazardCharacteristic(hazardCharacteristicId)
      .then((result) => {
        if (cancelled) return
        setHazardCharacteristic(result.hazard_characteristic)
        setEditCode(result.hazard_characteristic.code)
        setEditName(result.hazard_characteristic.name)
        setEditRiskLevel(result.hazard_characteristic.risk_level)
        setEditDescription(result.hazard_characteristic.description ?? '')
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
  }, [isAuthorized, hazardCharacteristicId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!hazardCharacteristic) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { hazard_characteristic: updated } = await updateHazardCharacteristic(hazardCharacteristic.id, {
        code: editCode,
        name: editName,
        risk_level: editRiskLevel,
        description: editDescription,
      })
      setHazardCharacteristic((current) => (current ? { ...current, ...updated } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!hazardCharacteristic) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { hazard_characteristic: updated } = hazardCharacteristic.is_active
        ? await deactivateHazardCharacteristic(hazardCharacteristic.id)
        : await activateHazardCharacteristic(hazardCharacteristic.id)
      setHazardCharacteristic((current) => (current ? { ...current, ...updated } : current))
    } catch (error) {
      setToggleError(errorMessage(error, 'hazard_characteristic'))
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

  if (loadError || !hazardCharacteristic) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró la característica de peligrosidad.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <AlertTriangle className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{hazardCharacteristic.name}</CardTitle>
                <RiskLevelBadge riskLevel={hazardCharacteristic.risk_level} />
              </div>
              <p className="text-sm text-muted-foreground">{hazardCharacteristic.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={hazardCharacteristic.is_active ? 'default' : 'secondary'}>
              {hazardCharacteristic.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
              {hazardCharacteristic.is_active ? 'Inactivar' : 'Activar'}
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
                <Label htmlFor="editRiskLevel">Nivel de Riesgo (1-9)</Label>
                <Input
                  id="editRiskLevel"
                  type="number"
                  min={1}
                  max={9}
                  value={editRiskLevel}
                  onChange={(event) => setEditRiskLevel(Number(event.target.value))}
                />
                <span className="text-xs text-muted-foreground">
                  Equivale a &quot;{HAZARD_RISK_LEVEL_LABELS[hazardRiskLevel(editRiskLevel)]}&quot;
                </span>
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
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

              <InfoField label="Fecha de Creación">{formatDate(hazardCharacteristic.created_at)}</InfoField>
              <InfoField label="Última Actualización">{formatDate(hazardCharacteristic.updated_at)}</InfoField>

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
          <CatalogSidebarSection title="Detalle" colorVariant="red" icon={<AlertTriangle className="size-4" />}>
            <CatalogSidebarStat label="Nivel de Riesgo" value={HAZARD_RISK_LEVEL_LABELS[hazardRiskLevel(hazardCharacteristic.risk_level)]} />
            <CatalogSidebarStat label="Estado" value={hazardCharacteristic.is_active ? 'Activo' : 'Inactivo'} withDivider={false} />
          </CatalogSidebarSection>
        </div>
      </div>
    </div>
  )
}
