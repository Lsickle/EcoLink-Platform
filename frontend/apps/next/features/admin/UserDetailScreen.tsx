'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  ApiValidationError,
  activateUser,
  assignRoleToUser,
  deactivateUser,
  fetchRole,
  fetchRoles,
  fetchUser,
  fetchUserActivity,
  resendInvitation,
  resetUserPassword,
  revokeRoleFromUser,
  updateUser,
  type AdminPermission,
  type AdminRole,
  type AdminUser,
  type AdminUserRole,
  type UserActivityEvent,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { moduleLabel } from 'app/features/admin/moduleLabels'
import { userStatusBadgeClasses } from 'app/features/admin/userStatus'
import { useRequireAuth } from 'app/provider/auth'

// El backend NUNCA borra una asignación user_roles al revocar un rol (RN-027,
// UserManagementController::revokeRole()) -- solo desactiva el pivote
// (`is_active=false`). `roles()` no filtra por pivote, así que
// `user.roles` (de fetchUser()/show()) puede incluir asignaciones YA
// revocadas -- se filtran aquí en TODOS los usos (header, tab Roles, conteo
// del panel lateral, derivación de permisos efectivos) para no mostrar un
// rol revocado como si siguiera activo. Un `pivot` ausente (fixtures de
// test, o roles recién asignados en esta misma sesión sin recargar) se
// trata como activo por defecto.
function isActiveRoleAssignment(role: AdminUserRole): boolean {
  return role.pivot?.is_active !== false
}

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

function initialsOf(user: AdminUser): string {
  const first = user.person.first_name?.[0] ?? ''
  const last = user.person.last_name?.[0] ?? ''
  const value = `${first}${last}`.toUpperCase()
  return value || '?'
}

// "Tiempo en Sistema" (panel lateral "Resumen del Usuario") -- derivado de
// created_at, no viene calculado del backend.
function daysSince(value: string): number {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  const diffMs = Date.now() - date.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

function MetricTile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-lg border border-border p-3', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  )
}

// Cierre de brecha con Figma (lote 2026-07-14, mismo ejercicio ya cerrado
// hoy para Roles -- RoleDetailScreen.tsx es la plantilla replicada aquí):
// layout de dos columnas + tabs Roles/Permisos/Actividad, en vez del
// max-w-2xl fijo de una sola tarjeta con roles de solo lectura.
//
// Desviaciones de criterio propio declaradas (sin precedente explícito en
// el contrato de la tarea, señaladas al hilo principal en el resumen):
//
// 1) "Permisos Efectivos" no viene expuesto por show() (a diferencia de
//    RoleDetailScreen, que recibe `permissions` directo de fetchRole()) --
//    se deriva client-side: por cada rol ACTIVO asignado al usuario, se
//    pide su detalle completo (fetchRole(), que sí trae `permissions`) y se
//    mergea la unión por id. Esto se recalcula (no solo al montar) cada vez
//    que se asigna/revoca un rol, para que el tab "Permisos" y el contador
//    del panel lateral nunca queden desincronizados del estado real.
//
// 2) El selector "Asignar rol" que la tarea describe como "ya existente" no
//    existe hoy en este archivo -- solo existe el inverso (asignar un
//    USUARIO a un ROL) en RoleDetailScreen.tsx. Se construyó aquí desde
//    cero (mismo endpoint assignRoleToUser(), invertido: se fija el rol
//    elegido y userId como parámetros) en vez de "moverlo", que es lo que
//    pedía el contrato original.
export function UserDetailScreen({ userId }: { userId: number | string }) {
  const { isAuthorized } = useRequireAuth('users.read')

  const [user, setUser] = useState<AdminUser | null>(null)
  const [allRoles, setAllRoles] = useState<AdminRole[]>([])
  const [effectivePermissions, setEffectivePermissions] = useState<AdminPermission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const editFormRef = useRef<HTMLFormElement>(null)
  const firstNameInputRef = useRef<HTMLInputElement>(null)

  const [actionError, setActionError] = useState<string | null>(null)
  const [isActing, setIsActing] = useState(false)
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false)

  const [isResending, setIsResending] = useState(false)
  const [resendMessage, setResendMessage] = useState<string | null>(null)
  const [resendError, setResendError] = useState<string | null>(null)

  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [resetPasswordMessage, setResetPasswordMessage] = useState<string | null>(null)
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null)
  const [confirmingResetPassword, setConfirmingResetPassword] = useState(false)

  const [activeTab, setActiveTab] = useState<'roles' | 'permisos' | 'actividad'>('roles')

  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [isAssigningRole, setIsAssigningRole] = useState(false)
  const [assignRoleMessage, setAssignRoleMessage] = useState<string | null>(null)
  const [assignRoleError, setAssignRoleError] = useState<string | null>(null)

  const [pendingRevokeRole, setPendingRevokeRole] = useState<AdminUserRole | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  // Tab "Actividad" -- mismo criterio de carga perezosa + "Cargar más" que
  // RoleDetailScreen.tsx (gateado por `audit.read`, no `users.read`).
  const [activityEvents, setActivityEvents] = useState<UserActivityEvent[]>([])
  const [activityPage, setActivityPage] = useState(1)
  const [activityLastPage, setActivityLastPage] = useState(1)
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  async function loadEffectivePermissions(roles: AdminUserRole[]) {
    const activeRoles = roles.filter(isActiveRoleAssignment)
    if (activeRoles.length === 0) {
      setEffectivePermissions([])
      return
    }
    const roleDetails = await Promise.all(activeRoles.map((role) => fetchRole(role.id)))
    const byId = new Map<number, AdminPermission>()
    for (const detail of roleDetails) {
      for (const permission of detail.role.permissions) {
        byId.set(permission.id, permission)
      }
    }
    setEffectivePermissions(Array.from(byId.values()))
  }

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    Promise.all([fetchUser(userId), fetchRoles({ perPage: 100 })])
      .then(async ([userResult, rolesResult]) => {
        if (cancelled) return
        setUser(userResult.user)
        setFirstName(userResult.user.person.first_name)
        setLastName(userResult.user.person.last_name)
        setEmail(userResult.user.email)
        setPhone(userResult.user.person.phone ?? '')
        setAllRoles(rolesResult.data)
        await loadEffectivePermissions(userResult.user.roles)
        if (cancelled) return
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
  }, [isAuthorized, userId])

  // Ver comentario equivalente en RoleDetailScreen.tsx: `activityLoaded` se
  // lee como guarda "cargar solo una vez" pero deliberadamente NO está en
  // las dependencias -- incluirla reintroduce el mismo bug de carrera ya
  // documentado ahí (el propio setActivityLoaded(true) dispara un
  // re-render que corre el cleanup de este efecto antes de que el
  // `.finally()` en vuelo pueda apagar el spinner).
  useEffect(() => {
    if (activeTab !== 'actividad' || activityLoaded || !isAuthorized) return
    let cancelled = false
    setActivityLoading(true)
    fetchUserActivity(userId, { page: 1, perPage: 15 })
      .then((result) => {
        if (cancelled) return
        setActivityEvents(result.data)
        setActivityPage(result.current_page)
        setActivityLastPage(result.last_page)
        setActivityLoaded(true)
        setActivityError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setActivityError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setActivityLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver comentario arriba
  }, [activeTab, isAuthorized, userId])

  const activeRoles = useMemo(() => (user ? user.roles.filter(isActiveRoleAssignment) : []), [user])

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, AdminPermission[]>()
    for (const permission of effectivePermissions) {
      const list = groups.get(permission.module) ?? []
      list.push(permission)
      groups.set(permission.module, list)
    }
    return Array.from(groups.entries())
  }, [effectivePermissions])

  const defaultOpenModules = useMemo(() => groupedPermissions.map(([module]) => module), [groupedPermissions])

  const assignableRoles = useMemo(() => {
    const activeIds = new Set(activeRoles.map((role) => role.id))
    return allRoles.filter((role) => !activeIds.has(role.id))
  }, [allRoles, activeRoles])

  const assignableRoleItems = useMemo(
    () => assignableRoles.map((role) => ({ value: String(role.id), label: role.name })),
    [assignableRoles]
  )

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { user: updated } = await updateUser(userId, { first_name: firstName, last_name: lastName, email, phone })
      setUser((current) => (current ? { ...current, ...updated } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'email'))
    } finally {
      setIsSaving(false)
    }
  }

  function handleEditClick() {
    // jsdom (entorno de test) no implementa scrollIntoView -- se llama
    // defensivamente, nunca debe bloquear el foco del campo.
    editFormRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    firstNameInputRef.current?.focus()
  }

  async function handleActivate() {
    setActionError(null)
    setIsActing(true)
    try {
      const { user: updated } = await activateUser(userId)
      setUser((current) => (current ? { ...current, ...updated } : current))
    } catch (error) {
      setActionError(errorMessage(error, 'user'))
    } finally {
      setIsActing(false)
    }
  }

  async function handleConfirmDeactivate() {
    setActionError(null)
    setIsActing(true)
    try {
      const { user: updated } = await deactivateUser(userId)
      setUser((current) => (current ? { ...current, ...updated } : current))
      setConfirmingDeactivate(false)
    } catch (error) {
      setActionError(errorMessage(error, 'user'))
      setConfirmingDeactivate(false)
    } finally {
      setIsActing(false)
    }
  }

  async function handleResendInvitation() {
    setResendError(null)
    setResendMessage(null)
    setIsResending(true)
    try {
      const { message } = await resendInvitation(userId)
      setResendMessage(message)
    } catch (error) {
      setResendError(errorMessage(error, 'user'))
    } finally {
      setIsResending(false)
    }
  }

  async function handleConfirmResetPassword() {
    setResetPasswordError(null)
    setResetPasswordMessage(null)
    setIsResettingPassword(true)
    try {
      const { message } = await resetUserPassword(userId)
      setResetPasswordMessage(message)
      setConfirmingResetPassword(false)
    } catch (error) {
      setResetPasswordError(errorMessage(error, 'user'))
      setConfirmingResetPassword(false)
    } finally {
      setIsResettingPassword(false)
    }
  }

  async function handleAssignRole() {
    if (!selectedRoleId || !user) return
    const role = allRoles.find((item) => item.id === selectedRoleId)
    if (!role) return
    setIsAssigningRole(true)
    setAssignRoleError(null)
    setAssignRoleMessage(null)
    try {
      await assignRoleToUser(role.id, { user_id: user.id })
      const updatedRoles = [...user.roles, { id: role.id, code: role.code, name: role.name }]
      setUser((current) => (current ? { ...current, roles: updatedRoles } : current))
      setSelectedRoleId(null)
      setAssignRoleMessage('Rol asignado correctamente.')
      await loadEffectivePermissions(updatedRoles)
    } catch (error) {
      setAssignRoleError(errorMessage(error, 'role'))
    } finally {
      setIsAssigningRole(false)
    }
  }

  async function handleConfirmRevokeRole() {
    const role = pendingRevokeRole
    if (!role || !user) return
    setIsRevoking(true)
    setRevokeError(null)
    try {
      await revokeRoleFromUser(user.id, role.id)
      const updatedRoles = user.roles.filter((item) => item.id !== role.id)
      setUser((current) => (current ? { ...current, roles: updatedRoles } : current))
      setPendingRevokeRole(null)
      await loadEffectivePermissions(updatedRoles)
    } catch (error) {
      // RN-027: falla con 422 si sería el último rol activo -- el mensaje
      // del backend se muestra tal cual, sin reinterpretarlo.
      setRevokeError(errorMessage(error, 'role'))
      setPendingRevokeRole(null)
    } finally {
      setIsRevoking(false)
    }
  }

  async function handleLoadMoreActivity() {
    setActivityLoading(true)
    try {
      const result = await fetchUserActivity(userId, { page: activityPage + 1, perPage: 15 })
      setActivityEvents((current) => [...current, ...result.data])
      setActivityPage(result.current_page)
      setActivityLastPage(result.last_page)
      setActivityError(null)
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : 'Error inesperado.')
    } finally {
      setActivityLoading(false)
    }
  }

  if (!isAuthorized || isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (loadError || !user) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el usuario.'}
      </p>
    )
  }

  const isActive = user.status.code === 'ACTIVE'
  const registeredDays = user.created_at ? daysSince(user.created_at) : null

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <div className={cn('h-1.5 w-full', userStatusBadgeClasses(user.status.code).split(' ')[0])} />
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
              aria-hidden="true"
            >
              {initialsOf(user)}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{user.person.full_name}</CardTitle>
                <Badge className={userStatusBadgeClasses(user.status.code)}>{user.status.name}</Badge>
                {activeRoles.length === 0 && <span className="text-xs text-muted-foreground">Sin roles asignados</span>}
                {activeRoles.map((role) => (
                  <Badge key={role.id} variant="outline">
                    {role.name}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">@{user.username}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleEditClick}>
              Editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isResettingPassword}
              onClick={() => setConfirmingResetPassword(true)}
            >
              Restablecer contraseña
            </Button>
            {isActive ? (
              <Button variant="outline" size="sm" disabled={isActing} onClick={() => setConfirmingDeactivate(true)}>
                Desactivar usuario
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={isActing} onClick={handleActivate}>
                Activar usuario
              </Button>
            )}
            {user.status.code === 'PENDING_ACTIVATION' && (
              <Button variant="outline" size="sm" disabled={isResending} onClick={handleResendInvitation}>
                {isResending ? 'Reenviando…' : 'Reenviar invitación'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pb-4">
          {actionError && (
            <p className="text-sm text-destructive" role="alert">
              {actionError}
            </p>
          )}
          {resendMessage && (
            <p className="text-sm text-muted-foreground" role="status">
              {resendMessage}
            </p>
          )}
          {resendError && (
            <p className="text-sm text-destructive" role="alert">
              {resendError}
            </p>
          )}
          {resetPasswordMessage && (
            <p className="text-sm text-muted-foreground" role="status">
              {resetPasswordMessage}
            </p>
          )}
          {resetPasswordError && (
            <p className="text-sm text-destructive" role="alert">
              {resetPasswordError}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Información General</CardTitle>
            </CardHeader>
            <CardContent>
              <form ref={editFormRef} onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="firstName">Nombres</Label>
                  <Input
                    id="firstName"
                    ref={firstNameInputRef}
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="lastName">Apellidos</Label>
                  <Input id="lastName" value={lastName} onChange={(event) => setLastName(event.target.value)} />
                </div>

                <InfoField label="Usuario">@{user.username}</InfoField>
                <InfoField label="Documento">
                  {user.person.document_type} {user.person.document_number}
                </InfoField>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
                </div>

                <InfoField label="Fecha de Registro">{user.created_at ? formatDate(user.created_at) : '—'}</InfoField>
                <InfoField label="Creado Por">{user.created_by?.username ?? '—'}</InfoField>
                <InfoField label="Última Actualización">{user.updated_at ? formatDate(user.updated_at) : '—'}</InfoField>
                <InfoField label="Actualizado Por">{user.updated_by?.username ?? '—'}</InfoField>

                {saveError && (
                  <p className="text-sm text-destructive sm:col-span-2" role="alert">
                    {saveError}
                  </p>
                )}
                {saveMessage && (
                  <p className="text-sm text-muted-foreground sm:col-span-2" role="status">
                    {saveMessage}
                  </p>
                )}

                <div className="flex justify-end sm:col-span-2">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Guardando…' : 'Guardar cambios'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
                <TabsList>
                  <TabsTrigger value="roles">Roles</TabsTrigger>
                  <TabsTrigger value="permisos">Permisos</TabsTrigger>
                  <TabsTrigger value="actividad">Actividad</TabsTrigger>
                </TabsList>

                <TabsContent value="roles" className="flex flex-col gap-4 pt-4">
                  {revokeError && (
                    <p className="text-sm text-destructive" role="alert">
                      {revokeError}
                    </p>
                  )}
                  <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rol</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeRoles.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={2} className="text-center text-muted-foreground">
                              Este usuario no tiene roles asignados.
                            </TableCell>
                          </TableRow>
                        )}
                        {activeRoles.map((role) => (
                          <TableRow key={role.id}>
                            <TableCell>{role.name}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`Revocar rol ${role.name}`}
                                onClick={() => setPendingRevokeRole(role)}
                              >
                                ✕
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex flex-col gap-2 border-t border-border pt-4">
                    <Label htmlFor="assignRole">Asignar rol</Label>
                    <div className="flex gap-2">
                      <Select
                        items={assignableRoleItems}
                        value={selectedRoleId ? String(selectedRoleId) : null}
                        onValueChange={(value) => setSelectedRoleId(Number(value))}
                      >
                        <SelectTrigger id="assignRole" className="flex-1">
                          <SelectValue placeholder="Selecciona un rol" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableRoles.map((role) => (
                            <SelectItem key={role.id} value={String(role.id)}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button disabled={!selectedRoleId || isAssigningRole} onClick={handleAssignRole}>
                        {isAssigningRole ? 'Asignando…' : 'Asignar'}
                      </Button>
                    </div>
                    {assignRoleMessage && <p className="text-sm text-muted-foreground">{assignRoleMessage}</p>}
                    {assignRoleError && (
                      <p className="text-sm text-destructive" role="alert">
                        {assignRoleError}
                      </p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="permisos" className="flex flex-col gap-4 pt-4">
                  {effectivePermissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Este usuario no tiene permisos efectivos.</p>
                  ) : (
                    <Accordion multiple defaultValue={defaultOpenModules}>
                      {groupedPermissions.map(([module, permissions]) => (
                        <AccordionItem key={module} value={module}>
                          <AccordionTrigger>
                            <span className="flex flex-1 flex-wrap items-center gap-2">
                              <span>{moduleLabel(module)}</span>
                              <Badge variant="outline">{permissions.length}</Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent>
                            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                              {permissions.map((permission) => (
                                <li key={permission.id} className="text-sm">
                                  {permission.name}
                                </li>
                              ))}
                            </ul>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </TabsContent>

                <TabsContent value="actividad" className="flex flex-col gap-3 pt-4">
                  {activityError && (
                    <p className="text-sm text-destructive" role="alert">
                      {activityError}
                    </p>
                  )}
                  {activityLoading && activityEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      Cargando…
                    </p>
                  ) : activityEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>
                  ) : (
                    <ol className="flex flex-col gap-4 border-l border-border pl-4">
                      {activityEvents.map((event, index) => (
                        <li key={`${event.created_at}-${index}`} className="relative">
                          <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-primary" aria-hidden="true" />
                          <p className="text-sm">{event.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(event.created_at)}
                            {event.actor ? ` · ${event.actor.username}` : ''}
                          </p>
                        </li>
                      ))}
                    </ol>
                  )}
                  {activityLoaded && activityPage < activityLastPage && (
                    <div className="flex justify-center">
                      <Button variant="outline" size="sm" disabled={activityLoading} onClick={handleLoadMoreActivity}>
                        {activityLoading ? 'Cargando…' : 'Cargar más'}
                      </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumen del Usuario</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <MetricTile label="Roles Asignados" value={String(activeRoles.length)} />
              <MetricTile label="Permisos Efectivos" value={String(effectivePermissions.length)} />
              <MetricTile label="Último Acceso" value={user.last_login_at ? formatDate(user.last_login_at) : 'Nunca'} />
              <MetricTile label="Tiempo en Sistema" value={registeredDays === null ? '—' : `${registeredDays} días`} />
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={confirmingDeactivate} onOpenChange={setConfirmingDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desactivar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres desactivar a {user.person.full_name}? No podrá iniciar sesión hasta que se
              reactive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isActing} onClick={handleConfirmDeactivate}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restablecer contraseña dispara un correo real (mismo mecanismo OTP
          que el autoservicio de "Olvidé mi contraseña", ver
          PasswordResetOtpService::issueFor()) -- confirmación previa. */}
      <AlertDialog open={confirmingResetPassword} onOpenChange={setConfirmingResetPassword}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restablecer contraseña</AlertDialogTitle>
            <AlertDialogDescription>
              Se enviará un código de verificación al correo de {user.person.full_name} ({user.email}) para
              restablecer su contraseña. ¿Deseas continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={isResettingPassword} onClick={handleConfirmResetPassword}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revocar puede fallar con 422 (RN-027, último rol activo) -- el
          diálogo se cierra igual y el mensaje del backend queda visible en
          el tab "Roles" (ver revokeError), mismo criterio que el resto de
          acciones con guardas de negocio en este proyecto. */}
      <AlertDialog open={pendingRevokeRole !== null} onOpenChange={(open) => !open && setPendingRevokeRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revocar rol</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres revocar el rol {pendingRevokeRole?.name} a {user.person.full_name}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isRevoking} onClick={handleConfirmRevokeRole}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
