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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  ApiValidationError,
  activatePreapprovedWaste,
  deactivatePreapprovedWaste,
  fetchPreapprovedWastes,
  type AdminPreapprovedWaste,
} from 'app/features/admin/api'
import { useAuth, useRequireAuth } from 'app/provider/auth'
import { OrganizationSearchSelect } from '../OrganizationSearchSelect'

const PER_PAGE = 15
const SEARCH_DEBOUNCE_MS = 300

function errorMessage(error: unknown, key: string): string {
  if (error instanceof ApiValidationError) {
    return error.firstError(key) ?? error.message
  }
  return error instanceof Error ? error.message : 'Error inesperado.'
}

// Clasificación resumida de la fila -- corrientes Y/A + códigos UN
// eager-cargados por `index()` (ver `AdminPreapprovedWaste.waste_stream_
// assignments`/`.waste_un_codes`, ambos opcionales -- ver docblock del tipo).
function classificationSummary(waste: AdminPreapprovedWaste): { key: string; label: string }[] {
  const streams = (waste.waste_stream_assignments ?? []).map((assignment) => ({
    key: `stream-${assignment.id}`,
    label: assignment.waste_stream.code,
  }))
  const unCodes = (waste.waste_un_codes ?? []).map((assignment) => ({
    key: `un-${assignment.id}`,
    label: assignment.un_code.code,
  }))
  return [...streams, ...unCodes]
}

// Términos comerciales resumidos -- toma la ÚNICA `WasteTreatmentApproval`
// asociada (siempre exactamente una, creada en la misma transacción de
// `store()`, ver docblock del backend).
function commercialTermsSummary(waste: AdminPreapprovedWaste): string {
  const approval = (waste.treatment_approvals ?? [])[0]
  if (!approval || approval.unit_price == null) return 'Sin definir'
  return `${approval.unit_price} ${approval.currency}/${approval.billing_unit}`
}

// "Residuos Preaprobados" (`wastes.waste_type_id=PREAPPROVED`, RN-191, ver
// docblock completo de `PreapprovedWasteController`) -- listado, mismo
// patrón EXACTO que WasteStreamsListScreen.tsx/WastesListScreen.tsx (grupo
// "Residuos" del sidebar, sin `CatalogPageHeader` -- ese patrón es exclusivo
// de "Catálogos Maestros"). Acceso DUAL, mismo criterio de filtro opcional
// de organización que OrganizationalAreasListScreen.tsx: platform staff ve
// TODAS las organizaciones Gestor (`OrganizationSearchSelect` OPCIONAL,
// acotado a `capability="can_treat_waste"` -- solo esas organizaciones
// pueden tener residuos preaprobados); un admin de tenant solo ve los de la
// suya, sin selector (si su organización no es Gestor, la lista vuelve
// VACÍA -- comportamiento del backend, no un error de esta pantalla). SIN
// filtro de estado activo/inactivo -- `index()` no lo soporta (a diferencia
// de WasteStreamsListScreen.tsx), y SIN kpis en la respuesta (a diferencia
// de WastesListScreen.tsx) -- ver docblock de `fetchPreapprovedWastes()`.
export function PreapprovedWastesListScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const { isAuthorized } = useRequireAuth('preapproved_wastes.read')
  const isPlatformStaff = Boolean(user?.is_platform_staff)

  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [organizationLabel, setOrganizationLabel] = useState<string | null>(null)

  const [wastes, setWastes] = useState<AdminPreapprovedWaste[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  const [page, setPage] = useState(1)
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
    fetchPreapprovedWastes({
      page,
      perPage: PER_PAGE,
      search: search || undefined,
      organizationId: isPlatformStaff && organizationId ? organizationId : undefined,
    })
      .then((result) => {
        if (cancelled) return
        setWastes(result.data)
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
  }, [isAuthorized, page, search, isPlatformStaff, organizationId])

  useEffect(() => load(), [load])

  // `activate()`/`deactivate()` devuelven `waste->fresh()` SIN relaciones --
  // se mezcla explícitamente solo `is_active` para no pisar la clasificación/
  // términos ya cargados por `index()` con `undefined`.
  async function handleToggleActive(waste: AdminPreapprovedWaste) {
    setBusyId(waste.id)
    setActionErrors((current) => ({ ...current, [waste.id]: '' }))
    try {
      const { waste: updated } = waste.is_active
        ? await deactivatePreapprovedWaste(waste.id)
        : await activatePreapprovedWaste(waste.id)
      setWastes((current) =>
        current.map((item) => (item.id === waste.id ? { ...item, is_active: updated.is_active } : item))
      )
    } catch (error) {
      setActionErrors((current) => ({ ...current, [waste.id]: errorMessage(error, 'waste') }))
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

  const rangeStart = total === 0 ? 0 : (page - 1) * PER_PAGE + 1
  const rangeEnd = Math.min(page * PER_PAGE, total)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            placeholder="Buscar por nombre o código…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="sm:max-w-xs"
            aria-label="Buscar residuos preaprobados"
          />
          {isPlatformStaff && (
            <div className="sm:w-64">
              <OrganizationSearchSelect
                label="Organización"
                htmlId="preapprovedWasteOrganizationFilter"
                capability="can_treat_waste"
                selectedId={organizationId}
                selectedLabel={organizationLabel}
                onSelect={(result) => {
                  setOrganizationId(result.id)
                  setOrganizationLabel(result.legal_name)
                  setPage(1)
                }}
                onClear={() => {
                  setOrganizationId(null)
                  setOrganizationLabel(null)
                  setPage(1)
                }}
              />
            </div>
          )}
        </div>
        <Button onClick={() => router.push('/admin/preapproved-wastes/new')}>+ Crear Residuo Preaprobado</Button>
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
                {isPlatformStaff && <TableHead>Organización</TableHead>}
                <TableHead>Clasificación</TableHead>
                <TableHead>Términos Comerciales</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wastes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isPlatformStaff ? 6 : 5} className="text-center text-muted-foreground">
                    No hay residuos preaprobados que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {wastes.map((waste) => {
                const classification = classificationSummary(waste)
                return (
                  <TableRow key={waste.id}>
                    <TableCell>
                      <button
                        type="button"
                        className="text-left hover:underline"
                        onClick={() => router.push(`/admin/preapproved-wastes/${waste.id}`)}
                      >
                        <div className="font-medium">{waste.name}</div>
                        <div className="text-xs text-muted-foreground">{waste.code ?? '—'}</div>
                      </button>
                    </TableCell>
                    {isPlatformStaff && (
                      <TableCell className="text-muted-foreground">
                        {waste.organization?.legal_name ?? '—'}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {classification.length === 0 && <span className="text-muted-foreground">—</span>}
                        {classification.map((item) => (
                          <Badge key={item.key} variant="outline">
                            {item.label}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{commercialTermsSummary(waste)}</TableCell>
                    <TableCell>
                      <Badge variant={waste.is_active ? 'default' : 'secondary'}>
                        {waste.is_active ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="outline" size="sm" aria-label={`Acciones para ${waste.name}`}>
                                <MoreHorizontal className="size-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => router.push(`/admin/preapproved-wastes/${waste.id}`)}>
                              Ver
                            </DropdownMenuItem>
                            <DropdownMenuItem disabled={busyId === waste.id} onClick={() => handleToggleActive(waste)}>
                              {waste.is_active ? 'Inactivar' : 'Activar'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {actionErrors[waste.id] && (
                          <p className="max-w-56 text-right text-xs text-destructive" role="alert">
                            {actionErrors[waste.id]}
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
          Mostrando {rangeStart}–{rangeEnd} de {total} residuos preaprobados
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
