import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MunicipalitiesListScreen } from './MunicipalitiesListScreen'

const fetchMunicipalitiesMock = vi.fn()
const fetchDepartmentsMock = vi.fn()
const activateMunicipalityMock = vi.fn()
const deactivateMunicipalityMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchMunicipalities: (...args: unknown[]) => fetchMunicipalitiesMock(...args),
    fetchDepartments: (...args: unknown[]) => fetchDepartmentsMock(...args),
    activateMunicipality: (...args: unknown[]) => activateMunicipalityMock(...args),
    deactivateMunicipality: (...args: unknown[]) => deactivateMunicipalityMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeMunicipality(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'mun-1',
    department_id: 11,
    codigo_dane: '11001',
    name: 'Bogotá D.C.',
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('MunicipalitiesListScreen', () => {
  beforeEach(() => {
    fetchMunicipalitiesMock.mockResolvedValue({
      data: [makeMunicipality(), makeMunicipality({ id: 2, uuid: 'mun-2', codigo_dane: '05001', name: 'Medellín', department_id: 5 })],
      current_page: 1,
      last_page: 45,
      total: 1119,
      per_page: 25,
    })
    fetchDepartmentsMock.mockResolvedValue({
      data: [{ id: 11, uuid: 'dep-11', country_id: 1, dane_code: '11', name: 'Bogotá D.C.', is_active: true, created_at: '', updated_at: '' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 40,
    })
  })

  afterEach(() => {
    fetchMunicipalitiesMock.mockReset()
    fetchDepartmentsMock.mockReset()
    activateMunicipalityMock.mockReset()
    deactivateMunicipalityMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the geography.read permission via useRequireAuth', async () => {
    render(<MunicipalitiesListScreen />)
    await screen.findByText('Medellín')

    expect(useRequireAuthMock).toHaveBeenCalledWith('geography.read')
  })

  test('shows the correct pagination summary for the largest catalog (1119 rows)', async () => {
    render(<MunicipalitiesListScreen />)
    await screen.findByText('Medellín')

    expect(screen.getByText(/de 1119 municipios/)).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 45')).toBeInTheDocument()
  })

  test('filtering by department requests the selected department_id and resets to page 1', async () => {
    render(<MunicipalitiesListScreen />)
    await screen.findByText('Medellín')
    fetchMunicipalitiesMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por departamento' }))
    const option = await screen.findByRole('option', { name: 'Bogotá D.C.' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchMunicipalitiesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, departmentId: '11' }))
  })

  test('the "Siguiente" button advances the page for large paginated results', async () => {
    render(<MunicipalitiesListScreen />)
    await screen.findByText('Medellín')
    fetchMunicipalitiesMock.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))

    expect(fetchMunicipalitiesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }))
  })

  test('toggling a row calls deactivateMunicipality/activateMunicipality', async () => {
    deactivateMunicipalityMock.mockResolvedValueOnce({ municipality: { ...makeMunicipality(), is_active: false } })
    render(<MunicipalitiesListScreen />)
    await screen.findByText('Bogotá D.C.')

    const row = screen.getByText('Bogotá D.C.').closest('tr')
    await act(async () => {
      fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivateMunicipalityMock).toHaveBeenCalledWith(1)
  })
})
