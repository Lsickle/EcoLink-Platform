import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AuthUser } from 'app/features/auth/api'
import { AuthProvider, useAuth, useRequireAuth } from 'app/provider/auth'

const meMock = vi.fn()
const logoutMock = vi.fn()
const replaceMock = vi.fn()

vi.mock('app/features/auth/api', () => ({
  me: (...args: unknown[]) => meMock(...args),
  logout: (...args: unknown[]) => logoutMock(...args),
}))

// El AuthProvider vive en packages/app (compartido con la futura app móvil),
// pero useRequireAuth navega con solito -- en web delega en next/navigation.
vi.mock('solito/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

const testUser: AuthUser = { id: 1, uuid: 'u', username: 'ana', email: 'ana@example.com' }

function Consumer() {
  const { user, isLoading } = useAuth()
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user">{user?.username ?? 'none'}</span>
    </div>
  )
}

describe('AuthProvider / useAuth', () => {
  afterEach(() => {
    meMock.mockReset()
    logoutMock.mockReset()
    replaceMock.mockReset()
  })

  test('hydrates the user by calling me() on mount', async () => {
    meMock.mockResolvedValueOnce({ user: testUser })

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )

    expect(screen.getByTestId('loading').textContent).toBe('true')
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('user').textContent).toBe('ana')
    expect(meMock).toHaveBeenCalledTimes(1)
  })

  test('user stays null when me() rejects (no active session)', async () => {
    meMock.mockRejectedValueOnce(new Error('401'))

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'))
    expect(screen.getByTestId('user').textContent).toBe('none')
  })

  test('logout() calls the api and clears the user', async () => {
    meMock.mockResolvedValueOnce({ user: testUser })
    logoutMock.mockResolvedValueOnce(undefined)

    function ConsumerWithLogout() {
      const { user, logout } = useAuth()
      return (
        <div>
          <span data-testid="user">{user?.username ?? 'none'}</span>
          <button onClick={() => logout()}>salir</button>
        </div>
      )
    }

    render(
      <AuthProvider>
        <ConsumerWithLogout />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('ana'))

    await act(async () => {
      screen.getByText('salir').click()
    })

    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('user').textContent).toBe('none')
  })

  test('useAuth throws when used outside of an AuthProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Consumer />)).toThrow(/AuthProvider/)
    consoleError.mockRestore()
  })
})

describe('useRequireAuth', () => {
  function Protected() {
    const { user } = useRequireAuth()
    return <span data-testid="user">{user?.username ?? 'none'}</span>
  }

  afterEach(() => {
    meMock.mockReset()
    replaceMock.mockReset()
  })

  test('redirects to /login once loading finishes with no session', async () => {
    meMock.mockRejectedValueOnce(new Error('401'))

    render(
      <AuthProvider>
        <Protected />
      </AuthProvider>
    )

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'))
  })

  test('does not redirect when there is an active session', async () => {
    meMock.mockResolvedValueOnce({ user: testUser })

    render(
      <AuthProvider>
        <Protected />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('ana'))
    expect(replaceMock).not.toHaveBeenCalled()
  })
})

// Revisión de seguridad del lote admin/*: gating de autorización en el
// frontend (defensa en profundidad -- el backend ya rechaza con 403).
describe('useRequireAuth(requiredPermission)', () => {
  function ProtectedByPermission({ permission }: { permission: string }) {
    const { isAuthorized } = useRequireAuth(permission)
    return <span data-testid="authorized">{String(isAuthorized)}</span>
  }

  afterEach(() => {
    meMock.mockReset()
    replaceMock.mockReset()
  })

  test('redirects to / when the session exists but lacks the required permission', async () => {
    meMock.mockResolvedValueOnce({ user: { ...testUser, permissions: ['users.read'] } })

    render(
      <AuthProvider>
        <ProtectedByPermission permission="roles.read" />
      </AuthProvider>
    )

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
    expect(screen.getByTestId('authorized').textContent).toBe('false')
  })

  test('does not redirect and reports isAuthorized=true when the user has the required permission', async () => {
    meMock.mockResolvedValueOnce({ user: { ...testUser, permissions: ['roles.read', 'users.read'] } })

    render(
      <AuthProvider>
        <ProtectedByPermission permission="roles.read" />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByTestId('authorized').textContent).toBe('true'))
    expect(replaceMock).not.toHaveBeenCalled()
  })

  test('still redirects to /login (not /) when there is no session at all', async () => {
    meMock.mockRejectedValueOnce(new Error('401'))

    render(
      <AuthProvider>
        <ProtectedByPermission permission="roles.read" />
      </AuthProvider>
    )

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'))
  })
})

// Hallazgo Alto (especialista-seguridad, 2026-07-14, revisión del mecanismo
// de invitación): opción `requirePlatformStaff` -- gate adicional (además
// del permiso) para pantallas restringidas al staff de la organización
// plataforma (ver InvitationRequestsListScreen).
describe('useRequireAuth(requiredPermission, { requirePlatformStaff })', () => {
  function ProtectedByPlatformStaff({ permission }: { permission: string }) {
    const { isAuthorized } = useRequireAuth(permission, { requirePlatformStaff: true })
    return <span data-testid="authorized">{String(isAuthorized)}</span>
  }

  afterEach(() => {
    meMock.mockReset()
    replaceMock.mockReset()
  })

  test('redirects to / when the user has the permission but is_platform_staff is false', async () => {
    meMock.mockResolvedValueOnce({ user: { ...testUser, permissions: ['users.create'], is_platform_staff: false } })

    render(
      <AuthProvider>
        <ProtectedByPlatformStaff permission="users.create" />
      </AuthProvider>
    )

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
    expect(screen.getByTestId('authorized').textContent).toBe('false')
  })

  test('does not redirect and reports isAuthorized=true when the user has the permission and is_platform_staff', async () => {
    meMock.mockResolvedValueOnce({ user: { ...testUser, permissions: ['users.create'], is_platform_staff: true } })

    render(
      <AuthProvider>
        <ProtectedByPlatformStaff permission="users.create" />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByTestId('authorized').textContent).toBe('true'))
    expect(replaceMock).not.toHaveBeenCalled()
  })
})
