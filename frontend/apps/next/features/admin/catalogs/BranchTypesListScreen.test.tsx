import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchTypesListScreen } from './BranchTypesListScreen'

const fetchBranchTypesMock = vi.fn()
const activateBranchTypeMock = vi.fn()
const deactivateBranchTypeMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchBranchTypes: (...args: unknown[]) => fetchBranchTypesMock(...args),
    activateBranchType: (...args: unknown[]) => activateBranchTypeMock(...args),
    deactivateBranchType: (...args: unknown[]) => deactivateBranchTypeMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeBranchType(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'bt-1',
    code: 'PLT',
    name: 'Planta',
    category: 'Productiva',
    is_logistics: false,
    is_storage: false,
    is_treatment: true,
    is_dispatch: false,
    sort_order: 3,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('BranchTypesListScreen', () => {
  beforeEach(() => {
    fetchBranchTypesMock.mockResolvedValue({
      data: [
        makeBranchType(),
        makeBranchType({ id: 2, uuid: 'bt-2', code: 'ACO', name: 'Centro de Acopio', category: 'Acopio', is_logistics: true, is_storage: true, is_treatment: false, is_active: false }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 15,
    })
  })

  afterEach(() => {
    fetchBranchTypesMock.mockReset()
    activateBranchTypeMock.mockReset()
    deactivateBranchTypeMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the branch_types.read permission via useRequireAuth', async () => {
    render(<BranchTypesListScreen />)
    await screen.findByText('Centro de Acopio')

    expect(useRequireAuthMock).toHaveBeenCalledWith('branch_types.read')
  })

  test('renders the capability badges (Logística/Almacenamiento/Tratamiento/Despacho) per row', async () => {
    render(<BranchTypesListScreen />)
    await screen.findByText('Centro de Acopio')

    const plantRow = screen.getByText('Planta').closest('tr')
    expect(within(plantRow as HTMLElement).getByText('Tratamiento')).toBeInTheDocument()
    expect(within(plantRow as HTMLElement).queryByText('Logística')).not.toBeInTheDocument()

    const acopioRow = screen.getByText('Centro de Acopio').closest('tr')
    expect(within(acopioRow as HTMLElement).getByText('Logística')).toBeInTheDocument()
    expect(within(acopioRow as HTMLElement).getByText('Almacenamiento')).toBeInTheDocument()
  })

  test('navigates to /admin/catalogs/branch-types/new when clicking "+ Crear Tipo de Sede"', async () => {
    render(<BranchTypesListScreen />)
    await screen.findByText('Planta')

    fireEvent.click(screen.getByRole('button', { name: /crear tipo de sede/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/branch-types/new')
  })

  test('the actions menu navigates to the detail page for "Ver" and "Editar"', async () => {
    render(<BranchTypesListScreen />)
    await screen.findByText('Centro de Acopio')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Centro de Acopio' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ver' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/branch-types/2')
  })

  test('"Inactivar" calls deactivateBranchType', async () => {
    deactivateBranchTypeMock.mockResolvedValueOnce({ branch_type: { ...makeBranchType(), is_active: false } })
    render(<BranchTypesListScreen />)
    await screen.findByText('Planta')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Planta' }))
    const menu = await screen.findByRole('menu')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inactivar' }))
    })

    expect(deactivateBranchTypeMock).toHaveBeenCalledWith(1)
  })
})
