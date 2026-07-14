import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { LoginForm } from './LoginForm'

const loginMock = vi.fn()
const refreshMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/auth/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/auth/api')>()
  return {
    ...actual,
    login: (...args: unknown[]) => loginMock(...args),
  }
})

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ refresh: refreshMock }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}))

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.com' } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Passw0rd123' } })
  fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))
}

// RN-181: rate limiting de /api/login (RateLimiter::for('login', ...) en
// backend/app/Providers/AppServiceProvider.php) -- el 429 se traduce a un
// RateLimitError que la UI muestra como cuenta regresiva en español.
describe('LoginForm - rate limiting (429)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    loginMock.mockReset()
    refreshMock.mockReset()
    pushMock.mockReset()
    vi.useRealTimers()
  })

  test('shows a live countdown in Spanish and disables submit until it reaches 0', async () => {
    const { RateLimitError } = await import('app/features/auth/api')
    loginMock.mockRejectedValueOnce(new RateLimitError(3))

    render(<LoginForm />)

    await act(async () => {
      fillAndSubmit()
    })

    expect(screen.getByText('Demasiados intentos. Intenta de nuevo en 3 segundos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('Demasiados intentos. Intenta de nuevo en 2 segundos.')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.getByRole('button', { name: /iniciar sesión/i })).not.toBeDisabled()
    expect(screen.queryByText(/Demasiados intentos/)).not.toBeInTheDocument()
  })
})
