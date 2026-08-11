'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  createGeneratorGestorRelationship,
  fetchGeneratorGestorRelationships,
  revokeGeneratorGestorRelationship,
  type AdminGeneratorGestorRelationship,
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
 * Vínculo comercial DIRECTO Generador -> Gestor (Carga Masiva de
 * Generadores, confirmado por el usuario 2026-08-11) -- gestión de
 * `generator_gestor_relationships`. Calco exacto de
 * `GeneratorSubgestorRelationshipsListScreen.tsx`, roles invertidos (aquí
 * el Gestor registra/revoca) -- el backend y las funciones API ya existían
 * desde el lote de Carga Masiva; esta pantalla cierra el gap de frontend
 * (pedido explícito del usuario, 2026-08-11).
 *
 * Ruta PROPIA en el sidebar (NO embebida en `OrganizationDetailScreen`),
 * mismo motivo que su hermana: `GeneratorGestorRelationshipController::index()`
 * NO acepta un filtro por organización -- platform staff ve TODAS las
 * relaciones del sistema sin acotar.
 */
export function GeneratorGestorRelationshipsListScreen() {
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('generator_gestor_relationships.read')
  const router = useRouter()
  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const permissions = user?.permissions ?? []

  const [relationships, setRelationships] = useState<AdminGeneratorGestorRelationship[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [pendingRevoke, setPendingRevoke] = useState<AdminGeneratorGestorRelationship | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  function reload() {
    setIsLoading(true)
    return fetchGeneratorGestorRelationships({ page, perPage: PER_PAGE })
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
      await revokeGeneratorGestorRelationship(pendingRevoke.id)
      setPendingRevoke(null)
      reload()
    } catch (error) {
      setRevokeError(errorMessage(error, 'generator_gestor_relationship'))
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

  const canCreate = permissions.includes('generator_gestor_relationships.create')
  const canRevoke = permissions.includes('generator_gestor_relationships.revoke')

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  return (
    <div className="flex flex-col gap-4">
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
                <TableHead>Gestor</TableHead>
                <TableHead>Generador cliente</TableHead>
                <TableHead>Fecha de Registro</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relationships.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No hay relaciones Generador-Gestor registradas.
                  </TableCell>
                </TableRow>
              )}
              {relationships.map((relationship) => (
                <TableRow key={relationship.id}>
                  <TableCell>{relationship.gestor_organization?.legal_name ?? '—'}</TableCell>
                  <TableCell>{relationship.generator_organization?.legal_name ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {relationship.authorized_at ? formatDate(relationship.authorized_at) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={relationship.is_active ? 'default' : 'secondary'}>
                      {relationship.is_active ? 'Vigente' : 'Revocada'}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex justify-end gap-2">
                    {/* Pedido explícito del usuario, 2026-08-11: acceder a los
                        usuarios del Generador vinculado. Platform staff va al
                        detalle completo (OrganizationDetailScreen, tab
                        Usuarios); el Gestor dueño va a la pantalla acotada
                        LinkedGeneratorDetailScreen -- mismo criterio de
                        routing dual que UserDetailScreen.tsx. */}
                    {relationship.is_active && relationship.generator_organization && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          router.push(
                            isPlatformStaff
                              ? `/admin/organizations/${relationship.generator_organization!.id}`
                              : `/admin/generators/${relationship.generator_organization!.id}`
                          )
                        }
                      >
                        Ver usuarios
                      </Button>
                    )}
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
          Mostrando {rangeStart}–{rangeEnd} de {total} relaciones
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
            <AlertDialogTitle>Revocar relación</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Seguro que quieres dejar de ser el Gestor de {pendingRevoke?.generator_organization?.legal_name}? Las
            evaluaciones ya reenviadas bajo esta relación no se ven afectadas -- solo se bloquean reenvíos nuevos a
            partir de la revocación.
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
  const [gestorOrganizationId, setGestorOrganizationId] = useState<number | null>(null)
  const [gestorOrganizationLabel, setGestorOrganizationLabel] = useState<string | null>(null)
  const [generatorOrganizationId, setGeneratorOrganizationId] = useState<number | null>(null)
  const [generatorOrganizationLabel, setGeneratorOrganizationLabel] = useState<string | null>(null)
  const [observations, setObservations] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function reset() {
    setGestorOrganizationId(null)
    setGestorOrganizationLabel(null)
    setGeneratorOrganizationId(null)
    setGeneratorOrganizationLabel(null)
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
    if (!generatorOrganizationId || (isPlatformStaff && !gestorOrganizationId)) {
      setFormError('Selecciona la organización Generadora a registrar como cliente.')
      return
    }
    setIsSubmitting(true)
    try {
      await createGeneratorGestorRelationship({
        generator_organization_id: generatorOrganizationId,
        observations: observations.trim() || undefined,
        gestor_organization_id: isPlatformStaff ? (gestorOrganizationId ?? undefined) : undefined,
      })
      reset()
      onCreated()
    } catch (error) {
      setFormError(errorMessage(error, 'generator_organization_id'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button>+ Registrar Generador Cliente</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Generador Cliente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          {isPlatformStaff && (
            <OrganizationSearchSelect
              label="Organización Gestor"
              htmlId="generatorGestorRel-gestor"
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
          )}
          <OrganizationSearchSelect
            label="Organización Generadora"
            htmlId="generatorGestorRel-generator"
            capability="can_generate_waste"
            selectedId={generatorOrganizationId}
            selectedLabel={generatorOrganizationLabel}
            onSelect={(result) => {
              setGeneratorOrganizationId(result.id)
              setGeneratorOrganizationLabel(result.legal_name)
            }}
            onClear={() => {
              setGeneratorOrganizationId(null)
              setGeneratorOrganizationLabel(null)
            }}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="generatorGestorRel-observations">
              Observaciones <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <textarea
              id="generatorGestorRel-observations"
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
              {isSubmitting ? 'Registrando…' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
