import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { VehicleTypesListScreen } from './VehicleTypesListScreen'

const fetchVehicleTypesMock = vi.fn()
const activateVehicleTypeMock = vi.fn()
const deactivateVehicleTypeMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchVehicleTypes: (...args: unknown[]) => fetchVehicleTypesMock(...args),
    activateVehicleType: (...args: unknown[]) => activateVehicleTypeMock(...args),
    deactivateVehicleType: (...args: unknown[]) => deactivateVehicleTypeMock(...args),
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

function makeVehicleType(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'vt-1',
    code: 'CAM',
    name: 'Camión',
    category: null,
    is_system: true,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('VehicleTypesListScreen', () => {
  beforeEach(() => {
    fetchVehicleTypesMock.mockResolvedValue({
      data: [
        makeVehicleType(),
        makeVehicleType({ id: 4, uuid: 'vt-4', code: 'CISTERNA', name: 'Cisterna', is_active: false }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 15,
    })
  })

  afterEach(() => {
    fetchVehicleTypesMock.mockReset()
    activateVehicleTypeMock.mockReset()
    deactivateVehicleTypeMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the vehicle_types.read permission via useRequireAuth', async () => {
    render(<VehicleTypesListScreen />)
    await screen.findByText('Cisterna')

    expect(useRequireAuthMock).toHaveBeenCalledWith('vehicle_types.read')
  })

  test('renders the provisional data notice', async () => {
    render(<VehicleTypesListScreen />)
    await screen.findByText('Camión')

    expect(screen.getByText(/datos provisionales/i)).toBeInTheDocument()
  })

  test('navigates to /admin/catalogs/vehicle-types/new when clicking "+ Crear Tipo de Vehículo"', async () => {
    render(<VehicleTypesListScreen />)
    await screen.findByText('Camión')

    fireEvent.click(screen.getByRole('button', { name: /crear tipo de vehículo/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/vehicle-types/new')
  })

  test('the actions menu navigates to the detail page for "Ver"', async () => {
    render(<VehicleTypesListScreen />)
    await screen.findByText('Cisterna')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Cisterna' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ver' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/vehicle-types/4')
  })

  test('"Activar" calls activateVehicleType', async () => {
    activateVehicleTypeMock.mockResolvedValueOnce({
      vehicle_type: { ...makeVehicleType({ id: 4 }), is_active: true },
    })
    render(<VehicleTypesListScreen />)
    await screen.findByText('Cisterna')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Cisterna' }))
    const menu = await screen.findByRole('menu')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Activar' }))
    })

    expect(activateVehicleTypeMock).toHaveBeenCalledWith(4)
  })

  test('renders a fallback for a null category', async () => {
    render(<VehicleTypesListScreen />)
    await screen.findByText('Camión')

    const camionRow = screen.getByText('Camión').closest('tr')
    expect(within(camionRow as HTMLElement).getByText('Sin categoría')).toBeInTheDocument()
  })

  test('renders the category when present', async () => {
    fetchVehicleTypesMock.mockResolvedValue({
      data: [makeVehicleType({ category: 'Pesado' })],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })
    render(<VehicleTypesListScreen />)
    await screen.findByText('Camión')

    expect(screen.getByText('Pesado')).toBeInTheDocument()
  })
})
