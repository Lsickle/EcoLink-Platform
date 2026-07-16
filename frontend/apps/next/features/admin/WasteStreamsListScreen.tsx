'use client'

import { useCallback, useEffect, useState } from 'react'
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
import {
  ApiValidationError,
  activateWasteStream,
  deactivateWasteStream,
  fetchWasteStreams,
  importWasteStreams,
  type AdminWasteStream,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'
import { ImportCsvDialog } from './ImportCsvDialog'

type StatusFilter = 'all' | 'active' | 'inactive'
type TipoFilter = 'all' | 'Y' | 'A'

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
]

const tipoFilterOptions: { value: TipoFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'Y', label: 'Y' },
  { value: 'A', label: 'A' },
]

const perPageOptions = [10, 25, 50] as const

// Mismo umbral de debounce que RolesListScreen.tsx/PermissionsListScreen.tsx.
const SEARCH_DEBOUNCE_MS = 300

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// Catálogo "Corrientes Y/A" (primer módulo real del dominio Residuos, plan
// aprobado -- ver WasteStreamController). Mismo patrón de filtros/tabla/menú
// de fila que RolesListScreen.tsx, con el filtro adicional de `tipo`
// (exclusivo de este catálogo, Códigos UN no lo tiene) y el modal de
// importación CSV compartido (ImportCsvDialog).
export function WasteStreamsListScreen() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('waste_streams.read')

  const [wasteStreams, setWasteStreams] = useState<AdminWasteStream[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>('all')

  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState<number>(perPageOptions[0])
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [busyId, setBusyId] = useState<number | null>(null)
  const [actionErrors, setActionErrors] = useState<Record<number, string>>({})

  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [searchInput])

  const load = useCallback(() => {
    if (!isAuthorized) return
    let cancelled = false
    setIsLoading(true)
    fetchWasteStreams({
      page,
      perPage,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
      tipo: tipoFilter === 'all' ? undefined : tipoFilter,
    })
      .then((result) => {
        if (cancelled) return
        setWasteStreams(result.data)
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
  }, [isAuthorized, page, perPage, search, statusFilter, tipoFilter])

  useEffect(() => load(), [load])

  function handleStatusFilterChange(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleTipoFilterChange(value: TipoFilter) {
    setTipoFilter(value)
    setPage(1)
  }

  function handlePerPageChange(value: string | null) {
    if (!value) return
    setPerPage(Number(value))
    setPage(1)
  }

  async function handleToggleActive(wasteStream: AdminWasteStream) {
    setBusyId(wasteStream.id)
    setActionErrors((current) => ({ ...current, [wasteStream.id]: '' }))
    try {
      const { waste_stream: updated } = wasteStream.is_active
        ? await deactivateWasteStream(wasteStream.id)
        : await activateWasteStream(wasteStream.id)
      setWasteStreams((current) =>
        current.map((item) => (item.id === wasteStream.id ? { ...item, ...updated } : item))
      )
    } catch (error) {
      setActionErrors((current) => ({ ...current, [wasteStream.id]: errorMessage(error, 'waste_stream') }))
    } finally {
      setBusyId(null)
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
            placeholder="Buscar por código o nombre…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar corrientes"
          />
          <Select
            items={tipoFilterOptions}
            value={tipoFilter}
            onValueChange={(value) => handleTipoFilterChange(value as TipoFilter)}
          >
            <SelectTrigger aria-label="Filtrar por tipo" className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tipoFilterOptions.map((option) => (
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
        </div>
        <div className="flex items-center gap-2">
          <ImportCsvDialog
            resourceLabel="corrientes Y/A"
            headersHint="code,name,tipo"
            onImport={importWasteStreams}
            onImported={load}
          />
          <Button onClick={() => router.push('/admin/waste-streams/new')}>+ Crear Corriente</Button>
        </div>
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
                <TableHead>Tipo</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creación</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wasteStreams.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No hay corrientes que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {wasteStreams.map((wasteStream) => (
                <TableRow key={wasteStream.id}>
                  <TableCell className="text-muted-foreground">{wasteStream.code}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => router.push(`/admin/waste-streams/${wasteStream.id}`)}
                    >
                      {wasteStream.name}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{wasteStream.tipo}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={wasteStream.is_system ? 'secondary' : 'outline'}>
                      {wasteStream.is_system ? 'Sistema' : 'Personalizado'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={wasteStream.is_active ? 'default' : 'secondary'}>
                      {wasteStream.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(wasteStream.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="outline" size="sm" aria-label={`Acciones para ${wasteStream.name}`}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/admin/waste-streams/${wasteStream.id}`)}>
                            Ver
                          </DropdownMenuItem>
                          {/* "Editar" navega al mismo detalle -- WasteStreamDetailScreen ya
                              muestra el formulario de edición inline, mismo patrón que
                              RolesListScreen.tsx/RoleDetailScreen.tsx. */}
                          <DropdownMenuItem onClick={() => router.push(`/admin/waste-streams/${wasteStream.id}`)}>
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={busyId === wasteStream.id}
                            onClick={() => handleToggleActive(wasteStream)}
                          >
                            {wasteStream.is_active ? 'Inactivar' : 'Activar'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {actionErrors[wasteStream.id] && (
                        <p className="max-w-56 text-right text-xs text-destructive" role="alert">
                          {actionErrors[wasteStream.id]}
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
            Mostrando {rangeStart}–{rangeEnd} de {total} corrientes
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
