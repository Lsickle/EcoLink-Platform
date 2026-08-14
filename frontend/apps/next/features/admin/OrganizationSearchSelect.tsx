'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { searchOrganizations, type OrganizationSearchResult } from 'app/features/admin/api'

// Debounce -- mismo umbral usado en el resto de este proyecto (RolesListScreen.tsx/UsersListScreen.tsx).
const SEARCH_DEBOUNCE_MS = 300

// Selector "Organización Matriz" (`parent_organization_id`) -- combo de
// búsqueda con debounce sobre `GET /api/admin/organizations/search`, sin
// depender de un catálogo cargado de antemano (podría haber miles de
// organizaciones). Reutilizado por CreateOrganizationForm.tsx y
// OrganizationDetailScreen.tsx.
export function OrganizationSearchSelect({
  label,
  htmlId,
  hideLabel = false,
  excludeId,
  capability,
  selectedId,
  selectedLabel,
  onSelect,
  onClear,
}: {
  label: string
  htmlId: string
  /**
   * Oculta el `<Label>` VISUALMENTE (sigue en el árbol de accesibilidad vía
   * `sr-only`, así que `getByLabelText`/lectores de pantalla no cambian).
   * Pensado para las barras de filtros de los listados: ahí el resto de los
   * controles son de una sola línea, y el label apilado encima hacía que
   * este filtro quedara más alto y desalineado con los demás (reporte del
   * usuario, 2026-08-13). El placeholder ya dice "Buscar organización…", así
   * que el label visible era redundante. En FORMULARIOS se deja visible
   * (default), donde sí aporta.
   */
  hideLabel?: boolean
  excludeId?: number | string
  /**
   * Filtra el resultado por business_role activo (ej. `can_treat_waste` para
   * el selector de Organización Gestor de CreateBranchTreatmentForm.tsx) --
   * ver `capability` en `searchOrganizations()`/`OrganizationController::
   * search()`. Sin este prop, el comportamiento es idéntico al de antes
   * (sin filtrar por capacidad).
   */
  capability?: string
  selectedId: number | null
  selectedLabel: string | null
  onSelect: (result: OrganizationSearchResult) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<OrganizationSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)

  // Sin query (foco/clic inicial, ANTES de escribir nada): también dispara
  // la búsqueda -- el backend (`OrganizationController::search()`) ya
  // soporta listar sin filtro de texto (omite el `where` de `q` si viene
  // vacío), pero antes este componente nunca se lo pedía, dejando el
  // listbox vacío hasta que el usuario ya supiera qué nombre escribir.
  // Corrección confirmada por el usuario, 2026-08-13 ("de otra forma yo
  // tendría que saberme todos los nombres de generadores"). Gateado en
  // `isOpen` para no disparar la petición antes de que el campo reciba foco.
  useEffect(() => {
    if (!isOpen) {
      return
    }
    const timeout = setTimeout(() => {
      searchOrganizations({ q: query.trim() || undefined, excludeId, capability, perPage: 10 })
        .then((result) => setResults(result.data))
        .catch(() => setResults([]))
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [query, excludeId, capability, isOpen])

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlId} className={hideLabel ? 'sr-only' : undefined}>
        {label}
      </Label>
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
          {isOpen && results.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      onSelect(result)
                      setQuery('')
                      setResults([])
                      setIsOpen(false)
                    }}
                  >
                    {result.legal_name} <span className="text-muted-foreground">({result.tax_id})</span>
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
