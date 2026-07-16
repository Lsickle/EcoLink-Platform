import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CountriesListScreen } from './CountriesListScreen'

const fetchCountriesMock = vi.fn()
const activateCountryMock = vi.fn()
const deactivateCountryMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchCountries: (...args: unknown[]) => fetchCountriesMock(...args),
    activateCountry: (...args: unknown[]) => activateCountryMock(...args),
    deactivateCountry: (...args: unknown[]) => deactivateCountryMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeCountry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'co-1',
    iso_code: 'COL',
    name: 'Colombia',
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('CountriesListScreen', () => {
  beforeEach(() => {
    fetchCountriesMock.mockResolvedValue({
      data: [
        makeCountry(),
        makeCountry({ id: 2, uuid: 'co-2', iso_code: 'PER', name: 'Perú', is_active: false }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 10,
    })
  })

  afterEach(() => {
    fetchCountriesMock.mockReset()
    activateCountryMock.mockReset()
    deactivateCountryMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the geography.read permission via useRequireAuth', async () => {
    render(<CountriesListScreen />)
    await screen.findByText('Perú')

    expect(useRequireAuthMock).toHaveBeenCalledWith('geography.read')
  })

  test('does not fetch when the user lacks geography.read', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<CountriesListScreen />)

    expect(fetchCountriesMock).not.toHaveBeenCalled()
  })

  test('renders KPI cards for total/active/inactive counts', async () => {
    render(<CountriesListScreen />)
    await screen.findByText('Perú')

    expect(screen.getAllByTestId('catalog-stat-card')).toHaveLength(3)
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Activos').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Inactivos').length).toBeGreaterThan(0)
  })

  test('renders no create button (read-only catalog)', async () => {
    render(<CountriesListScreen />)
    await screen.findByText('Perú')

    expect(screen.queryByRole('button', { name: /crear/i })).not.toBeInTheDocument()
  })

  test('filtering by status requests the selected status and resets to page 1', async () => {
    render(<CountriesListScreen />)
    await screen.findByText('Perú')
    fetchCountriesMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    const option = await screen.findByRole('option', { name: 'Inactivo' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchCountriesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, status: 'inactive' }))
  })

  test('toggling a row calls deactivateCountry/activateCountry and updates the badge in place', async () => {
    deactivateCountryMock.mockResolvedValueOnce({ country: { ...makeCountry(), is_active: false } })
    render(<CountriesListScreen />)
    await screen.findByText('Colombia')

    const row = screen.getByText('Colombia').closest('tr')
    expect(row).not.toBeNull()
    await act(async () => {
      fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivateCountryMock).toHaveBeenCalledWith(1)
    expect(within(row as HTMLElement).getByText('Inactivo')).toBeInTheDocument()
  })

  test('renders the sidebar summary and a disabled "Exportar" quick action', async () => {
    render(<CountriesListScreen />)
    await screen.findByText('Perú')

    expect(screen.getByText('Resumen del Catálogo')).toBeInTheDocument()
    expect(screen.getByText('Acciones Rápidas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /exportar/i })).toBeDisabled()
  })
})
