import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PhysicalStatesListScreen } from './PhysicalStatesListScreen'

const fetchPhysicalStatesMock = vi.fn()
const activatePhysicalStateMock = vi.fn()
const deactivatePhysicalStateMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchPhysicalStates: (...args: unknown[]) => fetchPhysicalStatesMock(...args),
    activatePhysicalState: (...args: unknown[]) => activatePhysicalStateMock(...args),
    deactivatePhysicalState: (...args: unknown[]) => deactivatePhysicalStateMock(...args),
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

function makePhysicalState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'ps-1',
    code: 'SOLIDO',
    name: 'Sólido',
    is_system: true,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('PhysicalStatesListScreen', () => {
  beforeEach(() => {
    fetchPhysicalStatesMock.mockResolvedValue({
      data: [
        makePhysicalState(),
        makePhysicalState({ id: 2, uuid: 'ps-2', code: 'LIQUIDO', name: 'Líquido', is_active: false }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 15,
    })
  })

  afterEach(() => {
    fetchPhysicalStatesMock.mockReset()
    activatePhysicalStateMock.mockReset()
    deactivatePhysicalStateMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the physical_states.read permission via useRequireAuth', async () => {
    render(<PhysicalStatesListScreen />)
    await screen.findByText('Líquido')

    expect(useRequireAuthMock).toHaveBeenCalledWith('physical_states.read')
  })

  test('navigates to /admin/catalogs/physical-states/new when clicking "+ Crear Estado Físico"', async () => {
    render(<PhysicalStatesListScreen />)
    await screen.findByText('Sólido')

    fireEvent.click(screen.getByRole('button', { name: /crear estado físico/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/physical-states/new')
  })

  test('the actions menu navigates to the detail page for "Ver"', async () => {
    render(<PhysicalStatesListScreen />)
    await screen.findByText('Líquido')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Líquido' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ver' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/physical-states/2')
  })

  test('"Activar" calls activatePhysicalState', async () => {
    activatePhysicalStateMock.mockResolvedValueOnce({
      physical_state: { ...makePhysicalState({ id: 2 }), is_active: true },
    })
    render(<PhysicalStatesListScreen />)
    await screen.findByText('Líquido')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Líquido' }))
    const menu = await screen.findByRole('menu')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Activar' }))
    })

    expect(activatePhysicalStateMock).toHaveBeenCalledWith(2)
  })
})
