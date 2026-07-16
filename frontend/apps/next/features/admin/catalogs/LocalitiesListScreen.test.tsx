import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { LocalitiesListScreen } from './LocalitiesListScreen'

const fetchLocalitiesMock = vi.fn()
const fetchDepartmentsMock = vi.fn()
const fetchMunicipalitiesMock = vi.fn()
const activateLocalityMock = vi.fn()
const deactivateLocalityMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchLocalities: (...args: unknown[]) => fetchLocalitiesMock(...args),
    fetchDepartments: (...args: unknown[]) => fetchDepartmentsMock(...args),
    fetchMunicipalities: (...args: unknown[]) => fetchMunicipalitiesMock(...args),
    activateLocality: (...args: unknown[]) => activateLocalityMock(...args),
    deactivateLocality: (...args: unknown[]) => deactivateLocalityMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeLocality(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'loc-1',
    municipality_id: 11001,
    name: 'Usaquén',
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('LocalitiesListScreen', () => {
  beforeEach(() => {
    fetchLocalitiesMock.mockResolvedValue({
      data: [makeLocality(), makeLocality({ id: 2, uuid: 'loc-2', name: 'Chapinero', is_active: false })],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 10,
    })
    fetchDepartmentsMock.mockResolvedValue({
      data: [{ id: 11, uuid: 'dep-11', country_id: 1, dane_code: '11', name: 'Bogotá D.C.', is_active: true, created_at: '', updated_at: '' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 40,
    })
    fetchMunicipalitiesMock.mockResolvedValue({
      data: [{ id: 11001, uuid: 'mun-11001', department_id: 11, codigo_dane: '11001', name: 'Bogotá D.C.', is_active: true, created_at: '', updated_at: '' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 50,
    })
  })

  afterEach(() => {
    fetchLocalitiesMock.mockReset()
    fetchDepartmentsMock.mockReset()
    fetchMunicipalitiesMock.mockReset()
    activateLocalityMock.mockReset()
    deactivateLocalityMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the geography.read permission via useRequireAuth', async () => {
    render(<LocalitiesListScreen />)
    await screen.findByText('Chapinero')

    expect(useRequireAuthMock).toHaveBeenCalledWith('geography.read')
  })

  // Filtro en cascada Departamento -> Municipio (mejora de UX declarada al
  // hilo principal: 1.119 municipios en un único <Select> plano sería
  // inutilizable, ver resumen de la tarea).
  test('the municipality filter is disabled until a department is selected, then loads its municipalities', async () => {
    render(<LocalitiesListScreen />)
    await screen.findByText('Chapinero')

    expect(screen.getByRole('combobox', { name: 'Filtrar por municipio' })).toBeDisabled()
    expect(fetchMunicipalitiesMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por departamento' }))
    const deptOption = await screen.findByRole('option', { name: 'Bogotá D.C.' })
    await act(async () => {
      fireEvent.pointerDown(deptOption)
      fireEvent.click(deptOption)
    })

    expect(fetchMunicipalitiesMock).toHaveBeenCalledWith(expect.objectContaining({ departmentId: '11' }))
    expect(screen.getByRole('combobox', { name: 'Filtrar por municipio' })).not.toBeDisabled()
  })

  test('filtering by municipality requests the selected municipality_id and resets to page 1', async () => {
    render(<LocalitiesListScreen />)
    await screen.findByText('Chapinero')

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por departamento' }))
    const deptOption = await screen.findByRole('option', { name: 'Bogotá D.C.' })
    await act(async () => {
      fireEvent.pointerDown(deptOption)
      fireEvent.click(deptOption)
    })

    fetchLocalitiesMock.mockClear()
    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por municipio' }))
    const munOptions = await screen.findAllByRole('option', { name: 'Bogotá D.C.' })
    await act(async () => {
      fireEvent.pointerDown(munOptions[0]!)
      fireEvent.click(munOptions[0]!)
    })

    expect(fetchLocalitiesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, municipalityId: '11001' }))
  })

  test('toggling a row calls deactivateLocality/activateLocality', async () => {
    deactivateLocalityMock.mockResolvedValueOnce({ locality: { ...makeLocality(), is_active: false } })
    render(<LocalitiesListScreen />)
    await screen.findByText('Usaquén')

    const row = screen.getByText('Usaquén').closest('tr')
    await act(async () => {
      fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivateLocalityMock).toHaveBeenCalledWith(1)
  })
})
