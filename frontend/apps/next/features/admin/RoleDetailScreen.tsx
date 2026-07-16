'use client'

import { useEffect, useMemo, useState } from 'react'
import { Shield } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  ApiValidationError,
  activateRole,
  assignPermissionToRole,
  assignRoleToUser,
  deactivateRole,
  fetchPermissions,
  fetchRole,
  fetchRoleActivity,
  fetchRoleUsers,
  fetchUsers,
  revokePermissionFromRole,
  updateRole,
  type AdminPermission,
  type AdminRoleDetail,
  type AdminUser,
  type RiskLevel,
  type RoleActivityEvent,
} from 'app/features/admin/api'
import { priorityLevelOptions } from 'app/features/admin/schemas'
import { RISK_LEVEL_BAR_CLASSES, RISK_LEVEL_CLASSES, RISK_LEVEL_LABELS } from 'app/features/admin/riskLevel'
import { formatDate } from 'app/features/admin/formatDate'
import { moduleLabel } from 'app/features/admin/moduleLabels'
import { useRequireAuth } from 'app/provider/auth'

// Bug menor encontrado en el mismo lote que el badge/botón de estado
// stale: sin `items`, Base UI `<Select.Value>` renderiza el VALOR crudo
// del item seleccionado (p. ej. "3") en vez de su label ("3. Coordinación")
// -- mismo root cause que el bug reportado de "all" en los filtros de
// RolesListScreen.tsx, solo que aquí no fue reportado explícitamente.
const priorityLevelItems = priorityLevelOptions.map((option) => ({
  value: String(option.value),
  label: `${option.value}. ${option.label}`,
}))

const RISK_LEVEL_ORDER: RiskLevel[] = ['bajo', 'medio', 'alto', 'critico']

type ModuleAssignmentState = 'all' | 'partial' | 'none'

function moduleAssignmentState(permissions: AdminPermission[], assignedIds: Set<number>): ModuleAssignmentState {
  const assignedCount = permissions.filter((permission) => assignedIds.has(permission.id)).length
  if (assignedCount === 0) return 'none'
  if (assignedCount === permissions.length) return 'all'
  return 'partial'
}

// Ámbar para parcial (advertencia no crítica), verde para completo, gris
// para vacío -- mismo criterio de color semántico pedido para todo el
// archivo, ver resumen del lote.
function moduleBadgeClasses(state: ModuleAssignmentState): string {
  if (state === 'all') return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
  if (state === 'partial') return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  return 'bg-muted text-muted-foreground'
}

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="text-sm text-muted-foreground">{children}</div>
    </div>
  )
}

function MetricTile({
  label,
  value,
  hint,
  className,
}: {
  label: string
  value: string
  hint?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1 rounded-lg border border-border p-3', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold">
        {value}
        {hint && <span className="ml-1 text-xs font-normal text-muted-foreground">({hint})</span>}
      </span>
    </div>
  )
}

// CU de detalle de rol (RBAC): riesgo del rol + edición inline de
// name/description/priority_level (Figma "Roles Management", lote 3) +
// activar/inactivar + permisos asignados (checkbox individual como toggle
// real: asigna al marcar, revoca al desmarcar -- POST /revoke ya existe,
// lote "Matriz de Permisos") + asignar el rol a un usuario. Rediseño de
// layout de dos columnas + tabs Permisos/Usuarios/Auditoría (Figma
// "Detalle de Rol", lote 4).
//
// Desviación de criterio propio (declarada, sin precedente explícito en el
// contrato del lote): no existe un "modo edición" separado en este
// proyecto -- UserDetailScreen ya resuelve edición como un formulario
// SIEMPRE visible, deshabilitado según permiso/estado, en vez de un
// toggle. Se replica el mismo patrón aquí por consistencia (el enlace
// "Editar" del menú de RolesListScreen navega a esta misma pantalla).
export function RoleDetailScreen({ roleId }: { roleId: number | string }) {
  const { isAuthorized } = useRequireAuth('roles.read')
  const [role, setRole] = useState<AdminRoleDetail | null>(null)
  const [allPermissions, setAllPermissions] = useState<AdminPermission[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [assigningPermissionId, setAssigningPermissionId] = useState<number | null>(null)
  const [busyModule, setBusyModule] = useState<string | null>(null)
  const [permissionError, setPermissionError] = useState<string | null>(null)

  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [isAssigningRole, setIsAssigningRole] = useState(false)
  const [assignRoleMessage, setAssignRoleMessage] = useState<string | null>(null)
  const [assignRoleError, setAssignRoleError] = useState<string | null>(null)

  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriorityLevel, setEditPriorityLevel] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isTogglingActive, setIsTogglingActive] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'permisos' | 'usuarios' | 'auditoria'>('permisos')

  // Tab "Usuarios con este rol" (lote 4) -- cargado perezosamente, solo la
  // primera vez que se abre la pestaña (no en el mount inicial, para no
  // disparar una request que la mayoría de las visitas no necesita).
  const [roleUsers, setRoleUsers] = useState<AdminUser[]>([])
  const [roleUsersLoaded, setRoleUsersLoaded] = useState(false)
  const [roleUsersLoading, setRoleUsersLoading] = useState(false)
  const [roleUsersError, setRoleUsersError] = useState<string | null>(null)

  // Tab "Auditoría" (lote 4) -- mismo criterio de carga perezosa, con
  // paginación "Cargar más" (RoleController::activity() está gateado por
  // `audit.read`, no `roles.read` -- un 403 aquí es esperable).
  const [activityEvents, setActivityEvents] = useState<RoleActivityEvent[]>([])
  const [activityPage, setActivityPage] = useState(1)
  const [activityLastPage, setActivityLastPage] = useState(1)
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    Promise.all([fetchRole(roleId), fetchPermissions({ perPage: 50 }), fetchUsers({ perPage: 100 })])
      .then(([roleResult, permissionsResult, usersResult]) => {
        if (cancelled) return
        setRole(roleResult.role)
        setEditName(roleResult.role.name)
        setEditDescription(roleResult.role.description ?? '')
        setEditPriorityLevel(roleResult.role.priority_level as 1 | 2 | 3 | 4 | 5)
        setAllPermissions(permissionsResult.data)
        setUsers(usersResult.data)
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
  }, [isAuthorized, roleId])

  // OJO -- `roleUsersLoaded`/`activityLoaded` se leen dentro del efecto
  // (guardas de "cargar solo una vez") pero DELIBERADAMENTE NO están en el
  // arreglo de dependencias. Bug real encontrado al escribir el test de
  // "Cargar más": si se incluyen, el propio `setActivityLoaded(true)` del
  // `.then()` dispara un re-render que hace que React ejecute el cleanup
  // de ESTE mismo efecto (`cancelled = true`) antes de que el `.finally()`
  // (ya encolado como microtask sobre la misma promesa) se ejecute -- el
  // `if (!cancelled)` de `finally` entonces nunca corre, y el spinner de
  // carga queda pegado en `true` para siempre. Como `activeTab` sí sigue
  // en las dependencias, cambiar de pestaña y volver igual reevalúa la
  // guarda con el valor más reciente de `roleUsersLoaded`/`activityLoaded`
  // -- solo se evita el loop de re-disparo por el propio efecto.
  useEffect(() => {
    if (activeTab !== 'usuarios' || roleUsersLoaded || !isAuthorized) return
    let cancelled = false
    setRoleUsersLoading(true)
    fetchRoleUsers(roleId, { perPage: 15 })
      .then((result) => {
        if (cancelled) return
        setRoleUsers(result.data)
        setRoleUsersLoaded(true)
        setRoleUsersError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setRoleUsersError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setRoleUsersLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver comentario arriba
  }, [activeTab, isAuthorized, roleId])

  useEffect(() => {
    if (activeTab !== 'auditoria' || activityLoaded || !isAuthorized) return
    let cancelled = false
    setActivityLoading(true)
    fetchRoleActivity(roleId, { page: 1, perPage: 15 })
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
  }, [activeTab, isAuthorized, roleId])

  const assignedPermissionIds = useMemo(() => new Set(role?.permissions.map((permission) => permission.id) ?? []), [role])

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, AdminPermission[]>()
    for (const permission of allPermissions) {
      const list = groups.get(permission.module) ?? []
      list.push(permission)
      groups.set(permission.module, list)
    }
    return Array.from(groups.entries())
  }, [allPermissions])

  // Todos los módulos abiertos por defecto: el catálogo hoy es pequeño (3
  // módulos reales, ver comentario en features/admin/api.ts) y esta
  // pantalla es de revisión/edición, no de navegación -- forzar un click
  // extra por módulo para ver qué está asignado no aporta. Desviación de
  // criterio propio sobre el mockup (no especificaba estado inicial),
  // señalada aquí.
  const defaultOpenModules = useMemo(() => groupedPermissions.map(([module]) => module), [groupedPermissions])

  const totalPermissionsCount = allPermissions.length
  // Nota deliberada: se usa el tamaño de `assignedPermissionIds` (derivado
  // de `role.permissions`, que SÍ se actualiza al asignar) en vez de
  // `role.permissions_count` (que NUNCA se actualiza localmente tras un
  // assign -- ver handleAssignPermission) para que el banner, el progreso
  // y el panel lateral nunca queden desincronizados entre sí.
  const assignedPermissionsCount = assignedPermissionIds.size
  const assignedPercent =
    totalPermissionsCount === 0 ? 0 : Math.round((assignedPermissionsCount / totalPermissionsCount) * 100)

  const totalModulesCount = groupedPermissions.length
  const assignedModulesCount = groupedPermissions.filter(([, permissions]) =>
    permissions.some((permission) => assignedPermissionIds.has(permission.id))
  ).length

  // Mismo fix que priorityLevelItems: sin `items`, el trigger colapsado
  // mostraba el user_id crudo en vez del nombre completo tras seleccionar.
  const userSelectItems = useMemo(
    () => users.map((user) => ({ value: String(user.id), label: user.person.full_name })),
    [users]
  )

  async function handleAssignPermission(permission: AdminPermission) {
    if (!role) return
    setPermissionError(null)
    setAssigningPermissionId(permission.id)
    try {
      await assignPermissionToRole(permission.id, { role_id: role.id })
      setRole((current) => (current ? { ...current, permissions: [...current.permissions, permission] } : current))
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : 'Error inesperado.')
    } finally {
      setAssigningPermissionId(null)
    }
  }

  // Cierre de brecha con Figma (lote "Matriz de Permisos"): antes solo se
  // podía asignar (no existía POST /revoke) -- ahora el checkbox individual
  // es un toggle real. Mismo criterio de estado local que
  // handleAssignPermission: se actualiza `role.permissions` con la
  // respuesta ya conocida (el endpoint solo devuelve {message}) para que el
  // banner/progreso/panel lateral nunca queden desincronizados.
  async function handleRevokePermission(permission: AdminPermission) {
    if (!role) return
    setPermissionError(null)
    setAssigningPermissionId(permission.id)
    try {
      await revokePermissionFromRole(permission.id, role.id)
      setRole((current) =>
        current
          ? { ...current, permissions: current.permissions.filter((item) => item.id !== permission.id) }
          : current
      )
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : 'Error inesperado.')
    } finally {
      setAssigningPermissionId(null)
    }
  }

  // Checkbox tri-state del header de módulo (accordion): asigna de una vez
  // todos los permisos del módulo que todavía no están asignados (un POST
  // por permiso, en paralelo -- no existe endpoint de asignación masiva,
  // ver comentario en features/admin/api.ts). Sigue sin poder desasignar.
  async function handleAssignModule(module: string, permissions: AdminPermission[]) {
    if (!role) return
    const targets = permissions.filter((permission) => !assignedPermissionIds.has(permission.id))
    if (targets.length === 0) return
    setPermissionError(null)
    setBusyModule(module)
    try {
      await Promise.all(targets.map((permission) => assignPermissionToRole(permission.id, { role_id: role.id })))
      setRole((current) => (current ? { ...current, permissions: [...current.permissions, ...targets] } : current))
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : 'Error inesperado.')
    } finally {
      setBusyModule(null)
    }
  }

  async function handleAssignRole() {
    if (!selectedUserId) return
    setIsAssigningRole(true)
    setAssignRoleError(null)
    setAssignRoleMessage(null)
    try {
      await assignRoleToUser(roleId, { user_id: selectedUserId })
      setAssignRoleMessage('Rol asignado correctamente.')
    } catch (error) {
      setAssignRoleError(error instanceof Error ? error.message : 'Error inesperado.')
    } finally {
      setIsAssigningRole(false)
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!role) return
    setSaveError(null)
    setSaveMessage(null)
    setIsSaving(true)
    try {
      const { role: updated } = await updateRole(role.id, {
        name: editName,
        description: editDescription || undefined,
        priority_level: editPriorityLevel,
      })
      setRole((current) => (current ? { ...current, ...updated } : current))
      setSaveMessage('Cambios guardados.')
    } catch (error) {
      setSaveError(errorMessage(error, 'name'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleActive() {
    if (!role) return
    setToggleError(null)
    setIsTogglingActive(true)
    try {
      // activate()/deactivate() devuelven el modelo base sin
      // risk_level/users_count/permissions_count/permissions/created_by/
      // updated_by -- se mergea con el detalle ya cargado para no
      // perderlos en pantalla.
      const { role: updated } = role.is_active ? await deactivateRole(role.id) : await activateRole(role.id)
      setRole((current) => (current ? { ...current, ...updated } : current))
    } catch (error) {
      setToggleError(errorMessage(error, 'role'))
    } finally {
      setIsTogglingActive(false)
    }
  }

  async function handleLoadMoreActivity() {
    setActivityLoading(true)
    try {
      const result = await fetchRoleActivity(roleId, { page: activityPage + 1, perPage: 15 })
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

  if (loadError || !role) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el rol.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        {/* Franja de color a juego con el nivel de riesgo del rol. */}
        <div className={cn('h-1.5 w-full', RISK_LEVEL_CLASSES[role.risk_level].split(' ')[0])} />
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Shield className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{role.name}</CardTitle>
                <Badge variant={role.is_system ? 'secondary' : 'outline'}>
                  {role.is_system ? 'Sistema' : 'Personalizado'}
                </Badge>
                {!role.is_editable && <Badge variant="secondary">Protegido</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{role.code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={role.is_active ? 'default' : 'secondary'}>{role.is_active ? 'Activo' : 'Inactivo'}</Badge>
            <Badge className={RISK_LEVEL_CLASSES[role.risk_level]}>{RISK_LEVEL_LABELS[role.risk_level]}</Badge>
            <Button
              variant="outline"
              size="sm"
              disabled={!role.is_editable || isTogglingActive}
              onClick={handleToggleActive}
            >
              {role.is_active ? 'Inactivar rol' : 'Activar rol'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pb-4">
          {!role.is_editable && (
            <p className="text-sm text-muted-foreground" role="status">
              Rol de sistema, no editable.
            </p>
          )}
          {toggleError && (
            <p className="text-sm text-destructive" role="alert">
              {toggleError}
            </p>
          )}
          <p className="text-sm text-muted-foreground" data-testid="role-summary-banner">
            Este rol tiene acceso a{' '}
            <strong className="font-semibold text-foreground">{assignedPermissionsCount}</strong> permisos en{' '}
            <strong className="font-semibold text-foreground">
              {assignedModulesCount} de {totalModulesCount}
            </strong>{' '}
            módulos y <strong className="font-semibold text-foreground">{role.users_count}</strong> usuarios
            asociados.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Información General</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editName">Nombre</Label>
                  <Input
                    id="editName"
                    value={editName}
                    disabled={!role.is_editable}
                    onChange={(event) => setEditName(event.target.value)}
                  />
                </div>
                <InfoField label="Tipo">
                  <Badge variant={role.is_system ? 'secondary' : 'outline'}>
                    {role.is_system ? 'Sistema' : 'Personalizado'}
                  </Badge>
                </InfoField>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="editDescription">Descripción</Label>
                  <textarea
                    id="editDescription"
                    className="min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    value={editDescription}
                    disabled={!role.is_editable}
                    onChange={(event) => setEditDescription(event.target.value)}
                  />
                </div>

                <InfoField label="Estado">
                  <Badge variant={role.is_active ? 'default' : 'secondary'}>
                    {role.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </InfoField>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="editPriorityLevel">Nivel de Acceso</Label>
                  <Select
                    items={priorityLevelItems}
                    value={String(editPriorityLevel)}
                    disabled={!role.is_editable}
                    onValueChange={(value) => setEditPriorityLevel(Number(value) as 1 | 2 | 3 | 4 | 5)}
                  >
                    <SelectTrigger id="editPriorityLevel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {priorityLevelOptions.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          {option.value}. {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <InfoField label="Fecha de Creación">{formatDate(role.created_at)}</InfoField>
                <InfoField label="Creado Por">{role.created_by?.username ?? '—'}</InfoField>
                <InfoField label="Última Actualización">{formatDate(role.updated_at)}</InfoField>
                <InfoField label="Actualizado Por">{role.updated_by?.username ?? '—'}</InfoField>

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
                  <Button type="submit" disabled={!role.is_editable || isSaving}>
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
                  <TabsTrigger value="permisos">Permisos</TabsTrigger>
                  <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
                  <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
                </TabsList>

                <TabsContent value="permisos" className="flex flex-col gap-4 pt-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{assignedPercent}% asignado</span>
                      <span className="text-muted-foreground">
                        {assignedPermissionsCount}/{totalPermissionsCount}
                      </span>
                    </div>
                    <Progress value={assignedPercent} aria-label="Porcentaje de permisos asignados" />
                  </div>

                  {permissionError && (
                    <p className="text-sm text-destructive" role="alert">
                      {permissionError}
                    </p>
                  )}

                  <Accordion multiple defaultValue={defaultOpenModules}>
                    {groupedPermissions.map(([module, permissions]) => {
                      const state = moduleAssignmentState(permissions, assignedPermissionIds)
                      const assignedInModule = permissions.filter((permission) =>
                        assignedPermissionIds.has(permission.id)
                      ).length
                      return (
                        <AccordionItem key={module} value={module}>
                          <div className="flex items-center gap-2">
                            <Checkbox
                              aria-label={`Seleccionar todos los permisos de ${moduleLabel(module)}`}
                              checked={state === 'all'}
                              indeterminate={state === 'partial'}
                              disabled={!role.is_editable || state === 'all' || busyModule === module}
                              onCheckedChange={() => handleAssignModule(module, permissions)}
                            />
                            <AccordionTrigger className="flex-1">
                              <span className="flex flex-1 flex-wrap items-center gap-2">
                                <span>{moduleLabel(module)}</span>
                                <Badge className={moduleBadgeClasses(state)}>
                                  {assignedInModule}/{permissions.length}
                                </Badge>
                              </span>
                            </AccordionTrigger>
                          </div>
                          <AccordionContent>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                              {permissions.map((permission) => {
                                const isAssigned = assignedPermissionIds.has(permission.id)
                                return (
                                  <div key={permission.id} className="flex items-center gap-2">
                                    <Checkbox
                                      id={`role-perm-${permission.id}`}
                                      checked={isAssigned}
                                      disabled={!role.is_editable || assigningPermissionId === permission.id}
                                      onCheckedChange={() =>
                                        isAssigned ? handleRevokePermission(permission) : handleAssignPermission(permission)
                                      }
                                    />
                                    <Label htmlFor={`role-perm-${permission.id}`} className="font-normal">
                                      {permission.name}
                                    </Label>
                                  </div>
                                )
                              })}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      )
                    })}
                  </Accordion>
                </TabsContent>

                <TabsContent value="usuarios" className="flex flex-col gap-3 pt-4">
                  {roleUsersError && (
                    <p className="text-sm text-destructive" role="alert">
                      {roleUsersError}
                    </p>
                  )}
                  {roleUsersLoading && !roleUsersLoaded ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      Cargando…
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nombre</TableHead>
                            <TableHead>Correo</TableHead>
                            <TableHead>Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {roleUsers.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground">
                                Este rol no tiene usuarios asociados.
                              </TableCell>
                            </TableRow>
                          )}
                          {roleUsers.map((user) => (
                            <TableRow key={user.id}>
                              <TableCell>{user.person.full_name}</TableCell>
                              <TableCell>{user.email}</TableCell>
                              <TableCell>
                                <Badge variant={user.status.code === 'ACTIVE' ? 'default' : 'secondary'}>
                                  {user.status.name}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="auditoria" className="flex flex-col gap-3 pt-4">
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

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Asignar Rol a Usuario</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Label htmlFor="assignUser">Asignar a usuario</Label>
              <div className="flex gap-2">
                <Select
                  items={userSelectItems}
                  value={selectedUserId ? String(selectedUserId) : null}
                  onValueChange={(value) => setSelectedUserId(Number(value))}
                >
                  <SelectTrigger id="assignUser" className="flex-1">
                    <SelectValue placeholder="Selecciona un usuario" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={String(user.id)}>
                        {user.person.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button disabled={!selectedUserId || isAssigningRole} onClick={handleAssignRole}>
                  {isAssigningRole ? 'Asignando…' : 'Asignar'}
                </Button>
              </div>
              {assignRoleMessage && <p className="text-sm text-muted-foreground">{assignRoleMessage}</p>}
              {assignRoleError && (
                <p className="text-sm text-destructive" role="alert">
                  {assignRoleError}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumen del Rol</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <MetricTile label="Usuarios Asociados" value={String(role.users_count)} />
              <MetricTile label="Módulos Habilitados" value={`${assignedModulesCount}/${totalModulesCount}`} />
              <MetricTile
                className="col-span-2"
                label="Permisos Asignados"
                value={`${assignedPermissionsCount}/${totalPermissionsCount}`}
                hint={`${assignedPercent}%`}
              />
              <div className="col-span-2 flex flex-col gap-1 rounded-lg border border-border p-3">
                <span className="text-xs text-muted-foreground">Última Modificación</span>
                <span className="text-sm font-medium">{formatDate(role.updated_at)}</span>
                <span className="text-xs text-muted-foreground">{role.updated_by?.username ?? '—'}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nivel de Riesgo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex gap-1">
                {RISK_LEVEL_ORDER.map((level) => (
                  <div
                    key={level}
                    className={cn(
                      'h-2 flex-1 rounded-full bg-muted',
                      level === role.risk_level && RISK_LEVEL_BAR_CLASSES[level]
                    )}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Riesgo actual</span>
                <Badge className={RISK_LEVEL_CLASSES[role.risk_level]}>{RISK_LEVEL_LABELS[role.risk_level]}</Badge>
              </div>
              {role.risk_level === 'critico' && (
                <p className="rounded-lg bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-400" role="alert">
                  Rol con acceso crítico — asignar con precaución.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
