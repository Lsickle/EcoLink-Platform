'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  ApiValidationError,
  fetchBusinessRoles,
  fetchRespelStatuses,
  fetchRoles,
  storeWorkflowTransition,
  updateWorkflowTransition,
  type AdminBusinessRole,
  type AdminRespelStatus,
  type AdminRole,
  type AdminWorkflowTransition,
  type CreateWorkflowTransitionRolePayload,
} from 'app/features/admin/api'

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

type RoleAssignmentDraft = {
  key: string
  roleId?: number
  businessRoleId?: number
  label: string
}

function toPayloadRoles(assignments: RoleAssignmentDraft[]): CreateWorkflowTransitionRolePayload[] {
  return assignments.map((assignment) =>
    assignment.roleId !== undefined
      ? { role_id: assignment.roleId }
      : { business_role_id: assignment.businessRoleId }
  )
}

// Crea/edita una `WorkflowTransition` (CU-021, ver
// `WorkflowController::storeTransition()`/`updateTransition()`). `mode`
// controla qué campos son editables: `from_status_code`/`to_status_code`
// SOLO se piden en modo "create" (inmutables tras crear, ver docblock de
// `UpdateWorkflowTransitionPayload` en types.ts) -- se eligen de un
// `<Select>` real sobre el catálogo de `respel_statuses`
// (`fetchRespelStatuses()`, gap de contrato cerrado -- antes era texto libre
// sin catálogo disponible).
//
// `organizationId`: id de la organización DUEÑA del workflow que se está
// editando (`workflow.tenant_organization_id`, `null` para el BASE) -- se
// reenvía a `fetchRoles()` para que, cuando un platform staff administra el
// workflow PERSONALIZADO de una organización Gestor ajena, el selector de
// roles traiga los roles reales de ESA organización (el backend lo ignora en
// silencio para un actor que no sea platform staff, ver `RoleController::
// index()`).
export function CreateWorkflowTransitionForm({
  workflowId,
  organizationId,
  mode,
  transition,
  open,
  onOpenChange,
  onSaved,
}: {
  workflowId: number | string
  organizationId?: number | null
  mode: 'create' | 'edit'
  transition?: AdminWorkflowTransition
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (transition: AdminWorkflowTransition) => void
}) {
  const [fromStatusCode, setFromStatusCode] = useState(transition?.from_status_code ?? '')
  const [toStatusCode, setToStatusCode] = useState(transition?.to_status_code ?? '')
  const [isAutomatic, setIsAutomatic] = useState(transition?.is_automatic ?? false)
  const [requiresApproval, setRequiresApproval] = useState(transition?.requires_approval ?? false)

  const [roleAssignments, setRoleAssignments] = useState<RoleAssignmentDraft[]>(
    (transition?.roles ?? []).map((assignment) => ({
      key: `existing-${assignment.id}`,
      roleId: assignment.role_id ?? undefined,
      businessRoleId: assignment.business_role_id ?? undefined,
      label: assignment.role?.name ?? assignment.business_role?.name ?? 'Rol',
    }))
  )

  const [systemRoles, setSystemRoles] = useState<AdminRole[]>([])
  const [businessRoles, setBusinessRoles] = useState<AdminBusinessRole[]>([])
  const [respelStatuses, setRespelStatuses] = useState<AdminRespelStatus[]>([])
  const [pendingRoleValue, setPendingRoleValue] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setFromStatusCode(transition?.from_status_code ?? '')
    setToStatusCode(transition?.to_status_code ?? '')
    setIsAutomatic(transition?.is_automatic ?? false)
    setRequiresApproval(transition?.requires_approval ?? false)
    setRoleAssignments(
      (transition?.roles ?? []).map((assignment) => ({
        key: `existing-${assignment.id}`,
        roleId: assignment.role_id ?? undefined,
        businessRoleId: assignment.business_role_id ?? undefined,
        label: assignment.role?.name ?? assignment.business_role?.name ?? 'Rol',
      }))
    )
    setError(null)
    fetchRoles({ perPage: 100, status: 'active', organizationId: organizationId ?? undefined })
      .then((result) => setSystemRoles(result.data))
      .catch(() => setSystemRoles([]))
    fetchBusinessRoles({ activeOnly: true })
      .then((result) => setBusinessRoles(result.data))
      .catch(() => setBusinessRoles([]))
    fetchRespelStatuses({ activeOnly: true })
      .then((result) => setRespelStatuses(result.data))
      .catch(() => setRespelStatuses([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir/cambiar de transición
  }, [open, transition, organizationId])

  function handleAddRole(value: string) {
    if (!value) return
    setPendingRoleValue('')
    const [kind, idRaw] = value.split(':')
    const id = Number(idRaw)
    if (kind === 'role') {
      const role = systemRoles.find((candidate) => candidate.id === id)
      if (!role || roleAssignments.some((assignment) => assignment.roleId === id)) return
      setRoleAssignments((current) => [...current, { key: `role-${id}`, roleId: id, label: role.name }])
    } else if (kind === 'business') {
      const businessRole = businessRoles.find((candidate) => candidate.id === id)
      if (!businessRole || roleAssignments.some((assignment) => assignment.businessRoleId === id)) return
      setRoleAssignments((current) => [
        ...current,
        { key: `business-${id}`, businessRoleId: id, label: businessRole.name },
      ])
    }
  }

  function handleRemoveRole(key: string) {
    setRoleAssignments((current) => current.filter((assignment) => assignment.key !== key))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSaving(true)
    try {
      if (mode === 'create') {
        const { workflow_transition: created } = await storeWorkflowTransition(workflowId, {
          from_status_code: fromStatusCode.trim(),
          to_status_code: toStatusCode.trim(),
          is_automatic: isAutomatic,
          requires_approval: requiresApproval,
          roles: toPayloadRoles(roleAssignments),
        })
        onSaved(created)
      } else if (transition) {
        const { workflow_transition: updated } = await updateWorkflowTransition(workflowId, transition.id, {
          is_automatic: isAutomatic,
          requires_approval: requiresApproval,
          roles: toPayloadRoles(roleAssignments),
        })
        onSaved(updated)
      }
      onOpenChange(false)
    } catch (err) {
      setError(errorMessage(err, mode === 'create' ? 'to_status_code' : 'workflow_transition'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Nueva Transición' : 'Editar Transición'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Se crea sobre la versión en borrador vigente del workflow.'
              : 'El origen/destino no se pueden modificar tras crear la transición.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fromStatusCode">Desde (estado origen)</Label>
              {mode === 'create' ? (
                <Select value={fromStatusCode} onValueChange={(value) => setFromStatusCode(value ?? '')}>
                  <SelectTrigger id="fromStatusCode">
                    <SelectValue placeholder="Selecciona un estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {respelStatuses.map((status) => (
                      <SelectItem key={status.code} value={status.code}>
                        {status.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input id="fromStatusCode" value={transition?.from_status?.name ?? fromStatusCode} disabled />
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="toStatusCode">Hasta (estado destino)</Label>
              {mode === 'create' ? (
                <Select value={toStatusCode} onValueChange={(value) => setToStatusCode(value ?? '')}>
                  <SelectTrigger id="toStatusCode">
                    <SelectValue placeholder="Selecciona un estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {respelStatuses.map((status) => (
                      <SelectItem key={status.code} value={status.code}>
                        {status.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input id="toStatusCode" value={transition?.to_status?.name ?? toStatusCode} disabled />
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="isAutomatic"
              checked={isAutomatic}
              onCheckedChange={(checked) => setIsAutomatic(checked === true)}
            />
            <Label htmlFor="isAutomatic" className="font-normal">
              Transición automática
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="requiresApproval"
              checked={requiresApproval}
              onCheckedChange={(checked) => setRequiresApproval(checked === true)}
            />
            <Label htmlFor="requiresApproval" className="font-normal">
              Requiere aprobación
            </Label>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="addRole">Roles autorizados para ejecutar la transición</Label>
            <Select value={pendingRoleValue} onValueChange={(value) => handleAddRole(value ?? '')}>
              <SelectTrigger id="addRole">
                <SelectValue placeholder="Agregar un rol…" />
              </SelectTrigger>
              <SelectContent>
                {systemRoles.map((role) => (
                  <SelectItem key={`role-${role.id}`} value={`role:${role.id}`}>
                    {role.name} (rol de sistema)
                  </SelectItem>
                ))}
                {businessRoles.map((businessRole) => (
                  <SelectItem key={`business-${businessRole.id}`} value={`business:${businessRole.id}`}>
                    {businessRole.name} (rol de negocio)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap gap-2">
              {roleAssignments.length === 0 && (
                <span className="text-sm text-muted-foreground">Sin roles asignados.</span>
              )}
              {roleAssignments.map((assignment) => (
                <Badge key={assignment.key} variant="outline" className="gap-1">
                  {assignment.label}
                  <button
                    type="button"
                    aria-label={`Quitar ${assignment.label}`}
                    onClick={() => handleRemoveRole(assignment.key)}
                    className="ml-1"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving || !fromStatusCode.trim() || !toStatusCode.trim()}>
              {isSaving ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
