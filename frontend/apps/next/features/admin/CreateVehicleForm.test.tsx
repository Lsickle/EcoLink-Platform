import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateVehicleForm } from './CreateVehicleForm'

const createVehicleMock = vi.fn()
const fetchVehicleTypesMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createVehicle: (...args: unknown[]) => createVehicleMock(...args),
    fetchVehicleTypes: (...args: unknown[]) => fetchVehicleTypesMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean } | null = { id: 1, is_platform_staff: false }

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

describe('CreateVehicleForm', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false }
    fetchVehicleTypesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'vt-1', code: 'CAM', name: 'Camión', category: null, is_system: true, is_active: true, created_at: '', updated_at: '' }],
    })
    searchOrganizationsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    createVehicleMock.mockReset()
    fetchVehicleTypesMock.mockReset()
    searchOrganizationsMock.mockReset()
    pushMock.mockReset()
  })

  test('hides the "Organización dueña" selector for a non-platform-staff actor', async () => {
    render(<CreateVehicleForm />)
    await screen.findByLabelText('Placa')

    expect(screen.queryByLabelText('Organización dueña')).not.toBeInTheDocument()
  })

  test('shows the "Organización dueña" selector for platform staff, without filtering by business_role', async () => {
    currentUser = { id: 1, is_platform_staff: true }
    render(<CreateVehicleForm />)

    expect(await screen.findByLabelText('Organización dueña')).toBeInTheDocument()
  })

  test('requires a plate number and vehicle type before submitting', async () => {
    render(<CreateVehicleForm />)
    await screen.findByLabelText('Placa')

    fireEvent.click(screen.getByRole('button', { name: 'Crear Vehículo' }))

    expect(await screen.findByText('Ingresa la placa.')).toBeInTheDocument()
    expect(createVehicleMock).not.toHaveBeenCalled()
  })

  test('creates a vehicle for a non-platform-staff actor without organization_id', async () => {
    createVehicleMock.mockResolvedValueOnce({ vehicle: { id: 99 } })
    render(<CreateVehicleForm />)
    await screen.findByLabelText('Placa')

    fireEvent.change(screen.getByLabelText('Placa'), { target: { value: 'abc123' } })
    fireEvent.click(screen.getByRole('combobox', { name: /tipo de vehículo/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Camión' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear Vehículo' }))

    await vi.waitFor(() => expect(createVehicleMock).toHaveBeenCalled())
    expect(createVehicleMock).toHaveBeenCalledWith(expect.not.objectContaining({ organization_id: expect.anything() }))
    expect(pushMock).toHaveBeenCalledWith('/admin/vehicles/99')
  })

  test('shows the backend validation error on a duplicate plate number', async () => {
    createVehicleMock.mockRejectedValueOnce(
      new ApiValidationError('The given data was invalid.', { plate_number: ['Ya existe un vehículo con esta placa.'] })
    )
    render(<CreateVehicleForm />)
    await screen.findByLabelText('Placa')

    fireEvent.change(screen.getByLabelText('Placa'), { target: { value: 'ABC123' } })
    fireEvent.click(screen.getByRole('combobox', { name: /tipo de vehículo/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Camión' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear Vehículo' }))

    expect(await screen.findByText('Ya existe un vehículo con esta placa.')).toBeInTheDocument()
  })
})
