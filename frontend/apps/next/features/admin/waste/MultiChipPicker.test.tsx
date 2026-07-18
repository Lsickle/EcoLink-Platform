import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { MultiChipPicker } from './MultiChipPicker'

const items = [
  { id: 1, label: 'Y8', sublabel: 'Aceites minerales' },
  { id: 2, label: 'Y9', sublabel: 'Mezclas aceite/agua' },
  { id: 3, label: 'Y18', sublabel: 'Residuos de tratamientos' },
]

// Componente reutilizable de chips removibles + combobox filtrable -- Paso
// 2 del wizard de Residuos (Corrientes Y/A/Códigos UN, Figma nodeId
// 606:5341). Se prueba en aislamiento (sin depender de la API) porque se
// reutiliza 3 veces dentro de WasteWizard. Internamente usa el primitivo
// `Combobox` de Base UI (`components/ui/combobox.tsx`) en modo `multiple` --
// los tests solo verifican comportamiento observable (chips, filtro,
// selección múltiple), no la implementación interna.
describe('MultiChipPicker', () => {
  test('renders a removable chip per selected item', () => {
    const onChange = vi.fn()
    render(
      <MultiChipPicker label="Corrientes Y" addLabel="+ Agregar Y" items={items} selectedIds={[1, 2]} onChange={onChange} />
    )

    expect(screen.getByText('Y8')).toBeInTheDocument()
    expect(screen.getByText('Y9')).toBeInTheDocument()
    expect(screen.queryByText('Y18')).not.toBeInTheDocument()
  })

  test('removing a chip calls onChange without that id', () => {
    const onChange = vi.fn()
    render(
      <MultiChipPicker label="Corrientes Y" addLabel="+ Agregar Y" items={items} selectedIds={[1, 2]} onChange={onChange} />
    )

    fireEvent.click(screen.getByRole('button', { name: /quitar y8/i }))

    expect(onChange).toHaveBeenCalledWith([2])
  })

  test('opening the picker and clicking an unselected item adds it', async () => {
    const onChange = vi.fn()
    render(<MultiChipPicker label="Corrientes Y" addLabel="+ Agregar Y" items={items} selectedIds={[1]} onChange={onChange} />)

    fireEvent.click(screen.getByRole('combobox', { name: '+ Agregar Y' }))
    const option = await screen.findByRole('option', { name: /Y9/ })
    fireEvent.click(option)

    expect(onChange).toHaveBeenCalledWith([1, 2])
  })

  test('selecting multiple items keeps accumulating ids', async () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <MultiChipPicker label="Corrientes Y" addLabel="+ Agregar Y" items={items} selectedIds={[]} onChange={onChange} />
    )

    fireEvent.click(screen.getByRole('combobox', { name: '+ Agregar Y' }))
    fireEvent.click(await screen.findByRole('option', { name: /Y8/ }))
    expect(onChange).toHaveBeenLastCalledWith([1])

    rerender(<MultiChipPicker label="Corrientes Y" addLabel="+ Agregar Y" items={items} selectedIds={[1]} onChange={onChange} />)
    fireEvent.click(await screen.findByRole('option', { name: /Y9/ }))
    expect(onChange).toHaveBeenLastCalledWith([1, 2])
  })

  test('filters the picker list by search query', async () => {
    render(<MultiChipPicker label="Corrientes Y" addLabel="+ Agregar Y" items={items} selectedIds={[]} onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('combobox', { name: '+ Agregar Y' }))
    const search = await screen.findByPlaceholderText('Buscar…')
    fireEvent.change(search, { target: { value: 'Y18' } })

    expect(await screen.findByRole('option', { name: /Y18/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Y8/ })).not.toBeInTheDocument()
  })

  test('shows emptyMessage when the search query matches nothing', async () => {
    render(
      <MultiChipPicker
        label="Corrientes Y"
        addLabel="+ Agregar Y"
        items={items}
        selectedIds={[]}
        onChange={vi.fn()}
        emptyMessage="No hay corrientes que coincidan."
      />
    )

    fireEvent.click(screen.getByRole('combobox', { name: '+ Agregar Y' }))
    const search = await screen.findByPlaceholderText('Buscar…')
    fireEvent.change(search, { target: { value: 'no-existe' } })

    expect(await screen.findByText('No hay corrientes que coincidan.')).toBeInTheDocument()
  })
})
