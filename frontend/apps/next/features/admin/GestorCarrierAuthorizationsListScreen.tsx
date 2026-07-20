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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  createGestorCarrierAuthorization,
  fetchGestorCarrierAuthorizations,
  revokeGestorCarrierAuthorization,
  type AdminGestorCarrierAuthorization,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from './OrganizationSearchSelect'

const PER_PAGE = 15

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

/**
 * "Modalidad 3" -- gestión de `gestor_carrier_authorizations` (Fase 4 "Cita
 * de Recepción en Planta", revisión especialista-seguridad). Sin frame de
 * Figma -- diseño PROPUESTO, mismo lenguaje visual ya usado en
 * `ManifestLoadsListScreen.tsx` (tabla + acciones por fila).
 *
 * Ruta PROPIA en el sidebar (NO embebida en `OrganizationDetailScreen`) --
 * decisión deliberada de este agente: `GestorCarrierAuthorizationController::index()`
 * NO acepta un filtro por organización (a diferencia de
 * `fetchBranchLocations()`), platform staff ve TODAS las autorizaciones del
 * sistema sin acotar a una organización puntual -- embeberla en el detalle
 * de UNA organización daría la falsa impresión de estar filtrada. Ver AVISO
 * completo en `fetchGestorCarrierAuthorizations()` (api.ts).
 */
export function GestorCarrierAuthorizationsListScreen() {
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('gestor_carrier_authorizations.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const permissions = user?.permissions ?? []

  const [authorizations, setAuthorizations] = useState<AdminGestorCarrierAuthorization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [pendingRevoke, setPendingRevoke] = useState<AdminGestorCarrierAuthorization | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  function reload() {
    setIsLoading(true)
    return fetchGestorCarrierAuthorizations({ page, perPage: PER_PAGE })
      .then((result) => {
        setAuthorizations(result.data)
        setLastPage(result.last_page)
        setTotal(result.total)
        setLoadError(null)
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Error inesperado.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    reload().finally(() => {
      if (cancelled) return
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized, page])

  async function handleConfirmRevoke() {
    if (!pendingRevoke) return
    setIsRevoking(true)
    setRevokeError(null)
    try {
      await revokeGestorCarrierAuthorization(pendingRevoke.id)
      setPendingRevoke(null)
      reload()
    } catch (error) {
      setRevokeError(errorMessage(error, 'gestor_carrier_authorization'))
    } finally {
      setIsRevoking(false)
    }
  }

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const canCreate = permissions.includes('gestor_carrier_authorizations.create')
  const canRevoke = permissions.includes('gestor_carrier_authorizations.revoke')

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        {canCreate && (
          <CreateAuthorizationDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            isPlatformStaff={isPlatformStaff}
            onCreated={() => {
              setCreateOpen(false)
              reload()
            }}
          />
        )}
      </div>

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}
      {revokeError && (
        <p className="text-sm text-destructive" role="alert">
          {revokeError}
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
                <TableHead>Gestor</TableHead>
                <TableHead>Transportador</TableHead>
                <TableHead>Fecha de Autorización</TableHead>
                <TableHead>Estado</TableHead>
                {canRevoke && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {authorizations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canRevoke ? 5 : 4} className="text-center text-muted-foreground">
                    No hay autorizaciones de transportador registradas.
                  </TableCell>
                </TableRow>
              )}
              {authorizations.map((authorization) => (
                <TableRow key={authorization.id}>
                  <TableCell>{authorization.gestor_organization?.legal_name ?? '—'}</TableCell>
                  <TableCell>{authorization.carrier_organization?.legal_name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {authorization.authorized_at ? formatDate(authorization.authorized_at) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={authorization.is_active ? 'default' : 'secondary'}>
                      {authorization.is_active ? 'Vigente' : 'Revocada'}
                    </Badge>
                  </TableCell>
                  {canRevoke && (
                    <TableCell className="text-right">
                      {authorization.is_active && (
                        <Button variant="outline" size="sm" onClick={() => setPendingRevoke(authorization)}>
                          Revocar
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="text-sm text-muted-foreground">
          Mostrando {rangeStart}–{rangeEnd} de {total} autorizaciones
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {lastPage}
          </span>
          <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => setPage((current) => current + 1)}>
            Siguiente
          </Button>
        </div>
      </div>

      <AlertDialog open={pendingRevoke !== null} onOpenChange={(open) => !open && setPendingRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocar autorización</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Seguro que quieres revocar la autorización de {pendingRevoke?.carrier_organization?.legal_name}? Las
            programaciones ya creadas bajo esta autorización no se ven afectadas -- solo se bloquean programaciones
            nuevas a partir de la revocación.
          </p>
          <AlertDialogFooter>
            <Button variant="outline" disabled={isRevoking} onClick={() => setPendingRevoke(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={isRevoking} onClick={handleConfirmRevoke}>
              {isRevoking ? 'Revocando…' : 'Confirmar revocación'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CreateAuthorizationDialog({
  open,
  onOpenChange,
  isPlatformStaff,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isPlatformStaff: boolean
  onCreated: () => void
}) {
  const [gestorOrganizationId, setGestorOrganizationId] = useState<number | null>(null)
  const [gestorOrganizationLabel, setGestorOrganizationLabel] = useState<string | null>(null)
  const [carrierOrganizationId, setCarrierOrganizationId] = useState<number | null>(null)
  const [carrierOrganizationLabel, setCarrierOrganizationLabel] = useState<string | null>(null)
  const [observations, setObservations] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function reset() {
    setGestorOrganizationId(null)
    setGestorOrganizationLabel(null)
    setCarrierOrganizationId(null)
    setCarrierOrganizationLabel(null)
    setObservations('')
    setFormError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) reset()
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    if (!carrierOrganizationId || (isPlatformStaff && !gestorOrganizationId)) {
      setFormError('Selecciona la organización transportadora a autorizar.')
      return
    }
    setIsSubmitting(true)
    try {
      await createGestorCarrierAuthorization({
        carrier_organization_id: carrierOrganizationId,
        observations: observations.trim() || undefined,
        gestor_organization_id: isPlatformStaff ? (gestorOrganizationId ?? undefined) : undefined,
      })
      reset()
      onCreated()
    } catch (error) {
      setFormError(errorMessage(error, 'carrier_organization_id'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button>+ Autorizar Transportador</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Autorizar Transportador Independiente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          {isPlatformStaff && (
            <OrganizationSearchSelect
              label="Organización Gestor"
              htmlId="gestorCarrierAuth-gestor"
              selectedId={gestorOrganizationId}
              selectedLabel={gestorOrganizationLabel}
              onSelect={(result) => {
                setGestorOrganizationId(result.id)
                setGestorOrganizationLabel(result.legal_name)
              }}
              onClear={() => {
                setGestorOrganizationId(null)
                setGestorOrganizationLabel(null)
              }}
            />
          )}
          <OrganizationSearchSelect
            label="Organización Transportadora"
            htmlId="gestorCarrierAuth-carrier"
            capability="can_transport_waste"
            selectedId={carrierOrganizationId}
            selectedLabel={carrierOrganizationLabel}
            onSelect={(result) => {
              setCarrierOrganizationId(result.id)
              setCarrierOrganizationLabel(result.legal_name)
            }}
            onClear={() => {
              setCarrierOrganizationId(null)
              setCarrierOrganizationLabel(null)
            }}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gestorCarrierAuth-observations">
              Observaciones <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <textarea
              id="gestorCarrierAuth-observations"
              className="min-h-16 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={observations}
              onChange={(event) => setObservations(event.target.value)}
            />
          </div>
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Autorizando…' : 'Autorizar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
