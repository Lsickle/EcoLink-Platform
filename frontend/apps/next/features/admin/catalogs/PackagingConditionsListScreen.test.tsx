import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PackagingConditionsListScreen } from './PackagingConditionsListScreen'

const fetchPackagingConditionsMock = vi.fn()
const activatePackagingConditionMock = vi.fn()
const deactivatePackagingConditionMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchPackagingConditions: (...args: unknown[]) => fetchPackagingConditionsMock(...args),
    activatePackagingCondition: (...args: unknown[]) => activatePackagingConditionMock(...args),
    deactivatePackagingCondition: (...args: unknown[]) => deactivatePackagingConditionMock(...args),
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

function makePackagingCondition(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'pc-1',
    code: 'BUENO',
    name: 'Bueno',
    risk_level: 1,
    is_system: true,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('PackagingConditionsListScreen', () => {
  beforeEach(() => {
    fetchPackagingConditionsMock.mockResolvedValue({
      data: [
        makePackagingCondition(),
        makePackagingCondition({ id: 3, uuid: 'pc-3', code: 'DETERIORADO', name: 'Deteriorado', risk_level: 9, is_active: false }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 15,
    })
  })

  afterEach(() => {
    fetchPackagingConditionsMock.mockReset()
    activatePackagingConditionMock.mockReset()
    deactivatePackagingConditionMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the packaging_conditions.read permission via useRequireAuth', async () => {
    render(<PackagingConditionsListScreen />)
    await screen.findByText('Deteriorado')

    expect(useRequireAuthMock).toHaveBeenCalledWith('packaging_conditions.read')
  })

  test('renders the provisional data notice', async () => {
    render(<PackagingConditionsListScreen />)
    await screen.findByText('Bueno')

    expect(screen.getByText(/datos provisionales/i)).toBeInTheDocument()
  })

  test('renders the derived qualitative risk level label per row, not the raw number', async () => {
    render(<PackagingConditionsListScreen />)
    await screen.findByText('Deteriorado')

    const buenoRow = screen.getByText('Bueno').closest('tr')
    expect(within(buenoRow as HTMLElement).getByText('Mínimo')).toBeInTheDocument()

    const deterioradoRow = screen.getByText('Deteriorado').closest('tr')
    expect(within(deterioradoRow as HTMLElement).getByText('Crítico')).toBeInTheDocument()
  })

  test('renders a fallback when risk_level is null', async () => {
    fetchPackagingConditionsMock.mockResolvedValue({
      data: [makePackagingCondition({ risk_level: null })],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })
    render(<PackagingConditionsListScreen />)
    await screen.findByText('Bueno')

    expect(screen.getByText('Sin definir')).toBeInTheDocument()
  })

  test('navigates to /admin/catalogs/packaging-conditions/new when clicking "+ Crear Estado"', async () => {
    render(<PackagingConditionsListScreen />)
    await screen.findByText('Bueno')

    fireEvent.click(screen.getByRole('button', { name: /crear estado/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/packaging-conditions/new')
  })

  test('the actions menu navigates to the detail page for "Ver"', async () => {
    render(<PackagingConditionsListScreen />)
    await screen.findByText('Deteriorado')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Deteriorado' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ver' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/packaging-conditions/3')
  })

  test('"Activar" calls activatePackagingCondition', async () => {
    activatePackagingConditionMock.mockResolvedValueOnce({
      packaging_condition: { ...makePackagingCondition({ id: 3 }), is_active: true },
    })
    render(<PackagingConditionsListScreen />)
    await screen.findByText('Deteriorado')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Deteriorado' }))
    const menu = await screen.findByRole('menu')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Activar' }))
    })

    expect(activatePackagingConditionMock).toHaveBeenCalledWith(3)
  })
})
