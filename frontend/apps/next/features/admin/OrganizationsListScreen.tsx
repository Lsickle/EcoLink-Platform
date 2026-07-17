'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  fetchBusinessRoles,
  fetchDepartments,
  fetchOrganizations,
  type AdminBusinessRole,
  type AdminDepartment,
  type AdminOrganization,
  type OrganizationKpi,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'

const PER_PAGE = 15

// Debounce de la búsqueda -- mismo umbral usado en RolesListScreen.tsx/
// UsersListScreen.tsx.
const SEARCH_DEBOUNCE_MS = 300

// Acento de color de cada tarjeta KPI/badge de Estado, tomado del
// `color_hex` REAL que ya devuelve el backend (`organization_statuses.
// color_hex`, ver OrganizationController::statusKpis()) -- nunca una
// paleta propia inventada aquí. Tailwind v4 no puede generar clases
// arbitrarias a partir de un hex conocido solo en tiempo de ejecución (el
// escaneo JIT es estático sobre el código fuente), así que el color se
// aplica vía `style` inline.
function colorAccentStyle(colorHex: string | null): React.CSSProperties {
  if (!colorHex) return {}
  return { borderTopColor: colorHex }
}

function statusBadgeStyle(colorHex: string | null): React.CSSProperties {
  if (!colorHex) return {}
  // ~15% de opacidad de fondo, texto sólido -- misma proporción visual que
  // RISK_LEVEL_CLASSES (riskLevel.ts), aplicada aquí con un color dinámico
  // en vez de una clase Tailwind fija.
  return { backgroundColor: `${colorHex}26`, color: colorHex }
}

// CU "CRUD de Organizaciones vs. Figma" -- pantalla EXCLUSIVA de platform
// staff (gate `requirePlatformStaff`, NO un permiso RBAC -- ver
// OrganizationController, `isPlatformStaff()` en vez de una Policy). 5
// tarjetas KPI (una por cada organization_status real) + filtros
// (búsqueda/Tipo/Estado/Departamento) + tabla, mismo patrón EXACTO de
// filtros con debounce/paginación server-side que RolesListScreen.tsx/
// UsersListScreen.tsx.
//
// AVISO -- gap declarado explícitamente (plan del lote): `index()` NO trae
// `branches_count`/`contacts_count`/`users_count` por fila (solo `show()` los
// calcula, ver OrganizationController::index()/show()) -- las columnas
// Sedes/Contactos/Usuarios de abajo muestran "—" a propósito, NUNCA un
// cálculo client-side (implicaría N requests adicionales, uno por fila).
// Cerrar este gap requiere que el backend agregue esos 3 conteos a
// index() (mismo patrón `withCount()` que ya usa `show()`).
export function OrganizationsListScreen() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth(undefined, { requirePlatformStaff: true })

  const [organizations, setOrganizations] = useState<AdminOrganization[]>([])
  const [kpis, setKpis] = useState<OrganizationKpi[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [businessRoleFilter, setBusinessRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [departments, setDepartments] = useState<AdminDepartment[]>([])
  const [businessRoles, setBusinessRoles] = useState<AdminBusinessRole[]>([])

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  // Catálogos de departamentos y tipos de organización para los filtros --
  // extra sobre la tabla ya funcional, un fallo aquí no debe bloquear el
  // listado (mismo criterio que el catálogo de roles en
  // UsersListScreen.tsx). `fetchBusinessRoles()` cierra el gap que antes
  // resolvía `BUSINESS_ROLES_FALLBACK` (ver organizationCatalogs.ts).
  useEffect(() => {
    if (!isAuthorized) return
    fetchDepartments({ perPage: 100 })
      .then((result) => setDepartments(result.data))
      .catch(() => {})
    fetchBusinessRoles({ activeOnly: true })
      .then((result) => setBusinessRoles(result.data))
      .catch(() => {})
  }, [isAuthorized])

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
    fetchOrganizations({
      page,
      perPage: PER_PAGE,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      businessRole: businessRoleFilter === 'all' ? undefined : businessRoleFilter,
      department: departmentFilter === 'all' ? undefined : departmentFilter,
    })
      .then((result) => {
        if (cancelled) return
        setOrganizations(result.data)
        setKpis(result.kpis)
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
  }, [isAuthorized, page, search, statusFilter, businessRoleFilter, departmentFilter])

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  const statusFilterOptions = [
    { value: 'all', label: 'Todos' },
    ...kpis.map((kpi) => ({ value: kpi.code, label: kpi.name })),
  ]
  const businessRoleFilterOptions = [
    { value: 'all', label: 'Todos' },
    ...businessRoles.map((role) => ({ value: role.code, label: role.name })),
  ]
  const departmentFilterOptions = [
    { value: 'all', label: 'Todos' },
    ...departments.map((department) => ({ value: String(department.id), label: department.name })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <Card key={kpi.code} className="border-t-4 py-0" style={colorAccentStyle(kpi.color_hex)}>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-xs text-muted-foreground">{kpi.name}</span>
              <span className="text-2xl font-semibold">{kpi.count}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Buscar por razón social, nombre comercial o NIT…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar organizaciones"
          />
          <Select
            items={businessRoleFilterOptions}
            value={businessRoleFilter}
            onValueChange={(value) => {
              setBusinessRoleFilter(value as string)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por tipo" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {businessRoleFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            items={statusFilterOptions}
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as string)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por estado" className="w-full sm:w-44">
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
            items={departmentFilterOptions}
            value={departmentFilter}
            onValueChange={(value) => {
              setDepartmentFilter(value as string)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por departamento" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {departmentFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => router.push('/admin/organizations/new')}>+ Nueva Organización</Button>
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
                <TableHead>Organización</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ciudad Principal</TableHead>
                <TableHead>Sucursales</TableHead>
                <TableHead>Contactos</TableHead>
                <TableHead>Usuarios</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creación</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No hay organizaciones que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {organizations.map((organization) => {
                const primaryBranch = organization.primary_branch
                const cityLabel = primaryBranch?.municipality
                  ? `${primaryBranch.municipality.name}${primaryBranch.department ? `, ${primaryBranch.department.name}` : ''}`
                  : '—'
                return (
                  <TableRow key={organization.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => router.push(`/admin/organizations/${organization.id}`)}
                      >
                        <div className="font-medium">{organization.legal_name}</div>
                        <div className="text-xs text-muted-foreground">{organization.tax_id}</div>
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {organization.type.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        {organization.type.map((typeName) => (
                          <Badge key={typeName} variant="outline">
                            {typeName}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{cityLabel}</TableCell>
                    {/* AVISO: index() no trae estos 3 conteos por fila -- ver
                        docblock de esta pantalla. */}
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell className="text-muted-foreground">—</TableCell>
                    <TableCell>
                      <Badge style={statusBadgeStyle(organization.status.color_hex)}>{organization.status.name}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(organization.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="outline" size="sm" aria-label={`Acciones para ${organization.legal_name}`}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/admin/organizations/${organization.id}`)}>
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
        <span className="text-sm text-muted-foreground">
          Mostrando {rangeStart}–{rangeEnd} de {total} organizaciones
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
    </div>
  )
}
