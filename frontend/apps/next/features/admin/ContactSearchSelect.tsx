'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiValidationError, searchContacts, type ContactSearchResult } from 'app/features/admin/api'

// Debounce -- mismo umbral usado en el resto de este proyecto
// (OrganizationSearchSelect.tsx/RolesListScreen.tsx/UsersListScreen.tsx).
const SEARCH_DEBOUNCE_MS = 300

/**
 * Selector "Responsable" (`responsible_person_id`) -- combo de búsqueda con
 * debounce sobre `GET /api/admin/organizations/contacts/search`, mismo
 * patrón EXACTO que OrganizationSearchSelect.tsx (sin depender de un
 * catálogo cargado de antemano). Sin `transportScheduleId`, el endpoint NO
 * filtra por organización -- para un actor `is_platform_staff` busca sin
 * restricción, para un actor de tenant normal el backend ya se auto-limita a
 * contactos de su propio tenant (ver AVISO en CreateOrganizationalAreaForm.tsx:
 * un platform staff podría en teoría asignar un responsable sin relación con
 * la organización del área -- gap de backend ya conocido y aceptado, no se
 * corrige aquí).
 *
 * `transportScheduleId` (lote 2026-07-19, ver TransportScheduleDetailScreen.tsx
 * / "Generar Manifiesto de Cargue"): acota la búsqueda a la organización
 * Generadora real de esa `transport_schedule` en vez de la del actor. El
 * backend exige `q` no vacío en ese caso -- este componente ya nunca busca
 * con `q` vacío, así que ese 422 no debería ocurrir nunca en la práctica; si
 * ocurriera igual se ignora en silencio (no es accionable para el usuario).
 * Errores 403 ("sin acceso a la programación")/404 (programación inexistente)
 * sí se muestran, son accionables.
 */
export function ContactSearchSelect({
  label,
  htmlId,
  selectedId,
  selectedLabel,
  onSelect,
  onClear,
  transportScheduleId,
}: {
  label: string
  htmlId: string
  selectedId: number | null
  selectedLabel: string | null
  onSelect: (result: ContactSearchResult) => void
  onClear: () => void
  transportScheduleId?: number | string
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactSearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSearchError(null)
      return
    }
    const timeout = setTimeout(() => {
      searchContacts({ q: query.trim(), perPage: 10, transportScheduleId })
        .then((result) => {
          setResults(result.data)
          setSearchError(null)
        })
        .catch((error) => {
          setResults([])
          if (error instanceof ApiValidationError) {
            // 422 "falta q" -- no debería pasar (ver docblock), se ignora.
            setSearchError(null)
            return
          }
          setSearchError(error instanceof Error ? error.message : 'Error al buscar contactos.')
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [query, transportScheduleId])

  const placeholder = transportScheduleId
    ? 'Escribe para buscar contactos del Generador…'
    : `Buscar ${label.toLowerCase()}…`

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
            placeholder={placeholder}
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
                    {result.first_name} {result.last_name}{' '}
                    <span className="text-muted-foreground">({result.document_number})</span>{' '}
                    <span className="text-muted-foreground">
                      — {result.position_title ?? 'Sin cargo registrado'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {searchError && (
            <p className="mt-1 text-xs text-destructive" role="alert">
              {searchError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
