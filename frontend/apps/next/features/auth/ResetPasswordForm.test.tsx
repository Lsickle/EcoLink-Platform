import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { savePasswordRecoveryEmail } from './passwordRecoveryStorage'
import { ResetPasswordForm } from './ResetPasswordForm'

const verifyPasswordRecoveryCodeMock = vi.fn()
const resetPasswordMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/auth/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/auth/api')>()
  return {
    ...actual,
    verifyPasswordRecoveryCode: (...args: unknown[]) => verifyPasswordRecoveryCodeMock(...args),
    resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

function fillCodeAndVerify(code = '123456') {
  fireEvent.change(screen.getByLabelText('Código de verificación'), { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: /verificar código/i }))
}

function fillPasswordsAndSubmit(password = 'Passw0rd123', confirmation = 'Passw0rd123') {
  fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: confirmation } })
  fireEvent.click(screen.getByRole('button', { name: /restablecer contraseña/i }))
}

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    savePasswordRecoveryEmail('ana@example.com')
  })

  afterEach(() => {
    verifyPasswordRecoveryCodeMock.mockReset()
    resetPasswordMock.mockReset()
    pushMock.mockReset()
    window.sessionStorage.clear()
  })

  // Hallazgo especialista-seguridad: sin nada en sessionStorage (enlace
  // compartido, marcador, o pestaña nueva sin haber pasado por
  // ForgotPasswordForm) no se reconstruye el email desde ningún otro lado
  // -- se manda de vuelta a pedirlo.
  test('redirects to /forgot-password when there is nothing in sessionStorage', () => {
    window.sessionStorage.clear()

    render(<ResetPasswordForm />)

    expect(pushMock).toHaveBeenCalledWith('/forgot-password')
  })

  test('step 1: only shows the code field until verification succeeds', () => {
    render(<ResetPasswordForm />)

    expect(screen.getByLabelText('Código de verificación')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalledWith('/forgot-password')
  })

  test('step 1 -> step 2: verifying a valid code reveals the new password step', async () => {
    verifyPasswordRecoveryCodeMock.mockResolvedValueOnce({ verified: true })

    render(<ResetPasswordForm />)

    await act(async () => {
      fillCodeAndVerify('123456')
    })

    expect(verifyPasswordRecoveryCodeMock).toHaveBeenCalledWith('ana@example.com', '123456')
    expect(screen.getByLabelText('Nueva contraseña')).toBeInTheDocument()
    expect(screen.queryByLabelText('Código de verificación')).not.toBeInTheDocument()
  })

  test('step 1: invalid code shows only the generic backend message, nothing more revealing', async () => {
    const { ApiValidationError } = await import('app/features/auth/api')
    verifyPasswordRecoveryCodeMock.mockRejectedValueOnce(
      new ApiValidationError('The given data was invalid.', { code: ['El código es inválido o ha expirado.'] })
    )

    render(<ResetPasswordForm />)

    await act(async () => {
      fillCodeAndVerify('000000')
    })

    expect(screen.getByText('El código es inválido o ha expirado.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nueva contraseña')).not.toBeInTheDocument()
  })

  test('step 1: field validation error for a non 6-digit code, without calling the API', async () => {
    render(<ResetPasswordForm />)

    await act(async () => {
      fillCodeAndVerify('123')
    })

    expect(screen.getByText('Ingresa el código de 6 dígitos.')).toBeInTheDocument()
    expect(verifyPasswordRecoveryCodeMock).not.toHaveBeenCalled()
  })

  test('step 2: successful reset redirects to /login?reset=1', async () => {
    verifyPasswordRecoveryCodeMock.mockResolvedValueOnce({ verified: true })
    resetPasswordMock.mockResolvedValueOnce({ message: 'Tu contraseña ha sido actualizada correctamente.' })

    render(<ResetPasswordForm />)

    await act(async () => {
      fillCodeAndVerify('123456')
    })

    await act(async () => {
      fillPasswordsAndSubmit()
    })

    expect(resetPasswordMock).toHaveBeenCalledWith({
      email: 'ana@example.com',
      code: '123456',
      password: 'Passw0rd123',
      passwordConfirmation: 'Passw0rd123',
    })
    expect(pushMock).toHaveBeenCalledWith('/login?reset=1')
  })

  test('step 2: 422 error from reset() (e.g. code expired between steps) shows the message and a link back to /forgot-password', async () => {
    verifyPasswordRecoveryCodeMock.mockResolvedValueOnce({ verified: true })
    const { ApiValidationError } = await import('app/features/auth/api')
    resetPasswordMock.mockRejectedValueOnce(
      new ApiValidationError('The given data was invalid.', { code: ['El código es inválido o ha expirado.'] })
    )

    render(<ResetPasswordForm />)

    await act(async () => {
      fillCodeAndVerify('123456')
    })

    await act(async () => {
      fillPasswordsAndSubmit()
    })

    expect(screen.getByText('El código es inválido o ha expirado.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /solicitar un código nuevo/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
    expect(pushMock).not.toHaveBeenCalledWith('/login?reset=1')
  })

  test('step 2: field validation error for mismatched passwords, without calling the API', async () => {
    verifyPasswordRecoveryCodeMock.mockResolvedValueOnce({ verified: true })

    render(<ResetPasswordForm />)

    await act(async () => {
      fillCodeAndVerify('123456')
    })

    await act(async () => {
      fillPasswordsAndSubmit('Passw0rd123', 'Different123')
    })

    expect(screen.getByText('Las contraseñas no coinciden.')).toBeInTheDocument()
    expect(resetPasswordMock).not.toHaveBeenCalled()
  })

  // Hallazgo especialista-seguridad: a diferencia del query param anterior,
  // sessionStorage sí sobrevive una recarga de página dentro de la misma
  // pestaña -- se simula desmontando y volviendo a montar el componente
  // (equivalente a un refresh: el estado en memoria de React se pierde,
  // sessionStorage no).
  test('survives a page reload mid-flow: sessionStorage keeps the email across an unmount/remount', () => {
    const { unmount } = render(<ResetPasswordForm />)
    expect(screen.getByLabelText('Código de verificación')).toBeInTheDocument()
    unmount()

    render(<ResetPasswordForm />)

    // No se redirige a /forgot-password tras el "reload" -- el email seguía
    // en sessionStorage -- y el paso vuelve a pedir el código (el estado de
    // React sí se perdió, como es de esperar en un reload real).
    expect(pushMock).not.toHaveBeenCalledWith('/forgot-password')
    expect(screen.getByLabelText('Código de verificación')).toBeInTheDocument()
  })

  describe('rate limiting (429), shared across both steps', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test('step 1: shows a live countdown and disables the verify button', async () => {
      const { RateLimitError } = await import('app/features/auth/api')
      verifyPasswordRecoveryCodeMock.mockRejectedValueOnce(new RateLimitError(2))

      render(<ResetPasswordForm />)

      await act(async () => {
        fillCodeAndVerify('123456')
      })

      expect(screen.getByText('Demasiados intentos. Intenta de nuevo en 2 segundos.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /verificar código/i })).toBeDisabled()

      await act(async () => {
        vi.advanceTimersByTime(2000)
      })

      expect(screen.getByRole('button', { name: /verificar código/i })).not.toBeDisabled()
    })

    test('step 2: shows a live countdown and disables the reset button', async () => {
      verifyPasswordRecoveryCodeMock.mockResolvedValueOnce({ verified: true })
      const { RateLimitError } = await import('app/features/auth/api')
      resetPasswordMock.mockRejectedValueOnce(new RateLimitError(3))

      render(<ResetPasswordForm />)

      await act(async () => {
        fillCodeAndVerify('123456')
      })

      await act(async () => {
        fillPasswordsAndSubmit()
      })

      expect(screen.getByText('Demasiados intentos. Intenta de nuevo en 3 segundos.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /restablecer contraseña/i })).toBeDisabled()

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(screen.getByRole('button', { name: /restablecer contraseña/i })).not.toBeDisabled()
    })
  })
})
