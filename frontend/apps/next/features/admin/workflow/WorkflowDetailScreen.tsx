'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  cloneWorkflow,
  destroyWorkflowTransition,
  fetchWorkflow,
  publishWorkflowVersion,
  storeWorkflowVersion,
  type AdminRespelStatus,
  type AdminWorkflowDetail,
  type AdminWorkflowTransition,
  type AdminWorkflowTransitionRoleAssignment,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { CreateWorkflowTransitionForm } from './CreateWorkflowTransitionForm'

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

function roleAssignmentLabel(assignment: AdminWorkflowTransitionRoleAssignment): string {
  return assignment.role?.name ?? assignment.business_role?.name ?? '—'
}

// Agrupa un código de `respel_statuses` (ej. `TECH_PENDING`, `COM_QUOTED`)
// por su prefijo de eje -- `respel_statuses` no tiene una columna "axis"
// propia, el eje SÍ se deriva del código por convención de nomenclatura
// (`TECH_*`/`COM_*`, ver `RespelStatusSeeder`), pero el ORDEN dentro de cada
// eje ya no se deriva de la aparición en pantalla -- viene del `sort_order`
// real del catálogo (`WorkflowTransition::fromStatus()`/`toStatus()`, ver
// types.ts).
function axisOf(code: string): string {
  const separatorIndex = code.indexOf('_')
  return separatorIndex === -1 ? code : code.slice(0, separatorIndex)
}

function statusName(code: string, status: AdminRespelStatus | null | undefined): string {
  return status?.name ?? code
}

// CU-021 "Configurar Workflow" -- detalle. Ver docblock de
// `WorkflowController`/`WorkflowPolicy` (backend). Los 2 gaps de contrato del
// lote anterior (sin catálogo de `respel_statuses`, `show()` sin
// `versions[].transitions` completo) ya se cerraron -- ver types.ts.
export function WorkflowDetailScreen({ workflowId }: { workflowId: number | string }) {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('workflows.manage')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [workflow, setWorkflow] = useState<AdminWorkflowDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [viewingDraft, setViewingDraft] = useState(false)

  const [search, setSearch] = useState('')
  const [selectedTransitionId, setSelectedTransitionId] = useState<number | null>(null)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingTransition, setEditingTransition] = useState<AdminWorkflowTransition | null>(null)

  const [versionActionError, setVersionActionError] = useState<string | null>(null)
  const [isVersionActionBusy, setIsVersionActionBusy] = useState(false)

  const [transitionActionErrors, setTransitionActionErrors] = useState<Record<number, string>>({})
  const [busyTransitionId, setBusyTransitionId] = useState<number | null>(null)

  const [cloneError, setCloneError] = useState<string | null>(null)
  const [isCloning, setIsCloning] = useState(false)

  const load = useCallback(() => {
    if (!isAuthorized) return
    setIsLoading(true)
    fetchWorkflow(workflowId)
      .then((result) => {
        setWorkflow(result.workflow)
        // Por defecto se muestra la versión PUBLICADA -- salvo que no exista
        // ninguna todavía (p. ej. justo después de clonar el BASE, que solo
        // crea un DRAFT), caso en el que se muestra el borrador de una vez en
        // vez de aterrizar en una tabla vacía.
        setViewingDraft(
          !result.workflow.current_version && result.workflow.versions.some((version) => version.status === 'DRAFT')
        )
        setLoadError(null)
      })
      .catch((error) => {
        setLoadError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => setIsLoading(false))
  }, [isAuthorized, workflowId])

  useEffect(() => load(), [load])

  const draftVersion = workflow?.versions.find((version) => version.status === 'DRAFT')
  const activeVersion = viewingDraft ? draftVersion : workflow?.current_version ?? undefined
  // `transitions` ya no es opcional (gap de contrato cerrado, ver types.ts) --
  // siempre es un array, posiblemente vacío.
  const visibleTransitions = activeVersion?.transitions ?? []

  const canEdit =
    Boolean(workflow) &&
    (isPlatformStaff ||
      (workflow!.tenant_organization_id !== null && workflow!.tenant_organization_id === user?.tenant_organization_id))
  const canOfferClone = !isPlatformStaff && workflow?.tenant_organization_id === null

  const rolesAssignedCount = useMemo(() => {
    const ids = new Set<string>()
    for (const transition of visibleTransitions) {
      for (const role of transition.roles ?? []) {
        ids.add(role.role_id != null ? `role-${role.role_id}` : `business-${role.business_role_id}`)
      }
    }
    return ids.size
  }, [visibleTransitions])

  // Orden real por eje (técnico/comercial): usa el `sort_order` del
  // `RespelStatus` embebido en la transición (`from_status`/`to_status`, ver
  // types.ts) en vez del orden de aparición en las transiciones visibles.
  const axisLists = useMemo(() => {
    const groups = new Map<string, Map<string, AdminRespelStatus | null | undefined>>()
    for (const transition of visibleTransitions) {
      const entries: Array<[string, AdminRespelStatus | null | undefined]> = [
        [transition.from_status_code, transition.from_status],
        [transition.to_status_code, transition.to_status],
      ]
      for (const [code, status] of entries) {
        const axis = axisOf(code)
        const codeMap = groups.get(axis) ?? new Map<string, AdminRespelStatus | null | undefined>()
        if (!codeMap.has(code) || (!codeMap.get(code) && status)) codeMap.set(code, status)
        groups.set(axis, codeMap)
      }
    }
    return Array.from(groups.entries()).map(([axis, codeMap]) => {
      const entries = Array.from(codeMap.entries())
      entries.sort((a, b) => (a[1]?.sort_order ?? Number.MAX_SAFE_INTEGER) - (b[1]?.sort_order ?? Number.MAX_SAFE_INTEGER))
      return [axis, entries] as [string, Array<[string, AdminRespelStatus | null | undefined]>]
    })
  }, [visibleTransitions])

  const filteredTransitions = visibleTransitions.filter((transition) => {
    if (!search.trim()) return true
    const query = search.trim().toLowerCase()
    return (
      transition.from_status_code.toLowerCase().includes(query) ||
      transition.to_status_code.toLowerCase().includes(query) ||
      statusName(transition.from_status_code, transition.from_status).toLowerCase().includes(query) ||
      statusName(transition.to_status_code, transition.to_status).toLowerCase().includes(query)
    )
  })

  const selectedTransition = visibleTransitions.find((transition) => transition.id === selectedTransitionId)

  function upsertTransitionOnDraft(transition: AdminWorkflowTransition) {
    setWorkflow((current) => {
      if (!current) return current
      return {
        ...current,
        versions: current.versions.map((version) => {
          if (version.status !== 'DRAFT') return version
          const withoutThis = (version.transitions ?? []).filter((existing) => existing.id !== transition.id)
          return { ...version, transitions: [...withoutThis, transition] }
        }),
      }
    })
    setViewingDraft(true)
  }

  async function handleCreateVersion() {
    if (!workflow) return
    setVersionActionError(null)
    setIsVersionActionBusy(true)
    try {
      const { workflow_version: created } = await storeWorkflowVersion(workflow.id)
      setWorkflow((current) => (current ? { ...current, versions: [created, ...current.versions] } : current))
      setViewingDraft(true)
      setSelectedTransitionId(null)
    } catch (error) {
      setVersionActionError(errorMessage(error, 'workflow'))
    } finally {
      setIsVersionActionBusy(false)
    }
  }

  async function handlePublish() {
    if (!workflow || !draftVersion) return
    setVersionActionError(null)
    setIsVersionActionBusy(true)
    try {
      await publishWorkflowVersion(workflow.id, draftVersion.id)
      // Refetch: `show()` SIEMPRE trae `current_version.transitions`
      // completo (a diferencia de la respuesta de `publishVersion()`, que no
      // lo incluye) -- la fuente autoritativa tras publicar es un GET nuevo,
      // no un merge manual del estado local.
      const { workflow: fresh } = await fetchWorkflow(workflow.id)
      setWorkflow(fresh)
      setViewingDraft(false)
      setSelectedTransitionId(null)
    } catch (error) {
      setVersionActionError(errorMessage(error, 'workflow_version'))
    } finally {
      setIsVersionActionBusy(false)
    }
  }

  async function handleDeleteTransition(transition: AdminWorkflowTransition) {
    if (!workflow) return
    setBusyTransitionId(transition.id)
    setTransitionActionErrors((current) => ({ ...current, [transition.id]: '' }))
    try {
      await destroyWorkflowTransition(workflow.id, transition.id)
      setWorkflow((current) => {
        if (!current) return current
        return {
          ...current,
          versions: current.versions.map((version) =>
            version.status === 'DRAFT' && version.transitions
              ? { ...version, transitions: version.transitions.filter((item) => item.id !== transition.id) }
              : version
          ),
        }
      })
      if (selectedTransitionId === transition.id) setSelectedTransitionId(null)
    } catch (error) {
      setTransitionActionErrors((current) => ({
        ...current,
        [transition.id]: errorMessage(error, 'workflow_transition'),
      }))
    } finally {
      setBusyTransitionId(null)
    }
  }

  async function handleClone() {
    if (!workflow) return
    setCloneError(null)
    setIsCloning(true)
    try {
      const { workflow: cloned } = await cloneWorkflow(workflow.id)
      router.push(`/admin/workflows/${cloned.id}`)
    } catch (error) {
      setCloneError(errorMessage(error, 'workflow'))
    } finally {
      setIsCloning(false)
    }
  }

  if (!isAuthorized || isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (loadError || !workflow) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el workflow.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-xl">{workflow.name}</CardTitle>
              <Badge variant={workflow.tenant_organization_id === null ? 'default' : 'outline'}>
                {workflow.tenant_organization_id === null ? 'BASE (Sistema)' : 'Personalizado'}
              </Badge>
              <Badge variant="outline">{workflow.entity_type}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{workflow.code}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isVersionActionBusy || Boolean(draftVersion)}
                  title={draftVersion ? 'Ya existe una versión en borrador' : undefined}
                  onClick={handleCreateVersion}
                >
                  Nueva Versión
                </Button>
                <Button
                  size="sm"
                  disabled={isVersionActionBusy || !draftVersion}
                  onClick={handlePublish}
                >
                  Publicar Versión
                </Button>
                <Button
                  size="sm"
                  disabled={!draftVersion}
                  onClick={() => {
                    setEditingTransition(null)
                    setIsCreateOpen(true)
                  }}
                >
                  + Nueva Transición
                </Button>
              </>
            )}
            {canOfferClone && (
              <Button size="sm" disabled={isCloning} onClick={handleClone}>
                {isCloning ? 'Personalizando…' : 'Personalizar mi Workflow'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {cloneError && (
            <p className="text-sm text-destructive" role="alert">
              {cloneError}
            </p>
          )}
          {versionActionError && (
            <p className="text-sm text-destructive" role="alert">
              {versionActionError}
            </p>
          )}
          {draftVersion && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">
              <span>
                Versión en borrador: <strong>v{draftVersion.version_number}</strong>
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  variant={viewingDraft ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setViewingDraft(true)
                    setSelectedTransitionId(null)
                  }}
                >
                  Ver Borrador
                </Button>
                {workflow.current_version && (
                  <Button
                    variant={!viewingDraft ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setViewingDraft(false)
                      setSelectedTransitionId(null)
                    }}
                  >
                    Ver Publicada
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Total Transiciones</p>
              <p className="text-lg font-semibold">{visibleTransitions.length}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Roles Asignados</p>
              <p className="text-lg font-semibold">{rolesAssignedCount}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Versión Actual</p>
              <p className="text-lg font-semibold">
                {activeVersion ? `v${activeVersion.version_number}` : '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                {activeVersion ? (activeVersion.status === 'DRAFT' ? 'Borrador' : 'Publicada') : 'Sin versión'}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Última Publicación</p>
              <p className="text-lg font-semibold">
                {workflow.current_version?.published_at ? formatDate(workflow.current_version.published_at) : '—'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <Input
            placeholder="Buscar por estado origen o destino…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Buscar transiciones"
          />
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Desde → Hasta</TableHead>
                  <TableHead>Automática</TableHead>
                  <TableHead>Requiere Aprobación</TableHead>
                  <TableHead>Roles Autorizados</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransitions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No hay transiciones que coincidan con la búsqueda.
                    </TableCell>
                  </TableRow>
                )}
                {filteredTransitions.map((transition) => (
                  <TableRow
                    key={transition.id}
                    data-selected={transition.id === selectedTransitionId}
                    className="cursor-pointer"
                    onClick={() => setSelectedTransitionId(transition.id)}
                  >
                    <TableCell>
                      {statusName(transition.from_status_code, transition.from_status)} →{' '}
                      {statusName(transition.to_status_code, transition.to_status)}
                    </TableCell>
                    <TableCell>{transition.is_automatic ? 'Sí' : 'No'}</TableCell>
                    <TableCell>{transition.requires_approval ? 'Sí' : 'No'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(transition.roles ?? []).length === 0 && <span className="text-muted-foreground">—</span>}
                        {(transition.roles ?? []).map((role) => (
                          <Badge key={role.id} variant="outline">
                            {roleAssignmentLabel(role)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedTransitionId(transition.id)
                            }}
                          >
                            Ver
                          </Button>
                          {canEdit && viewingDraft && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setEditingTransition(transition)
                                  setIsCreateOpen(true)
                                }}
                              >
                                Editar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busyTransitionId === transition.id}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleDeleteTransition(transition)
                                }}
                              >
                                Eliminar
                              </Button>
                            </>
                          )}
                        </div>
                        {transitionActionErrors[transition.id] && (
                          <p className="max-w-56 text-right text-xs text-destructive" role="alert">
                            {transitionActionErrors[transition.id]}
                          </p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalle de la Transición</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!selectedTransition ? (
              <p className="text-sm text-muted-foreground">Selecciona una transición para ver su detalle.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {statusName(selectedTransition.from_status_code, selectedTransition.from_status)} →{' '}
                    {statusName(selectedTransition.to_status_code, selectedTransition.to_status)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedTransition.is_automatic ? 'Automática' : 'Manual'} ·{' '}
                    {selectedTransition.requires_approval ? 'Requiere aprobación' : 'Sin aprobación'}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Roles Autorizados</span>
                  <div className="flex flex-wrap gap-1">
                    {(selectedTransition.roles ?? []).length === 0 && (
                      <span className="text-sm text-muted-foreground">Sin roles asignados.</span>
                    )}
                    {(selectedTransition.roles ?? []).map((role) => (
                      <Badge key={role.id} variant="outline">
                        {roleAssignmentLabel(role)}
                      </Badge>
                    ))}
                  </div>
                </div>
                {(selectedTransition.rules ?? []).length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">Reglas (solo lectura)</span>
                    <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {(selectedTransition.rules ?? []).map((rule) => (
                        <li key={rule.id}>{rule.rule_type}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <span className="text-sm font-medium">→ Flujo</span>
              {axisLists.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin transiciones para derivar el flujo.</p>
              )}
              {axisLists.map(([axis, entries]) => (
                <div key={axis} className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{axis}</span>
                  <ul className="flex flex-col gap-1">
                    {entries.map(([code, status], index) => (
                      <li key={code} className="flex flex-wrap items-center gap-1 text-sm">
                        {index > 0 && <span className="text-muted-foreground">↓</span>}
                        <span
                          className={
                            selectedTransition &&
                            (selectedTransition.from_status_code === code || selectedTransition.to_status_code === code)
                              ? 'font-semibold'
                              : undefined
                          }
                        >
                          {statusName(code, status)}
                        </span>
                        {status?.is_initial && (
                          <Badge variant="outline" className="text-[10px]">
                            Inicial
                          </Badge>
                        )}
                        {status?.is_final && (
                          <Badge variant="outline" className="text-[10px]">
                            Final
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">({code})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {canEdit && (
        <CreateWorkflowTransitionForm
          workflowId={workflow.id}
          organizationId={workflow.tenant_organization_id}
          mode={editingTransition ? 'edit' : 'create'}
          transition={editingTransition ?? undefined}
          open={isCreateOpen}
          onOpenChange={(open) => {
            setIsCreateOpen(open)
            if (!open) setEditingTransition(null)
          }}
          onSaved={upsertTransitionOnDraft}
        />
      )}
    </div>
  )
}
