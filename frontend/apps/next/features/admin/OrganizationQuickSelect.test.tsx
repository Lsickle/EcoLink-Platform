import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { OrganizationQuickSelect } from './OrganizationQuickSelect'

const searchOrganizationsMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

const organizations = [
  { id: 1, legal_name: 'EcoRecicla S.A.S.', tax_id: '900123456-1' },
  { id: 2, legal_name: 'Hospital San José', tax_id: '800987654-2' },
  { id: 3, legal_name: 'Gestora Ambiental del Caribe', tax_id: '901234567-3' },
]

// Combo de selección única de organización (Paso 1 del wizard de Residuos,
// solo isPlatformStaff) -- a diferencia de OrganizationSearchSelect
// (debounce + red por tecla), este componente carga el catálogo completo
// UNA vez y filtra 100% en memoria, mismo patrón que MultiChipPicker.tsx.
describe('OrganizationQuickSelect', () => {
  beforeEach(() => {
    searchOrganizationsMock.mockResolvedValue({ data: organizations, current_page: 1, last_page: 1, total: 3, per_page: 50 })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('loads the full catalog once on mount (no q, high per_page)', async () => {
    render(
      <OrganizationQuickSelect
        label="Organización"
        htmlId="orgId"
        selectedId={null}
        selectedLabel={null}
        onSelect={vi.fn()}
        onClear={vi.fn()}
      />
    )

    await waitFor(() => expect(searchOrganizationsMock).toHaveBeenCalledTimes(1))
    expect(searchOrganizationsMock).toHaveBeenCalledWith(expect.objectContaining({ perPage: 50 }))
    expect(searchOrganizationsMock.mock.calls[0][0]).not.toHaveProperty('q')
  })

  test('typing filters the already-loaded list in memory, without calling the API again', async () => {
    render(
      <OrganizationQuickSelect
        label="Organización"
        htmlId="orgId"
        selectedId={null}
        selectedLabel={null}
        onSelect={vi.fn()}
        onClear={vi.fn()}
      />
    )
    await waitFor(() => expect(searchOrganizationsMock).toHaveBeenCalledTimes(1))

    const input = screen.getByLabelText('Organización')
    fireEvent.focus(input)
    expect(await screen.findByText(/EcoRecicla/)).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'hospital' } })

    expect(await screen.findByText(/Hospital San José/)).toBeInTheDocument()
    expect(screen.queryByText(/EcoRecicla/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Gestora Ambiental/)).not.toBeInTheDocument()
    // Ninguna tecla debe disparar una nueva petición de red.
    expect(searchOrganizationsMock).toHaveBeenCalledTimes(1)
  })

  test('filters by tax_id as well as legal_name', async () => {
    render(
      <OrganizationQuickSelect
        label="Organización"
        htmlId="orgId"
        selectedId={null}
        selectedLabel={null}
        onSelect={vi.fn()}
        onClear={vi.fn()}
      />
    )
    await waitFor(() => expect(searchOrganizationsMock).toHaveBeenCalledTimes(1))

    const input = screen.getByLabelText('Organización')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '901234567' } })

    expect(await screen.findByText(/Gestora Ambiental/)).toBeInTheDocument()
    expect(screen.queryByText(/EcoRecicla/)).not.toBeInTheDocument()
  })

  test('clicking a result calls onSelect with the organization', async () => {
    const onSelect = vi.fn()
    render(
      <OrganizationQuickSelect
        label="Organización"
        htmlId="orgId"
        selectedId={null}
        selectedLabel={null}
        onSelect={onSelect}
        onClear={vi.fn()}
      />
    )
    await waitFor(() => expect(searchOrganizationsMock).toHaveBeenCalledTimes(1))

    const input = screen.getByLabelText('Organización')
    fireEvent.focus(input)
    const option = await screen.findByText(/EcoRecicla/)
    fireEvent.click(option)

    expect(onSelect).toHaveBeenCalledWith(organizations[0])
  })

  test('renders the selected organization with a "Quitar" button that calls onClear', () => {
    const onClear = vi.fn()
    render(
      <OrganizationQuickSelect
        label="Organización"
        htmlId="orgId"
        selectedId={1}
        selectedLabel="EcoRecicla S.A.S."
        onSelect={vi.fn()}
        onClear={onClear}
      />
    )

    expect(screen.getByText('EcoRecicla S.A.S.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }))
    expect(onClear).toHaveBeenCalled()
  })
})
