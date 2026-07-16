import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { VehicleDetailScreen } from './VehicleDetailScreen'

const fetchVehicleMock = vi.fn()
const fetchVehicleTypesMock = vi.fn()
const updateVehicleMock = vi.fn()
const activateVehicleMock = vi.fn()
const deactivateVehicleMock = vi.fn()
const fetchVehicleActivityMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchVehicle: (...args: unknown[]) => fetchVehicleMock(...args),
    fetchVehicleTypes: (...args: unknown[]) => fetchVehicleTypesMock(...args),
    updateVehicle: (...args: unknown[]) => updateVehicleMock(...args),
    activateVehicle: (...args: unknown[]) => activateVehicleMock(...args),
    deactivateVehicle: (...args: unknown[]) => deactivateVehicleMock(...args),
    fetchVehicleActivity: (...args: unknown[]) => fetchVehicleActivityMock(...args),
  }
})

const useRequireAuthMock = vi.fn((_permission?: string) => ({ user: { id: 1 }, isLoading: false, isAuthorized: true }))

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function vehicleDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10,
    uuid: 'vehicle-10',
    organization_id: 1,
    branch_id: null,
    code: 'VEH-001',
    plate_number: 'ABC123',
    vin: null,
    vehicle_type_id: 1,
    brand: 'Mercedes-Benz',
    model: 'Actros',
    manufacturing_year: 2020,
    max_load_capacity: '5000.00',
    capacity_unit: 'KG',
    supports_hazmat: true,
    has_gps: true,
    operational_status: 'ACTIVE',
    soat_expiration_date: null,
    technical_inspection_expiration: null,
    is_active: true,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    organization: { id: 1, legal_name: 'EcoFleet SAS' },
    branch: null,
    vehicle_type: { id: 1, uuid: 'vt-1', code: 'CAM', name: 'Camión', category: null, is_system: true, is_active: true, created_at: '', updated_at: '' },
    created_by: { id: 1, username: 'admin' },
    updated_by: null,
    ...overrides,
  }
}

describe('VehicleDetailScreen', () => {
  beforeEach(() => {
    fetchVehicleMock.mockResolvedValue({ vehicle: vehicleDetail() })
    fetchVehicleTypesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'vt-1', code: 'CAM', name: 'Camión', category: null, is_system: true, is_active: true, created_at: '', updated_at: '' }],
    })
    fetchVehicleActivityMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    fetchVehicleMock.mockReset()
    fetchVehicleTypesMock.mockReset()
    updateVehicleMock.mockReset()
    activateVehicleMock.mockReset()
    deactivateVehicleMock.mockReset()
    fetchVehicleActivityMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the vehicles.read permission via useRequireAuth', async () => {
    render(<VehicleDetailScreen vehicleId={10} />)
    await screen.findByText('ABC123')

    expect(useRequireAuthMock).toHaveBeenCalledWith('vehicles.read')
  })

  test('shows the header with status badge, vehicle type and organization', async () => {
    render(<VehicleDetailScreen vehicleId={10} />)

    const title = await screen.findByText('ABC123')
    const headerCard = title.closest('[data-slot="card"]') as HTMLElement
    expect(within(headerCard).getByText('Operativo')).toBeInTheDocument()
    expect(within(headerCard).getByText(/Camión/)).toBeInTheDocument()
    expect(within(headerCard).getByText(/EcoFleet SAS/)).toBeInTheDocument()
  })

  test('toggles active state', async () => {
    deactivateVehicleMock.mockResolvedValueOnce({
      vehicle: { ...vehicleDetail(), is_active: false, operational_status: 'OUT_OF_SERVICE' },
    })
    render(<VehicleDetailScreen vehicleId={10} />)
    await screen.findByText('ABC123')

    fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))

    await screen.findByRole('button', { name: 'Activar' })
    expect(deactivateVehicleMock).toHaveBeenCalledWith(10)
  })

  test('lazy-loads the Actividad tab only when selected', async () => {
    render(<VehicleDetailScreen vehicleId={10} />)
    await screen.findByText('ABC123')

    expect(fetchVehicleActivityMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('tab', { name: 'Actividad' }))

    await act(async () => {})
    expect(fetchVehicleActivityMock).toHaveBeenCalledWith(10, { perPage: 15 })
  })

  test('saves changes from the Información General form', async () => {
    updateVehicleMock.mockResolvedValueOnce({ vehicle: vehicleDetail({ brand: 'Volvo' }) })
    render(<VehicleDetailScreen vehicleId={10} />)
    await screen.findByText('ABC123')

    fireEvent.change(screen.getByLabelText(/^Marca/), { target: { value: 'Volvo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await screen.findByText('Cambios guardados.')
    expect(updateVehicleMock).toHaveBeenCalledWith(10, expect.objectContaining({ brand: 'Volvo' }))
  })
})
