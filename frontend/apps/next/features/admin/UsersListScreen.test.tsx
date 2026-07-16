import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { UsersListScreen } from './UsersListScreen'

const fetchUsersMock = vi.fn()
const fetchRolesMock = vi.fn()
const activateUserMock = vi.fn()
const deactivateUserMock = vi.fn()
const resendInvitationMock = vi.fn()
const resetUserPasswordMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchUsers: (...args: unknown[]) => fetchUsersMock(...args),
    fetchRoles: (...args: unknown[]) => fetchRolesMock(...args),
    activateUser: (...args: unknown[]) => activateUserMock(...args),
    deactivateUser: (...args: unknown[]) => deactivateUserMock(...args),
    resendInvitation: (...args: unknown[]) => resendInvitationMock(...args),
    resetUserPassword: (...args: unknown[]) => resetUserPasswordMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number; username: string } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1, username: 'admin' }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'u-1',
    username: 'ana.gomez',
    email: 'ana@example.com',
    tenant_organization_id: 1,
    organization_id: null,
    person: {
      first_name: 'Ana',
      last_name: 'Gomez',
      middle_name: null,
      second_last_name: null,
      full_name: 'Ana Gomez',
      document_type: 'CC',
      document_number: '123',
      email: 'ana@example.com',
      phone: null,
    },
    status: { code: 'ACTIVE', name: 'Activo' },
    roles: [{ id: 1, code: 'ADMINISTRADOR', name: 'Administrador' }],
    last_login_at: '2026-07-10T00:00:00Z',
    created_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

async function openMenu(userName: string) {
  fireEvent.click(screen.getByRole('button', { name: `Acciones para ${userName}` }))
  return screen.findByRole('menu')
}

describe('UsersListScreen', () => {
  beforeEach(() => {
    fetchUsersMock.mockResolvedValue({
      data: [
        makeUser(),
        makeUser({
          id: 2,
          uuid: 'u-2',
          username: 'luis.rios',
          email: 'luis@example.com',
          person: {
            first_name: 'Luis',
            last_name: 'Rios',
            middle_name: null,
            second_last_name: null,
            full_name: 'Luis Rios',
            document_type: 'CC',
            document_number: '456',
            email: 'luis@example.com',
            phone: null,
          },
          status: { code: 'LOCKED', name: 'Bloqueado' },
          roles: [],
          last_login_at: null,
        }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 15,
    })
    fetchRolesMock.mockResolvedValue({
      data: [{ id: 1, code: 'ADMINISTRADOR', name: 'Administrador' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 100,
    })
  })

  afterEach(() => {
    fetchUsersMock.mockReset()
    fetchRolesMock.mockReset()
    activateUserMock.mockReset()
    deactivateUserMock.mockReset()
    resendInvitationMock.mockReset()
    resetUserPasswordMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
    vi.useRealTimers()
  })

  test('requires the users.read permission via useRequireAuth', async () => {
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')

    expect(useRequireAuthMock).toHaveBeenCalledWith('users.read')
  })

  test('does not fetch or render the table when the user is not authorized', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<UsersListScreen />)

    expect(fetchUsersMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /crear usuario/i })).not.toBeInTheDocument()
  })

  test('renders the new columns: Último Acceso ("Nunca" when null) and Creación (formatted date)', async () => {
    render(<UsersListScreen />)

    expect(await screen.findByText('Ana Gomez')).toBeInTheDocument()
    expect(screen.getByText('10/07/2026')).toBeInTheDocument() // last_login_at de Ana
    expect(screen.getAllByText('15/01/2026').length).toBeGreaterThan(0) // created_at de ambos
    expect(screen.getByText('Nunca')).toBeInTheDocument() // last_login_at null de Luis
  })

  // Antes del rediseño, LOCKED se agrupaba con el mismo badge gris que
  // INACTIVE/SUSPENDED -- ver userStatus.ts.
  test('shows a distinct (red) badge for LOCKED, different from the muted class used for INACTIVE/SUSPENDED', async () => {
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')

    const lockedBadge = screen.getByText('Bloqueado')
    expect(lockedBadge.className).toContain('bg-red-500/15')

    const activeBadge = screen.getByText('Activo')
    expect(activeBadge.className).toContain('bg-emerald-500/15')
  })

  test('debounces the search input before refetching page 1 with the search filter', async () => {
    vi.useFakeTimers()
    render(<UsersListScreen />)
    await act(async () => {
      await Promise.resolve()
    })
    fetchUsersMock.mockClear()

    fireEvent.change(screen.getByLabelText('Buscar usuarios'), { target: { value: 'luis' } })
    expect(fetchUsersMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })

    expect(fetchUsersMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, search: 'luis' }))
  })

  test('shows the translated status label (not the raw code) on the collapsed filter trigger', async () => {
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')

    expect(screen.getByRole('combobox', { name: 'Filtrar por estado' })).toHaveTextContent('Todos')
    expect(screen.queryByText('all')).not.toBeInTheDocument()
  })

  test('changing the status filter resets to page 1 and requests the selected status code', async () => {
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')
    fetchUsersMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    const option = await screen.findByRole('option', { name: 'Bloqueado' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchUsersMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, status: 'LOCKED' }))
    expect(screen.getByRole('combobox', { name: 'Filtrar por estado' })).toHaveTextContent('Bloqueado')
  })

  test('loads the role catalog and filters by the selected role code', async () => {
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')

    expect(fetchRolesMock).toHaveBeenCalledWith({ perPage: 100 })
    fetchUsersMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por rol' }))
    const option = await screen.findByRole('option', { name: 'Administrador' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchUsersMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, role: 'ADMINISTRADOR' }))
  })

  test('the actions menu navigates to the detail page for "Ver" and "Editar"', async () => {
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')

    const menu = await openMenu('Ana Gomez')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ver' }))
    expect(pushMock).toHaveBeenCalledWith('/admin/users/1')

    pushMock.mockClear()
    const menu2 = await openMenu('Ana Gomez')
    fireEvent.click(within(menu2).getByRole('menuitem', { name: 'Editar' }))
    expect(pushMock).toHaveBeenCalledWith('/admin/users/1')
  })

  test('"Activar" calls activateUser directly (no confirmation) for an inactive/locked user', async () => {
    activateUserMock.mockResolvedValueOnce({ user: makeUser({ id: 2, status: { code: 'ACTIVE', name: 'Activo' } }) })
    render(<UsersListScreen />)
    await screen.findByText('Luis Rios')

    const menu = await openMenu('Luis Rios')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Activar' }))
    })

    expect(activateUserMock).toHaveBeenCalledWith(2)
  })

  test('"Inactivar" requires confirmation before calling deactivateUser', async () => {
    deactivateUserMock.mockResolvedValueOnce({ user: makeUser({ status: { code: 'INACTIVE', name: 'Inactivo' } }) })
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')

    const menu = await openMenu('Ana Gomez')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inactivar' }))
    expect(deactivateUserMock).not.toHaveBeenCalled()

    const confirm = await screen.findByRole('button', { name: /^confirmar$/i })
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(deactivateUserMock).toHaveBeenCalledWith(1)
  })

  // Guarda real de seguridad RBAC: no se puede desactivar al último admin
  // activo -- el mensaje del backend se muestra tal cual.
  test('shows the backend "last active admin" guard message verbatim on 422', async () => {
    deactivateUserMock.mockRejectedValueOnce(
      new ApiValidationError('No se puede procesar la solicitud.', {
        user: ['No se puede desactivar: dejaría a la organización sin ningún administrador activo.'],
      })
    )
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')

    const menu = await openMenu('Ana Gomez')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inactivar' }))
    const confirm = await screen.findByRole('button', { name: /^confirmar$/i })
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(
      await screen.findByText('No se puede desactivar: dejaría a la organización sin ningún administrador activo.')
    ).toBeInTheDocument()
  })

  test('only shows "Reenviar invitación" for a PENDING_ACTIVATION user, and calling it shows the backend message', async () => {
    fetchUsersMock.mockResolvedValueOnce({
      data: [makeUser({ status: { code: 'PENDING_ACTIVATION', name: 'Pendiente de activación' } })],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })
    resendInvitationMock.mockResolvedValueOnce({ message: 'Invitación reenviada.' })
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')

    const menu = await openMenu('Ana Gomez')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Reenviar invitación' }))
    })

    expect(resendInvitationMock).toHaveBeenCalledWith(1)
    expect(await screen.findByText('Invitación reenviada.')).toBeInTheDocument()
  })

  test('does not show "Reenviar invitación" for an ACTIVE user', async () => {
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')

    const menu = await openMenu('Ana Gomez')
    expect(within(menu).queryByRole('menuitem', { name: 'Reenviar invitación' })).not.toBeInTheDocument()
  })

  test('"Restablecer contraseña" requires confirmation (real email) before calling resetUserPassword', async () => {
    resetUserPasswordMock.mockResolvedValueOnce({
      message: 'Se envió un código de verificación al correo del usuario para restablecer su contraseña.',
    })
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')

    const menu = await openMenu('Ana Gomez')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Restablecer contraseña' }))
    expect(resetUserPasswordMock).not.toHaveBeenCalled()

    const confirm = await screen.findByRole('button', { name: /^confirmar$/i })
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(resetUserPasswordMock).toHaveBeenCalledWith(1)
    expect(
      await screen.findByText('Se envió un código de verificación al correo del usuario para restablecer su contraseña.')
    ).toBeInTheDocument()
  })

  test('navigates to /admin/users/new when clicking "+ Crear Usuario"', async () => {
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')

    fireEvent.click(screen.getByRole('button', { name: /crear usuario/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/users/new')
  })

  test('shows the descriptive pagination text "Mostrando X-Y de Z usuarios"', async () => {
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')

    expect(screen.getByText(/mostrando 1–2 de 2 usuarios/i)).toBeInTheDocument()
  })

  test('paginates using current_page/last_page from the response', async () => {
    fetchUsersMock.mockResolvedValue({
      data: [makeUser()],
      current_page: 1,
      last_page: 2,
      total: 2,
      per_page: 15,
    })
    render(<UsersListScreen />)
    await screen.findByText('Ana Gomez')

    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /siguiente/i })).not.toBeDisabled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    })

    expect(fetchUsersMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })
})
