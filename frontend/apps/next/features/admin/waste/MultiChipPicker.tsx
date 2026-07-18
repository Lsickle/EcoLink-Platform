'use client'

import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
} from '@/components/ui/combobox'

export type MultiChipPickerItem = {
  id: number
  label: string
  sublabel?: string
}

function isSameItem(a: MultiChipPickerItem, b: MultiChipPickerItem) {
  return a.id === b.id
}

function itemLabel(item: MultiChipPickerItem) {
  return item.label
}

function matchesQuery(item: MultiChipPickerItem, query: string) {
  if (!query.trim()) return true
  const haystack = `${item.label} ${item.sublabel ?? ''}`.toLowerCase()
  return haystack.includes(query.trim().toLowerCase())
}

// Componente reutilizable de chips removibles + combobox filtrable -- Paso 2
// del wizard de Residuos (Figma nodeId 606:5341, "StreamsY_Box"/
// "StreamsA_Box"/"StreamsUN_Box"). Reutilizado 3 veces (Corrientes Y,
// Corrientes A, Códigos UN) con catálogos ya cargados en memoria (no
// paginados como `OrganizationSearchSelect`) -- el filtro de búsqueda es
// puramente en cliente.
//
// Internamente usa el primitivo `Combobox` de Base UI (`components/ui/
// combobox.tsx`) en modo `multiple`, con `Combobox.Input` anidado DENTRO del
// popup (patrón "select-style combobox" soportado nativamente por la
// librería vía `inputInsidePopup`) -- el botón "+ Agregar" es un
// `Combobox.Trigger` real (por eso su rol accesible pasa a ser `combobox`,
// no `button`, mientras el popup está anidado; ver tests). Los ids
// numéricos de `selectedIds`/`onChange` (la API pública de este componente)
// se traducen a/desde los objetos `MultiChipPickerItem` completos que exige
// el primitivo como "value" -- `isItemEqualToValue` compara por `id` para no
// depender de identidad referencial de los objetos.
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
  const selectedItems = items.filter((item) => selectedIds.includes(item.id))

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <Combobox
        items={items}
        multiple
        value={selectedItems}
        onValueChange={(values) => onChange(values.map((item) => item.id))}
        isItemEqualToValue={isSameItem}
        itemToStringLabel={itemLabel}
        filter={matchesQuery}
      >
        <div className="flex flex-wrap items-center gap-2">
          <ComboboxChips>
            {selectedItems.map((item) => (
              <ComboboxChip key={item.id}>
                {item.label}
                <ComboboxChipRemove aria-label={`Quitar ${item.label}`} />
              </ComboboxChip>
            ))}
          </ComboboxChips>
          {/* `role="combobox"` (asignado por el primitivo cuando el input vive
              dentro del popup, ver docblock) NO toma el nombre accesible del
              contenido -- requiere `aria-label` explícito aunque el texto
              también se muestre visualmente. */}
          <ComboboxTrigger
            aria-label={addLabel}
            className="w-fit rounded-full border-dashed border-muted-foreground/40 px-3 py-1 text-xs font-medium text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          >
            {addLabel}
          </ComboboxTrigger>
        </div>
        <ComboboxContent>
          <ComboboxInput placeholder="Buscar…" />
          <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
          <ComboboxList>
            {(item: MultiChipPickerItem) => (
              <ComboboxItem key={item.id} value={item}>
                <span className="font-medium">{item.label}</span>
                {item.sublabel && <span className="text-muted-foreground">{item.sublabel}</span>}
                <ComboboxItemIndicator />
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}
