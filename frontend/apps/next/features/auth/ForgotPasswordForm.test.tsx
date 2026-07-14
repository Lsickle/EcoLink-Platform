import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { readPasswordRecoveryEmail } from './passwordRecoveryStorage'

const requestPasswordRecoveryCodeMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/auth/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/auth/api')>()
  return {
    ...actual,
    requestPasswordRecoveryCode: (...args: unknown[]) => requestPasswordRecoveryCodeMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

function fillAndSubmit(email = 'ana@example.com') {
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: /enviar código/i }))
}

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    requestPasswordRecoveryCodeMock.mockReset()
    pushMock.mockReset()
    window.sessionStorage.clear()
  })

  // Hallazgo especialista-seguridad (Baja-Media, minimización de PII, Ley
  // 1581): el email ya NO viaja por query string -- se guarda en
  // sessionStorage (nunca localStorage) y ResetPasswordForm lo lee de ahí,
  // ver passwordRecoveryStorage.ts.
  test('valid email: calls the API, saves the email to sessionStorage (not the URL) and redirects to /reset-password', async () => {
    requestPasswordRecoveryCodeMock.mockResolvedValueOnce({
      message: 'Si existe una cuenta asociada a ese correo, recibirás un código de verificación.',
    })

    render(<ForgotPasswordForm />)

    await act(async () => {
      fillAndSubmit('ana@example.com')
    })

    expect(requestPasswordRecoveryCodeMock).toHaveBeenCalledWith('ana@example.com')
    expect(readPasswordRecoveryEmail()).toBe('ana@example.com')
    expect(pushMock).toHaveBeenCalledWith('/reset-password')
    expect(pushMock).not.toHaveBeenCalledWith(expect.stringContaining('email='))
  })

  test('field validation error: invalid email is rejected without calling the API', async () => {
    render(<ForgotPasswordForm />)

    await act(async () => {
      fillAndSubmit('not-an-email')
    })

    expect(screen.getByText('Ingresa un correo válido.')).toBeInTheDocument()
    expect(requestPasswordRecoveryCodeMock).not.toHaveBeenCalled()
    expect(pushMock).not.toHaveBeenCalled()
    expect(readPasswordRecoveryEmail()).toBeNull()
  })

  test('generic backend message: anti-enumeration message is shown verbatim regardless of account existence', async () => {
    requestPasswordRecoveryCodeMock.mockRejectedValueOnce(new Error('Error inesperado (500).'))

    render(<ForgotPasswordForm />)

    await act(async () => {
      fillAndSubmit('ana@example.com')
    })

    expect(screen.getByText('Error inesperado (500).')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })

  describe('rate limiting (429)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test('shows a live countdown in Spanish and disables submit until it reaches 0', async () => {
      const { RateLimitError } = await import('app/features/auth/api')
      requestPasswordRecoveryCodeMock.mockRejectedValueOnce(new RateLimitError(2))

      render(<ForgotPasswordForm />)

      await act(async () => {
        fillAndSubmit()
      })

      expect(screen.getByText('Demasiados intentos. Intenta de nuevo en 2 segundos.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /enviar código/i })).toBeDisabled()

      await act(async () => {
        vi.advanceTimersByTime(2000)
      })

      expect(screen.getByRole('button', { name: /enviar código/i })).not.toBeDisabled()
      expect(screen.queryByText(/Demasiados intentos/)).not.toBeInTheDocument()
    })
  })
})
