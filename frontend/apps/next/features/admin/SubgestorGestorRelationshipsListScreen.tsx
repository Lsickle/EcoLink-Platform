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
  createSubgestorGestorRelationship,
  fetchSubgestorGestorRelationships,
  revokeSubgestorGestorRelationship,
  type AdminSubgestorGestorRelationship,
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
 * Vínculo comercial Subgestor -> Gestor (Fase 2 del ciclo de vida del residuo,
 * 2026-08-15) -- gestión de `subgestor_gestor_relationships`. Mismo patrón que
 * `GeneratorGestorRelationshipsListScreen`, con una diferencia de fondo: aquí
 * el lado que gestiona es el SUBGESTOR, porque un Gestor DE REFERENCIA no
 * tiene usuarios en la plataforma que pudieran autorizar nada.
 *
 * Para qué sirve: solo se puede registrar una asignación de tratamiento en
 * nombre de un Gestor con el que exista este vínculo activo. Sin él, un
 * Subgestor con el permiso podría hacerlo sobre cualquier Gestor del sistema.
 *
 * Ruta PROPIA en el sidebar, mismo motivo que sus hermanas: `index()` no
 * acepta filtro por organización -- platform staff ve TODAS.
 */
export function SubgestorGestorRelationshipsListScreen() {
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('subgestor_gestor_relationships.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const permissions = user?.permissions ?? []

  const [relationships, setRelationships] = useState<AdminSubgestorGestorRelationship[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [pendingRevoke, setPendingRevoke] = useState<AdminSubgestorGestorRelationship | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  function reload() {
    setIsLoading(true)
    return fetchSubgestorGestorRelationships({ page, perPage: PER_PAGE })
      .then((result) => {
        setRelationships(result.data)
        setLastPage(result.last_page)
        setTotal(result.total)
        setLoadError(null)
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Error inesperado.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    if (!isAuthorized) return
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized, page])

  async function handleConfirmRevoke() {
    if (!pendingRevoke) return
    setIsRevoking(true)
    setRevokeError(null)
    try {
      await revokeSubgestorGestorRelationship(pendingRevoke.id)
      setPendingRevoke(null)
      reload()
    } catch (error) {
      setRevokeError(errorMessage(error, 'subgestor_gestor_relationship'))
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

  const canCreate = permissions.includes('subgestor_gestor_relationships.create')
  const canRevoke = permissions.includes('subgestor_gestor_relationships.revoke')

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Los Gestores vinculados aquí son aquellos a los que puedes registrarles una evaluación que hayan resuelto en su
        propia plataforma. Sin vínculo activo no se puede asignar tratamiento en su nombre.
      </p>

      <div className="flex justify-end">
        {canCreate && (
          <CreateRelationshipDialog
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
                <TableHead>Subgestor</TableHead>
                <TableHead>Gestor vinculado</TableHead>
                <TableHead>Fecha de Registro</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relationships.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No hay Gestores vinculados todavía.
                  </TableCell>
                </TableRow>
              )}
              {relationships.map((relationship) => (
                <TableRow key={relationship.id}>
                  <TableCell>{relationship.subgestor_organization?.legal_name ?? '—'}</TableCell>
                  <TableCell>{relationship.gestor_organization?.legal_name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {relationship.authorized_at ? formatDate(relationship.authorized_at) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={relationship.is_active ? 'default' : 'secondary'}>
                      {relationship.is_active ? 'Vigente' : 'Revocado'}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    {canRevoke && relationship.is_active && (
                      <Button variant="outline" size="sm" onClick={() => setPendingRevoke(relationship)}>
                        Revocar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="text-sm text-muted-foreground">
          Mostrando {rangeStart}–{rangeEnd} de {total} vínculos
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
            <AlertDialogTitle>Revocar vínculo</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Seguro que quieres revocar el vínculo con {pendingRevoke?.gestor_organization?.legal_name}? Las
            evaluaciones ya registradas en su nombre no se ven afectadas y conservan su trazabilidad — solo se bloquean
            asignaciones nuevas a partir de la revocación.
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

function CreateRelationshipDialog({
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
  const [subgestorOrganizationId, setSubgestorOrganizationId] = useState<number | null>(null)
  const [subgestorOrganizationLabel, setSubgestorOrganizationLabel] = useState<string | null>(null)
  const [gestorOrganizationId, setGestorOrganizationId] = useState<number | null>(null)
  const [gestorOrganizationLabel, setGestorOrganizationLabel] = useState<string | null>(null)
  const [observations, setObservations] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function reset() {
    setSubgestorOrganizationId(null)
    setSubgestorOrganizationLabel(null)
    setGestorOrganizationId(null)
    setGestorOrganizationLabel(null)
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
    if (!gestorOrganizationId || (isPlatformStaff && !subgestorOrganizationId)) {
      setFormError('Selecciona la organización Gestor a vincular.')
      return
    }
    setIsSubmitting(true)
    try {
      await createSubgestorGestorRelationship({
        gestor_organization_id: gestorOrganizationId,
        observations: observations.trim() || undefined,
        subgestor_organization_id: isPlatformStaff ? (subgestorOrganizationId ?? undefined) : undefined,
      })
      reset()
      onCreated()
    } catch (error) {
      setFormError(errorMessage(error, 'gestor_organization_id'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button>+ Vincular Gestor</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular Gestor</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          {isPlatformStaff && (
            <OrganizationSearchSelect
              label="Organización Subgestora"
              htmlId="subgestorGestorRel-subgestor"
              // Un Subgestor se identifica por `can_transport_waste`, NO por
              // `can_treat_waste` -- misma convención que
              // `GeneratorSubgestorRelationshipController`. Con el filtro
              // equivocado el selector no encontraba ninguna organización.
              capability="can_transport_waste"
              selectedId={subgestorOrganizationId}
              selectedLabel={subgestorOrganizationLabel}
              onSelect={(result) => {
                setSubgestorOrganizationId(result.id)
                setSubgestorOrganizationLabel(result.legal_name)
              }}
              onClear={() => {
                setSubgestorOrganizationId(null)
                setSubgestorOrganizationLabel(null)
              }}
            />
          )}
          <OrganizationSearchSelect
            label="Organización Gestor"
            htmlId="subgestorGestorRel-gestor"
            capability="can_treat_waste"
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subgestorGestorRel-observations">
              Observaciones <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <textarea
              id="subgestorGestorRel-observations"
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
              {isSubmitting ? 'Vinculando…' : 'Vincular'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
