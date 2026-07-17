'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'

export type MultiChipPickerItem = {
  id: number
  label: string
  sublabel?: string
}

// Componente reutilizable de chips removibles + buscador "+ Agregar" -- Paso
// 2 del wizard de Residuos (Figma nodeId 606:5341, "StreamsY_Box"/
// "StreamsA_Box"/"StreamsUN_Box"). Reutilizado 3 veces (Corrientes Y,
// Corrientes A, Códigos UN) con catálogos ya cargados en memoria (no
// paginados como `OrganizationSearchSelect`) -- el filtro de búsqueda es
// puramente en cliente.
export function MultiChipPicker({
  label,
  addLabel,
  items,
  selectedIds,
  onChange,
  emptyMessage = 'No hay elementos que coincidan.',
}: {
  label: string
  addLabel: string
  items: MultiChipPickerItem[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
  emptyMessage?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedItems = items.filter((item) => selectedIds.includes(item.id))
  const availableItems = items.filter((item) => {
    if (!query.trim()) return true
    const haystack = `${item.label} ${item.sublabel ?? ''}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  function toggleItem(id: number) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((current) => current !== id))
    } else {
      onChange([...selectedIds, id])
    }
  }

  function removeItem(id: number) {
    onChange(selectedIds.filter((current) => current !== id))
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {selectedItems.map((item) => (
          <span
            key={item.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium"
          >
            {item.label}
            <button
              type="button"
              aria-label={`Quitar ${item.label}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => removeItem(item.id)}
            >
              ×
            </button>
          </span>
        ))}
        <div className="relative">
          <button
            type="button"
            className="rounded-full border border-dashed border-muted-foreground/40 px-3 py-1 text-xs font-medium text-muted-foreground hover:border-foreground/40 hover:text-foreground"
            onClick={() => setIsOpen((current) => !current)}
          >
            {addLabel}
          </button>
          {isOpen && (
            <div className="absolute z-10 mt-1 w-64 rounded-md border border-border bg-popover p-2 shadow-md">
              <Input
                autoFocus
                placeholder="Buscar…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="mb-2 h-8"
              />
              <ul role="listbox" className="max-h-48 overflow-y-auto">
                {availableItems.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">{emptyMessage}</li>}
                {availableItems.map((item) => {
                  const isSelected = selectedIds.includes(item.id)
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className={`flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-xs hover:bg-muted ${
                          isSelected ? 'bg-muted/60' : ''
                        }`}
                        onClick={() => toggleItem(item.id)}
                      >
                        <span className="font-medium">
                          {isSelected ? '✓ ' : ''}
                          {item.label}
                        </span>
                        {item.sublabel && <span className="text-muted-foreground">{item.sublabel}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
