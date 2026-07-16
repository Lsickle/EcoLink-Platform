import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WasteCategoriesListScreen } from './WasteCategoriesListScreen'

const fetchWasteCategoriesMock = vi.fn()
const activateWasteCategoryMock = vi.fn()
const deactivateWasteCategoryMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchWasteCategories: (...args: unknown[]) => fetchWasteCategoriesMock(...args),
    activateWasteCategory: (...args: unknown[]) => activateWasteCategoryMock(...args),
    deactivateWasteCategory: (...args: unknown[]) => deactivateWasteCategoryMock(...args),
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

function makeWasteCategory(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'wc-1',
    code: 'INDUSTRIAL',
    name: 'Industrial',
    description: null,
    is_system: true,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('WasteCategoriesListScreen', () => {
  beforeEach(() => {
    fetchWasteCategoriesMock.mockResolvedValue({
      data: [
        makeWasteCategory(),
        makeWasteCategory({ id: 2, uuid: 'wc-2', code: 'ORDINARIO', name: 'Ordinario', is_active: false }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 15,
    })
  })

  afterEach(() => {
    fetchWasteCategoriesMock.mockReset()
    activateWasteCategoryMock.mockReset()
    deactivateWasteCategoryMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the waste_categories.read permission via useRequireAuth', async () => {
    render(<WasteCategoriesListScreen />)
    await screen.findByText('Ordinario')

    expect(useRequireAuthMock).toHaveBeenCalledWith('waste_categories.read')
  })

  test('navigates to /admin/catalogs/waste-categories/new when clicking "+ Crear Categoría"', async () => {
    render(<WasteCategoriesListScreen />)
    await screen.findByText('Industrial')

    fireEvent.click(screen.getByRole('button', { name: /crear categoría/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/waste-categories/new')
  })

  test('the actions menu navigates to the detail page for "Ver"', async () => {
    render(<WasteCategoriesListScreen />)
    await screen.findByText('Ordinario')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Ordinario' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ver' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/waste-categories/2')
  })

  test('"Activar" calls activateWasteCategory', async () => {
    activateWasteCategoryMock.mockResolvedValueOnce({
      waste_category: { ...makeWasteCategory({ id: 2 }), is_active: true },
    })
    render(<WasteCategoriesListScreen />)
    await screen.findByText('Ordinario')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Ordinario' }))
    const menu = await screen.findByRole('menu')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Activar' }))
    })

    expect(activateWasteCategoryMock).toHaveBeenCalledWith(2)
  })
})
