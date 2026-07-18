'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { searchOrganizations, type OrganizationSearchResult } from 'app/features/admin/api'

// Selector "Organización" para actores `isPlatformStaff` (Paso 1 del wizard
// de Residuos, WasteWizard.tsx) -- a diferencia de `OrganizationSearchSelect`
// (debounce de 300ms + petición de red por cada tecla, pensado para
// catálogos potencialmente grandes -- Sedes/Áreas Organizacionales/
// Tratamientos de Sucursal, NO tocar ese componente), este carga el
// catálogo COMPLETO de organizaciones UNA sola vez al montar y filtra
// 100% en memoria -- mismo patrón que `MultiChipPicker.tsx` y el resto de
// catálogos de `WasteWizard.tsx` (useEffect + `perPage` alto, sin ninguna
// llamada de red adicional por interacción del usuario).
//
// Asunción declarada explícitamente: el catálogo de organizaciones es
// acotado (mercado colombiano regulado, no miles de registros) -- la carga
// completa en una sola página se asume válida mientras el número de
// organizaciones reales no supere el límite de una sola página del
// endpoint `GET /api/admin/organizations/search` (tope real de 50, ver
// `OrganizationController::search()`, NO modificado aquí a propósito). Si
// el catálogo real crece más allá de eso, este componente necesitará
// paginar o volver al patrón de `OrganizationSearchSelect`.
//
// Flag -- el backend de `search()` solo selecciona `id, legal_name, tax_id`
// (ver `OrganizationSearchResult` en types.ts), aunque el filtro de
// servidor SÍ compara contra `trade_name` además de `legal_name`. Como ese
// campo nunca viaja en la respuesta, el filtro en memoria de este
// componente solo puede operar sobre `legal_name`/`tax_id` -- no sobre
// `trade_name` -- hasta que el backend agregue esa columna al `select()`.
export function OrganizationQuickSelect({
  label,
  htmlId,
  excludeId,
  capability,
  selectedId,
  selectedLabel,
  onSelect,
  onClear,
}: {
  label: string
  htmlId: string
  excludeId?: number | string
  capability?: string
  selectedId: number | null
  selectedLabel: string | null
  onSelect: (result: OrganizationSearchResult) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [organizations, setOrganizations] = useState<OrganizationSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)

  // Carga completa UNA sola vez -- sin `q`, con el `per_page` más alto que
  // el backend permite (ver docblock arriba).
  useEffect(() => {
    searchOrganizations({ excludeId, capability, perPage: 50 })
      .then((result) => setOrganizations(result.data))
      .catch(() => setOrganizations([]))
  }, [excludeId, capability])

  const trimmedQuery = query.trim().toLowerCase()
  const filtered = trimmedQuery
    ? organizations.filter((organization) => {
        const haystack = `${organization.legal_name} ${organization.tax_id}`.toLowerCase()
        return haystack.includes(trimmedQuery)
      })
    : organizations

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlId}>{label}</Label>
      {selectedId ? (
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-border px-2.5 py-1.5 text-sm">{selectedLabel}</span>
          <Button type="button" variant="outline" size="sm" onClick={onClear}>
            Quitar
          </Button>
        </div>
      ) : (
        <div className="relative">
          <Input
            id={htmlId}
            placeholder={`Buscar ${label.toLowerCase()}…`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          />
          {isOpen && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-muted-foreground">No hay organizaciones que coincidan.</li>
              )}
              {filtered.map((organization) => (
                <li key={organization.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      onSelect(organization)
                      setQuery('')
                      setIsOpen(false)
                    }}
                  >
                    {organization.legal_name} <span className="text-muted-foreground">({organization.tax_id})</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
