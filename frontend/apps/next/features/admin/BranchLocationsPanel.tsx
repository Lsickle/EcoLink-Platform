'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  createBranchLocation,
  fetchBranchLocations,
  updateBranchLocation,
  type AdminBranchLocation,
} from 'app/features/admin/api'
import { useAuth } from 'app/provider/auth'

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

/**
 * CRUD MÍNIMO de "Muelles" (`branch_locations`, Fase 4 "Cita de Recepción en
 * Planta") -- tab propio de `BranchDetailScreen.tsx` (ver docblock de
 * `BranchLocationController`: el resto del DDL de canvas 2D de
 * `esquema-bd` -- coordenadas/capacidad/riesgo/EPP -- se difiere a una
 * feature futura, NO se construye aquí). Sin frame de Figma propio -- diseño
 * PROPUESTO, mismo lenguaje visual ya usado en `OrganizationContactsPanel.tsx`
 * (tabla + diálogo de creación + edición inline por fila).
 */
export function BranchLocationsPanel({ branchId }: { branchId: number | string }) {
  const { user } = useAuth()
  const permissions = user?.permissions ?? []
  // Defensa en profundidad -- mismo criterio ya aplicado al resto de
  // pantallas de este proyecto (ManifestLoadDetailScreen/OrganizationContactsPanel):
  // el backend ya rechaza con 403 sin estos permisos, pero se ocultan los
  // controles de escritura para no invitar a un intento que fallará.
  const canCreate = permissions.includes('branch_locations.create')
  const canUpdate = permissions.includes('branch_locations.update')

  const [locations, setLocations] = useState<AdminBranchLocation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<AdminBranchLocation | null>(null)

  function reload() {
    setIsLoading(true)
    return fetchBranchLocations({ branchId, perPage: 100 })
      .then((result) => {
        setLocations(result.data)
        setLoadError(null)
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Error inesperado.'))
      .finally(() => setIsLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    reload().finally(() => {
      if (cancelled) return
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId])

  return (
    <div className="flex flex-col gap-3">
      {canCreate && (
        <div className="flex justify-end">
          <CreateBranchLocationDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            branchId={branchId}
            onCreated={() => {
              setCreateOpen(false)
              reload()
            }}
          />
        </div>
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
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Estado</TableHead>
                {canUpdate && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canUpdate ? 4 : 3} className="text-center text-muted-foreground">
                    No hay muelles registrados para esta sede.
                  </TableCell>
                </TableRow>
              )}
              {locations.map((location) => (
                <TableRow key={location.id}>
                  <TableCell className="font-medium">{location.code}</TableCell>
                  <TableCell>{location.name}</TableCell>
                  <TableCell>
                    <Badge variant={location.is_active ? 'default' : 'secondary'}>
                      {location.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  {canUpdate && (
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => setEditing(location)}>
                        Editar
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EditBranchLocationDialog
        location={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSaved={() => {
          setEditing(null)
          reload()
        }}
      />
    </div>
  )
}

function CreateBranchLocationDialog({
  open,
  onOpenChange,
  branchId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  branchId: number | string
  onCreated: () => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function reset() {
    setCode('')
    setName('')
    setFormError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) reset()
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    if (!code.trim() || !name.trim()) {
      setFormError('Completa código y nombre.')
      return
    }
    setIsSubmitting(true)
    try {
      await createBranchLocation({ branch_id: Number(branchId), code: code.trim(), name: name.trim() })
      reset()
      onCreated()
    } catch (error) {
      setFormError(errorMessage(error, 'code'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button>+ Agregar Muelle</Button>} />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Agregar Muelle</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="branchLocation-code">Código</Label>
            <Input id="branchLocation-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Ej. M1" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="branchLocation-name">Nombre</Label>
            <Input
              id="branchLocation-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Muelle 1"
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
              {isSubmitting ? 'Creando…' : 'Crear Muelle'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditBranchLocationDialog({
  location,
  onOpenChange,
  onSaved,
}: {
  location: AdminBranchLocation | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (location) {
      setCode(location.code)
      setName(location.name)
      setIsActive(location.is_active)
      setFormError(null)
    }
  }, [location])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!location) return
    setFormError(null)
    if (!code.trim() || !name.trim()) {
      setFormError('Completa código y nombre.')
      return
    }
    setIsSubmitting(true)
    try {
      await updateBranchLocation(location.id, { code: code.trim(), name: name.trim(), is_active: isActive })
      onSaved()
    } catch (error) {
      setFormError(errorMessage(error, 'code'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={location !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar Muelle</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="editBranchLocation-code">Código</Label>
            <Input id="editBranchLocation-code" value={code} onChange={(event) => setCode(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="editBranchLocation-name">Nombre</Label>
            <Input id="editBranchLocation-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="editBranchLocation-isActive"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(checked === true)}
            />
            <Label htmlFor="editBranchLocation-isActive" className="font-normal">
              Activo
            </Label>
          </div>
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
