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
  activateUnCode,
  deactivateUnCode,
  fetchUnCodes,
  importUnCodes,
  type AdminUnCode,
} from 'app/features/admin/api'
import { formatDate } from 'app/features/admin/formatDate'
import { useRequireAuth } from 'app/provider/auth'
import { ImportCsvDialog } from './ImportCsvDialog'

type StatusFilter = 'all' | 'active' | 'inactive'

const statusFilterOptions: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
]

const perPageOptions = [10, 25, 50] as const

// Mismo umbral de debounce que WasteStreamsListScreen.tsx/RolesListScreen.tsx.
const SEARCH_DEBOUNCE_MS = 300

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// Catálogo "Códigos UN" -- independiente de Corrientes Y/A (sin FK entre sí,
// ver plan aprobado). Mismo patrón EXACTO de filtros/tabla/menú de fila que
// WasteStreamsListScreen.tsx, sin el filtro de `tipo` (UnCode no tiene ese
// campo).
export function UnCodesListScreen() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('un_codes.read')

  const [unCodes, setUnCodes] = useState<AdminUnCode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

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
    fetchUnCodes({
      page,
      perPage,
      search: search || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
    })
      .then((result) => {
        if (cancelled) return
        setUnCodes(result.data)
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
  }, [isAuthorized, page, perPage, search, statusFilter])

  useEffect(() => load(), [load])

  function handleStatusFilterChange(value: StatusFilter) {
    setStatusFilter(value)
    setPage(1)
  }

  function handlePerPageChange(value: string | null) {
    if (!value) return
    setPerPage(Number(value))
    setPage(1)
  }

  async function handleToggleActive(unCode: AdminUnCode) {
    setBusyId(unCode.id)
    setActionErrors((current) => ({ ...current, [unCode.id]: '' }))
    try {
      const { un_code: updated } = unCode.is_active ? await deactivateUnCode(unCode.id) : await activateUnCode(unCode.id)
      setUnCodes((current) => current.map((item) => (item.id === unCode.id ? { ...item, ...updated } : item)))
    } catch (error) {
      setActionErrors((current) => ({ ...current, [unCode.id]: errorMessage(error, 'un_code') }))
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
            aria-label="Buscar códigos UN"
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
        </div>
        <div className="flex items-center gap-2">
          <ImportCsvDialog
            resourceLabel="códigos UN"
            headersHint="code,name,hazard_class,packing_group"
            onImport={importUnCodes}
            onImported={load}
          />
          <Button onClick={() => router.push('/admin/un-codes/new')}>+ Crear Código UN</Button>
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
                <TableHead>Clase de Riesgo</TableHead>
                <TableHead>Grupo de Embalaje</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Creación</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unCodes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No hay códigos UN que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {unCodes.map((unCode) => (
                <TableRow key={unCode.id}>
                  <TableCell className="text-muted-foreground">{unCode.code}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => router.push(`/admin/un-codes/${unCode.id}`)}
                    >
                      {unCode.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{unCode.hazard_class ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{unCode.packing_group ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={unCode.is_system ? 'secondary' : 'outline'}>
                      {unCode.is_system ? 'Sistema' : 'Personalizado'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={unCode.is_active ? 'default' : 'secondary'}>
                      {unCode.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(unCode.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="outline" size="sm" aria-label={`Acciones para ${unCode.name}`}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/admin/un-codes/${unCode.id}`)}>
                            Ver
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/admin/un-codes/${unCode.id}`)}>
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={busyId === unCode.id}
                            onClick={() => handleToggleActive(unCode)}
                          >
                            {unCode.is_active ? 'Inactivar' : 'Activar'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {actionErrors[unCode.id] && (
                        <p className="max-w-56 text-right text-xs text-destructive" role="alert">
                          {actionErrors[unCode.id]}
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
            Mostrando {rangeStart}–{rangeEnd} de {total} códigos UN
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
