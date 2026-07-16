import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { DepartmentsListScreen } from './DepartmentsListScreen'

const fetchDepartmentsMock = vi.fn()
const fetchCountriesMock = vi.fn()
const activateDepartmentMock = vi.fn()
const deactivateDepartmentMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchDepartments: (...args: unknown[]) => fetchDepartmentsMock(...args),
    fetchCountries: (...args: unknown[]) => fetchCountriesMock(...args),
    activateDepartment: (...args: unknown[]) => activateDepartmentMock(...args),
    deactivateDepartment: (...args: unknown[]) => deactivateDepartmentMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeDepartment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'dep-1',
    country_id: 1,
    dane_code: '11',
    name: 'Bogotá D.C.',
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('DepartmentsListScreen', () => {
  beforeEach(() => {
    fetchDepartmentsMock.mockResolvedValue({
      data: [makeDepartment(), makeDepartment({ id: 2, uuid: 'dep-2', dane_code: '05', name: 'Antioquia', is_active: false })],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 10,
    })
    fetchCountriesMock.mockResolvedValue({
      data: [{ id: 1, uuid: 'co-1', iso_code: 'COL', name: 'Colombia', is_active: true, created_at: '', updated_at: '' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 300,
    })
  })

  afterEach(() => {
    fetchDepartmentsMock.mockReset()
    fetchCountriesMock.mockReset()
    activateDepartmentMock.mockReset()
    deactivateDepartmentMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the geography.read permission via useRequireAuth', async () => {
    render(<DepartmentsListScreen />)
    await screen.findByText('Antioquia')

    expect(useRequireAuthMock).toHaveBeenCalledWith('geography.read')
  })

  test('filtering by country requests the selected country_id and resets to page 1', async () => {
    render(<DepartmentsListScreen />)
    await screen.findByText('Antioquia')
    fetchDepartmentsMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por país' }))
    const option = await screen.findByRole('option', { name: 'Colombia' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchDepartmentsMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, countryId: '1' }))
  })

  test('toggling a row calls deactivateDepartment/activateDepartment', async () => {
    deactivateDepartmentMock.mockResolvedValueOnce({ department: { ...makeDepartment(), is_active: false } })
    render(<DepartmentsListScreen />)
    await screen.findByText('Bogotá D.C.')

    const row = screen.getByText('Bogotá D.C.').closest('tr')
    await act(async () => {
      fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivateDepartmentMock).toHaveBeenCalledWith(1)
  })
})
