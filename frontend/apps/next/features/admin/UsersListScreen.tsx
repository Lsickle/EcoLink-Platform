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
  activateUser,
  deactivateUser,
  fetchRoles,
  fetchUsers,
  resendInvitation,
  resetUserPassword,
  type AdminRole,
  type AdminUser,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { userStatusBadgeClasses } from 'app/features/admin/userStatus'
import { useRequireAuth } from 'app/provider/auth'

// Los 5 códigos reales de UserStatus (esquema-bd/UserStatusSeeder) -- nunca
// inventar uno adicional. Etiquetas tomadas literal del seeder (name), no
// del mockup, para no divergir de la fuente de verdad del backend.
const statusFilterOptions: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'PENDING_ACTIVATION', label: 'Pendiente de activación' },
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'LOCKED', label: 'Bloqueado' },
  { value: 'SUSPENDED', label: 'Suspendido' },
  { value: 'INACTIVE', label: 'Inactivo' },
]

const PER_PAGE = 15

// Debounce de la búsqueda -- mismo umbral usado en RolesListScreen.tsx.
const SEARCH_DEBOUNCE_MS = 300

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// Cierre de brecha con Figma (lote 2026-07-14, mismo ejercicio ya cerrado
// hoy para Roles): filtros server-side (search/status/role, con debounce en
// la búsqueda) + columnas Último Acceso/Creación + badge de Estado con
// Bloqueado diferenciado de Inactivo/Suspendido (antes se agrupaban bajo el
// mismo badge gris, ver userStatus.ts) + menú de acciones por fila (antes
// botones sueltos Activar/Desactivar). RN-181 (guarda "último admin
// activo") se muestra tal cual llega del backend, ver deactivateUser en
// features/admin/api.ts.
export function UsersListScreen() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('users.read')

  const [users, setUsers] = useState<AdminUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [roleOptions, setRoleOptions] = useState<AdminRole[]>([])

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [pendingDeactivation, setPendingDeactivation] = useState<AdminUser | null>(null)
  const [pendingResetPassword, setPendingResetPassword] = useState<AdminUser | null>(null)
  const [actionErrors, setActionErrors] = useState<Record<number, string>>({})
  const [actionMessages, setActionMessages] = useState<Record<number, string>>({})
  const [busyUserId, setBusyUserId] = useState<number | null>(null)

  // Catálogo de roles para el filtro "Rol" -- mismo perPage:100 ya usado en
  // RoleDetailScreen.tsx para poblar su selector "Asignar a usuario".
  useEffect(() => {
    if (!isAuthorized) return
    fetchRoles({ perPage: 100 })
      .then((result) => setRoleOptions(result.data))
      .catch(() => {
        // El filtro de rol es un extra sobre la tabla ya funcional -- un
        // fallo aquí no debe bloquear el listado de usuarios.
      })
  }, [isAuthorized])

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
    fetchUsers({
      page,
      perPage: PER_PAGE,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      role: roleFilter === 'all' ? undefined : roleFilter,
    })
      .then((result) => {
        if (cancelled) return
        setUsers(result.data)
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
  }, [isAuthorized, page, search, statusFilter, roleFilter])

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleRoleFilterChange(value: string) {
    setRoleFilter(value)
    setPage(1)
  }

  async function handleActivate(user: AdminUser) {
    setBusyUserId(user.id)
    setActionErrors((current) => ({ ...current, [user.id]: '' }))
    try {
      const { user: updated } = await activateUser(user.id)
      setUsers((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
    } catch (error) {
      setActionErrors((current) => ({ ...current, [user.id]: errorMessage(error, 'user') }))
    } finally {
      setBusyUserId(null)
    }
  }

  async function handleConfirmDeactivate() {
    const user = pendingDeactivation
    if (!user) return
    setBusyUserId(user.id)
    setActionErrors((current) => ({ ...current, [user.id]: '' }))
    try {
      const { user: updated } = await deactivateUser(user.id)
      setUsers((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)))
      setPendingDeactivation(null)
    } catch (error) {
      setActionErrors((current) => ({ ...current, [user.id]: errorMessage(error, 'user') }))
      // El diálogo se cierra igual -- el mensaje de error queda visible en
      // la fila del usuario (RN-181, guarda "último admin activo").
      setPendingDeactivation(null)
    } finally {
      setBusyUserId(null)
    }
  }

  async function handleResendInvitation(user: AdminUser) {
    setBusyUserId(user.id)
    setActionErrors((current) => ({ ...current, [user.id]: '' }))
    setActionMessages((current) => ({ ...current, [user.id]: '' }))
    try {
      const { message } = await resendInvitation(user.id)
      setActionMessages((current) => ({ ...current, [user.id]: message }))
    } catch (error) {
      setActionErrors((current) => ({ ...current, [user.id]: errorMessage(error, 'user') }))
    } finally {
      setBusyUserId(null)
    }
  }

  async function handleConfirmResetPassword() {
    const user = pendingResetPassword
    if (!user) return
    setBusyUserId(user.id)
    setActionErrors((current) => ({ ...current, [user.id]: '' }))
    setActionMessages((current) => ({ ...current, [user.id]: '' }))
    try {
      const { message } = await resetUserPassword(user.id)
      setActionMessages((current) => ({ ...current, [user.id]: message }))
      setPendingResetPassword(null)
    } catch (error) {
      setActionErrors((current) => ({ ...current, [user.id]: errorMessage(error, 'user') }))
      setPendingResetPassword(null)
    } finally {
      setBusyUserId(null)
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
          <Input
            placeholder="Buscar por nombre, correo o usuario…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar usuarios"
          />
          <Select
            items={statusFilterOptions}
            value={statusFilter}
            onValueChange={(value) => handleStatusFilterChange(value as string)}
          >
            <SelectTrigger aria-label="Filtrar por estado" className="w-full sm:w-52">
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
            items={[{ value: 'all', label: 'Todos' }, ...roleOptions.map((role) => ({ value: role.code, label: role.name }))]}
            value={roleFilter}
            onValueChange={(value) => handleRoleFilterChange(value as string)}
          >
            <SelectTrigger aria-label="Filtrar por rol" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {roleOptions.map((role) => (
                <SelectItem key={role.id} value={role.code}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => router.push('/admin/users/new')}>+ Crear Usuario</Button>
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
                <TableHead>Usuario</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Último Acceso</TableHead>
                <TableHead>Creación</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No hay usuarios que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {users.map((user) => {
                const isActive = user.status.code === 'ACTIVE'
                const isPendingActivation = user.status.code === 'PENDING_ACTIVATION'
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => router.push(`/admin/users/${user.id}`)}
                      >
                        <div className="font-medium">{user.person.full_name}</div>
                        <div className="text-xs text-muted-foreground">@{user.username}</div>
                      </button>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge className={userStatusBadgeClasses(user.status.code)}>{user.status.name}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length === 0 && <span className="text-xs text-muted-foreground">Sin roles</span>}
                        {user.roles.map((role) => (
                          <Badge key={role.id} variant="outline">
                            {role.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.last_login_at ? formatDate(user.last_login_at) : 'Nunca'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.created_at ? formatDate(user.created_at) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="outline" size="sm" aria-label={`Acciones para ${user.person.full_name}`}>
                                <MoreHorizontal className="size-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/admin/users/${user.id}`)}>Ver</DropdownMenuItem>
                            {/* "Editar" navega al mismo detalle: UserDetailScreen ya muestra el
                                formulario de edición inline (mismo criterio ya usado para roles,
                                ver RolesListScreen.tsx) -- no existe un "modo edición" separado. */}
                            <DropdownMenuItem onClick={() => router.push(`/admin/users/${user.id}`)}>
                              Editar
                            </DropdownMenuItem>
                            {isActive ? (
                              <DropdownMenuItem
                                disabled={busyUserId === user.id}
                                onClick={() => setPendingDeactivation(user)}
                              >
                                Inactivar
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem disabled={busyUserId === user.id} onClick={() => handleActivate(user)}>
                                Activar
                              </DropdownMenuItem>
                            )}
                            {isPendingActivation && (
                              <DropdownMenuItem
                                disabled={busyUserId === user.id}
                                onClick={() => handleResendInvitation(user)}
                              >
                                Reenviar invitación
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              disabled={busyUserId === user.id}
                              onClick={() => setPendingResetPassword(user)}
                            >
                              Restablecer contraseña
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {actionErrors[user.id] && (
                          <p className="max-w-56 text-right text-xs text-destructive" role="alert">
                            {actionErrors[user.id]}
                          </p>
                        )}
                        {actionMessages[user.id] && (
                          <p className="max-w-56 text-right text-xs text-muted-foreground" role="status">
                            {actionMessages[user.id]}
                          </p>
                        )}
                      </div>
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
          Mostrando {rangeStart}–{rangeEnd} de {total} usuarios
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

      <AlertDialog open={pendingDeactivation !== null} onOpenChange={(open) => !open && setPendingDeactivation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inactivar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres inactivar a {pendingDeactivation?.person.full_name}? No podrá iniciar sesión hasta
              que se reactive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busyUserId === pendingDeactivation?.id}
              onClick={handleConfirmDeactivate}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restablecer contraseña dispara un correo real al usuario objetivo
          (ver PasswordResetOtpService::issueFor()) -- confirmación previa,
          mismo criterio que cualquier acción con efecto secundario real. */}
      <AlertDialog
        open={pendingResetPassword !== null}
        onOpenChange={(open) => !open && setPendingResetPassword(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restablecer contraseña</AlertDialogTitle>
            <AlertDialogDescription>
              Se enviará un código de verificación al correo de {pendingResetPassword?.person.full_name} (
              {pendingResetPassword?.email}) para restablecer su contraseña. ¿Deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyUserId === pendingResetPassword?.id}
              onClick={handleConfirmResetPassword}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
