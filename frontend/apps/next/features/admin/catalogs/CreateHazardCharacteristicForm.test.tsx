import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateHazardCharacteristicForm } from './CreateHazardCharacteristicForm'

const createHazardCharacteristicMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createHazardCharacteristic: (...args: unknown[]) => createHazardCharacteristicMock(...args),
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

describe('CreateHazardCharacteristicForm', () => {
  beforeEach(() => {})

  afterEach(() => {
    createHazardCharacteristicMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the hazard_characteristics.manage permission via useRequireAuth', () => {
    render(<CreateHazardCharacteristicForm />)

    expect(useRequireAuthMock).toHaveBeenCalledWith('hazard_characteristics.manage')
  })

  test('shows validation errors when submitting without required fields', async () => {
    render(<CreateHazardCharacteristicForm />)

    fireEvent.click(screen.getByRole('button', { name: /crear característica/i }))

    expect(await screen.findByText('Ingresa un código.')).toBeInTheDocument()
    expect(screen.getByText('Ingresa un nombre.')).toBeInTheDocument()
    expect(createHazardCharacteristicMock).not.toHaveBeenCalled()
  })

  test('submits the payload with risk_level and navigates to the detail page', async () => {
    createHazardCharacteristicMock.mockResolvedValueOnce({ hazard_characteristic: { id: 9, code: 'TOXICO' } })
    render(<CreateHazardCharacteristicForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'TOXICO' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Tóxico' } })
    fireEvent.change(screen.getByLabelText('Nivel de Riesgo (1-9)'), { target: { value: '7' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear característica/i }))
    })

    expect(createHazardCharacteristicMock).toHaveBeenCalledWith({
      code: 'TOXICO',
      name: 'Tóxico',
      risk_level: 7,
      description: undefined,
    })
    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/hazard-characteristics/9')
  })

  test('shows the derived qualitative label while typing the risk level', async () => {
    render(<CreateHazardCharacteristicForm />)

    fireEvent.change(screen.getByLabelText('Nivel de Riesgo (1-9)'), { target: { value: '9' } })

    expect(screen.getByText(/crítico/i)).toBeInTheDocument()
  })

  test('shows the API validation error on submit failure', async () => {
    createHazardCharacteristicMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { code: ['Ya existe ese código.'] })
    )
    render(<CreateHazardCharacteristicForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'TOXICO' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Tóxico' } })
    fireEvent.change(screen.getByLabelText('Nivel de Riesgo (1-9)'), { target: { value: '7' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear característica/i }))
    })

    expect(await screen.findByText('Ya existe ese código.')).toBeInTheDocument()
  })
})
