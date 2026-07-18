import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from './combobox'

const fruits = [
  { value: 'apple', label: 'Manzana' },
  { value: 'banana', label: 'Banano' },
  { value: 'cherry', label: 'Cereza' },
]

// Wrapper de shadcn-style sobre `@base-ui/react/combobox` (ver
// `MultiChipPicker` para el caso de uso real de selección múltiple con
// chips). Estos tests cubren el wrapper en aislamiento -- selección simple,
// filtro y estado vacío -- sin depender de un consumidor concreto.
describe('Combobox (wrapper)', () => {
  test('opens the popup, filters by query, and selects an item', async () => {
    const onValueChange = vi.fn()
    render(
      <Combobox items={fruits} itemToStringLabel={(item: (typeof fruits)[number]) => item.label} onValueChange={onValueChange}>
        <ComboboxTrigger aria-label="Elegir fruta">Elegir fruta</ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder="Buscar…" />
          <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
          <ComboboxList>
            {(item: (typeof fruits)[number]) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'Elegir fruta' }))
    const search = await screen.findByPlaceholderText('Buscar…')
    fireEvent.change(search, { target: { value: 'ban' } })

    const option = await screen.findByRole('option', { name: 'Banano' })
    expect(screen.queryByRole('option', { name: 'Manzana' })).not.toBeInTheDocument()

    fireEvent.click(option)
    expect(onValueChange).toHaveBeenCalledWith(fruits[1], expect.anything())
  })

  test('shows the empty state when no item matches the query', async () => {
    render(
      <Combobox items={fruits} itemToStringLabel={(item: (typeof fruits)[number]) => item.label}>
        <ComboboxTrigger aria-label="Elegir fruta">Elegir fruta</ComboboxTrigger>
        <ComboboxContent>
          <ComboboxInput placeholder="Buscar…" />
          <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
          <ComboboxList>
            {(item: (typeof fruits)[number]) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    )

    fireEvent.click(screen.getByRole('combobox', { name: 'Elegir fruta' }))
    const search = await screen.findByPlaceholderText('Buscar…')
    fireEvent.change(search, { target: { value: 'no-existe' } })

    expect(await screen.findByText('Sin resultados.')).toBeInTheDocument()
  })
})
