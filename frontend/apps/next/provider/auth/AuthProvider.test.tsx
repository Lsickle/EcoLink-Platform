import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AuthUser } from 'app/features/auth/api'
import { AuthProvider, useAuth, useRequireAuth } from 'app/provider/auth'

const meMock = vi.fn()
const logoutMock = vi.fn()
const replaceMock = vi.fn()
let currentPathname = '/'

vi.mock('app/features/auth/api', () => ({
  me: (...args: unknown[]) => meMock(...args),
  logout: (...args: unknown[]) => logoutMock(...args),
}))

// El AuthProvider vive en packages/app (compartido con la futura app móvil),
// pero useRequireAuth navega con solito -- en web delega en next/navigation.
// `usePathname` es mutable por test (`currentPathname`) -- necesario para
// probar el redirect a /change-password (Cambio de contraseña obligatorio
// en el primer login, 2026-08-11), que depende de la ruta actual.
vi.mock('solito/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => currentPathname,
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

// Cambio de contraseña obligatorio en el primer login (confirmado por el
// usuario, 2026-08-11): `must_change_password` fuerza el redirect a
// /change-password ANTES de evaluar requiredPermission/requirePlatformStaff,
// sin importar qué pantalla se pidió -- y esa pantalla queda excluida del
// redirect (si no, loop).
describe('useRequireAuth — cambio de contraseña obligatorio en el primer login', () => {
  function ProtectedByPermission({ permission }: { permission: string }) {
    const { isAuthorized } = useRequireAuth(permission)
    return <span data-testid="authorized">{String(isAuthorized)}</span>
  }

  afterEach(() => {
    meMock.mockReset()
    replaceMock.mockReset()
    currentPathname = '/'
  })

  test('redirige a /change-password cuando must_change_password=true, sin importar el permiso pedido', async () => {
    currentPathname = '/admin/wastes'
    meMock.mockResolvedValueOnce({ user: { ...testUser, must_change_password: true, permissions: ['wastes.read'] } })

    render(
      <AuthProvider>
        <ProtectedByPermission permission="wastes.read" />
      </AuthProvider>
    )

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/change-password'))
    expect(screen.getByTestId('authorized').textContent).toBe('false')
  })

  test('NO redirige y reporta isAuthorized=true cuando ya está en /change-password, aunque must_change_password=true', async () => {
    currentPathname = '/change-password'
    meMock.mockResolvedValueOnce({ user: { ...testUser, must_change_password: true } })

    function ProtectedNoPermission() {
      const { isAuthorized } = useRequireAuth()
      return <span data-testid="authorized">{String(isAuthorized)}</span>
    }

    render(
      <AuthProvider>
        <ProtectedNoPermission />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByTestId('authorized').textContent).toBe('true'))
    expect(replaceMock).not.toHaveBeenCalled()
  })

  test('con must_change_password=false, no redirige a /change-password (comportamiento normal sin cambios)', async () => {
    currentPathname = '/admin/wastes'
    meMock.mockResolvedValueOnce({ user: { ...testUser, must_change_password: false, permissions: ['wastes.read'] } })

    render(
      <AuthProvider>
        <ProtectedByPermission permission="wastes.read" />
      </AuthProvider>
    )

    await waitFor(() => expect(screen.getByTestId('authorized').textContent).toBe('true'))
    expect(replaceMock).not.toHaveBeenCalled()
  })
})
