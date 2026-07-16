'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
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
  activatePackagingCondition,
  deactivatePackagingCondition,
  fetchPackagingCondition,
  updatePackagingCondition,
  type AdminPackagingCondition,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { HAZARD_RISK_LEVEL_LABELS, hazardRiskLevel } from 'app/features/admin/hazardRiskLevel'
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

// Detalle de un Estado del Embalaje (Batch 3/3, último -- ver
// PackagingConditionController): mismo patrón EXACTO que
// HazardCharacteristicDetailScreen.tsx (edición inline, riskLevel con
// etiqueta cualitativa derivada reutilizando hazardRiskLevel.ts). AVISO --
// PROVISIONAL (ver ProvisionalDataNotice). `risk_level` es NULLABLE aquí --
// el input se deja vacío cuando no hay valor, y un campo vacío se manda
// como `undefined` (nunca `0` ni NaN) al guardar.
export function PackagingConditionDetailScreen({
  packagingConditionId,
}: {
  packagingConditionId: number | string
}) {
  const { isAuthorized } = useRequireAuth('packaging_conditions.read')
  const [packagingCondition, setPackagingCondition] = useState<AdminPackagingCondition | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editRiskLevel, setEditRiskLevel] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchPackagingCondition(packagingConditionId)
      .then((result) => {
        if (cancelled) return
        setPackagingCondition(result.packaging_condition)
        setEditCode(result.packaging_condition.code)
        setEditName(result.packaging_condition.name)
        setEditRiskLevel(result.packaging_condition.risk_level != null ? String(result.packaging_condition.risk_level) : '')
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
  }, [isAuthorized, packagingConditionId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!packagingCondition) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { packaging_condition: updated } = await updatePackagingCondition(packagingCondition.id, {
        code: editCode,
        name: editName,
        risk_level: editRiskLevel === '' ? undefined : Number(editRiskLevel),
      })
      setPackagingCondition((current) => (current ? { ...current, ...updated } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!packagingCondition) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { packaging_condition: updated } = packagingCondition.is_active
        ? await deactivatePackagingCondition(packagingCondition.id)
        : await activatePackagingCondition(packagingCondition.id)
      setPackagingCondition((current) => (current ? { ...current, ...updated } : current))
    } catch (error) {
      setToggleError(errorMessage(error, 'packaging_condition'))
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

  if (loadError || !packagingCondition) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el estado del embalaje.'}
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
              <ShieldAlert className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <CardTitle className="text-xl">{packagingCondition.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{packagingCondition.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={packagingCondition.is_active ? 'default' : 'secondary'}>
              {packagingCondition.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
              {packagingCondition.is_active ? 'Inactivar' : 'Activar'}
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
                <Label htmlFor="editRiskLevel">Nivel de Riesgo (1-9, opcional)</Label>
                <Input
                  id="editRiskLevel"
                  type="number"
                  min={1}
                  max={9}
                  value={editRiskLevel}
                  onChange={(event) => setEditRiskLevel(event.target.value)}
                />
                <span className="text-xs text-muted-foreground">
                  {editRiskLevel === ''
                    ? 'Sin definir'
                    : `Equivale a "${HAZARD_RISK_LEVEL_LABELS[hazardRiskLevel(Number(editRiskLevel))]}"`}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="editName">Nombre</Label>
                <Input id="editName" value={editName} onChange={(event) => setEditName(event.target.value)} />
              </div>

              <InfoField label="Fecha de Creación">{formatDate(packagingCondition.created_at)}</InfoField>
              <InfoField label="Última Actualización">{formatDate(packagingCondition.updated_at)}</InfoField>

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
          <CatalogSidebarSection title="Detalle" colorVariant="orange" icon={<ShieldAlert className="size-4" />}>
            <CatalogSidebarStat
              label="Nivel de Riesgo"
              value={
                packagingCondition.risk_level != null
                  ? HAZARD_RISK_LEVEL_LABELS[hazardRiskLevel(packagingCondition.risk_level)]
                  : 'Sin definir'
              }
            />
            <CatalogSidebarStat label="Estado" value={packagingCondition.is_active ? 'Activo' : 'Inactivo'} withDivider={false} />
          </CatalogSidebarSection>
        </div>
      </div>
    </div>
  )
}
