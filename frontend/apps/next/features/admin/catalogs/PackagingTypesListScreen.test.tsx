import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PackagingTypesListScreen } from './PackagingTypesListScreen'

const fetchPackagingTypesMock = vi.fn()
const activatePackagingTypeMock = vi.fn()
const deactivatePackagingTypeMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchPackagingTypes: (...args: unknown[]) => fetchPackagingTypesMock(...args),
    activatePackagingType: (...args: unknown[]) => activatePackagingTypeMock(...args),
    deactivatePackagingType: (...args: unknown[]) => deactivatePackagingTypeMock(...args),
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

function makePackagingType(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'pt-1',
    code: 'BOLSA',
    name: 'Bolsa',
    is_system: true,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('PackagingTypesListScreen', () => {
  beforeEach(() => {
    fetchPackagingTypesMock.mockResolvedValue({
      data: [
        makePackagingType(),
        makePackagingType({ id: 2, uuid: 'pt-2', code: 'BIGBAG', name: 'Big Bag', is_active: false }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 15,
    })
  })

  afterEach(() => {
    fetchPackagingTypesMock.mockReset()
    activatePackagingTypeMock.mockReset()
    deactivatePackagingTypeMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the packaging_types.read permission via useRequireAuth', async () => {
    render(<PackagingTypesListScreen />)
    await screen.findByText('Big Bag')

    expect(useRequireAuthMock).toHaveBeenCalledWith('packaging_types.read')
  })

  test('navigates to /admin/catalogs/packaging-types/new when clicking "+ Crear Tipo de Embalaje"', async () => {
    render(<PackagingTypesListScreen />)
    await screen.findByText('Bolsa')

    fireEvent.click(screen.getByRole('button', { name: /crear tipo de embalaje/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/packaging-types/new')
  })

  test('the actions menu navigates to the detail page for "Ver"', async () => {
    render(<PackagingTypesListScreen />)
    await screen.findByText('Big Bag')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Big Bag' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ver' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/packaging-types/2')
  })

  test('"Activar" calls activatePackagingType', async () => {
    activatePackagingTypeMock.mockResolvedValueOnce({
      packaging_type: { ...makePackagingType({ id: 2 }), is_active: true },
    })
    render(<PackagingTypesListScreen />)
    await screen.findByText('Big Bag')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Big Bag' }))
    const menu = await screen.findByRole('menu')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Activar' }))
    })

    expect(activatePackagingTypeMock).toHaveBeenCalledWith(2)
  })

  test('does not render the provisional data notice (real confirmed catalog)', async () => {
    render(<PackagingTypesListScreen />)
    await screen.findByText('Bolsa')

    expect(screen.queryByText(/datos provisionales/i)).not.toBeInTheDocument()
  })
})
