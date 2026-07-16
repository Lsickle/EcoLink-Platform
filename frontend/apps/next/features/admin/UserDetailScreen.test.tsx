import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { UserDetailScreen } from './UserDetailScreen'

const fetchUserMock = vi.fn()
const fetchRolesMock = vi.fn()
const fetchRoleMock = vi.fn()
const updateUserMock = vi.fn()
const activateUserMock = vi.fn()
const deactivateUserMock = vi.fn()
const resendInvitationMock = vi.fn()
const resetUserPasswordMock = vi.fn()
const assignRoleToUserMock = vi.fn()
const revokeRoleFromUserMock = vi.fn()
const fetchUserActivityMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchUser: (...args: unknown[]) => fetchUserMock(...args),
    fetchRoles: (...args: unknown[]) => fetchRolesMock(...args),
    fetchRole: (...args: unknown[]) => fetchRoleMock(...args),
    updateUser: (...args: unknown[]) => updateUserMock(...args),
    activateUser: (...args: unknown[]) => activateUserMock(...args),
    deactivateUser: (...args: unknown[]) => deactivateUserMock(...args),
    resendInvitation: (...args: unknown[]) => resendInvitationMock(...args),
    resetUserPassword: (...args: unknown[]) => resetUserPasswordMock(...args),
    assignRoleToUser: (...args: unknown[]) => assignRoleToUserMock(...args),
    revokeRoleFromUser: (...args: unknown[]) => revokeRoleFromUserMock(...args),
    fetchUserActivity: (...args: unknown[]) => fetchUserActivityMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function paginated<T>(data: T[]) {
  return { data, current_page: 1, last_page: 1, total: data.length, per_page: 15 }
}

function permission(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    code: 'users.create',
    name: 'Crear usuarios',
    module: 'users',
    action: 'create',
    scope: 'tenant',
    is_system: true,
    is_critical: false,
    is_active: true,
    ...overrides,
  }
}

function roleDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'r-1',
    code: 'ADMINISTRADOR',
    name: 'Administrador',
    description: null,
    is_system: true,
    is_editable: false,
    priority_level: 1,
    is_active: true,
    tenant_organization_id: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    users_count: 1,
    permissions_count: 1,
    risk_level: 'alto',
    permissions: [permission()],
    ...overrides,
  }
}

function adminRole(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'r-1',
    code: 'ADMINISTRADOR',
    name: 'Administrador',
    description: null,
    is_system: true,
    is_editable: false,
    priority_level: 1,
    is_active: true,
    tenant_organization_id: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    users_count: 1,
    permissions_count: 1,
    risk_level: 'alto',
    ...overrides,
  }
}

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 7,
    uuid: 'u-7',
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
      phone: '3000000000',
    },
    status: { code: 'ACTIVE', name: 'Activo' },
    roles: [{ id: 1, code: 'ADMINISTRADOR', name: 'Administrador', pivot: { is_active: true } }],
    last_login_at: '2026-07-10T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    created_by: { id: 1, username: 'admin' },
    updated_by: { id: 1, username: 'admin' },
    ...overrides,
  }
}

describe('UserDetailScreen', () => {
  beforeEach(() => {
    fetchUserMock.mockResolvedValue({ user: makeUser() })
    fetchRolesMock.mockResolvedValue(
      paginated([
        adminRole({ id: 1, code: 'ADMINISTRADOR', name: 'Administrador' }),
        adminRole({ id: 2, code: 'COORDINADOR', name: 'Coordinador', is_system: false, is_editable: true }),
      ])
    )
    fetchRoleMock.mockImplementation((id: number) => {
      if (id === 2) {
        return Promise.resolve({
          role: roleDetail({ id: 2, code: 'COORDINADOR', permissions: [permission({ id: 2, name: 'Ver auditoría', module: 'audit' })] }),
        })
      }
      return Promise.resolve({ role: roleDetail({ id: 1, permissions: [permission({ id: 1, name: 'Crear usuarios', module: 'users' })] }) })
    })
    fetchUserActivityMock.mockResolvedValue(
      paginated([
        {
          event_type: 'USER_ACTIVATED',
          description: "Usuario 'ana.gomez' activado por administrador.",
          actor: { id: 1, username: 'admin' },
          created_at: '2026-07-14T00:00:00Z',
        },
      ])
    )
  })

  afterEach(() => {
    fetchUserMock.mockReset()
    fetchRolesMock.mockReset()
    fetchRoleMock.mockReset()
    updateUserMock.mockReset()
    activateUserMock.mockReset()
    deactivateUserMock.mockReset()
    resendInvitationMock.mockReset()
    resetUserPasswordMock.mockReset()
    assignRoleToUserMock.mockReset()
    revokeRoleFromUserMock.mockReset()
    fetchUserActivityMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the users.read permission via useRequireAuth', async () => {
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    expect(useRequireAuthMock).toHaveBeenCalledWith('users.read')
  })

  test('does not fetch the user when not authorized', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<UserDetailScreen userId={7} />)

    expect(fetchUserMock).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…')
  })

  test('loads and shows the user info, avatar initials and status/role badges', async () => {
    render(<UserDetailScreen userId={7} />)

    expect(await screen.findByDisplayValue('Ana')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Gomez')).toBeInTheDocument()
    expect(screen.getByDisplayValue('ana@example.com')).toBeInTheDocument()
    expect(screen.getByText('AG')).toBeInTheDocument()
    // "Administrador" aparece como badge del header y también como fila en
    // el tab "Roles" (activo por defecto) -- se verifica que aparezca.
    expect(screen.getAllByText('Administrador').length).toBeGreaterThanOrEqual(1)
  })

  // Revocada != nunca asignada: user.roles trae TODAS las asignaciones
  // históricas (pivot.is_active=false para las revocadas, ver comentario de
  // isActiveRoleAssignment en UserDetailScreen.tsx) -- no debe aparecer
  // como si siguiera activa.
  test('filters out roles whose pivot.is_active is false (revoked assignments)', async () => {
    fetchUserMock.mockResolvedValueOnce({
      user: makeUser({
        roles: [
          { id: 1, code: 'ADMINISTRADOR', name: 'Administrador', pivot: { is_active: true } },
          { id: 2, code: 'COORDINADOR', name: 'Coordinador', pivot: { is_active: false } },
        ],
      }),
    })
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    expect(screen.queryByText('Coordinador')).not.toBeInTheDocument()
    expect(fetchRoleMock).toHaveBeenCalledWith(1)
    expect(fetchRoleMock).not.toHaveBeenCalledWith(2)
  })

  test('submits only the 4 editable fields on save', async () => {
    updateUserMock.mockResolvedValueOnce({ user: makeUser({ email: 'nuevo@example.com' }) })
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'nuevo@example.com' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    })

    expect(updateUserMock).toHaveBeenCalledWith(7, {
      first_name: 'Ana',
      last_name: 'Gomez',
      email: 'nuevo@example.com',
      phone: '3000000000',
    })
  })

  test('shows Fecha de Registro/Creado Por/Última Actualización/Actualizado Por', async () => {
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    expect(screen.getByText('Fecha de Registro')).toBeInTheDocument()
    expect(screen.getByText('Creado Por')).toBeInTheDocument()
    expect(screen.getByText('Última Actualización')).toBeInTheDocument()
    expect(screen.getByText('Actualizado Por')).toBeInTheDocument()
    expect(screen.getAllByText('admin').length).toBeGreaterThanOrEqual(1)
  })

  test('clicking "Editar" focuses the Nombres input', async () => {
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    fireEvent.click(screen.getByRole('button', { name: /^editar$/i }))

    expect(screen.getByLabelText('Nombres')).toHaveFocus()
  })

  test('deactivating an active user requires confirmation', async () => {
    deactivateUserMock.mockResolvedValueOnce({ user: makeUser({ status: { code: 'INACTIVE', name: 'Inactivo' } }) })
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    fireEvent.click(screen.getByRole('button', { name: /desactivar usuario/i }))
    expect(deactivateUserMock).not.toHaveBeenCalled()

    const confirm = await screen.findByRole('button', { name: /^confirmar$/i })
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(deactivateUserMock).toHaveBeenCalledWith(7)
  })

  test('shows the "last active admin" guard message verbatim', async () => {
    deactivateUserMock.mockRejectedValueOnce(
      new ApiValidationError('x', {
        user: ['No se puede desactivar: dejaría a la organización sin ningún administrador activo.'],
      })
    )
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    fireEvent.click(screen.getByRole('button', { name: /desactivar usuario/i }))
    const confirm = await screen.findByRole('button', { name: /^confirmar$/i })
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(
      await screen.findByText('No se puede desactivar: dejaría a la organización sin ningún administrador activo.')
    ).toBeInTheDocument()
  })

  test('shows "Reenviar invitación" only for PENDING_ACTIVATION users', async () => {
    fetchUserMock.mockResolvedValueOnce({
      user: makeUser({ status: { code: 'PENDING_ACTIVATION', name: 'Pendiente de activación' } }),
    })
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    expect(screen.getByRole('button', { name: /reenviar invitación/i })).toBeInTheDocument()
  })

  test('does not show "Reenviar invitación" for an ACTIVE user', async () => {
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    expect(screen.queryByRole('button', { name: /reenviar invitación/i })).not.toBeInTheDocument()
  })

  test('resending an invitation shows the success message from the backend', async () => {
    fetchUserMock.mockResolvedValueOnce({
      user: makeUser({ status: { code: 'PENDING_ACTIVATION', name: 'Pendiente de activación' } }),
    })
    resendInvitationMock.mockResolvedValueOnce({ message: 'Invitación reenviada.' })
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /reenviar invitación/i }))
    })

    expect(resendInvitationMock).toHaveBeenCalledWith(7)
    expect(await screen.findByText('Invitación reenviada.')).toBeInTheDocument()
  })

  // ---- Restablecer contraseña (nuevo) ---------------------------------

  test('"Restablecer contraseña" requires confirmation (real email) before calling resetUserPassword', async () => {
    resetUserPasswordMock.mockResolvedValueOnce({
      message: 'Se envió un código de verificación al correo del usuario para restablecer su contraseña.',
    })
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    fireEvent.click(screen.getByRole('button', { name: /restablecer contraseña/i }))
    expect(resetUserPasswordMock).not.toHaveBeenCalled()

    const confirm = await screen.findByRole('button', { name: /^confirmar$/i })
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(resetUserPasswordMock).toHaveBeenCalledWith(7)
    expect(
      await screen.findByText('Se envió un código de verificación al correo del usuario para restablecer su contraseña.')
    ).toBeInTheDocument()
  })

  test('surfaces a resetUserPassword error verbatim', async () => {
    resetUserPasswordMock.mockRejectedValueOnce(
      new ApiValidationError('x', { user: ['No se pudo enviar el código de verificación.'] })
    )
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    fireEvent.click(screen.getByRole('button', { name: /restablecer contraseña/i }))
    const confirm = await screen.findByRole('button', { name: /^confirmar$/i })
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(await screen.findByText('No se pudo enviar el código de verificación.')).toBeInTheDocument()
  })

  // ---- Tab "Roles": tabla + revocar + asignar --------------------------

  test('the "Roles" tab lists only the active roles with a revoke button per row', async () => {
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    expect(screen.getByRole('button', { name: 'Revocar rol Administrador' })).toBeInTheDocument()
  })

  test('revoking a role requires confirmation and calls revokeRoleFromUser', async () => {
    revokeRoleFromUserMock.mockResolvedValueOnce({ message: 'Rol revocado.' })
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    fireEvent.click(screen.getByRole('button', { name: 'Revocar rol Administrador' }))
    expect(revokeRoleFromUserMock).not.toHaveBeenCalled()

    const confirm = await screen.findByRole('button', { name: /^confirmar$/i })
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(revokeRoleFromUserMock).toHaveBeenCalledWith(7, 1)
    expect(screen.queryByRole('button', { name: 'Revocar rol Administrador' })).not.toBeInTheDocument()
  })

  // RN-027: no se puede revocar la última asignación activa -- el mensaje
  // del backend se muestra tal cual, el diálogo se cierra igual.
  test('shows the "last active role" guard message verbatim if revoking fails, and closes the dialog', async () => {
    revokeRoleFromUserMock.mockRejectedValueOnce(
      new ApiValidationError('x', { role: ['No se puede revocar: el usuario debe conservar al menos un rol activo.'] })
    )
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    fireEvent.click(screen.getByRole('button', { name: 'Revocar rol Administrador' }))
    const confirm = await screen.findByRole('button', { name: /^confirmar$/i })
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(
      await screen.findByText('No se puede revocar: el usuario debe conservar al menos un rol activo.')
    ).toBeInTheDocument()
    // El rol sigue en la tabla -- el backend rechazó la acción.
    expect(screen.getByRole('button', { name: 'Revocar rol Administrador' })).toBeInTheDocument()
  })

  test('assigning a role shows only unassigned roles from the catalog and calls assignRoleToUser(role_id, {user_id})', async () => {
    assignRoleToUserMock.mockResolvedValueOnce({ message: 'ok' })
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    fireEvent.click(screen.getByRole('combobox', { name: /asignar rol/i }))
    // El rol ya asignado (Administrador) no debe aparecer como opción.
    expect(screen.queryByRole('option', { name: 'Administrador' })).not.toBeInTheDocument()
    const option = await screen.findByRole('option', { name: 'Coordinador' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^asignar$/i }))
    })

    expect(assignRoleToUserMock).toHaveBeenCalledWith(2, { user_id: 7 })
    expect(await screen.findByText('Rol asignado correctamente.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revocar rol Coordinador' })).toBeInTheDocument()
  })

  // ---- Tab "Permisos" ---------------------------------------------------

  test('the "Permisos" tab shows the effective permissions derived from the assigned roles, grouped by module', async () => {
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    expect(fetchRoleMock).toHaveBeenCalledWith(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /permisos/i }))
    })

    expect(await screen.findByText('Crear usuarios')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /usuarios/i })).toBeInTheDocument()
  })

  test('shows "sin permisos efectivos" when the user has no active roles', async () => {
    fetchUserMock.mockResolvedValueOnce({ user: makeUser({ roles: [] }) })
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /permisos/i }))
    })

    expect(await screen.findByText('Este usuario no tiene permisos efectivos.')).toBeInTheDocument()
  })

  // ---- Tab "Actividad" ---------------------------------------------------

  test('the "Actividad" tab lazily fetches and displays the activity timeline', async () => {
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    expect(fetchUserActivityMock).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /actividad/i }))
    })

    expect(await screen.findByText("Usuario 'ana.gomez' activado por administrador.")).toBeInTheDocument()
    expect(screen.getByText(/· admin/)).toBeInTheDocument()
    expect(fetchUserActivityMock).toHaveBeenCalledWith(7, { page: 1, perPage: 15 })
  })

  test('shows an error message if fetchUserActivity fails', async () => {
    fetchUserActivityMock.mockRejectedValueOnce(new Error('Error de red.'))
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /actividad/i }))
    })

    expect(await screen.findByText('Error de red.')).toBeInTheDocument()
  })

  test('"Cargar más" fetches and appends the next page of activity events', async () => {
    fetchUserActivityMock
      .mockResolvedValueOnce({
        data: [
          {
            event_type: 'USER_CREATED_BY_ADMIN',
            description: "Usuario 'ana.gomez' creado por administrador.",
            actor: { id: 1, username: 'admin' },
            created_at: '2026-07-10T00:00:00Z',
          },
        ],
        current_page: 1,
        last_page: 2,
        total: 2,
        per_page: 1,
      })
      .mockResolvedValueOnce({
        data: [
          {
            event_type: 'USER_ACTIVATED',
            description: "Usuario 'ana.gomez' activado por administrador.",
            actor: { id: 1, username: 'admin' },
            created_at: '2026-07-11T00:00:00Z',
          },
        ],
        current_page: 2,
        last_page: 2,
        total: 2,
        per_page: 1,
      })
    render(<UserDetailScreen userId={7} />)
    await screen.findByDisplayValue('Ana')

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /actividad/i }))
    })
    expect(await screen.findByText("Usuario 'ana.gomez' creado por administrador.")).toBeInTheDocument()
    const loadMoreButton = await screen.findByRole('button', { name: /cargar más/i })

    await act(async () => {
      fireEvent.click(loadMoreButton)
    })

    expect(await screen.findByText("Usuario 'ana.gomez' activado por administrador.")).toBeInTheDocument()
    expect(fetchUserActivityMock).toHaveBeenLastCalledWith(7, { page: 2, perPage: 15 })
  })
})
