'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
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
import { fetchPermissions, type AdminPermission } from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { moduleLabel } from 'app/features/admin/moduleLabels'
import { permissionPriorityLevel } from 'app/features/admin/permissionPriority'
import { RISK_LEVEL_CLASSES, RISK_LEVEL_LABELS } from 'app/features/admin/riskLevel'
import { useRequireAuth } from 'app/provider/auth'

type StatusFilter = 'all' | 'active' | 'inactive'
type CriticalFilter = 'all' | 'yes' | 'no'

// Los 4 módulos reales del catálogo hoy (ver comentario en
// features/admin/api.ts) -- hardcodeados aquí a propósito para el filtro
// "Módulo" (a diferencia del agrupamiento, que en otras pantallas se deriva
// dinámicamente de los resultados): este filtro es server-side (`module=`
// en el query string), así que necesita existir ANTES de que llegue la
// primera respuesta.
const MODULE_FILTER_CODES = ['users', 'roles', 'permissions', 'audit'] as const

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
]

const criticalFilterOptions: { value: CriticalFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'yes', label: 'Sí' },
  { value: 'no', label: 'No' },
]

const perPageOptions = [10, 25, 50] as const

// Debounce de la búsqueda -- mismo umbral usado en RolesListScreen.tsx/
// UsersListScreen.tsx.
const SEARCH_DEBOUNCE_MS = 300

// Cierre de brecha del CRUD de Permisos vs. Figma: filtros/columnas nuevas
// sobre el catálogo (sigue siendo de solo lectura en sus propios campos --
// sin crear/editar/eliminar permisos individuales, ya confirmado con el
// usuario) + navegación a Detalle de Permiso y a la nueva Matriz de
// Permisos. Mismo patrón de filtros/tabla/menú de fila que
// RolesListScreen.tsx.
export function PermissionsListScreen() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('permissions.read')

  const [permissions, setPermissions] = useState<AdminPermission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [criticalFilter, setCriticalFilter] = useState<CriticalFilter>('all')

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number>(perPageOptions[0])
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const moduleFilterOptions = [
    { value: 'all', label: 'Todos' },
    ...MODULE_FILTER_CODES.map((code) => ({ value: code, label: moduleLabel(code) })),
  ]

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
    fetchPermissions({
      page,
      perPage,
      search: search || undefined,
      module: moduleFilter === 'all' ? undefined : moduleFilter,
      status: statusFilter === 'all' ? undefined : statusFilter,
      critical: criticalFilter === 'all' ? undefined : criticalFilter === 'yes',
    })
      .then((result) => {
        if (cancelled) return
        setPermissions(result.data)
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
  }, [isAuthorized, page, perPage, search, moduleFilter, statusFilter, criticalFilter])

  function handleModuleFilterChange(value: string | null) {
    if (!value) return
    setModuleFilter(value)
    setPage(1)
  }

  function handleStatusFilterChange(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleCriticalFilterChange(value: CriticalFilter) {
    setCriticalFilter(value)
    setPage(1)
  }

  function handlePerPageChange(value: string | null) {
    if (!value) return
    setPerPage(Number(value))
    setPage(1)
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
            placeholder="Buscar por código o nombre…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar permisos"
          />
          <Select
            items={moduleFilterOptions}
            value={moduleFilter}
            onValueChange={handleModuleFilterChange}
          >
            <SelectTrigger aria-label="Filtrar por módulo" className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {moduleFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            items={criticalFilterOptions}
            value={criticalFilter}
            onValueChange={(value) => handleCriticalFilterChange(value as CriticalFilter)}
          >
            <SelectTrigger aria-label="Filtrar por crítico" className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {criticalFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => router.push('/admin/permissions/matrix')}>
          Ver Matriz de Permisos
        </Button>
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
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Roles</TableHead>
                <TableHead>Nivel</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creación</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {permissions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No hay permisos que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {permissions.map((permission) => {
                const riskLevel = permissionPriorityLevel(permission.priority_level)
                return (
                  <TableRow key={permission.id} data-slot="permission-row">
                    <TableCell className="font-mono text-xs text-muted-foreground">{permission.code}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          onClick={() => router.push(`/admin/permissions/${permission.id}`)}
                        >
                          {permission.name}
                        </button>
                        {permission.is_critical && <Badge variant="destructive">Crítico</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{moduleLabel(permission.module)}</TableCell>
                    <TableCell className="text-muted-foreground">{permission.action}</TableCell>
                    <TableCell>{permission.roles_count ?? 0}</TableCell>
                    <TableCell>
                      <Badge className={RISK_LEVEL_CLASSES[riskLevel]}>{RISK_LEVEL_LABELS[riskLevel]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={permission.is_active ? 'default' : 'secondary'}>
                        {permission.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(permission.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="outline" size="sm" aria-label={`Acciones para ${permission.name}`}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/admin/permissions/${permission.id}`)}>
                            Ver detalle
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            Mostrando {rangeStart}–{rangeEnd} de {total} permisos
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
    </div>
  )
}
