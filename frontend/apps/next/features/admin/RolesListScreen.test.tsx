import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { RolesListScreen } from './RolesListScreen'

const fetchRolesMock = vi.fn()
const deleteRoleMock = vi.fn()
const activateRoleMock = vi.fn()
const deactivateRoleMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchRoles: (...args: unknown[]) => fetchRolesMock(...args),
    deleteRole: (...args: unknown[]) => deleteRoleMock(...args),
    activateRole: (...args: unknown[]) => activateRoleMock(...args),
    deactivateRole: (...args: unknown[]) => deactivateRoleMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeRole(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'r-1',
    code: 'ADMINISTRADOR',
    name: 'Administrador',
    description: 'Rol de sistema',
    is_system: true,
    is_editable: false,
    priority_level: 1,
    is_active: true,
    tenant_organization_id: 1,
    created_at: '2026-01-15T00:00:00Z',
    users_count: 3,
    permissions_count: 12,
    risk_level: 'critico',
    ...overrides,
  }
}

async function openMenu(roleName: string) {
  fireEvent.click(screen.getByRole('button', { name: `Acciones para ${roleName}` }))
  return screen.findByRole('menu')
}

describe('RolesListScreen', () => {
  beforeEach(() => {
    fetchRolesMock.mockResolvedValue({
      data: [
        makeRole(),
        makeRole({
          id: 2,
          uuid: 'r-2',
          code: 'COORD',
          name: 'Coordinador',
          is_system: false,
          is_editable: true,
          priority_level: 3,
          users_count: 1,
          permissions_count: 2,
          risk_level: 'bajo',
        }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 10,
    })
  })

  afterEach(() => {
    fetchRolesMock.mockReset()
    deleteRoleMock.mockReset()
    activateRoleMock.mockReset()
    deactivateRoleMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
    vi.useRealTimers()
  })

  // Revisión de seguridad: gating de autorización -- /admin/roles requiere
  // roles.read (defensa en profundidad, el backend ya rechaza con 403).
  test('requires the roles.read permission via useRequireAuth', async () => {
    render(<RolesListScreen />)
    await screen.findByText('Administrador')

    expect(useRequireAuthMock).toHaveBeenCalledWith('roles.read')
  })

  test('does not fetch or render the table when the user lacks roles.read', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<RolesListScreen />)

    expect(fetchRolesMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /crear rol/i })).not.toBeInTheDocument()
  })

  test('renders the new columns: users_count, permissions badge, risk level and formatted creation date', async () => {
    render(<RolesListScreen />)

    expect(await screen.findByText('Administrador')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument() // users_count
    expect(screen.getByText('12 permisos')).toBeInTheDocument()
    expect(screen.getByText('crítico')).toBeInTheDocument()
    expect(screen.getAllByText('15/01/2026').length).toBeGreaterThan(0)
  })

  test('shows the descriptive pagination text "Mostrando X-Y de Z roles"', async () => {
    render(<RolesListScreen />)
    await screen.findByText('Administrador')

    expect(screen.getByText(/mostrando 1–2 de 2 roles/i)).toBeInTheDocument()
  })

  test('debounces the search input before refetching page 1 with the search filter', async () => {
    vi.useFakeTimers()
    render(<RolesListScreen />)
    await act(async () => {
      await Promise.resolve()
    })
    fetchRolesMock.mockClear()

    fireEvent.change(screen.getByLabelText('Buscar roles'), { target: { value: 'coord' } })
    expect(fetchRolesMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })

    expect(fetchRolesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, search: 'coord' }))
  })

  // Bug menor reproducido en navegador: el trigger colapsado de los filtros
  // Estado/Tipo mostraba el valor interno "all" en vez de la etiqueta
  // traducida "Todos" (las opciones del dropdown SÍ estaban bien
  // traducidas -- faltaba mapear el valor seleccionado a su label).
  test('shows the translated "Todos" label (not the raw "all" value) on the collapsed filter triggers', async () => {
    render(<RolesListScreen />)
    await screen.findByText('Administrador')

    expect(screen.getByRole('combobox', { name: 'Filtrar por estado' })).toHaveTextContent('Todos')
    expect(screen.getByRole('combobox', { name: 'Filtrar por tipo' })).toHaveTextContent('Todos')
    expect(screen.queryByText('all')).not.toBeInTheDocument()
  })

  test('changing the status filter resets to page 1 and requests the active status', async () => {
    render(<RolesListScreen />)
    await screen.findByText('Administrador')
    fetchRolesMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    const option = await screen.findByRole('option', { name: 'Activo' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchRolesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, status: 'active' }))
    expect(screen.getByRole('combobox', { name: 'Filtrar por estado' })).toHaveTextContent('Activo')
  })

  test('changing the type filter requests the custom type', async () => {
    render(<RolesListScreen />)
    await screen.findByText('Administrador')
    fetchRolesMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por tipo' }))
    const option = await screen.findByRole('option', { name: 'Personalizado' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchRolesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, type: 'custom' }))
    expect(screen.getByRole('combobox', { name: 'Filtrar por tipo' })).toHaveTextContent('Personalizado')
  })

  test('changing rows-per-page requests the new perPage and resets to page 1', async () => {
    render(<RolesListScreen />)
    await screen.findByText('Administrador')
    fetchRolesMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filas por página' }))
    const option = await screen.findByRole('option', { name: '25' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchRolesMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, perPage: 25 }))
  })

  test('the actions menu navigates to the detail page for "Ver" and "Editar"', async () => {
    render(<RolesListScreen />)
    await screen.findByText('Coordinador')

    const menu = await openMenu('Coordinador')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ver' }))
    expect(pushMock).toHaveBeenCalledWith('/admin/roles/2')

    pushMock.mockClear()
    const menu2 = await openMenu('Coordinador')
    fireEvent.click(within(menu2).getByRole('menuitem', { name: 'Editar' }))
    expect(pushMock).toHaveBeenCalledWith('/admin/roles/2')
  })

  test('disables "Inactivar" and "Eliminar" for non-editable (system) roles', async () => {
    render(<RolesListScreen />)
    await screen.findByText('Administrador')

    const menu = await openMenu('Administrador')
    expect(within(menu).getByRole('menuitem', { name: 'Inactivar' })).toHaveAttribute('aria-disabled', 'true')
    expect(within(menu).getByRole('menuitem', { name: 'Eliminar' })).toHaveAttribute('aria-disabled', 'true')
  })

  test('"Inactivar" calls deactivateRole and updates the row badge/menu in place', async () => {
    // Respuesta realista: el backend devuelve el modelo fresco del MISMO
    // rol (id 2, Coordinador) -- no un rol distinto -- con is_active en
    // false y el resto de campos propios del modelo base (sin
    // users_count/permissions_count/risk_level, ver contrato del lote).
    deactivateRoleMock.mockResolvedValueOnce({
      role: {
        ...makeRole({
          id: 2,
          uuid: 'r-2',
          code: 'COORD',
          name: 'Coordinador',
          is_system: false,
          is_editable: true,
          priority_level: 3,
        }),
        is_active: false,
      },
    })
    render(<RolesListScreen />)
    await screen.findByText('Coordinador')

    const row = screen.getByText('Coordinador').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('Activo')).toBeInTheDocument()

    const menu = await openMenu('Coordinador')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inactivar' }))
    })

    expect(deactivateRoleMock).toHaveBeenCalledWith(2)
    // Bug reproducido en navegador: el badge/menú se quedaba en el valor
    // ANTERIOR hasta recargar la página -- este assert falla si el estado
    // local de la fila no se actualiza con la respuesta del endpoint.
    expect(within(row as HTMLElement).getByText('Inactivo')).toBeInTheDocument()
    const menuAfter = await openMenu('Coordinador')
    expect(within(menuAfter).getByRole('menuitem', { name: 'Activar' })).toBeInTheDocument()
  })

  test('"Activar" calls activateRole for an inactive role and updates the row badge/menu in place', async () => {
    fetchRolesMock.mockResolvedValueOnce({
      data: [makeRole({ id: 2, name: 'Coordinador', is_system: false, is_editable: true, is_active: false })],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 10,
    })
    activateRoleMock.mockResolvedValueOnce({
      role: {
        ...makeRole({ id: 2, name: 'Coordinador', is_system: false, is_editable: true }),
        is_active: true,
      },
    })
    render(<RolesListScreen />)
    await screen.findByText('Coordinador')

    const row = screen.getByText('Coordinador').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLElement).getByText('Inactivo')).toBeInTheDocument()

    const menu = await openMenu('Coordinador')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Activar' }))
    })

    expect(activateRoleMock).toHaveBeenCalledWith(2)
    expect(within(row as HTMLElement).getByText('Activo')).toBeInTheDocument()
    const menuAfter = await openMenu('Coordinador')
    expect(within(menuAfter).getByRole('menuitem', { name: 'Inactivar' })).toBeInTheDocument()
  })

  test('shows the action error and clears the busy state if deactivateRole fails (422)', async () => {
    deactivateRoleMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', {
        role: ['No se puede desactivar este rol: dejaría a la organización sin nadie con permiso para revertir la acción.'],
      })
    )
    render(<RolesListScreen />)
    await screen.findByText('Coordinador')

    const menu = await openMenu('Coordinador')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inactivar' }))
    })

    expect(
      await screen.findByText('No se puede desactivar este rol: dejaría a la organización sin nadie con permiso para revertir la acción.')
    ).toBeInTheDocument()
    // El badge no cambia (el backend rechazó la acción) y el menú no queda
    // deshabilitado colgado en "cargando" -- vuelve a ser accionable.
    const row = screen.getByText('Coordinador').closest('tr')
    expect(within(row as HTMLElement).getByText('Activo')).toBeInTheDocument()
    const menuAfter = await openMenu('Coordinador')
    expect(within(menuAfter).getByRole('menuitem', { name: 'Inactivar' })).not.toHaveAttribute('aria-disabled', 'true')
  })

  test('deletes an editable role via the actions menu after confirmation', async () => {
    deleteRoleMock.mockResolvedValueOnce(undefined)
    render(<RolesListScreen />)
    await screen.findByText('Coordinador')

    const menu = await openMenu('Coordinador')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Eliminar' }))
    const confirm = await screen.findByRole('button', { name: /^confirmar$/i })
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(deleteRoleMock).toHaveBeenCalledWith(2)
  })

  test('navigates to /admin/roles/new when clicking "+ Crear Rol"', async () => {
    render(<RolesListScreen />)
    await screen.findByText('Administrador')

    fireEvent.click(screen.getByRole('button', { name: /crear rol/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/roles/new')
  })
})
