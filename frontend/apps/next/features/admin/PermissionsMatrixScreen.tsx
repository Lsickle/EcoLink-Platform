'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, Check, Loader2, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  assignPermissionToRole,
  fetchPermissionMatrixByModule,
  fetchPermissions,
  fetchRole,
  fetchRoles,
  revokePermissionFromRole,
  type AdminPermission,
  type AdminRole,
  type AdminRoleDetail,
  type PermissionMatrixByModule,
  type RiskLevel,
} from 'app/features/admin/api'
import { actionLabel, sortActions } from 'app/features/admin/actionLabels'
import { moduleLabel } from 'app/features/admin/moduleLabels'
import { permissionPriorityLevel } from 'app/features/admin/permissionPriority'
import { RISK_LEVEL_CLASSES, RISK_LEVEL_LABELS } from 'app/features/admin/riskLevel'
import { useRequireAuth } from 'app/provider/auth'

// Los 4 módulos reales del catálogo hoy (mismo criterio ya usado en
// PermissionsListScreen.tsx para el filtro "Módulo").
const MODULE_CODES = ['users', 'roles', 'permissions', 'audit'] as const

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// ---- Filtros compartidos de la barra superior (Figma "Matriz de
// Permisos"/"Por Módulo"/"Comparativa") -----------------------------------
// Figma usa una columna "Categoría" (Consulta/Operación/Control/Admin) que
// no existe en el esquema real -- se decidió explícitamente NO inventarla
// (ver contexto del lote). En su lugar, los 3 selects reales que sí se
// pueden construir con datos existentes son Módulo/Estado/Nivel.
const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
] as const
type StatusFilterValue = (typeof STATUS_FILTER_OPTIONS)[number]['value']

const LEVEL_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'bajo', label: 'Bajo' },
  { value: 'medio', label: 'Medio' },
  { value: 'alto', label: 'Alto' },
  { value: 'critico', label: 'Crítico' },
] as const
type LevelFilterValue = (typeof LEVEL_FILTER_OPTIONS)[number]['value']

const DIFFERENCES_FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'diff', label: 'Solo diferencias' },
] as const

function matchesSearch(search: string, ...values: (string | null | undefined)[]): boolean {
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  return values.some((value) => value?.toLowerCase().includes(needle))
}

// "Nivel" agregado de un grupo de permisos (columna NIVEL de "Por Rol"): el
// priority_level más alto entre TODOS los permisos reales del módulo
// (existan o no asignados al rol en pantalla) -- refleja el riesgo
// potencial del módulo completo, no solo lo que el rol tiene hoy.
function highestRiskLevel(permissions: AdminPermission[]): RiskLevel {
  const maxPriority = permissions.reduce((max, permission) => Math.max(max, permission.priority_level), 0)
  return permissionPriorityLevel(maxPriority)
}

// Visual de check de solo-lectura (Comparativa): deliberadamente NO es un
// <Checkbox> real -- esa vista no tiene toggle (ver ComparisonView), así
// que exponerlo como role="checkbox" sería un control interactivo
// engañoso. Mismo look (cuadro con borde, relleno al marcar) que el
// Checkbox real de las otras 2 sub-vistas, para que las 3 tablas se vean
// consistentes.
function ReadOnlyMark({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div
      className={cn(
        'mx-auto flex size-4 items-center justify-center rounded-[4px] border',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
      )}
      aria-label={label}
    >
      {checked && <Check className="size-3.5" aria-hidden="true" />}
    </div>
  )
}

// ---- Sub-vista "Por Rol" ---------------------------------------------------
// Filas = módulos reales del catálogo, columnas = la UNIÓN de acciones
// reales que existen en el catálogo cargado (nunca una lista hardcodeada --
// ver sortActions()); una celda sin permiso para esa combinación
// módulo/acción se muestra como "--" en vez de un checkbox (evita implicar
// que existe un permiso que el backend no tiene).
function RoleMatrixView({
  allRoles,
  search,
  moduleFilter,
  statusFilter,
  levelFilter,
}: {
  allRoles: AdminRole[]
  search: string
  moduleFilter: string
  statusFilter: StatusFilterValue
  levelFilter: LevelFilterValue
}) {
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [role, setRole] = useState<AdminRoleDetail | null>(null)
  const [catalog, setCatalog] = useState<AdminPermission[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyPermissionId, setBusyPermissionId] = useState<number | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const roleItems = useMemo(() => allRoles.map((item) => ({ value: String(item.id), label: item.name })), [allRoles])

  useEffect(() => {
    if (!selectedRoleId) {
      setRole(null)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setToggleError(null)
    Promise.all([fetchRole(selectedRoleId), fetchPermissions({ perPage: 100 })])
      .then(([roleResult, permissionsResult]) => {
        if (cancelled) return
        setRole(roleResult.role)
        setCatalog(permissionsResult.data)
        setLoadError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(errorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedRoleId])

  const groupedByModule = useMemo(() => {
    const groups = new Map<string, AdminPermission[]>()
    for (const permission of catalog) {
      const list = groups.get(permission.module) ?? []
      list.push(permission)
      groups.set(permission.module, list)
    }
    return Array.from(groups.entries())
  }, [catalog])

  const actionColumns = useMemo(() => sortActions(catalog.map((permission) => permission.action)), [catalog])

  const assignedIds = useMemo(() => new Set(role?.permissions.map((permission) => permission.id) ?? []), [role])

  const filteredGroups = useMemo(() => {
    return groupedByModule.filter(([module, permissions]) => {
      if (moduleFilter !== 'all' && module !== moduleFilter) return false
      if (statusFilter !== 'all') {
        const wantActive = statusFilter === 'active'
        if (!permissions.some((permission) => permission.is_active === wantActive)) return false
      }
      if (levelFilter !== 'all' && highestRiskLevel(permissions) !== levelFilter) return false
      if (!matchesSearch(search, moduleLabel(module), ...permissions.map((permission) => permission.name))) {
        return false
      }
      return true
    })
  }, [groupedByModule, moduleFilter, statusFilter, levelFilter, search])

  // Badges de conteo: reflejan el rol completo (sin filtrar por
  // búsqueda/selects -- esos solo acotan las filas de la tabla, no el
  // resumen, mismo criterio que Figma).
  const assignedModulesCount = useMemo(
    () => new Set(role?.permissions.map((permission) => permission.module) ?? []).size,
    [role]
  )
  const criticalAssignedCount = role?.permissions.filter((permission) => permission.is_critical).length ?? 0

  // Toggle inmediato: asigna si no estaba marcado, revoca si ya lo estaba --
  // sin estado de "cambios sin guardar" (confirmado en el contrato del
  // lote).
  async function handleToggle(permission: AdminPermission) {
    if (!role) return
    const isAssigned = assignedIds.has(permission.id)
    setBusyPermissionId(permission.id)
    setToggleError(null)
    try {
      if (isAssigned) {
        await revokePermissionFromRole(permission.id, role.id)
        setRole((current) =>
          current
            ? { ...current, permissions: current.permissions.filter((item) => item.id !== permission.id) }
            : current
        )
      } else {
        await assignPermissionToRole(permission.id, { role_id: role.id })
        setRole((current) => (current ? { ...current, permissions: [...current.permissions, permission] } : current))
      }
    } catch (error) {
      setToggleError(errorMessage(error))
    } finally {
      setBusyPermissionId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}
      {toggleError && (
        <p className="text-sm text-destructive" role="alert">
          {toggleError}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="matrixRoleSelect">Rol</Label>
          <Select
            items={roleItems}
            value={selectedRoleId ? String(selectedRoleId) : null}
            onValueChange={(value) => setSelectedRoleId(value ? Number(value) : null)}
          >
            <SelectTrigger id="matrixRoleSelect">
              <SelectValue placeholder="Selecciona un rol" />
            </SelectTrigger>
            <SelectContent>
              {allRoles.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {role && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{assignedModulesCount} módulos</Badge>
            <Badge variant="secondary">
              {role.permissions.length}/{catalog.length} permisos
            </Badge>
            <Badge variant="destructive">{criticalAssignedCount} críticos</Badge>
            <Badge variant="secondary">{role.users_count} usuarios</Badge>
          </div>
        )}
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground" role="status">
          Cargando…
        </p>
      )}

      {!isLoading && role && (
        <div className="flex flex-col gap-3">
          {!role.is_editable && (
            <p className="text-sm text-muted-foreground" role="status">
              Rol de sistema, no editable.
            </p>
          )}
          <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow className="divide-x divide-border">
                  <TableHead>Módulo</TableHead>
                  {actionColumns.map((action) => (
                    <TableHead key={action} className="text-center">
                      {actionLabel(action)}
                    </TableHead>
                  ))}
                  <TableHead className="text-center">Nivel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGroups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={actionColumns.length + 2} className="text-center text-muted-foreground">
                      Ningún módulo coincide con los filtros.
                    </TableCell>
                  </TableRow>
                )}
                {filteredGroups.map(([module, permissions]) => {
                  const riskLevel = highestRiskLevel(permissions)
                  return (
                    <TableRow key={module} className="divide-x divide-border">
                      <TableCell className="font-medium">{moduleLabel(module)}</TableCell>
                      {actionColumns.map((action) => {
                        const permission = permissions.find((item) => item.action === action)
                        if (!permission) {
                          return (
                            <TableCell key={action} className="text-muted-foreground/40">
                              <div className="flex justify-center">—</div>
                            </TableCell>
                          )
                        }
                        const isAssigned = assignedIds.has(permission.id)
                        const isBusy = busyPermissionId === permission.id
                        return (
                          <TableCell key={action}>
                            <div className="flex justify-center">
                              {isBusy ? (
                                <Loader2
                                  className="size-4 animate-spin text-muted-foreground"
                                  role="status"
                                  aria-label={`Actualizando ${permission.name}`}
                                />
                              ) : (
                                <Checkbox
                                  aria-label={permission.name}
                                  checked={isAssigned}
                                  disabled={!role.is_editable}
                                  onCheckedChange={() => handleToggle(permission)}
                                />
                              )}
                            </div>
                          </TableCell>
                        )
                      })}
                      <TableCell className="text-center">
                        <Badge className={RISK_LEVEL_CLASSES[riskLevel]}>{RISK_LEVEL_LABELS[riskLevel]}</Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            {role.permissions.length} permisos activos · {assignedModulesCount} módulos · {criticalAssignedCount}{' '}
            permisos críticos · {role.users_count} usuarios con este rol
          </p>
        </div>
      )}
    </div>
  )
}

// ---- Sub-vista "Por Módulo" -------------------------------------------
// Filas = permissions del módulo, columnas = roles (rectangular, a
// diferencia de "Por Rol" -- viene ya armado por el backend en un solo
// endpoint, ver PermissionMatrixByModule).
function ModuleMatrixView({
  search,
  statusFilter,
  levelFilter,
}: {
  search: string
  statusFilter: StatusFilterValue
  levelFilter: LevelFilterValue
}) {
  const [moduleFilter, setModuleFilter] = useState<string>(MODULE_CODES[0])
  const [matrix, setMatrix] = useState<PermissionMatrixByModule | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busyCellKey, setBusyCellKey] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const moduleItems = MODULE_CODES.map((code) => ({ value: code, label: moduleLabel(code) }))

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setToggleError(null)
    fetchPermissionMatrixByModule(moduleFilter)
      .then((result) => {
        if (cancelled) return
        setMatrix(result)
        setLoadError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(errorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [moduleFilter])

  function isAssigned(permissionId: number, roleId: number): boolean {
    return matrix?.assignments[String(permissionId)]?.includes(roleId) ?? false
  }

  const filteredPermissions = useMemo(() => {
    if (!matrix) return []
    return matrix.permissions.filter((permission) => {
      if (statusFilter !== 'all' && permission.is_active !== (statusFilter === 'active')) return false
      if (levelFilter !== 'all' && permissionPriorityLevel(permission.priority_level) !== levelFilter) return false
      if (!matchesSearch(search, permission.name)) return false
      return true
    })
  }, [matrix, statusFilter, levelFilter, search])

  const criticalCount = matrix?.permissions.filter((permission) => permission.is_critical).length ?? 0

  async function handleToggle(permission: AdminPermission, role: AdminRole) {
    if (!matrix) return
    const key = `${permission.id}-${role.id}`
    const assigned = isAssigned(permission.id, role.id)
    setBusyCellKey(key)
    setToggleError(null)
    try {
      if (assigned) {
        await revokePermissionFromRole(permission.id, role.id)
      } else {
        await assignPermissionToRole(permission.id, { role_id: role.id })
      }
      setMatrix((current) => {
        if (!current) return current
        const permissionKey = String(permission.id)
        const currentRoleIds = current.assignments[permissionKey] ?? []
        const nextRoleIds = assigned
          ? currentRoleIds.filter((id) => id !== role.id)
          : [...currentRoleIds, role.id]
        return { ...current, assignments: { ...current.assignments, [permissionKey]: nextRoleIds } }
      })
    } catch (error) {
      setToggleError(errorMessage(error))
    } finally {
      setBusyCellKey(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}
      {toggleError && (
        <p className="text-sm text-destructive" role="alert">
          {toggleError}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="matrixModuleSelect">Módulo</Label>
          <Select items={moduleItems} value={moduleFilter} onValueChange={(value) => value && setModuleFilter(value)}>
            <SelectTrigger id="matrixModuleSelect">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {moduleItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {matrix && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{matrix.permissions.length} permisos</Badge>
            <Badge variant="secondary">{matrix.roles.length} roles</Badge>
            <Badge variant="destructive">{criticalCount} críticos</Badge>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          Cargando…
        </p>
      ) : matrix ? (
        <div className="flex flex-col gap-3">
          <div className="overflow-auto rounded-xl ring-1 ring-foreground/10">
            <Table>
              <TableHeader>
                <TableRow className="divide-x divide-border">
                  <TableHead>Permiso</TableHead>
                  <TableHead>Nivel</TableHead>
                  {matrix.roles.map((role) => (
                    <TableHead key={role.id} className="text-center">
                      {role.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPermissions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2 + matrix.roles.length} className="text-center text-muted-foreground">
                      Ningún permiso coincide con los filtros.
                    </TableCell>
                  </TableRow>
                )}
                {filteredPermissions.map((permission) => {
                  const riskLevel = permissionPriorityLevel(permission.priority_level)
                  return (
                    <TableRow key={permission.id} className="divide-x divide-border">
                      <TableCell>{permission.name}</TableCell>
                      <TableCell>
                        <Badge className={RISK_LEVEL_CLASSES[riskLevel]}>{RISK_LEVEL_LABELS[riskLevel]}</Badge>
                      </TableCell>
                      {matrix.roles.map((role) => {
                        const assigned = isAssigned(permission.id, role.id)
                        const key = `${permission.id}-${role.id}`
                        const isBusy = busyCellKey === key
                        return (
                          <TableCell key={role.id}>
                            <div className="flex justify-center">
                              {isBusy ? (
                                <Loader2
                                  className="size-4 animate-spin text-muted-foreground"
                                  role="status"
                                  aria-label={`Actualizando ${permission.name} - ${role.name}`}
                                />
                              ) : (
                                <Checkbox
                                  aria-label={`${permission.name} - ${role.name}`}
                                  checked={assigned}
                                  disabled={!role.is_editable}
                                  onCheckedChange={() => handleToggle(permission, role)}
                                />
                              )}
                            </div>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground">
            Módulo: {moduleLabel(matrix.module)} · {filteredPermissions.length} de {matrix.permissions.length}{' '}
            permisos mostrados
          </p>
        </div>
      ) : null}
    </div>
  )
}

// Punto de color + etiqueta corta usados en el Label del selector y en la
// cabecera de la tabla (Ajuste #4: la tabla ya no repite el nombre
// completo del rol, solo "Rol A"/"Rol B"/"Rol C" -- el nombre completo
// sigue viviendo únicamente en el Select de arriba).
const ROLE_SLOT_DOT_CLASSES = {
  A: 'bg-sky-500',
  B: 'bg-violet-500',
  C: 'bg-rose-500',
} as const
type RoleSlot = keyof typeof ROLE_SLOT_DOT_CLASSES

function RoleSlotDot({ slot }: { slot: RoleSlot }) {
  return <span className={cn('size-2 rounded-full', ROLE_SLOT_DOT_CLASSES[slot])} aria-hidden="true" />
}

// Variante inline-block (en vez de flex) para usar dentro de <TableHead>
// (un <th>) -- display:flex en un <th> le quita su rol de celda de tabla
// para efectos de layout, así que el punto de color se apoya en
// `inline-block` + margen, igual que la versión anterior de este mismo
// header.
function RoleSlotInlineDot({ slot }: { slot: RoleSlot }) {
  return (
    <span
      className={cn('mr-1.5 inline-block size-2 rounded-full', ROLE_SLOT_DOT_CLASSES[slot])}
      aria-hidden="true"
    />
  )
}

// ---- Sub-vista "Comparativa" ------------------------------------------
// Solo lectura (sin toggle) -- diff client-side de los permisos de 2 o 3
// roles (Rol C es opcional), en una única tabla agrupada por módulo (fila
// de sección, el módulo no se repite en cada fila).
function ComparisonView({
  allRoles,
  search,
  moduleFilter,
  levelFilter,
  onlyDifferences,
}: {
  allRoles: AdminRole[]
  search: string
  moduleFilter: string
  levelFilter: LevelFilterValue
  onlyDifferences: boolean
}) {
  const [roleAId, setRoleAId] = useState<number | null>(null)
  const [roleBId, setRoleBId] = useState<number | null>(null)
  const [roleCId, setRoleCId] = useState<number | null>(null)
  const [roleA, setRoleA] = useState<AdminRoleDetail | null>(null)
  const [roleB, setRoleB] = useState<AdminRoleDetail | null>(null)
  const [roleC, setRoleC] = useState<AdminRoleDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const roleItems = useMemo(() => allRoles.map((item) => ({ value: String(item.id), label: item.name })), [allRoles])
  const roleCItems = useMemo(() => [{ value: 'none', label: 'Ninguno' }, ...roleItems], [roleItems])

  useEffect(() => {
    if (!roleAId || !roleBId) {
      setRoleA(null)
      setRoleB(null)
      setRoleC(null)
      return
    }
    let cancelled = false
    setIsLoading(true)
    Promise.all([fetchRole(roleAId), fetchRole(roleBId), roleCId ? fetchRole(roleCId) : Promise.resolve(null)])
      .then(([resultA, resultB, resultC]) => {
        if (cancelled) return
        setRoleA(resultA.role)
        setRoleB(resultB.role)
        setRoleC(resultC ? resultC.role : null)
        setLoadError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setLoadError(errorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [roleAId, roleBId, roleCId])

  function handleSwap() {
    setRoleAId(roleBId)
    setRoleBId(roleAId)
  }

  // Filas planas (module + permission + estado en A/B/C), agrupadas por
  // módulo solo para el RENDER (fila de sección) -- el cálculo de
  // diferencias en sí es una lista plana para que los badges de resumen y
  // los filtros no tengan que reconstruir el agrupamiento.
  const allRows = useMemo(() => {
    if (!roleA || !roleB) return []
    const byId = new Map<number, AdminPermission>()
    for (const permission of roleA.permissions) byId.set(permission.id, permission)
    for (const permission of roleB.permissions) byId.set(permission.id, permission)
    if (roleC) for (const permission of roleC.permissions) byId.set(permission.id, permission)
    const aIds = new Set(roleA.permissions.map((permission) => permission.id))
    const bIds = new Set(roleB.permissions.map((permission) => permission.id))
    const cIds = roleC ? new Set(roleC.permissions.map((permission) => permission.id)) : null

    // Array.from(...) en vez de `for...of` directo sobre el iterador de
    // Map.values() -- el target "es5" del tsconfig del proyecto no soporta
    // iterar un MapIterator sin --downlevelIteration (ver tsconfig.json).
    return Array.from(byId.values()).map((permission) => {
      const inA = aIds.has(permission.id)
      const inB = bIds.has(permission.id)
      const inC = cIds ? cIds.has(permission.id) : null
      // Con Rol C presente: diferente si A/B/C no coinciden los 3. Sin Rol
      // C: mismo criterio de siempre (inA !== inB).
      const isDifferent = cIds ? !(inA === inB && inB === (inC as boolean)) : inA !== inB
      return {
        permission,
        inA,
        inB,
        inC,
        isDifferent,
        riskLevel: permissionPriorityLevel(permission.priority_level),
      }
    })
  }, [roleA, roleB, roleC])

  const totalDifferences = allRows.filter((row) => row.isDifferent).length
  const totalMatches = allRows.length - totalDifferences

  const filteredGroups = useMemo(() => {
    const filtered = allRows.filter((row) => {
      if (moduleFilter !== 'all' && row.permission.module !== moduleFilter) return false
      if (levelFilter !== 'all' && row.riskLevel !== levelFilter) return false
      if (onlyDifferences && !row.isDifferent) return false
      if (!matchesSearch(search, row.permission.name, moduleLabel(row.permission.module))) return false
      return true
    })
    const groups = new Map<string, typeof filtered>()
    for (const row of filtered) {
      const list = groups.get(row.permission.module) ?? []
      list.push(row)
      groups.set(row.permission.module, list)
    }
    return Array.from(groups.entries())
  }, [allRows, moduleFilter, levelFilter, onlyDifferences, search])

  // Permiso/Estado/Nivel + 1 columna por rol presente (2 o 3).
  const columnCount = 3 + (roleC ? 3 : 2)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="roleASelect" className="flex items-center gap-1.5">
              <RoleSlotDot slot="A" />
              Rol A
            </Label>
            <Select
              items={roleItems}
              value={roleAId ? String(roleAId) : null}
              onValueChange={(value) => setRoleAId(value ? Number(value) : null)}
            >
              <SelectTrigger id="roleASelect">
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                {allRoles.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" onClick={handleSwap}>
            <ArrowLeftRight className="size-4" aria-hidden="true" />
            Intercambiar Roles
          </Button>
          <div className="flex flex-1 flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="roleBSelect" className="flex items-center gap-1.5">
              <RoleSlotDot slot="B" />
              Rol B
            </Label>
            <Select
              items={roleItems}
              value={roleBId ? String(roleBId) : null}
              onValueChange={(value) => setRoleBId(value ? Number(value) : null)}
            >
              <SelectTrigger id="roleBSelect">
                <SelectValue placeholder="Selecciona un rol" />
              </SelectTrigger>
              <SelectContent>
                {allRoles.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="roleCSelect" className="flex items-center gap-1.5">
              <RoleSlotDot slot="C" />
              Rol C
            </Label>
            <Select
              items={roleCItems}
              value={roleCId ? String(roleCId) : 'none'}
              onValueChange={(value) => setRoleCId(value && value !== 'none' ? Number(value) : null)}
            >
              <SelectTrigger id="roleCSelect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ninguno</SelectItem>
                {allRoles.map((item) => (
                  <SelectItem key={item.id} value={String(item.id)}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {roleA && roleB && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400">{totalDifferences} diferencias</Badge>
            <Badge variant="secondary">{totalMatches} iguales</Badge>
          </div>
        )}
      </div>

      {loadError && (
        <p className="text-sm text-destructive" role="alert">
          {loadError}
        </p>
      )}
      {isLoading && (
        <p className="text-sm text-muted-foreground" role="status">
          Cargando…
        </p>
      )}

      {!isLoading && roleA && roleB && (
        <div className="flex flex-col gap-3">
          {filteredGroups.length === 0 && (
            <p className="text-sm text-muted-foreground">Ningún permiso coincide con los filtros.</p>
          )}
          {filteredGroups.length > 0 && (
            <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow className="divide-x divide-border">
                    <TableHead>Permiso</TableHead>
                    <TableHead>
                      <RoleSlotInlineDot slot="A" />
                      Rol A
                    </TableHead>
                    <TableHead>
                      <RoleSlotInlineDot slot="B" />
                      Rol B
                    </TableHead>
                    {roleC && (
                      <TableHead>
                        <RoleSlotInlineDot slot="C" />
                        Rol C
                      </TableHead>
                    )}
                    <TableHead>Estado</TableHead>
                    <TableHead>Nivel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map(([module, rows]) => (
                    <Fragment key={module}>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={columnCount} className="border-l-4 border-primary/50 font-semibold">
                          {moduleLabel(module)}
                        </TableCell>
                      </TableRow>
                      {rows.map(({ permission, inA, inB, inC, isDifferent, riskLevel }) => (
                        <TableRow
                          key={permission.id}
                          className={cn(
                            'divide-x divide-border',
                            isDifferent ? 'bg-amber-50 dark:bg-amber-950/20' : undefined
                          )}
                        >
                          <TableCell>{permission.name}</TableCell>
                          <TableCell className={cn(isDifferent && !inA && 'rounded-md ring-2 ring-amber-400')}>
                            <ReadOnlyMark checked={inA} label={inA ? 'Sí' : 'No'} />
                          </TableCell>
                          <TableCell className={cn(isDifferent && !inB && 'rounded-md ring-2 ring-amber-400')}>
                            <ReadOnlyMark checked={inB} label={inB ? 'Sí' : 'No'} />
                          </TableCell>
                          {roleC && (
                            <TableCell className={cn(isDifferent && !inC && 'rounded-md ring-2 ring-amber-400')}>
                              <ReadOnlyMark checked={Boolean(inC)} label={inC ? 'Sí' : 'No'} />
                            </TableCell>
                          )}
                          <TableCell>
                            <Badge
                              className={
                                isDifferent
                                  ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                                  : 'bg-muted text-muted-foreground'
                              }
                            >
                              {isDifferent ? 'Diferente' : 'Igual'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={RISK_LEVEL_CLASSES[riskLevel]}>{RISK_LEVEL_LABELS[riskLevel]}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Cierre de brecha del CRUD de Permisos vs. Figma: pantalla "Matriz de
// Permisos" no existía. 3 sub-vistas -- "Por Rol"/"Por Módulo" con toggle
// inmediato de asignación (assign/revoke, sin estado de "cambios sin
// guardar"), "Comparativa" de solo lectura. Sin botón "Exportar" (fuera de
// alcance, mismo criterio ya declinado para Roles/Usuarios en este lote).
//
// Rediseño visual (2026-07-14): layout compartido de filtros+tabs
// construido UNA sola vez aquí (Card con buscador+selects a la izquierda,
// separador, tabs a la derecha) -- cada sub-vista solo aporta sus propios
// selects específicos vía render condicional según `activeTab`, nunca
// duplica la fila. Los filtros (Módulo/Estado/Nivel) SÍ acotan las filas
// mostradas en cada sub-vista, a diferencia de la versión anterior. La
// columna "Categoría" de Figma (Consulta/Operación/Control/Admin) no
// existe en el esquema -- se omitió a propósito, sin inventarla.
export function PermissionsMatrixScreen() {
  const { isAuthorized } = useRequireAuth('permissions.read')
  const [allRoles, setAllRoles] = useState<AdminRole[]>([])
  const [isLoadingRoles, setIsLoadingRoles] = useState(true)
  const [rolesError, setRolesError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'porRol' | 'porModulo' | 'comparativa'>('porRol')

  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all')
  const [levelFilter, setLevelFilter] = useState<LevelFilterValue>('all')
  const [onlyDifferences, setOnlyDifferences] = useState(false)

  useEffect(() => {
    if (!isAuthorized) return
    let cancelled = false
    fetchRoles({ perPage: 100 })
      .then((result) => {
        if (cancelled) return
        setAllRoles(result.data)
        setRolesError(null)
      })
      .catch((error) => {
        if (cancelled) return
        setRolesError(errorMessage(error))
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRoles(false)
      })
    return () => {
      cancelled = true
    }
  }, [isAuthorized])

  const moduleFilterItems = [
    { value: 'all', label: 'Todos' },
    ...MODULE_CODES.map((code) => ({ value: code, label: moduleLabel(code) })),
  ]

  if (!isAuthorized || isLoadingRoles) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {rolesError && (
        <p className="text-sm text-destructive" role="alert">
          {rolesError}
        </p>
      )}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <Card>
          <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-56">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  placeholder="Buscar módulo, permiso…"
                  aria-label="Buscar en la matriz de permisos"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-8"
                />
              </div>

              {activeTab !== 'porModulo' && (
                <Select
                  items={moduleFilterItems}
                  value={moduleFilter}
                  onValueChange={(value) => value && setModuleFilter(value)}
                >
                  <SelectTrigger aria-label="Filtrar por módulo" className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {moduleFilterItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {activeTab !== 'comparativa' && (
                <Select
                  items={STATUS_FILTER_OPTIONS}
                  value={statusFilter}
                  onValueChange={(value) => value && setStatusFilter(value as StatusFilterValue)}
                >
                  <SelectTrigger aria-label="Filtrar por estado" className="w-full sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTER_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select
                items={LEVEL_FILTER_OPTIONS}
                value={levelFilter}
                onValueChange={(value) => value && setLevelFilter(value as LevelFilterValue)}
              >
                <SelectTrigger aria-label="Filtrar por nivel" className="w-full sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEVEL_FILTER_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {activeTab === 'comparativa' && (
                <Select
                  items={DIFFERENCES_FILTER_OPTIONS}
                  value={onlyDifferences ? 'diff' : 'all'}
                  onValueChange={(value) => setOnlyDifferences(value === 'diff')}
                >
                  <SelectTrigger aria-label="Mostrar solo diferencias" className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFERENCES_FILTER_OPTIONS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Separator orientation="vertical" className="hidden h-8 lg:block" />

            <TabsList>
              <TabsTrigger value="porRol">Por Rol</TabsTrigger>
              <TabsTrigger value="porModulo">Por Módulo</TabsTrigger>
              <TabsTrigger value="comparativa">Comparativa</TabsTrigger>
            </TabsList>
          </CardContent>
        </Card>

        <TabsContent value="porRol" className="pt-4">
          <RoleMatrixView
            allRoles={allRoles}
            search={search}
            moduleFilter={moduleFilter}
            statusFilter={statusFilter}
            levelFilter={levelFilter}
          />
        </TabsContent>
        <TabsContent value="porModulo" className="pt-4">
          <ModuleMatrixView search={search} statusFilter={statusFilter} levelFilter={levelFilter} />
        </TabsContent>
        <TabsContent value="comparativa" className="pt-4">
          <ComparisonView
            allRoles={allRoles}
            search={search}
            moduleFilter={moduleFilter}
            levelFilter={levelFilter}
            onlyDifferences={onlyDifferences}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
