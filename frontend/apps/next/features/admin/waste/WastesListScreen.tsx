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
  fetchWasteCategories,
  fetchWastes,
  type AdminWaste,
  type AdminWasteCategory,
  type WasteKpis,
  type WasteStatus,
} from 'app/features/admin/api'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'

const PER_PAGE = 15
const SEARCH_DEBOUNCE_MS = 300
const allFilterValue = 'all'

// RN del wizard de Residuos (esquema-bd punto 14/L-22): workflow de
// declaración BR/DEC/REV/CLS/RCH -- DISTINTO de `operational_status_id`
// (eje independiente, no filtrado aquí por simplicidad, igual que
// VehiclesListScreen no filtra por catálogos secundarios sin selector
// propio de Figma).
const DECLARATION_STATUSES: WasteStatus[] = ['BR', 'DEC', 'REV', 'CLS', 'RCH']

const STATUS_LABELS: Record<WasteStatus, string> = {
  BR: 'Borrador',
  DEC: 'Declarado',
  REV: 'En Revisión',
  CLS: 'Clasificado',
  RCH: 'Rechazado',
}

const STATUS_BADGE_VARIANT: Record<WasteStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  BR: 'secondary',
  DEC: 'outline',
  REV: 'outline',
  CLS: 'default',
  RCH: 'destructive',
}

const statusFilterOptions = [
  { value: allFilterValue, label: 'Todos' },
  ...DECLARATION_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
]

const emptyKpis: WasteKpis = { total: 0, active: 0, inactive: 0 }

// Núcleo del Módulo Residuos -- listado (CU del wizard de declaración,
// Figma fileKey pX6vqXxnJ66YSIYpE7v9pV). Acceso DUAL, mismo mecanismo EXACTO
// que VehiclesListScreen.tsx: platform staff ve/gestiona TODOS los residuos
// de cualquier organización; un tenant admin (o `wastes.read` sin ser
// platform staff) solo ve los suyos. 3 KPIs reales (objeto plano
// {total,active,inactive}, ver `WasteController::statusKpis()`) + filtros
// (búsqueda, Organización [solo platform staff], Categoría de Residuo,
// Estado de Declaración) + tabla. Botón "+ Declarar Residuo" abre el wizard
// de 5 pasos (`/admin/wastes/new`).
export function WastesListScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('wastes.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [wastes, setWastes] = useState<AdminWaste[]>([])
  const [kpis, setKpis] = useState<WasteKpis>(emptyKpis)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [organizationFilterId, setOrganizationFilterId] = useState<number | null>(null)
  const [organizationFilterLabel, setOrganizationFilterLabel] = useState<string | null>(null)
  const [wasteCategoryFilter, setWasteCategoryFilter] = useState(allFilterValue)
  const [statusFilter, setStatusFilter] = useState(allFilterValue)

  const [wasteCategories, setWasteCategories] = useState<AdminWasteCategory[]>([])

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!isAuthorized) return
    fetchWasteCategories({ perPage: 100, status: 'active' })
      .then((result) => setWasteCategories(result.data))
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
    fetchWastes({
      page,
      perPage: PER_PAGE,
      search: search || undefined,
      organizationId: isPlatformStaff && organizationFilterId ? organizationFilterId : undefined,
      wasteCategoryId: wasteCategoryFilter === allFilterValue ? undefined : wasteCategoryFilter,
      status: statusFilter === allFilterValue ? undefined : (statusFilter as WasteStatus),
    })
      .then((result) => {
        if (cancelled) return
        setWastes(result.data)
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
  }, [isAuthorized, page, search, isPlatformStaff, organizationFilterId, wasteCategoryFilter, statusFilter])

  if (!isAuthorized) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Cargando…
      </p>
    )
  }

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  const wasteCategoryFilterItems = [
    { value: allFilterValue, label: 'Todas las categorías' },
    ...wasteCategories.map((category) => ({ value: String(category.id), label: category.name })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-t-4 border-t-foreground/20 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="text-2xl font-semibold">{kpis.total}</span>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Activos</span>
            <span className="text-2xl font-semibold">{kpis.active}</span>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-muted-foreground/40 py-0">
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-xs text-muted-foreground">Inactivos</span>
            <span className="text-2xl font-semibold">{kpis.inactive}</span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Buscar por nombre o código…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar residuos"
          />
          {isPlatformStaff && (
            <div className="sm:w-64">
              <OrganizationSearchSelect
                label="Organización"
                htmlId="wasteOrganizationFilter"
                selectedId={organizationFilterId}
                selectedLabel={organizationFilterLabel}
                onSelect={(result) => {
                  setOrganizationFilterId(result.id)
                  setOrganizationFilterLabel(result.legal_name)
                  setPage(1)
                }}
                onClear={() => {
                  setOrganizationFilterId(null)
                  setOrganizationFilterLabel(null)
                  setPage(1)
                }}
              />
            </div>
          )}
          <Select
            items={wasteCategoryFilterItems}
            value={wasteCategoryFilter}
            onValueChange={(value) => {
              if (!value) return
              setWasteCategoryFilter(value as string)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por categoría de residuo" className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {wasteCategoryFilterItems.map((option) => (
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
              if (!value) return
              setStatusFilter(value as string)
              setPage(1)
            }}
          >
            <SelectTrigger aria-label="Filtrar por estado de declaración" className="w-full sm:w-44">
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
        </div>
        <Button onClick={() => router.push('/admin/wastes/new')}>+ Declarar Residuo</Button>
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
                <TableHead>Residuo</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Peligrosidad</TableHead>
                <TableHead>Estado</TableHead>
                {isPlatformStaff && <TableHead>Organización</TableHead>}
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wastes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isPlatformStaff ? 6 : 5} className="text-center text-muted-foreground">
                    No hay residuos que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {wastes.map((waste) => (
                <TableRow key={waste.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => router.push(`/admin/wastes/${waste.id}`)}
                    >
                      <div className="font-medium">{waste.name}</div>
                      <div className="text-xs text-muted-foreground">{waste.code ?? '—'}</div>
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{waste.waste_category?.name ?? '—'}</TableCell>
                  <TableCell>
                    {waste.waste_danger ? <Badge variant="destructive">{waste.waste_danger}</Badge> : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[waste.status]}>{STATUS_LABELS[waste.status]}</Badge>
                  </TableCell>
                  {isPlatformStaff && (
                    <TableCell className="text-muted-foreground">{waste.organization?.legal_name ?? '—'}</TableCell>
                  )}
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="outline" size="sm" aria-label={`Acciones para ${waste.name}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/admin/wastes/${waste.id}`)}>
                          Ver detalle
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="text-sm text-muted-foreground">
          Mostrando {rangeStart}–{rangeEnd} de {total} residuos
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
