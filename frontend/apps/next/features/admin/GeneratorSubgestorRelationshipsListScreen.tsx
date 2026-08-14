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
  createGeneratorSubgestorRelationship,
  fetchGeneratorSubgestorRelationships,
  revokeGeneratorSubgestorRelationship,
  type AdminGeneratorSubgestorRelationship,
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
 * Cadena Generador -> Subgestor -> Gestor en Declaración de Residuos
 * (confirmado por stakeholders reales, 2026-08-09) -- gestión de
 * `generator_subgestor_relationships`. Sin frame de Figma -- diseño
 * PROPUESTO, MISMO patrón exacto que `GestorCarrierAuthorizationsListScreen.tsx`
 * (relación bilateral entre organizaciones, roles invertidos: aquí el
 * Subgestor registra/revoca).
 *
 * Ruta PROPIA en el sidebar (NO embebida en `OrganizationDetailScreen`),
 * mismo motivo que su hermana: `GeneratorSubgestorRelationshipController::index()`
 * NO acepta un filtro por organización -- platform staff ve TODAS las
 * relaciones del sistema sin acotar.
 */
export function GeneratorSubgestorRelationshipsListScreen() {
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('generator_subgestor_relationships.read')
  const router = useRouter()
  const isPlatformStaff = Boolean(user?.is_platform_staff)
  const permissions = user?.permissions ?? []

  const [relationships, setRelationships] = useState<AdminGeneratorSubgestorRelationship[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [pendingRevoke, setPendingRevoke] = useState<AdminGeneratorSubgestorRelationship | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  function reload() {
    setIsLoading(true)
    return fetchGeneratorSubgestorRelationships({ page, perPage: PER_PAGE })
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
      await revokeGeneratorSubgestorRelationship(pendingRevoke.id)
      setPendingRevoke(null)
      reload()
    } catch (error) {
      setRevokeError(errorMessage(error, 'generator_subgestor_relationship'))
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

  const canCreate = permissions.includes('generator_subgestor_relationships.create')
  const canRevoke = permissions.includes('generator_subgestor_relationships.revoke')

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
                <TableHead>Subgestor</TableHead>
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
                    No hay relaciones Generador-Subgestor registradas.
                  </TableCell>
                </TableRow>
              )}
              {relationships.map((relationship) => (
                <TableRow key={relationship.id}>
                  <TableCell>{relationship.subgestor_organization?.legal_name ?? '—'}</TableCell>
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
                        detalles del Generador vinculado (usuarios, sucursales y
                        contactos). Platform staff va al
                        detalle completo (OrganizationDetailScreen, tab
                        Usuarios); el Subgestor dueño va a la pantalla acotada
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
                        Ver detalles
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
            ¿Seguro que quieres dejar de ser el Subgestor de {pendingRevoke?.generator_organization?.legal_name}? Las
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
  const [subgestorOrganizationId, setSubgestorOrganizationId] = useState<number | null>(null)
  const [subgestorOrganizationLabel, setSubgestorOrganizationLabel] = useState<string | null>(null)
  const [generatorOrganizationId, setGeneratorOrganizationId] = useState<number | null>(null)
  const [generatorOrganizationLabel, setGeneratorOrganizationLabel] = useState<string | null>(null)
  const [observations, setObservations] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function reset() {
    setSubgestorOrganizationId(null)
    setSubgestorOrganizationLabel(null)
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
    if (!generatorOrganizationId || (isPlatformStaff && !subgestorOrganizationId)) {
      setFormError('Selecciona la organización Generadora a registrar como cliente.')
      return
    }
    setIsSubmitting(true)
    try {
      await createGeneratorSubgestorRelationship({
        generator_organization_id: generatorOrganizationId,
        observations: observations.trim() || undefined,
        subgestor_organization_id: isPlatformStaff ? (subgestorOrganizationId ?? undefined) : undefined,
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
              label="Organización Subgestor"
              htmlId="generatorSubgestorRel-subgestor"
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
            label="Organización Generadora"
            htmlId="generatorSubgestorRel-generator"
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
            <Label htmlFor="generatorSubgestorRel-observations">
              Observaciones <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <textarea
              id="generatorSubgestorRel-observations"
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
