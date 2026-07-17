import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateTreatmentForm } from './CreateTreatmentForm'

const createTreatmentMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createTreatment: (...args: unknown[]) => createTreatmentMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const useRequireAuthMock = vi.fn(() => ({ isAuthorized: true, user: { id: 1, is_platform_staff: true }, isLoading: false }))

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (...args: unknown[]) => useRequireAuthMock(...(args as [])),
}))

describe('CreateTreatmentForm', () => {
  beforeEach(() => {
    useRequireAuthMock.mockClear()
  })

  afterEach(() => {
    createTreatmentMock.mockReset()
    pushMock.mockReset()
  })

  test('gates the screen with treatments.create AND requirePlatformStaff', async () => {
    render(<CreateTreatmentForm />)
    await screen.findByLabelText('Código')

    expect(useRequireAuthMock).toHaveBeenCalledWith('treatments.create', { requirePlatformStaff: true })
  })

  test('requires a code and name before submitting', async () => {
    render(<CreateTreatmentForm />)
    await screen.findByLabelText('Código')

    fireEvent.click(screen.getByRole('button', { name: 'Crear Tratamiento' }))

    expect(await screen.findByText('Ingresa un código.')).toBeInTheDocument()
    expect(createTreatmentMock).not.toHaveBeenCalled()
  })

  test('the "Temperatura" section is collapsed by default and can be toggled', async () => {
    render(<CreateTreatmentForm />)
    await screen.findByLabelText('Código')

    expect(screen.queryByLabelText(/temperatura mínima/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /temperatura/i }))

    expect(await screen.findByLabelText(/temperatura mínima/i)).toBeInTheDocument()
  })

  test('creates a treatment with the default configuration flags', async () => {
    createTreatmentMock.mockResolvedValueOnce({ treatment: { id: 5 } })
    render(<CreateTreatmentForm />)
    await screen.findByLabelText('Código')

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'INCIN' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Incineración' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear Tratamiento' }))

    await vi.waitFor(() => expect(createTreatmentMock).toHaveBeenCalled())
    expect(createTreatmentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INCIN',
        name: 'Incineración',
        requires_environmental_license: true,
        requires_certificate: true,
        requires_weight_control: true,
        requires_special_transport: false,
        allows_recovery: false,
      })
    )
    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/treatments/5')
  })

  test('shows the backend validation error on a duplicate code', async () => {
    createTreatmentMock.mockRejectedValueOnce(
      new ApiValidationError('The given data was invalid.', { code: ['Ya existe un tratamiento con este código.'] })
    )
    render(<CreateTreatmentForm />)
    await screen.findByLabelText('Código')

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'INCIN' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Incineración' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear Tratamiento' }))

    expect(await screen.findByText('Ya existe un tratamiento con este código.')).toBeInTheDocument()
  })
})
