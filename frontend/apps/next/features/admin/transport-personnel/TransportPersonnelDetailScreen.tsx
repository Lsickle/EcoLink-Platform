'use client'

import { useEffect, useState } from 'react'
import { IdCardIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ApiValidationError,
  fetchTransportPersonnelById,
  updateTransportPersonnel,
  type AdminTransportPersonnelDetail,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

/**
 * Detalle + edición de Conductor (GET/PUT /api/admin/transport-personnel/{id})
 * -- cierre del GAP DE CONTRATO señalado en el lote anterior (2026-07-19).
 * `person_id`/`organization_id` NO editables aquí (inmutables tras crear,
 * ver docblock de `TransportPersonnelController::update()`) -- solo
 * licencia/permiso de mercancías peligrosas/estado activo, en un único
 * formulario (a diferencia de `VehicleDetailScreen.tsx`, que separa
 * `is_active` en un botón Activar/Inactivar dedicado -- `transport_personnel`
 * no tiene ese par de endpoints, `is_active` viaja dentro de `update()`).
 * Sin tabs de actividad -- el backend de este lote no expone un endpoint de
 * actividad para conductores.
 */
export function TransportPersonnelDetailScreen({ transportPersonnelId }: { transportPersonnelId: number | string }) {
  const { isAuthorized } = useRequireAuth('transport_personnel.read')
  const [driver, setDriver] = useState<AdminTransportPersonnelDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [licenseNumber, setLicenseNumber] = useState('')
  const [licenseCategory, setLicenseCategory] = useState('')
  const [licenseExpirationDate, setLicenseExpirationDate] = useState('')
  const [hasHazmatPermit, setHasHazmatPermit] = useState(false)
  const [isActive, setIsActive] = useState(true)

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchTransportPersonnelById(transportPersonnelId)
      .then((result) => {
        if (cancelled) return
        const d = result.transport_personnel
        setDriver(d)
        setLicenseNumber(d.license_number ?? '')
        setLicenseCategory(d.license_category ?? '')
        setLicenseExpirationDate(d.license_expiration_date ?? '')
        setHasHazmatPermit(d.has_hazmat_permit)
        setIsActive(d.is_active)
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
  }, [isAuthorized, transportPersonnelId])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!driver) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { transport_personnel: updated } = await updateTransportPersonnel(driver.id, {
        license_number: licenseNumber || undefined,
        license_category: licenseCategory || undefined,
        license_expiration_date: licenseExpirationDate || undefined,
        has_hazmat_permit: hasHazmatPermit,
        is_active: isActive,
      })
      // updateTransportPersonnel() devuelve `AdminTransportPersonnel` (fila
      // plana, mismo criterio ya documentado para AdminVehicle) -- su
      // `organization`/`person` son subconjuntos MÍNIMOS de columnas, no el
      // shape completo de `AdminTransportPersonnelDetail` ya cargado por
      // show(). Se preservan los ya cargados, mismo patrón EXACTO que
      // VehicleDetailScreen.tsx::handleSave().
      setDriver((current) =>
        current
          ? {
              ...current,
              ...updated,
              organization: current.organization,
              person: current.person,
              created_by: current.created_by,
              updated_by: current.updated_by,
            }
          : current
      )
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'license_number'))
    } finally {
      setIsSaving(false)
    }
  }

  if (!isAuthorized || isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (loadError || !driver) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el conductor.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              <IdCardIcon className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{driver.person.full_name}</CardTitle>
                {driver.has_hazmat_permit && <Badge variant="outline">Mercancías Peligrosas</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                {driver.person.document_number} · {driver.organization.legal_name}
              </p>
            </div>
          </div>
          <Badge variant={driver.is_active ? 'default' : 'secondary'}>{driver.is_active ? 'Activo' : 'Inactivo'}</Badge>
        </CardHeader>
        <CardContent className="pb-4" />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Información General</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
            <InfoField label="Contacto">{driver.person.full_name}</InfoField>
            <InfoField label="Documento">{driver.person.document_number}</InfoField>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="licenseNumber">
                Número de Licencia <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="licenseNumber"
                value={licenseNumber}
                onChange={(event) => setLicenseNumber(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="licenseCategory">
                Categoría <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="licenseCategory"
                value={licenseCategory}
                onChange={(event) => setLicenseCategory(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="licenseExpirationDate">
                Vencimiento de Licencia <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="licenseExpirationDate"
                type="date"
                value={licenseExpirationDate}
                onChange={(event) => setLicenseExpirationDate(event.target.value)}
              />
            </div>
            <div className="flex flex-col justify-center gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasHazmatPermit"
                  checked={hasHazmatPermit}
                  onCheckedChange={(checked) => setHasHazmatPermit(checked === true)}
                />
                <Label htmlFor="hasHazmatPermit" className="font-normal">
                  Permiso de mercancías peligrosas
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="isActive" checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
                <Label htmlFor="isActive" className="font-normal">
                  Activo
                </Label>
              </div>
            </div>

            <InfoField label="Fecha de Registro">{formatDate(driver.created_at)}</InfoField>
            <InfoField label="Registrado Por">{driver.created_by?.username ?? '—'}</InfoField>

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
