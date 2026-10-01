'use client'

import { useEffect, useState } from 'react'
import { Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  fetchOrganization,
  fetchOrganizationSidebarModules,
  enableOrganizationSidebarModule,
  disableOrganizationSidebarModule,
  type AdminOrganizationDetail,
  type AdminOrganizationSidebarModule,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'
import { EcoLinkSpinner } from '@/components/ecolink-spinner'

function statusBadgeStyle(colorHex: string | null): React.CSSProperties {
  if (!colorHex) return {}
  return { backgroundColor: `${colorHex}26`, color: colorHex }
}

// Reorganización del sidebar en 7 grupos temáticos (2026-09-28) -- pantalla
// nueva y dedicada, EXCLUSIVA de platform staff (mismo gate EXACTO que
// OrganizationDetailScreen.tsx: `useRequireAuth(undefined, {
// requirePlatformStaff: true })`, primer consumidor real de esa opción
// además de esa pantalla). Header con los datos de la organización (mismo
// estilo visual que el CardHeader de OrganizationDetailScreen.tsx pero SIN
// los botones de Editar/Inactivar -- esta pantalla no edita la organización
// en sí, solo sus módulos de sidebar habilitados) + lista de los 7 módulos
// con un Checkbox por fila (mismo componente que ya usa
// OrganizationDetailScreen.tsx para "Tipos de Organización" -- no hay
// `Switch` instalado en este proyecto todavía, ver discrepancia señalada en
// el resumen del lote).
export function OrganizationSidebarModulesScreen({ organizationId }: { organizationId: number | string }) {
  const { isAuthorized } = useRequireAuth(undefined, { requirePlatformStaff: true })

  const [organization, setOrganization] = useState<AdminOrganizationDetail | null>(null)
  const [modules, setModules] = useState<AdminOrganizationSidebarModule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [toggleError, setToggleError] = useState<string | null>(null)
  const [busyModuleId, setBusyModuleId] = useState<number | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    Promise.all([fetchOrganization(organizationId), fetchOrganizationSidebarModules(organizationId)])
      .then(([orgResult, modulesResult]) => {
        if (cancelled) return
        setOrganization(orgResult.organization)
        setModules(modulesResult.data)
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
  }, [isAuthorized, organizationId])

  // Mismo patrón EXACTO que `handleToggleBusinessRole` en
  // OrganizationDetailScreen.tsx: optimistic update, error de fila único (no
  // uno por módulo -- solo un toggle puede estar en curso a la vez gracias a
  // `busyModuleId` deshabilitando el resto de los checkboxes), revierte el
  // estado si la llamada falla.
  async function handleToggleModule(module: AdminOrganizationSidebarModule) {
    setToggleError(null)
    setBusyModuleId(module.id)
    const wasEnabled = module.is_enabled
    try {
      if (wasEnabled) {
        await disableOrganizationSidebarModule(organizationId, module.id)
      } else {
        await enableOrganizationSidebarModule(organizationId, module.id)
      }
      setModules((current) =>
        current.map((m) => (m.id === module.id ? { ...m, is_enabled: !wasEnabled } : m))
      )
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : 'Error inesperado.')
    } finally {
      setBusyModuleId(null)
    }
  }

  if (!isAuthorized || isLoading) {
    return (
      <EcoLinkSpinner />
    )
  }

  if (loadError || !organization) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró la organización.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              {organization.legal_name.charAt(0).toUpperCase() || <Building2 className="size-5" aria-hidden="true" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{organization.legal_name}</CardTitle>
                {organization.type.map((typeName) => (
                  <Badge key={typeName} variant="outline">
                    {typeName}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">{organization.tax_id}</p>
            </div>
          </div>
          <Badge style={statusBadgeStyle(organization.status.color_hex)}>{organization.status.name}</Badge>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Módulos del Sidebar Habilitados</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {toggleError && (
            <p className="text-sm text-destructive" role="alert">
              {toggleError}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {modules.map((module) => (
              <li
                key={module.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`sidebar-module-${module.id}`}
                    checked={module.is_enabled}
                    disabled={busyModuleId === module.id}
                    onCheckedChange={() => handleToggleModule(module)}
                  />
                  <Label htmlFor={`sidebar-module-${module.id}`} className="font-normal">
                    {module.name}
                  </Label>
                </div>
                <span className="text-xs text-muted-foreground">
                  {module.is_enabled && module.enabled_at ? `Habilitado el ${formatDate(module.enabled_at)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
