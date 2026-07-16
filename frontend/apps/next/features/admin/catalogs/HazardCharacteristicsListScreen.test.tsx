import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { HazardCharacteristicsListScreen } from './HazardCharacteristicsListScreen'

const fetchHazardCharacteristicsMock = vi.fn()
const activateHazardCharacteristicMock = vi.fn()
const deactivateHazardCharacteristicMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchHazardCharacteristics: (...args: unknown[]) => fetchHazardCharacteristicsMock(...args),
    activateHazardCharacteristic: (...args: unknown[]) => activateHazardCharacteristicMock(...args),
    deactivateHazardCharacteristic: (...args: unknown[]) => deactivateHazardCharacteristicMock(...args),
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

function makeHazardCharacteristic(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'hc-1',
    code: 'RADIOACTIVO',
    name: 'Radiactivo',
    risk_level: 9,
    description: null,
    is_system: true,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('HazardCharacteristicsListScreen', () => {
  beforeEach(() => {
    fetchHazardCharacteristicsMock.mockResolvedValue({
      data: [
        makeHazardCharacteristic(),
        makeHazardCharacteristic({ id: 2, uuid: 'hc-2', code: 'IRRITANTE', name: 'Irritante', risk_level: 1, is_active: false }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 15,
    })
  })

  afterEach(() => {
    fetchHazardCharacteristicsMock.mockReset()
    activateHazardCharacteristicMock.mockReset()
    deactivateHazardCharacteristicMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the hazard_characteristics.read permission via useRequireAuth', async () => {
    render(<HazardCharacteristicsListScreen />)
    await screen.findByText('Irritante')

    expect(useRequireAuthMock).toHaveBeenCalledWith('hazard_characteristics.read')
  })

  test('sorts by risk_level descending by default', async () => {
    render(<HazardCharacteristicsListScreen />)
    await screen.findByText('Irritante')

    expect(fetchHazardCharacteristicsMock).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'risk_level', direction: 'desc' })
    )
  })

  test('renders the derived qualitative risk level label per row, not the raw number', async () => {
    render(<HazardCharacteristicsListScreen />)
    await screen.findByText('Irritante')

    const radioactiveRow = screen.getByText('Radiactivo').closest('tr')
    expect(within(radioactiveRow as HTMLElement).getByText('Crítico')).toBeInTheDocument()

    const irritanteRow = screen.getByText('Irritante').closest('tr')
    expect(within(irritanteRow as HTMLElement).getByText('Mínimo')).toBeInTheDocument()
  })

  test('navigates to /admin/catalogs/hazard-characteristics/new when clicking "+ Crear Característica"', async () => {
    render(<HazardCharacteristicsListScreen />)
    await screen.findByText('Radiactivo')

    fireEvent.click(screen.getByRole('button', { name: /crear característica/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/hazard-characteristics/new')
  })

  test('the actions menu navigates to the detail page for "Ver"', async () => {
    render(<HazardCharacteristicsListScreen />)
    await screen.findByText('Irritante')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Irritante' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ver' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/hazard-characteristics/2')
  })

  test('"Activar" calls activateHazardCharacteristic', async () => {
    activateHazardCharacteristicMock.mockResolvedValueOnce({
      hazard_characteristic: { ...makeHazardCharacteristic({ id: 2 }), is_active: true },
    })
    render(<HazardCharacteristicsListScreen />)
    await screen.findByText('Irritante')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Irritante' }))
    const menu = await screen.findByRole('menu')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Activar' }))
    })

    expect(activateHazardCharacteristicMock).toHaveBeenCalledWith(2)
  })
})
