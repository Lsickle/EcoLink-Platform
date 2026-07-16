'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { KeyRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  fetchPermission,
  fetchPermissionActivity,
  fetchPermissionRoles,
  fetchPermissionUsers,
  fetchPermissions,
  type AdminPermission,
  type AdminPermissionDetail,
  type AdminRole,
  type AdminUser,
  type PermissionActivityEvent,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { moduleLabel } from 'app/features/admin/moduleLabels'
import { permissionPriorityLevel } from 'app/features/admin/permissionPriority'
import { RISK_LEVEL_BAR_CLASSES, RISK_LEVEL_CLASSES, RISK_LEVEL_LABELS } from 'app/features/admin/riskLevel'
import { useRequireAuth } from 'app/provider/auth'

const RISK_LEVEL_ORDER = ['bajo', 'medio', 'alto', 'critico'] as const

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

// Cierre de brecha del CRUD de Permisos vs. Figma: "Detalle de Permiso" no
// existía. Mismo layout de dos columnas + tabs con lazy-load que
// RoleDetailScreen.tsx (plantilla replicada aquí) -- Permisos sigue siendo
// un catálogo de solo lectura en sus PROPIOS campos (sin editar/eliminar el
// permiso), lo que cambia aquí es la posibilidad de ver/gestionar sus
// relaciones (roles, usuarios impactados, actividad).
export function PermissionDetailScreen({ permissionId }: { permissionId: string }) {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('permissions.read')

  const [permission, setPermission] = useState<AdminPermissionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'roles' | 'usuarios' | 'dependencias' | 'auditoria'>('roles')

  // Tab "Roles" -- cargado perezosamente, solo la primera vez que se abre
  // la pestaña (mismo criterio de RoleDetailScreen.tsx para "Usuarios").
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [rolesLoaded, setRolesLoaded] = useState(false)
  const [rolesLoading, setRolesLoading] = useState(false)
  const [rolesError, setRolesError] = useState<string | null>(null)

  // Tab "Usuarios".
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoaded, setUsersLoaded] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)

  // Tab "Dependencias" -- INTERPRETACIÓN explícita (declarada al hilo
  // principal en el resumen del lote): no existe un grafo real de
  // dependencias entre permisos en el esquema, así que se muestra la lista
  // de otros permisos del mismo módulo como referencia de contexto, no como
  // una relación técnica real.
  const [relatedPermissions, setRelatedPermissions] = useState<AdminPermission[]>([])
  const [relatedLoaded, setRelatedLoaded] = useState(false)
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [relatedError, setRelatedError] = useState<string | null>(null)

  // Tab "Auditoría" -- mismo criterio de carga perezosa + "Cargar más" que
  // RoleDetailScreen.tsx/UserDetailScreen.tsx.
  const [activityEvents, setActivityEvents] = useState<PermissionActivityEvent[]>([])
  const [activityPage, setActivityPage] = useState(1)
  const [activityLastPage, setActivityLastPage] = useState(1)
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    setIsLoading(true)
    fetchPermission(permissionId)
      .then((result) => {
        if (cancelled) return
        setPermission(result.permission)
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
  }, [isAuthorized, permissionId])

  // OJO -- `rolesLoaded`/`usersLoaded`/`activityLoaded` se leen dentro del
  // efecto (guardas de "cargar solo una vez") pero DELIBERADAMENTE NO están
  // en el arreglo de dependencias. Mismo bug de carrera ya documentado en
  // RoleDetailScreen.tsx: si se incluyen, el propio `setXLoaded(true)` del
  // `.then()` dispara un re-render que corre el cleanup de ESTE mismo
  // efecto (`cancelled = true`) antes de que el `.finally()` (ya encolado
  // como microtask sobre la misma promesa) se ejecute -- el spinner de
  // carga queda pegado en `true` para siempre. Como `activeTab` sí sigue en
  // las dependencias, cambiar de pestaña y volver reevalúa la guarda con el
  // valor más reciente -- solo se evita el loop de re-disparo por el propio
  // efecto.
  useEffect(() => {
    if (activeTab !== 'roles' || rolesLoaded || !isAuthorized) return
    let cancelled = false
    setRolesLoading(true)
    fetchPermissionRoles(permissionId, { perPage: 15 })
      .then((result) => {
        if (cancelled) return
        setRoles(result.data)
        setRolesLoaded(true)
        setRolesError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setRolesError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setRolesLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver comentario arriba
  }, [activeTab, isAuthorized, permissionId])

  useEffect(() => {
    if (activeTab !== 'usuarios' || usersLoaded || !isAuthorized) return
    let cancelled = false
    setUsersLoading(true)
    fetchPermissionUsers(permissionId, { perPage: 15 })
      .then((result) => {
        if (cancelled) return
        setUsers(result.data)
        setUsersLoaded(true)
        setUsersError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setUsersError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver comentario arriba
  }, [activeTab, isAuthorized, permissionId])

  useEffect(() => {
    if (activeTab !== 'dependencias' || relatedLoaded || !isAuthorized || !permission) return
    let cancelled = false
    setRelatedLoading(true)
    fetchPermissions({ module: permission.module, perPage: 50 })
      .then((result) => {
        if (cancelled) return
        setRelatedPermissions(result.data.filter((item) => item.id !== permission.id))
        setRelatedLoaded(true)
        setRelatedError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setRelatedError(error instanceof Error ? error.message : 'Error inesperado.')
      })
      .finally(() => {
        if (!cancelled) setRelatedLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver comentario arriba
  }, [activeTab, isAuthorized, permission])

  useEffect(() => {
    if (activeTab !== 'auditoria' || activityLoaded || !isAuthorized) return
    let cancelled = false
    setActivityLoading(true)
    fetchPermissionActivity(permissionId, { page: 1, perPage: 15 })
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
  }, [activeTab, isAuthorized, permissionId])

  async function handleLoadMoreActivity() {
    setActivityLoading(true)
    try {
      const result = await fetchPermissionActivity(permissionId, { page: activityPage + 1, perPage: 15 })
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

  const riskLevel = useMemo(() => (permission ? permissionPriorityLevel(permission.priority_level) : 'bajo'), [permission])

  if (!isAuthorized || isLoading) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  if (loadError || !permission) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {loadError ?? 'No se encontró el permiso.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <div className={cn('h-1.5 w-full', RISK_LEVEL_CLASSES[riskLevel].split(' ')[0])} />
        <CardHeader className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <KeyRound className="size-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-sm text-muted-foreground">{permission.code}</code>
                <CardTitle className="text-xl">{permission.name}</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">{moduleLabel(permission.module)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={permission.is_active ? 'default' : 'secondary'}>
              {permission.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            {permission.is_critical && <Badge variant="destructive">Crítico</Badge>}
            <Badge className={RISK_LEVEL_CLASSES[riskLevel]}>{RISK_LEVEL_LABELS[riskLevel]}</Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Información General</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField label="Código">
                <code>{permission.code}</code>
              </InfoField>
              <InfoField label="Nombre">{permission.name}</InfoField>
              <InfoField label="Módulo">{moduleLabel(permission.module)}</InfoField>
              <InfoField label="Acción">{permission.action}</InfoField>
              {permission.description && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <span className="text-sm font-medium">Descripción</span>
                  <p className="text-sm text-muted-foreground">{permission.description}</p>
                </div>
              )}
              <InfoField label="Fecha de Creación">{formatDate(permission.created_at)}</InfoField>
              <InfoField label="Creado Por">{permission.created_by?.username ?? '—'}</InfoField>
              <InfoField label="Última Actualización">{formatDate(permission.updated_at)}</InfoField>
              <InfoField label="Actualizado Por">{permission.updated_by?.username ?? '—'}</InfoField>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
                <TabsList>
                  <TabsTrigger value="roles">Roles</TabsTrigger>
                  <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
                  <TabsTrigger value="dependencias">Dependencias</TabsTrigger>
                  <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
                </TabsList>

                <TabsContent value="roles" className="flex flex-col gap-3 pt-4">
                  {rolesError && (
                    <p className="text-sm text-destructive" role="alert">
                      {rolesError}
                    </p>
                  )}
                  {rolesLoading && !rolesLoaded ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      Cargando…
                    </p>
                  ) : (
                    <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rol</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {roles.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground">
                                Ningún rol tiene este permiso asignado.
                              </TableCell>
                            </TableRow>
                          )}
                          {roles.map((role) => (
                            <TableRow key={role.id}>
                              <TableCell>{role.name}</TableCell>
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
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => router.push(`/admin/roles/${role.id}`)}
                                >
                                  Ver Rol →
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="usuarios" className="flex flex-col gap-3 pt-4">
                  {usersError && (
                    <p className="text-sm text-destructive" role="alert">
                      {usersError}
                    </p>
                  )}
                  {usersLoading && !usersLoaded ? (
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
                            <TableHead>Roles</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground">
                                Ningún usuario tiene este permiso.
                              </TableCell>
                            </TableRow>
                          )}
                          {users.map((user) => (
                            <TableRow key={user.id}>
                              <TableCell>{user.person.full_name}</TableCell>
                              <TableCell>{user.email}</TableCell>
                              <TableCell>{user.roles.map((role) => role.name).join(', ') || '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="dependencias" className="flex flex-col gap-3 pt-4">
                  <p className="text-sm text-muted-foreground">
                    Permisos relacionados del mismo módulo ({moduleLabel(permission.module)}).
                  </p>
                  {relatedError && (
                    <p className="text-sm text-destructive" role="alert">
                      {relatedError}
                    </p>
                  )}
                  {relatedLoading && !relatedLoaded ? (
                    <p className="text-sm text-muted-foreground" role="status">
                      Cargando…
                    </p>
                  ) : relatedPermissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay otros permisos en este módulo.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {relatedPermissions.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm"
                        >
                          <span>{item.name}</span>
                          <span className="text-xs text-muted-foreground">{item.code}</span>
                        </li>
                      ))}
                    </ul>
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
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <MetricTile label="Roles Asociados" value={String(permission.roles_count)} />
              <MetricTile label="Usuarios Impactados" value={String(permission.users_impacted_count)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nivel</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex gap-1">
                {RISK_LEVEL_ORDER.map((level) => (
                  <div
                    key={level}
                    className={cn('h-2 flex-1 rounded-full bg-muted', level === riskLevel && RISK_LEVEL_BAR_CLASSES[level])}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Nivel actual</span>
                <Badge className={RISK_LEVEL_CLASSES[riskLevel]}>{RISK_LEVEL_LABELS[riskLevel]}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
