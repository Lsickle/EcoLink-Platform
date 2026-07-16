'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { CatalogSidebarSection } from '@/components/catalog/CatalogSidebarSection'
import { CatalogSidebarStat } from '@/components/catalog/CatalogSidebarStat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ApiValidationError,
  activateOrganizationalArea,
  deactivateOrganizationalArea,
  fetchOrganizationalArea,
  fetchOrganizationalAreas,
  updateOrganizationalArea,
  type AdminOrganizationalArea,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { ORGANIZATIONAL_AREA_LEVELS, type OrganizationalAreaLevel } from 'app/features/admin/types'
import { useRequireAuth } from 'app/provider/auth'

const levelOptions = ORGANIZATIONAL_AREA_LEVELS.map((level) => ({ value: level, label: level }))
const noParentValue = 'none'

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

/**
 * Detalle de un Área Organizacional (Batch 1/3, backend cerrado -- ver
 * OrganizationalAreaController): mismo patrón "edición inline sin modo
 * separado" que BranchTypeDetailScreen.tsx. Gateado por
 * `organizational_areas.read` -- el guardado/toggle exige
 * `organizational_areas.manage` en el backend, la UI no repite el gate
 * (mismo criterio que BranchTypeDetailScreen.tsx).
 *
 * Jerarquía del sidebar (padre/hijas): un único fetch adicional de
 * `fetchOrganizationalAreas` sobre la misma organización del área (todas
 * sus filas, hasta 200 -- catálogo pequeño por organización) resuelve AMBOS
 * -- el padre (`find` por `parent_area_id`) y las hijas (`filter` por
 * `parent_area_id === area.id`) -- sin pedir un endpoint de árbol dedicado
 * que no existe.
 */
export function OrganizationalAreaDetailScreen({ organizationalAreaId }: { organizationalAreaId: number | string }) {
  const router = useRouter()
  const { isAuthorized, user } = useRequireAuth('organizational_areas.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [area, setArea] = useState<AdminOrganizationalArea | null>(null)
  const [siblings, setSiblings] = useState<AdminOrganizationalArea[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editCode, setEditCode] = useState('')
  const [editName, setEditName] = useState('')
  const [editLevel, setEditLevel] = useState<OrganizationalAreaLevel>('Coordinación')
  const [editParentAreaId, setEditParentAreaId] = useState<string>(noParentValue)
  const [editResponsiblePersonIdInput, setEditResponsiblePersonIdInput] = useState('')

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchOrganizationalArea(organizationalAreaId)
      .then((result) => {
        if (cancelled) return
        const loaded = result.organizational_area
        setArea(loaded)
        setEditCode(loaded.code)
        setEditName(loaded.name)
        setEditLevel(loaded.level)
        setEditParentAreaId(loaded.parent_area_id ? String(loaded.parent_area_id) : noParentValue)
        setEditResponsiblePersonIdInput(loaded.responsible_person_id ? String(loaded.responsible_person_id) : '')
        return fetchOrganizationalAreas({
          organizationId: isPlatformStaff ? loaded.organization_id : undefined,
          status: 'active',
          perPage: 200,
        })
      })
      .then((result) => {
        if (cancelled || !result) return
        setSiblings(result.data)
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
  }, [isAuthorized, isPlatformStaff, organizationalAreaId])

  const parentArea = area?.parent_area_id ? siblings.find((item) => item.id === area.parent_area_id) : undefined
  const childAreas = area ? siblings.filter((item) => item.parent_area_id === area.id) : []

  const parentAreaItems = [
    { value: noParentValue, label: 'Ninguna (área raíz)' },
    ...siblings.filter((item) => item.id !== area?.id).map((item) => ({ value: String(item.id), label: `${item.code} · ${item.name}` })),
  ]

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!area) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { organizational_area: updated } = await updateOrganizationalArea(area.id, {
        code: editCode,
        name: editName,
        level: editLevel,
        parent_area_id: editParentAreaId === noParentValue ? null : Number(editParentAreaId),
        responsible_person_id: editResponsiblePersonIdInput ? Number(editResponsiblePersonIdInput) : null,
      })
      setArea((current) => (current ? { ...current, ...updated } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!area) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      const { organizational_area: updated } = area.is_active
        ? await deactivateOrganizationalArea(area.id)
        : await activateOrganizationalArea(area.id)
      setArea((current) => (current ? { ...current, ...updated } : current))
    } catch (error) {
      setToggleError(errorMessage(error, 'organizational_area'))
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

  if (loadError || !area) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el área organizacional.'}
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
                <CardTitle className="text-xl">{area.name}</CardTitle>
                <Badge variant="outline">{area.level}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{area.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={area.is_active ? 'default' : 'secondary'}>{area.is_active ? 'Activo' : 'Inactivo'}</Badge>
            <Button variant="outline" size="sm" disabled={isTogglingActive} onClick={handleToggleActive}>
              {area.is_active ? 'Inactivar' : 'Activar'}
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
                <Label htmlFor="editLevel">Nivel</Label>
                <Select
                  items={levelOptions}
                  value={editLevel}
                  onValueChange={(value) => value && setEditLevel(value as OrganizationalAreaLevel)}
                >
                  <SelectTrigger id="editLevel" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {levelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="editName">Nombre</Label>
                <Input id="editName" value={editName} onChange={(event) => setEditName(event.target.value)} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editParentAreaId">Área Padre</Label>
                <Select
                  items={parentAreaItems}
                  value={editParentAreaId}
                  onValueChange={(value) => value && setEditParentAreaId(value)}
                >
                  <SelectTrigger id="editParentAreaId" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {parentAreaItems.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="editResponsiblePersonId">
                  ID de Persona Responsable <span className="text-muted-foreground">(opcional)</span>
                </Label>
                <Input
                  id="editResponsiblePersonId"
                  type="number"
                  min={1}
                  value={editResponsiblePersonIdInput}
                  onChange={(event) => setEditResponsiblePersonIdInput(event.target.value)}
                />
              </div>

              <InfoField label="Fecha de Creación">{formatDate(area.created_at)}</InfoField>
              <InfoField label="Última Actualización">{formatDate(area.updated_at)}</InfoField>

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
          <CatalogSidebarSection title="Jerarquía" colorVariant="blue" icon={<Building2 className="size-4" />}>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Área Padre</span>
              {parentArea ? (
                <button
                  type="button"
                  className="text-left text-sm text-primary hover:underline"
                  onClick={() => router.push(`/admin/catalogs/organizational-areas/${parentArea.id}`)}
                >
                  {parentArea.name}
                </button>
              ) : (
                <span className="text-sm text-muted-foreground">Ninguna (área raíz)</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Áreas Hijas ({childAreas.length})</span>
              {childAreas.length === 0 ? (
                <span className="text-sm text-muted-foreground">Sin áreas hijas.</span>
              ) : (
                <ul className="flex flex-col gap-1">
                  {childAreas.map((child) => (
                    <li key={child.id}>
                      <button
                        type="button"
                        className="text-left text-sm text-primary hover:underline"
                        onClick={() => router.push(`/admin/catalogs/organizational-areas/${child.id}`)}
                      >
                        {child.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CatalogSidebarSection>

          <CatalogSidebarSection title="Detalle">
            <CatalogSidebarStat label="Organización" value={area.organization_id} />
            <CatalogSidebarStat label="Responsable" value={area.responsible_person_id ?? '—'} />
            <CatalogSidebarStat label="Estado" value={area.is_active ? 'Activo' : 'Inactivo'} withDivider={false} />
          </CatalogSidebarSection>
        </div>
      </div>
    </div>
  )
}
