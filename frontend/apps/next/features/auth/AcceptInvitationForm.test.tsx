import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { AcceptInvitationForm } from './AcceptInvitationForm'

const acceptInvitationMock = vi.fn()
const pushMock = vi.fn()
let searchParams = new URLSearchParams()

vi.mock('app/features/auth/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/auth/api')>()
  return {
    ...actual,
    acceptInvitation: (...args: unknown[]) => acceptInvitationMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}))

function fillPasswords(password = 'Passw0rd123', confirmation = 'Passw0rd123') {
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: confirmation } })
}

// CU-006.1 modificado (mecanismo de invitación): el token viaja por query
// string (?token=...) -- a diferencia de ResetPasswordForm (email nunca en
// la URL por PII), aquí SÍ es el patrón esperado (el link de invitación).
describe('AcceptInvitationForm', () => {
  afterEach(() => {
    acceptInvitationMock.mockReset()
    pushMock.mockReset()
    searchParams = new URLSearchParams()
  })

  test('shows an invalid-link message when there is no token in the query string', () => {
    render(<AcceptInvitationForm />)

    expect(screen.getByText('Enlace de invitación inválido')).toBeInTheDocument()
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument()
  })

  test('submits token + password and redirects to /login on success', async () => {
    searchParams = new URLSearchParams({ token: 'a-valid-token' })
    acceptInvitationMock.mockResolvedValueOnce({ message: 'Cuenta activada correctamente. Ya puedes iniciar sesión.' })
    render(<AcceptInvitationForm />)

    fillPasswords()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /activar cuenta/i }))
    })

    expect(acceptInvitationMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'a-valid-token', password: 'Passw0rd123', passwordConfirmation: 'Passw0rd123' })
    )
    expect(pushMock).toHaveBeenCalledWith('/login?invitationAccepted=1')
  })

  test('rejects mismatched password confirmation before calling the API', async () => {
    searchParams = new URLSearchParams({ token: 'a-valid-token' })
    render(<AcceptInvitationForm />)

    fillPasswords('Passw0rd123', 'Different123')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /activar cuenta/i }))
    })

    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(acceptInvitationMock).not.toHaveBeenCalled()
  })

  test('surfaces the generic token error from the backend (expired/used/invalid)', async () => {
    searchParams = new URLSearchParams({ token: 'expired-token' })
    const { ApiValidationError } = await import('app/features/auth/api')
    acceptInvitationMock.mockRejectedValueOnce(
      new ApiValidationError('x', { token: ['Enlace de invitación inválido o expirado.'] })
    )
    render(<AcceptInvitationForm />)

    fillPasswords()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /activar cuenta/i }))
    })

    expect(await screen.findByText('Enlace de invitación inválido o expirado.')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })
})

// RN-181: rate limiting de /api/invitations/accept
// (RateLimiter::for('invitation-accept', ...)).
describe('AcceptInvitationForm - rate limiting (429)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    searchParams = new URLSearchParams({ token: 'a-valid-token' })
  })

  afterEach(() => {
    acceptInvitationMock.mockReset()
    vi.useRealTimers()
    searchParams = new URLSearchParams()
  })

  test('shows a live countdown in Spanish and disables submit until it reaches 0', async () => {
    const { RateLimitError } = await import('app/features/auth/api')
    acceptInvitationMock.mockRejectedValueOnce(new RateLimitError(2))

    render(<AcceptInvitationForm />)

    await act(async () => {
      fillPasswords()
      fireEvent.click(screen.getByRole('button', { name: /activar cuenta/i }))
    })

    expect(screen.getByText('Demasiados intentos. Intenta de nuevo en 2 segundos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /activar cuenta/i })).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByRole('button', { name: /activar cuenta/i })).not.toBeDisabled()
  })
})
