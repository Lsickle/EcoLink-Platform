'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  fetchTreatmentApprovals,
  type AdminTreatmentApproval,
  type TreatmentApprovalCommercialStatus,
  type TreatmentApprovalTechnicalStatus,
} from 'app/features/admin/api'
import { useRequireAuth } from 'app/provider/auth'

const PER_PAGE = 15
const SEARCH_DEBOUNCE_MS = 300
const allFilterValue = 'all'

const TECHNICAL_STATUSES: TreatmentApprovalTechnicalStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'RESTRICTED']
const COMMERCIAL_STATUSES: TreatmentApprovalCommercialStatus[] = [
  'DRAFT',
  'QUOTED',
  'NEGOTIATING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]

const TECHNICAL_STATUS_LABELS: Record<TreatmentApprovalTechnicalStatus, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  RESTRICTED: 'Aprobado con Restricciones',
}

const TECHNICAL_STATUS_BADGE_VARIANT: Record<TreatmentApprovalTechnicalStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  APPROVED: 'default',
  REJECTED: 'destructive',
  RESTRICTED: 'outline',
}

const COMMERCIAL_STATUS_LABELS: Record<TreatmentApprovalCommercialStatus, string> = {
  DRAFT: 'Borrador',
  QUOTED: 'Cotizado',
  NEGOTIATING: 'En Negociación',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
}

const COMMERCIAL_STATUS_BADGE_VARIANT: Record<TreatmentApprovalCommercialStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  QUOTED: 'outline',
  NEGOTIATING: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
  CANCELLED: 'destructive',
}

const technicalFilterOptions = [
  { value: allFilterValue, label: 'Todos' },
  ...TECHNICAL_STATUSES.map((status) => ({ value: status, label: TECHNICAL_STATUS_LABELS[status] })),
]

const commercialFilterOptions = [
  { value: allFilterValue, label: 'Todos' },
  ...COMMERCIAL_STATUSES.map((status) => ({ value: status, label: COMMERCIAL_STATUS_LABELS[status] })),
]

function treatmentApprovalPrice(approval: AdminTreatmentApproval): string {
  return approval.unit_price != null ? `${approval.unit_price} ${approval.currency}/${approval.billing_unit}` : '—'
}

// "Evaluación del Gestor" (waste_treatment_approvals) -- listado GENERAL
// desde la perspectiva del GESTOR evaluador (acceso dual: platform staff ve
// todas, un Gestor solo las suyas por `organization_id`, ver
// `WasteTreatmentApprovalController::index()`). Sin botón "Crear" -- las
// solicitudes SIEMPRE se crean desde el detalle de un Residuo (el Generador
// elige el tratamiento, esa elección ES la invitación), nunca desde este
// listado. Sin KPIs -- `index()` no los calcula (a diferencia de
// BranchTreatmentsListScreen.tsx/VehiclesListScreen.tsx).
//
// GAP de contrato documentado en el resumen del lote: `index()` eager-carga
// `branchTreatment:id,operational_name,branch_id,treatment_id` (SIN
// `treatment` anidado) y `waste:id,name,code,organization_id` (SIN
// `waste.organization` anidado) -- por eso la columna "Tratamiento" usa
// `operational_name` (el nombre que el propio Gestor le dio a esa
// habilitación) en vez del nombre del tratamiento base, con el nombre del
// Gestor (`approval.organization.legal_name` -- ESTE SÍ disponible en
// `index()`, es el otro lado de la relación cruzada) como subtítulo -- útil
// sobre todo para platform staff, que ve evaluaciones de múltiples Gestores
// a la vez. La columna "Organización Generadora" (el dueño del residuo, NO
// el Gestor) no puede resolverse a un nombre con los datos de `index()` --
// solo se conoce el `organization_id` numérico del residuo, no su
// `legal_name` -- se muestra "—" en vez de inventar un valor. El detalle
// (`show()`) SÍ trae ambos completos, ver TreatmentApprovalDetailScreen.tsx.
export function TreatmentApprovalsListScreen() {
  const router = useRouter()
  const { isAuthorized } = useRequireAuth('treatment_approvals.read')

  const [approvals, setApprovals] = useState<AdminTreatmentApproval[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [technicalStatusFilter, setTechnicalStatusFilter] = useState(allFilterValue)
  const [commercialStatusFilter, setCommercialStatusFilter] = useState(allFilterValue)

  const [page, setPage] = useState(1)
  const [lastPage, setLastPage] = useState(1)
  const [total, setTotal] = useState(0)

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
    fetchTreatmentApprovals({
      page,
      perPage: PER_PAGE,
      search: search || undefined,
      technicalStatus: technicalStatusFilter === allFilterValue ? undefined : (technicalStatusFilter as TreatmentApprovalTechnicalStatus),
      commercialStatus: commercialStatusFilter === allFilterValue ? undefined : (commercialStatusFilter as TreatmentApprovalCommercialStatus),
    })
      .then((result) => {
        if (cancelled) return
        setApprovals(result.data)
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
  }, [isAuthorized, page, search, technicalStatusFilter, commercialStatusFilter])

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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          placeholder="Buscar por residuo…"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="sm:max-w-xs"
          aria-label="Buscar evaluaciones de tratamiento"
        />
        <Select
          items={technicalFilterOptions}
          value={technicalStatusFilter}
          onValueChange={(value) => {
            if (!value) return
            setTechnicalStatusFilter(value as string)
            setPage(1)
          }}
        >
          <SelectTrigger aria-label="Filtrar por estado técnico" className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {technicalFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={commercialFilterOptions}
          value={commercialStatusFilter}
          onValueChange={(value) => {
            if (!value) return
            setCommercialStatusFilter(value as string)
            setPage(1)
          }}
        >
          <SelectTrigger aria-label="Filtrar por estado comercial" className="w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {commercialFilterOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                <TableHead>Organización Generadora</TableHead>
                <TableHead>Tratamiento</TableHead>
                <TableHead>Estado Técnico</TableHead>
                <TableHead>Estado Comercial</TableHead>
                <TableHead>Precio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No hay evaluaciones de tratamiento que coincidan con los filtros.
                  </TableCell>
                </TableRow>
              )}
              {approvals.map((approval) => (
                <TableRow key={approval.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left hover:underline"
                      onClick={() => router.push(`/admin/treatment-approvals/${approval.id}`)}
                    >
                      <div className="font-medium">{approval.waste?.name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{approval.waste?.code ?? '—'}</div>
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                  <TableCell>
                    <div>{approval.branch_treatment?.operational_name ?? `Tratamiento #${approval.branch_treatment_id}`}</div>
                    <div className="text-xs text-muted-foreground">{approval.organization?.legal_name ?? '—'}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={TECHNICAL_STATUS_BADGE_VARIANT[approval.technical_status]}>
                      {TECHNICAL_STATUS_LABELS[approval.technical_status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={COMMERCIAL_STATUS_BADGE_VARIANT[approval.commercial_status]}>
                      {COMMERCIAL_STATUS_LABELS[approval.commercial_status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{treatmentApprovalPrice(approval)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
        <span className="text-sm text-muted-foreground">
          Mostrando {rangeStart}–{rangeEnd} de {total} evaluaciones de tratamiento
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
