'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  cloneWorkflow,
  fetchWorkflows,
  type AdminWorkflow,
} from 'app/features/admin/api'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'

const PER_PAGE = 15

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// Gap de contrato cerrado (backend, `WorkflowController::index()` ahora
// eager-carga `tenantOrganization:id,legal_name`, mismo criterio que
// `show()`) -- se muestra la razón social real en vez de "Organización #<id>".
function scopeLabel(workflow: AdminWorkflow): { text: string; variant: 'default' | 'outline' } {
  if (workflow.tenant_organization_id === null) {
    return { text: 'BASE (Sistema)', variant: 'default' }
  }
  return { text: workflow.tenant_organization?.legal_name ?? `Organización #${workflow.tenant_organization_id}`, variant: 'outline' }
}

function versionLabel(workflow: AdminWorkflow): string {
  if (!workflow.current_version) return 'Sin versión publicada'
  return `v${workflow.current_version.version_number} · Publicada`
}

// CU-021 "Configurar Workflow" -- listado. Platform staff ve TODOS los
// workflows (BASE + el de cada organización Gestor que ya personalizó el
// suyo, filtro opcional de organización -- mismo patrón EXACTO que
// PreapprovedWastesListScreen.tsx/OrganizationalAreasListScreen.tsx). Un
// admin de organización Gestor ve el BASE (solo lectura) + el suyo propio si
// existe -- el backend ya acota el resultado (`WorkflowController::index()`),
// esta pantalla solo decide qué controles mostrar según
// `user.is_platform_staff`.
export function WorkflowsListScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('workflows.manage')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [organizationLabel, setOrganizationLabel] = useState<string | null>(null)

  const [workflows, setWorkflows] = useState<AdminWorkflow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [isCloning, setIsCloning] = useState(false)
  const [cloneError, setCloneError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!isAuthorized) return
    let cancelled = false
    setIsLoading(true)
    fetchWorkflows({
      page,
      perPage: PER_PAGE,
      organizationId: isPlatformStaff && organizationId ? organizationId : undefined,
    })
      .then((result) => {
        if (cancelled) return
        setWorkflows(result.data)
        setLastPage(result.last_page)
        setTotal(result.total)
        setLoadError(null)
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
  }, [isAuthorized, page, isPlatformStaff, organizationId])

  useEffect(() => load(), [load])

  // Solo relevante para un admin de organización Gestor (no platform staff):
  // ¿ya tiene su propio workflow de TREATMENT? El backend, sin filtro de
  // organización para ese actor, ya devuelve BASE + el suyo (si existe) --
  // ver `WorkflowController::index()`.
  const baseWorkflow = workflows.find((workflow) => workflow.tenant_organization_id === null)
  const ownWorkflow =
    !isPlatformStaff && user?.tenant_organization_id != null
      ? workflows.find((workflow) => workflow.tenant_organization_id === user.tenant_organization_id)
      : undefined
  const canOfferPersonalize = !isPlatformStaff && !ownWorkflow && Boolean(baseWorkflow)

  async function handlePersonalize() {
    if (!baseWorkflow) return
    setCloneError(null)
    setIsCloning(true)
    try {
      const { workflow } = await cloneWorkflow(baseWorkflow.id)
      router.push(`/admin/workflows/${workflow.id}`)
    } catch (error) {
      setCloneError(errorMessage(error, 'workflow'))
    } finally {
      setIsCloning(false)
    }
  }

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {isPlatformStaff && (
            <div className="sm:w-64">
              <OrganizationSearchSelect
                label="Organización"
                htmlId="workflowOrganizationFilter"
                capability="can_treat_waste"
                selectedId={organizationId}
                selectedLabel={organizationLabel}
                onSelect={(result) => {
                  setOrganizationId(result.id)
                  setOrganizationLabel(result.legal_name)
                  setPage(1)
                }}
                onClear={() => {
                  setOrganizationId(null)
                  setOrganizationLabel(null)
                  setPage(1)
                }}
              />
            </div>
          )}
        </div>
        {canOfferPersonalize && (
          <Button disabled={isCloning} onClick={handlePersonalize}>
            {isCloning ? 'Personalizando…' : 'Personalizar mi Workflow'}
          </Button>
        )}
      </div>

      {cloneError && (
        <p className="text-sm text-destructive" role="alert">
          {cloneError}
        </p>
      )}

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Cargando…
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow</TableHead>
                <TableHead>Alcance</TableHead>
                <TableHead>Tipo de Entidad</TableHead>
                <TableHead>Versión Actual</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No hay workflows que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {workflows.map((workflow) => {
                const scope = scopeLabel(workflow)
                return (
                  <TableRow key={workflow.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => router.push(`/admin/workflows/${workflow.id}`)}
                      >
                        <div className="font-medium">{workflow.name}</div>
                        <div className="text-xs text-muted-foreground">{workflow.code}</div>
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={scope.variant}>{scope.text}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{workflow.entity_type}</TableCell>
                    <TableCell className="text-muted-foreground">{versionLabel(workflow)}</TableCell>
                    <TableCell>
                      <Badge variant={workflow.is_active ? 'default' : 'secondary'}>
                        {workflow.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => router.push(`/admin/workflows/${workflow.id}`)}>
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="text-sm text-muted-foreground">
          Mostrando {rangeStart}–{rangeEnd} de {total} workflows
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {lastPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= lastPage}
            onClick={() => setPage((current) => current + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}
