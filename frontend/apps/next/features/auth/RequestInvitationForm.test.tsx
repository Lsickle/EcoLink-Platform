import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RequestInvitationForm } from './RequestInvitationForm'

const requestInvitationMock = vi.fn()

vi.mock('app/features/auth/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/auth/api')>()
  return {
    ...actual,
    requestInvitation: (...args: unknown[]) => requestInvitationMock(...args),
  }
})

function fillFields() {
  fireEvent.change(screen.getByLabelText('Número de documento'), { target: { value: '123456789' } })
  fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Gomez' } })
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.com' } })
}

// CU-006.1 modificado: RequestInvitationForm reemplaza al RegisterForm
// eliminado -- sin username/password, POSTea a /api/invitation-requests y
// se queda en una pantalla de confirmación (no hay cuenta creada todavía).
describe('RequestInvitationForm', () => {
  afterEach(() => {
    requestInvitationMock.mockReset()
  })

  test('does not render password fields -- the account is not created yet', () => {
    render(<RequestInvitationForm />)

    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument()
  })

  test('submits the identity fields and shows the generic confirmation message', async () => {
    requestInvitationMock.mockResolvedValueOnce({ message: 'Tu solicitud fue enviada. Un administrador la revisará.' })
    render(<RequestInvitationForm />)

    fillFields()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enviar solicitud/i }))
    })

    expect(requestInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        documentNumber: '123456789',
        firstName: 'Ana',
        lastName: 'Gomez',
        email: 'ana@example.com',
      })
    )
    expect(await screen.findByText('Solicitud enviada')).toBeInTheDocument()
  })

  test('shows a required-field validation error without calling the API', async () => {
    render(<RequestInvitationForm />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enviar solicitud/i }))
    })

    expect(screen.getByText('Ingresa tus nombres.')).toBeInTheDocument()
    expect(requestInvitationMock).not.toHaveBeenCalled()
  })

  test('surfaces a generic error message from the backend', async () => {
    const { ApiValidationError } = await import('app/features/auth/api')
    requestInvitationMock.mockRejectedValueOnce(new ApiValidationError('Error de validación.', { email: ['Ingresa un correo válido.'] }))
    render(<RequestInvitationForm />)

    fillFields()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /enviar solicitud/i }))
    })

    expect(await screen.findByText('Ingresa un correo válido.')).toBeInTheDocument()
  })
})

// RN-181: rate limiting de /api/invitation-requests
// (RateLimiter::for('invitation-request', ...)) -- mismo tratamiento de 429
// que LoginForm: cuenta regresiva en español, submit deshabilitado.
describe('RequestInvitationForm - rate limiting (429)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    requestInvitationMock.mockReset()
    vi.useRealTimers()
  })

  test('shows a live countdown in Spanish and disables submit until it reaches 0', async () => {
    const { RateLimitError } = await import('app/features/auth/api')
    requestInvitationMock.mockRejectedValueOnce(new RateLimitError(2))

    render(<RequestInvitationForm />)

    await act(async () => {
      fillFields()
      fireEvent.click(screen.getByRole('button', { name: /enviar solicitud/i }))
    })

    expect(screen.getByText('Demasiados intentos. Intenta de nuevo en 2 segundos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enviar solicitud/i })).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByRole('button', { name: /enviar solicitud/i })).not.toBeDisabled()
    expect(screen.queryByText(/Demasiados intentos/)).not.toBeInTheDocument()
  })
})
