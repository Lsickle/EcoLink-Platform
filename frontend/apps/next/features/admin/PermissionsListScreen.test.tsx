import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PermissionsListScreen } from './PermissionsListScreen'

const fetchPermissionsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchPermissions: (...args: unknown[]) => fetchPermissionsMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function permission(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    code: 'users.create',
    name: 'Crear usuarios',
    module: 'users',
    action: 'create',
    scope: 'tenant',
    description: null,
    priority_level: 1,
    is_system: true,
    is_critical: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    roles_count: 2,
    ...overrides,
  }
}

function paginated(data: unknown[]) {
  return { data, current_page: 1, last_page: 1, total: data.length, per_page: 10 }
}

describe('PermissionsListScreen', () => {
  beforeEach(() => {
    fetchPermissionsMock.mockResolvedValue(
      paginated([
        permission({ id: 1, code: 'users.create', name: 'Crear usuarios', module: 'users', action: 'create' }),
        permission({
          id: 2,
          code: 'users.delete',
          name: 'Eliminar usuarios',
          module: 'users',
          action: 'delete',
          is_critical: true,
          priority_level: 4,
        }),
        permission({ id: 3, code: 'roles.create', name: 'Crear roles', module: 'roles', action: 'create' }),
        permission({ id: 4, code: 'permissions.read', name: 'Ver permisos', module: 'permissions', action: 'read' }),
      ])
    )
  })

  afterEach(() => {
    fetchPermissionsMock.mockReset()
    useRequireAuthMock.mockClear()
    pushMock.mockReset()
  })

  test('requires the permissions.read permission via useRequireAuth', async () => {
    render(<PermissionsListScreen />)
    await screen.findByText('Crear usuarios')

    expect(useRequireAuthMock).toHaveBeenCalledWith('permissions.read')
  })

  test('does not fetch or render the catalog when the user lacks permissions.read', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<PermissionsListScreen />)

    expect(fetchPermissionsMock).not.toHaveBeenCalled()
    expect(screen.queryByText('Crear usuarios')).not.toBeInTheDocument()
  })

  test('translates the "audit" module label to "Auditoría"', async () => {
    fetchPermissionsMock.mockResolvedValueOnce(
      paginated([permission({ id: 5, code: 'audit.read', name: 'Ver auditoría', module: 'audit', action: 'read' })])
    )
    render(<PermissionsListScreen />)

    expect(await screen.findByText('Auditoría')).toBeInTheDocument()
    expect(screen.queryByText('audit')).not.toBeInTheDocument()
  })

  test('renders code/name/module/action/roles/level/status/creation columns', async () => {
    render(<PermissionsListScreen />)
    await screen.findByText('Crear usuarios')

    expect(screen.getByText('users.create')).toBeInTheDocument()
    expect(screen.getAllByText('Usuarios').length).toBeGreaterThan(0)
    expect(screen.getAllByText('create').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0) // roles_count
    expect(screen.getAllByText('Activo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('01/01/2026').length).toBeGreaterThan(0)
  })

  test('shows a critical badge and the highest risk level badge for is_critical/priority_level=4 permissions', async () => {
    render(<PermissionsListScreen />)
    await screen.findByText('Eliminar usuarios')

    const criticalRow = screen.getByText('Eliminar usuarios').closest('[data-slot="permission-row"]')
    expect(criticalRow).not.toBeNull()
    expect(criticalRow?.textContent).toContain('Crítico')
    expect(criticalRow?.textContent).toContain('crítico')
  })

  test('typing in the search box debounces and calls fetchPermissions with the search term', async () => {
    vi.useFakeTimers()
    render(<PermissionsListScreen />)
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Buscar permisos'), { target: { value: 'crear' } })
    })

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(fetchPermissionsMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'crear' }))
    vi.useRealTimers()
  })

  test('filtering by module, status and critical forwards the right params to fetchPermissions', async () => {
    render(<PermissionsListScreen />)
    await screen.findByText('Crear usuarios')

    fireEvent.click(screen.getByRole('combobox', { name: /filtrar por módulo/i }))
    const moduleOption = await screen.findByRole('option', { name: 'Roles' })
    await act(async () => {
      fireEvent.pointerDown(moduleOption)
      fireEvent.click(moduleOption)
    })

    fireEvent.click(screen.getByRole('combobox', { name: /filtrar por estado/i }))
    const statusOption = await screen.findByRole('option', { name: 'Activo' })
    await act(async () => {
      fireEvent.pointerDown(statusOption)
      fireEvent.click(statusOption)
    })

    fireEvent.click(screen.getByRole('combobox', { name: /filtrar por crítico/i }))
    const criticalOption = await screen.findByRole('option', { name: 'Sí' })
    await act(async () => {
      fireEvent.pointerDown(criticalOption)
      fireEvent.click(criticalOption)
    })

    expect(fetchPermissionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ module: 'roles', status: 'active', critical: true })
    )
  })

  test('the "Ver Matriz de Permisos" button navigates to /admin/permissions/matrix', async () => {
    render(<PermissionsListScreen />)
    await screen.findByText('Crear usuarios')

    fireEvent.click(screen.getByRole('button', { name: /ver matriz de permisos/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/permissions/matrix')
  })

  test('the row action menu "Ver detalle" navigates to the permission detail route', async () => {
    render(<PermissionsListScreen />)
    await screen.findByText('Crear usuarios')

    fireEvent.click(screen.getByRole('button', { name: /acciones para crear usuarios/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /ver detalle/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/permissions/1')
  })

  test('does not render any create/edit/delete controls -- read-only catalog', async () => {
    render(<PermissionsListScreen />)
    await screen.findByText('Crear usuarios')

    expect(screen.queryByRole('button', { name: /^crear$|^editar$|^eliminar$/i })).not.toBeInTheDocument()
  })
})
