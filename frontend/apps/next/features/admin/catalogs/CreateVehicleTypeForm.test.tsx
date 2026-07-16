import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateVehicleTypeForm } from './CreateVehicleTypeForm'

const createVehicleTypeMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createVehicleType: (...args: unknown[]) => createVehicleTypeMock(...args),
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

describe('CreateVehicleTypeForm', () => {
  beforeEach(() => {})

  afterEach(() => {
    createVehicleTypeMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the vehicle_types.manage permission via useRequireAuth', () => {
    render(<CreateVehicleTypeForm />)

    expect(useRequireAuthMock).toHaveBeenCalledWith('vehicle_types.manage')
  })

  test('renders the provisional data notice', () => {
    render(<CreateVehicleTypeForm />)

    expect(screen.getByText(/datos provisionales/i)).toBeInTheDocument()
  })

  test('shows validation errors when submitting without required fields', async () => {
    render(<CreateVehicleTypeForm />)

    fireEvent.click(screen.getByRole('button', { name: /crear tipo de vehículo/i }))

    expect(await screen.findByText('Ingresa un código.')).toBeInTheDocument()
    expect(screen.getByText('Ingresa un nombre.')).toBeInTheDocument()
    expect(createVehicleTypeMock).not.toHaveBeenCalled()
  })

  test('submits the payload without category when left blank', async () => {
    createVehicleTypeMock.mockResolvedValueOnce({ vehicle_type: { id: 5, code: 'VOLQUETA' } })
    render(<CreateVehicleTypeForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'VOLQUETA' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Volqueta' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear tipo de vehículo/i }))
    })

    expect(createVehicleTypeMock).toHaveBeenCalledWith({
      code: 'VOLQUETA',
      name: 'Volqueta',
      category: undefined,
    })
    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/vehicle-types/5')
  })

  test('submits the payload with category and navigates to the detail page', async () => {
    createVehicleTypeMock.mockResolvedValueOnce({ vehicle_type: { id: 6, code: 'GRUA' } })
    render(<CreateVehicleTypeForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'GRUA' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Grúa' } })
    fireEvent.change(screen.getByLabelText(/^categoría/i), { target: { value: 'Especializado' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear tipo de vehículo/i }))
    })

    expect(createVehicleTypeMock).toHaveBeenCalledWith({
      code: 'GRUA',
      name: 'Grúa',
      category: 'Especializado',
    })
    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/vehicle-types/6')
  })

  test('shows the API validation error on submit failure', async () => {
    createVehicleTypeMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { code: ['Ya existe ese código.'] })
    )
    render(<CreateVehicleTypeForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'VOLQUETA' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Volqueta' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear tipo de vehículo/i }))
    })

    expect(await screen.findByText('Ya existe ese código.')).toBeInTheDocument()
  })
})
