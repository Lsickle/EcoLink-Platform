import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { VehicleTypeDetailScreen } from './VehicleTypeDetailScreen'

const fetchVehicleTypeMock = vi.fn()
const updateVehicleTypeMock = vi.fn()
const activateVehicleTypeMock = vi.fn()
const deactivateVehicleTypeMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchVehicleType: (...args: unknown[]) => fetchVehicleTypeMock(...args),
    updateVehicleType: (...args: unknown[]) => updateVehicleTypeMock(...args),
    activateVehicleType: (...args: unknown[]) => activateVehicleTypeMock(...args),
    deactivateVehicleType: (...args: unknown[]) => deactivateVehicleTypeMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeVehicleType(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 2,
    uuid: 'vt-2',
    code: 'TRACTO',
    name: 'Tractocamión',
    category: null,
    is_system: true,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('VehicleTypeDetailScreen', () => {
  beforeEach(() => {
    fetchVehicleTypeMock.mockResolvedValue({ vehicle_type: makeVehicleType() })
  })

  afterEach(() => {
    fetchVehicleTypeMock.mockReset()
    updateVehicleTypeMock.mockReset()
    activateVehicleTypeMock.mockReset()
    deactivateVehicleTypeMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the vehicle_types.read permission via useRequireAuth', async () => {
    render(<VehicleTypeDetailScreen vehicleTypeId={2} />)
    await screen.findByText('Tractocamión')

    expect(useRequireAuthMock).toHaveBeenCalledWith('vehicle_types.read')
  })

  test('renders the provisional data notice', async () => {
    render(<VehicleTypeDetailScreen vehicleTypeId={2} />)
    await screen.findByText('Tractocamión')

    expect(screen.getByText(/datos provisionales/i)).toBeInTheDocument()
  })

  test('saves changes via updateVehicleType, including category', async () => {
    updateVehicleTypeMock.mockResolvedValueOnce({
      vehicle_type: { ...makeVehicleType(), category: 'Pesado' },
    })
    render(<VehicleTypeDetailScreen vehicleTypeId={2} />)
    await screen.findByText('Tractocamión')

    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Pesado' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(updateVehicleTypeMock).toHaveBeenCalledWith(2, expect.objectContaining({ category: 'Pesado' }))
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
  })

  test('toggles active status via activateVehicleType/deactivateVehicleType', async () => {
    deactivateVehicleTypeMock.mockResolvedValueOnce({
      vehicle_type: { ...makeVehicleType(), is_active: false },
    })
    render(<VehicleTypeDetailScreen vehicleTypeId={2} />)
    await screen.findByText('Tractocamión')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivateVehicleTypeMock).toHaveBeenCalledWith(2)
  })

  test('shows the API validation error on save failure', async () => {
    updateVehicleTypeMock.mockRejectedValueOnce(new ApiValidationError('Error.', { name: ['Ya existe ese nombre.'] }))
    render(<VehicleTypeDetailScreen vehicleTypeId={2} />)
    await screen.findByText('Tractocamión')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(await screen.findByText('Ya existe ese nombre.')).toBeInTheDocument()
  })
})
