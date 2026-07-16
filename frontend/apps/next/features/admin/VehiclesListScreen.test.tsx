import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { VehiclesListScreen } from './VehiclesListScreen'

const fetchVehiclesMock = vi.fn()
const fetchVehicleTypesMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchVehicles: (...args: unknown[]) => fetchVehiclesMock(...args),
    fetchVehicleTypes: (...args: unknown[]) => fetchVehicleTypesMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['vehicles.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function vehiclesPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...emptyPage,
    data: [
      {
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
        created_by: 1,
        updated_by: 1,
      },
    ],
    total: 1,
    kpis: { total: 5, active: 3, inactive: 2 },
    ...overrides,
  }
}

describe('VehiclesListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['vehicles.read'] }
    fetchVehiclesMock.mockResolvedValue(vehiclesPage())
    fetchVehicleTypesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'vt-1', code: 'CAM', name: 'Camión', category: null, is_system: true, is_active: true, created_at: '', updated_at: '' }],
    })
    searchOrganizationsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    fetchVehiclesMock.mockReset()
    fetchVehicleTypesMock.mockReset()
    searchOrganizationsMock.mockReset()
    pushMock.mockReset()
  })

  test('shows the 3 real KPIs (plain object)', async () => {
    render(<VehiclesListScreen />)

    await screen.findByText('ABC123')
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Activos')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Inactivos')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  test('shows the eager-loaded organization/vehicle type per row for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['vehicles.read'] }
    fetchVehiclesMock.mockResolvedValue(
      vehiclesPage({
        data: [
          {
            ...vehiclesPage().data[0],
            organization: { id: 1, legal_name: 'EcoFleet SAS' },
            vehicle_type: { id: 1, name: 'Camión' },
          },
        ],
      })
    )
    render(<VehiclesListScreen />)

    await screen.findByText('ABC123')
    const row = screen.getByText('ABC123').closest('tr') as HTMLElement
    expect(within(row).getByText('EcoFleet SAS')).toBeInTheDocument()
    expect(within(row).getByText('Camión')).toBeInTheDocument()
  })

  test('hides the Organización column/filter for a non-platform-staff tenant admin', async () => {
    render(<VehiclesListScreen />)

    await screen.findByText('ABC123')
    expect(screen.queryByLabelText('Organización')).not.toBeInTheDocument()
  })

  test('shows the Organización filter for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['vehicles.read'] }
    render(<VehiclesListScreen />)

    await screen.findByText('ABC123')
    expect(screen.getByRole('columnheader', { name: 'Organización' })).toBeInTheDocument()
  })

  test('applies search with debounce', async () => {
    render(<VehiclesListScreen />)
    await screen.findByText('ABC123')
    fetchVehiclesMock.mockClear()

    fireEvent.change(screen.getByLabelText('Buscar vehículos'), { target: { value: 'ABC' } })

    await vi.waitFor(() => {
      expect(fetchVehiclesMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'ABC' }))
    })
  })

  test('filters by operational status', async () => {
    render(<VehiclesListScreen />)
    await screen.findByText('ABC123')
    fetchVehiclesMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado operativo' }))
    const option = await screen.findByRole('option', { name: 'Fuera de Servicio' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    await vi.waitFor(() => {
      expect(fetchVehiclesMock).toHaveBeenCalledWith(expect.objectContaining({ operationalStatus: 'OUT_OF_SERVICE' }))
    })
  })

  test('navigates to /admin/vehicles/new when "Crear Vehículo" is clicked', async () => {
    render(<VehiclesListScreen />)
    await screen.findByText('ABC123')

    fireEvent.click(screen.getByRole('button', { name: '+ Crear Vehículo' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/vehicles/new')
  })

  test('navigates to the vehicle detail when a row is clicked', async () => {
    render(<VehiclesListScreen />)
    await screen.findByText('ABC123')

    fireEvent.click(screen.getByText('ABC123'))

    expect(pushMock).toHaveBeenCalledWith('/admin/vehicles/10')
  })
})
