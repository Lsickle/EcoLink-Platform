'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  activateRole,
  deactivateRole,
  deleteRole,
  fetchRoles,
  type AdminRole,
} from 'app/features/admin/api'
import { priorityLevelOptions } from 'app/features/admin/schemas'
import { RISK_LEVEL_CLASSES, RISK_LEVEL_LABELS } from 'app/features/admin/riskLevel'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'

type StatusFilter = 'all' | 'active' | 'inactive'
type TypeFilter = 'all' | 'system' | 'custom'

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
]

const typeFilterOptions: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'system', label: 'Sistema' },
  { value: 'custom', label: 'Personalizado' },
]

const perPageOptions = [10, 25, 50] as const

// Debounce de la búsqueda -- mismo umbral usado en el resto de formularios
// de este proyecto que esperan input del usuario antes de disparar red.
const SEARCH_DEBOUNCE_MS = 300

function priorityLabel(level: number): string {
  return priorityLevelOptions.find((option) => option.value === level)?.label ?? String(level)
}

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// CU de gestión de roles (RBAC): tabla con filtros/orden (Figma "Roles
// Management", lote 3) + wizard de creación (/admin/roles/new) + menú de
// acciones por fila (ver/editar/activar-inactivar/eliminar -- solo si
// is_editable=true, los roles de sistema como ADMINISTRADOR nunca lo son).
export function RolesListScreen() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('roles.read')

  const [roles, setRoles] = useState<AdminRole[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number>(perPageOptions[0])
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [pendingDelete, setPendingDelete] = useState<AdminRole | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const [busyRoleId, setBusyRoleId] = useState<number | null>(null)
  const [actionErrors, setActionErrors] = useState<Record<number, string>>({})

  // Debounce: solo actualiza `search` (y dispara refetch) SEARCH_DEBOUNCE_MS
  // después de que el usuario deja de escribir.
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [searchInput])

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    setIsLoading(true)
    fetchRoles({
      page,
      perPage,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      type: typeFilter === 'all' ? undefined : typeFilter,
    })
      .then((result) => {
        if (cancelled) return
        setRoles(result.data)
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
  }, [isAuthorized, page, perPage, search, statusFilter, typeFilter])

  function handleStatusFilterChange(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleTypeFilterChange(value: TypeFilter) {
    setTypeFilter(value)
    setPage(1)
  }

  function handlePerPageChange(value: string | null) {
    if (!value) return
    setPerPage(Number(value))
    setPage(1)
  }

  async function handleToggleActive(role: AdminRole) {
    setBusyRoleId(role.id)
    setActionErrors((current) => ({ ...current, [role.id]: '' }))
    try {
      // activate()/deactivate() devuelven el modelo base sin
      // users_count/permissions_count/risk_level (ver contrato del lote) --
      // se mergea con la fila ya cargada para no perderlos en la tabla.
      const { role: updated } = role.is_active ? await deactivateRole(role.id) : await activateRole(role.id)
      setRoles((current) => current.map((item) => (item.id === role.id ? { ...item, ...updated } : item)))
    } catch (error) {
      setActionErrors((current) => ({ ...current, [role.id]: errorMessage(error, 'role') }))
    } finally {
      setBusyRoleId(null)
    }
  }

  async function handleConfirmDelete() {
    const role = pendingDelete
    if (!role) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteRole(role.id)
      setRoles((current) => current.filter((item) => item.id !== role.id))
      setTotal((current) => Math.max(0, current - 1))
      setPendingDelete(null)
    } catch (error) {
      setDeleteError(errorMessage(error, 'role'))
      setPendingDelete(null)
    } finally {
      setIsDeleting(false)
    }
  }

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1
  const rangeEnd = Math.min(page * perPage, total)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Buscar por nombre o descripción…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar roles"
          />
          <Select
            items={statusFilterOptions}
            value={statusFilter}
            onValueChange={(value) => handleStatusFilterChange(value as StatusFilter)}
          >
            <SelectTrigger aria-label="Filtrar por estado" className="w-full sm:w-40">
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
          <Select
            items={typeFilterOptions}
            value={typeFilter}
            onValueChange={(value) => handleTypeFilterChange(value as TypeFilter)}
          >
            <SelectTrigger aria-label="Filtrar por tipo" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => router.push('/admin/roles/new')}>+ Crear Rol</Button>
      </div>

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}
      {deleteError && (
        <p className="text-sm text-destructive" role="alert">
          {deleteError}
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
                <TableHead>Código</TableHead>
                <TableHead>Nivel</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead>Usuarios</TableHead>
                <TableHead>Permisos</TableHead>
                <TableHead>Nivel de Riesgo</TableHead>
                <TableHead>Creación</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    No hay roles que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => router.push(`/admin/roles/${role.id}`)}
                    >
                      {role.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{role.code}</TableCell>
                  <TableCell>{priorityLabel(role.priority_level)}</TableCell>
                  <TableCell>
                    <Badge variant={role.is_system ? 'secondary' : 'outline'}>
                      {role.is_system ? 'Sistema' : 'Personalizado'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={role.is_active ? 'default' : 'secondary'}>
                      {role.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell>{role.users_count}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{role.permissions_count} permisos</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={RISK_LEVEL_CLASSES[role.risk_level]}>{RISK_LEVEL_LABELS[role.risk_level]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(role.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="outline" size="sm" aria-label={`Acciones para ${role.name}`}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/admin/roles/${role.id}`)}>Ver</DropdownMenuItem>
                          {/* "Editar" navega al mismo detalle: RoleDetailScreen ya muestra el
                              formulario de edición inline cuando is_editable=true (mismo
                              patrón que UserDetailScreen) -- no existe un "modo edición"
                              separado en este proyecto, ver resumen del lote. */}
                          <DropdownMenuItem onClick={() => router.push(`/admin/roles/${role.id}`)}>
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!role.is_editable || busyRoleId === role.id}
                            onClick={() => handleToggleActive(role)}
                          >
                            {role.is_active ? 'Inactivar' : 'Activar'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={!role.is_editable}
                            onClick={() => setPendingDelete(role)}
                          >
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {actionErrors[role.id] && (
                        <p className="max-w-56 text-right text-xs text-destructive" role="alert">
                          {actionErrors[role.id]}
                        </p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Mostrando {rangeStart}–{rangeEnd} de {total} roles
          </span>
          <Select value={String(perPage)} onValueChange={handlePerPageChange}>
            <SelectTrigger aria-label="Filas por página" className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {perPageOptions.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar rol</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres eliminar el rol {pendingDelete?.name}? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isDeleting} onClick={handleConfirmDelete}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
