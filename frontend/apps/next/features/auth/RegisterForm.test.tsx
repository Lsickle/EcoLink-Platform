import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RegisterForm } from './RegisterForm'

const registerMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/auth/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/auth/api')>()
  return {
    ...actual,
    register: (...args: unknown[]) => registerMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Número de documento'), { target: { value: '123456789' } })
  fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Gomez' } })
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.com' } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Passw0rd123' } })
  fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'Passw0rd123' } })
  fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))
}

// RN-181: rate limiting de /api/register (RateLimiter::for('register', ...)
// en backend/app/Providers/AppServiceProvider.php) -- mismo tratamiento de
// 429 que LoginForm: cuenta regresiva en español, submit deshabilitado.
describe('RegisterForm - rate limiting (429)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    registerMock.mockReset()
    pushMock.mockReset()
    vi.useRealTimers()
  })

  test('shows a live countdown in Spanish and disables submit until it reaches 0', async () => {
    const { RateLimitError } = await import('app/features/auth/api')
    registerMock.mockRejectedValueOnce(new RateLimitError(2))

    render(<RegisterForm />)

    await act(async () => {
      fillAndSubmit()
    })

    expect(screen.getByText('Demasiados intentos. Intenta de nuevo en 2 segundos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByRole('button', { name: /crear cuenta/i })).not.toBeDisabled()
    expect(screen.queryByText(/Demasiados intentos/)).not.toBeInTheDocument()
  })
})
