'use client'

import { useEffect, useState } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  approveInvitationRequest,
  fetchInvitationRequests,
  fetchRoles,
  rejectInvitationRequest,
  type AdminInvitationRequest,
  type AdminRole,
  type InvitationRequestStatus,
} from 'app/features/admin/api'
import { useRequireAuth } from 'app/provider/auth'

const PER_PAGE = 15

type StatusFilter = InvitationRequestStatus | 'ALL'

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'APPROVED', label: 'Aprobadas' },
  { value: 'REJECTED', label: 'Rechazadas' },
  { value: 'ALL', label: 'Todas' },
]

function statusLabel(status: InvitationRequestStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pendiente'
    case 'APPROVED':
      return 'Aprobada'
    case 'REJECTED':
      return 'Rechazada'
  }
}

function statusBadgeVariant(status: InvitationRequestStatus): 'secondary' | 'default' | 'destructive' {
  switch (status) {
    case 'PENDING':
      return 'secondary'
    case 'APPROVED':
      return 'default'
    case 'REJECTED':
      return 'destructive'
  }
}

function fullName(request: AdminInvitationRequest): string {
  return [request.first_name, request.middle_name, request.last_name, request.second_last_name]
    .filter(Boolean)
    .join(' ')
}

/**
 * CU-006.1 modificado (mecanismo de invitación, reemplaza el registro
 * público eliminado): cola de solicitudes públicas
 * (InvitationRequestController) revisadas por un administrador.
 *
 * Hallazgo Alto (especialista-seguridad, 2026-07-14): `invitation_requests`
 * es una cola global sin frontera de tenant -- `index()`/`approve()`/
 * `reject()` ahora exigen AMBOS: el permiso `users.create` (mismo permiso
 * que Crear Usuario, subido desde `users.read` porque el dato listado es PII
 * cross-tenant) y ser staff de la organización PLATAFORMA
 * (`is_platform_staff`, decisión explícita del usuario del proyecto -- ver
 * InvitationRequestController). Este gate es defensa en profundidad; el
 * backend ya rechaza con 403 de todas formas.
 */
export function InvitationRequestsListScreen() {
  const { isAuthorized } = useRequireAuth('users.create', { requirePlatformStaff: true })

  const [requests, setRequests] = useState<AdminInvitationRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING')
  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)

  const [roles, setRoles] = useState<AdminRole[]>([])

  const [approving, setApproving] = useState<AdminInvitationRequest | null>(null)
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([])
  const [approveError, setApproveError] = useState<string | null>(null)
  const [isApproving, setIsApproving] = useState(false)

  const [rejecting, setRejecting] = useState<AdminInvitationRequest | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectError, setRejectError] = useState<string | null>(null)
  const [isRejecting, setIsRejecting] = useState(false)

  useEffect(() => {
    if (!isAuthorized) return
    fetchRoles({ perPage: 100 })
      .then((result) => setRoles(result.data))
      .catch(() => setRoles([]))
  }, [isAuthorized])

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    setIsLoading(true)
    fetchInvitationRequests({ status: statusFilter === 'ALL' ? undefined : statusFilter, page, perPage: PER_PAGE })
      .then((result) => {
        if (cancelled) return
        setRequests(result.data)
        setLastPage(result.last_page)
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
  }, [isAuthorized, statusFilter, page])

  function handleStatusFilterChange(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function openApprove(request: AdminInvitationRequest) {
    setApproveError(null)
    setSelectedRoleIds([])
    setApproving(request)
  }

  function toggleRole(roleId: number) {
    setSelectedRoleIds((current) => (current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId]))
  }

  async function handleConfirmApprove() {
    const request = approving
    if (!request) return
    // RN-027 (CU-006.7): todo usuario debe tener al menos un rol -- el
    // backend lo exige igual (422 role_ids), esta validación es solo UX.
    if (selectedRoleIds.length === 0) {
      setApproveError('Selecciona al menos un rol.')
      return
    }
    setIsApproving(true)
    setApproveError(null)
    try {
      const { invitation_request: updated } = await approveInvitationRequest(request.id, { role_ids: selectedRoleIds })
      setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setApproving(null)
    } catch (error) {
      setApproveError(
        error instanceof ApiValidationError
          ? (error.firstError('invitation_request') ?? error.firstError('role_ids') ?? error.message)
          : error instanceof Error
            ? error.message
            : 'Error inesperado.'
      )
    } finally {
      setIsApproving(false)
    }
  }

  function openReject(request: AdminInvitationRequest) {
    setRejectError(null)
    setRejectReason('')
    setRejecting(request)
  }

  async function handleConfirmReject() {
    const request = rejecting
    if (!request) return
    setIsRejecting(true)
    setRejectError(null)
    try {
      const { invitation_request: updated } = await rejectInvitationRequest(request.id, {
        reason: rejectReason.trim() || undefined,
      })
      setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      setRejecting(null)
    } catch (error) {
      setRejectError(
        error instanceof ApiValidationError
          ? (error.firstError('invitation_request') ?? error.message)
          : error instanceof Error
            ? error.message
            : 'Error inesperado.'
      )
    } finally {
      setIsRejecting(false)
    }
  }

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={statusFilter} onValueChange={(value) => handleStatusFilterChange(value as StatusFilter)}>
          <SelectTrigger aria-label="Filtrar por estado" className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
                <TableHead>Nombre</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No hay solicitudes que coincidan con el filtro.
                  </TableCell>
                </TableRow>
              )}
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">{fullName(request)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {request.document_type} {request.document_number}
                  </TableCell>
                  <TableCell>{request.email}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(request.status)}>{statusLabel(request.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {request.status === 'PENDING' ? (
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openApprove(request)}>
                          Aprobar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openReject(request)}>
                          Rechazar
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {request.status === 'REJECTED' && request.rejection_reason
                          ? request.rejection_reason
                          : 'Ya revisada'}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
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

      <AlertDialog open={approving !== null} onOpenChange={(open) => !open && setApproving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprobar solicitud de {approving ? fullName(approving) : ''}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label>Roles</Label>
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              {roles.length === 0 && <p className="text-sm text-muted-foreground">No hay roles disponibles.</p>}
              {roles.map((role) => (
                <div key={role.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`approve-role-${role.id}`}
                    checked={selectedRoleIds.includes(role.id)}
                    onCheckedChange={() => toggleRole(role.id)}
                  />
                  <Label htmlFor={`approve-role-${role.id}`} className="font-normal">
                    {role.name}
                  </Label>
                </div>
              ))}
            </div>
            {approveError && (
              <p className="text-sm text-destructive" role="alert">
                {approveError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <Button variant="outline" disabled={isApproving} onClick={() => setApproving(null)}>
              Cancelar
            </Button>
            <Button disabled={isApproving} onClick={handleConfirmApprove}>
              {isApproving ? 'Aprobando…' : 'Confirmar aprobación'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechazar solicitud de {rejecting ? fullName(rejecting) : ''}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rejectReason">
              Motivo <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input id="rejectReason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
            {rejectError && (
              <p className="text-sm text-destructive" role="alert">
                {rejectError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <Button variant="outline" disabled={isRejecting} onClick={() => setRejecting(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={isRejecting} onClick={handleConfirmReject}>
              {isRejecting ? 'Rechazando…' : 'Confirmar rechazo'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
