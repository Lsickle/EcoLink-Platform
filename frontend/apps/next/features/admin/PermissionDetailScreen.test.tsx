import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PermissionDetailScreen } from './PermissionDetailScreen'

const fetchPermissionMock = vi.fn()
const fetchPermissionRolesMock = vi.fn()
const fetchPermissionUsersMock = vi.fn()
const fetchPermissionActivityMock = vi.fn()
const fetchPermissionsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchPermission: (...args: unknown[]) => fetchPermissionMock(...args),
    fetchPermissionRoles: (...args: unknown[]) => fetchPermissionRolesMock(...args),
    fetchPermissionUsers: (...args: unknown[]) => fetchPermissionUsersMock(...args),
    fetchPermissionActivity: (...args: unknown[]) => fetchPermissionActivityMock(...args),
    fetchPermissions: (...args: unknown[]) => fetchPermissionsMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function permissionDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 5,
    code: 'users.create',
    name: 'Crear usuarios',
    module: 'users',
    action: 'create',
    scope: 'tenant',
    description: 'Permite crear usuarios en la organización.',
    priority_level: 3,
    is_system: true,
    is_critical: false,
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    created_by: { id: 1, username: 'admin' },
    updated_by: { id: 1, username: 'admin' },
    roles_count: 2,
    users_impacted_count: 4,
    ...overrides,
  }
}

function paginated<T>(data: T[]) {
  return { data, current_page: 1, last_page: 1, total: data.length, per_page: 15 }
}

function adminRole(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 3,
    uuid: 'r-3',
    code: 'COORDINADOR',
    name: 'Coordinador',
    description: null,
    is_system: false,
    is_editable: true,
    priority_level: 3,
    is_active: true,
    tenant_organization_id: 1,
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    users_count: 1,
    permissions_count: 1,
    risk_level: 'medio',
    ...overrides,
  }
}

function adminUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 9,
    uuid: 'u-9',
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
      document_number: '1',
      email: 'ana@example.com',
      phone: null,
    },
    status: { code: 'ACTIVE', name: 'Activo' },
    roles: [{ id: 3, code: 'COORDINADOR', name: 'Coordinador' }],
    ...overrides,
  }
}

describe('PermissionDetailScreen', () => {
  beforeEach(() => {
    fetchPermissionMock.mockResolvedValue({ permission: permissionDetail() })
    fetchPermissionRolesMock.mockResolvedValue(paginated([adminRole()]))
    fetchPermissionUsersMock.mockResolvedValue(paginated([adminUser()]))
    fetchPermissionActivityMock.mockResolvedValue(
      paginated([
        {
          event_type: 'PERMISSION_ASSIGNED',
          description: "Permiso 'Crear usuarios' asignado al rol 'Coordinador'.",
          actor: { id: 1, username: 'admin' },
          created_at: '2026-07-14T00:00:00Z',
        },
      ])
    )
    fetchPermissionsMock.mockResolvedValue(
      paginated([
        permissionDetail({ id: 5, name: 'Crear usuarios' }),
        permissionDetail({ id: 6, name: 'Editar usuarios', code: 'users.update' }),
      ])
    )
  })

  afterEach(() => {
    fetchPermissionMock.mockReset()
    fetchPermissionRolesMock.mockReset()
    fetchPermissionUsersMock.mockReset()
    fetchPermissionActivityMock.mockReset()
    fetchPermissionsMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the permissions.read permission via useRequireAuth', async () => {
    render(<PermissionDetailScreen permissionId="5" />)
    await screen.findAllByText('Crear usuarios')

    expect(useRequireAuthMock).toHaveBeenCalledWith('permissions.read')
  })

  test('does not fetch anything when the user lacks permissions.read', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<PermissionDetailScreen permissionId="5" />)

    expect(fetchPermissionMock).not.toHaveBeenCalled()
  })

  test('shows the header with code, name, status/critical/level badges and summary sidebar', async () => {
    render(<PermissionDetailScreen permissionId="5" />)
    await screen.findAllByText('Crear usuarios')

    expect(screen.getAllByText('users.create').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Activo').length).toBeGreaterThan(0)
    expect(screen.getAllByText('alto').length).toBeGreaterThan(0) // priority_level 3 -> alto
    expect(screen.getByText('2')).toBeInTheDocument() // Roles Asociados
    expect(screen.getByText('4')).toBeInTheDocument() // Usuarios Impactados
  })

  test('shows the "Crítico" badge only when is_critical is true', async () => {
    fetchPermissionMock.mockResolvedValueOnce({ permission: permissionDetail({ is_critical: true }) })
    render(<PermissionDetailScreen permissionId="5" />)

    expect(await screen.findByText('Crítico')).toBeInTheDocument()
  })

  test('shows general info fields including description and created_by/updated_by', async () => {
    render(<PermissionDetailScreen permissionId="5" />)
    await screen.findAllByText('Crear usuarios')

    expect(screen.getByText('Permite crear usuarios en la organización.')).toBeInTheDocument()
    expect(screen.getAllByText('admin').length).toBeGreaterThanOrEqual(1)
  })

  test('the "Roles" tab lazily fetches and displays roles using this permission, with a link to the role detail', async () => {
    render(<PermissionDetailScreen permissionId="5" />)
    await screen.findAllByText('Crear usuarios')

    expect(fetchPermissionRolesMock).toHaveBeenCalledWith('5', { perPage: 15 })
    expect(await screen.findByText('Coordinador')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /ver rol/i }))
    expect(pushMock).toHaveBeenCalledWith('/admin/roles/3')
  })

  test('the "Usuarios" tab lazily fetches and displays users with this permission', async () => {
    render(<PermissionDetailScreen permissionId="5" />)
    await screen.findAllByText('Crear usuarios')

    expect(fetchPermissionUsersMock).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /usuarios/i }))
    })

    expect(await screen.findByText('Ana Gomez')).toBeInTheDocument()
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()
    expect(fetchPermissionUsersMock).toHaveBeenCalledWith('5', { perPage: 15 })
  })

  test('the "Dependencias" tab shows other permissions of the same module, excluding the current one', async () => {
    render(<PermissionDetailScreen permissionId="5" />)
    await screen.findAllByText('Crear usuarios')

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /dependencias/i }))
    })

    expect(fetchPermissionsMock).toHaveBeenCalledWith({ module: 'users', perPage: 50 })
    expect(await screen.findByText('Editar usuarios')).toBeInTheDocument()
    // El propio permiso (id 5, "Crear usuarios") no debe listarse como
    // "relacionado consigo mismo" -- solo debe aparecer en el header, no en
    // la lista de la pestaña.
    const dependenciesPanel = screen.getByRole('tabpanel', { name: /dependencias/i })
    expect(dependenciesPanel).not.toHaveTextContent('Crear usuarios')
  })

  test('the "Auditoría" tab lazily fetches and displays the activity timeline', async () => {
    render(<PermissionDetailScreen permissionId="5" />)
    await screen.findAllByText('Crear usuarios')

    expect(fetchPermissionActivityMock).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /auditoría/i }))
    })

    expect(await screen.findByText("Permiso 'Crear usuarios' asignado al rol 'Coordinador'.")).toBeInTheDocument()
    expect(fetchPermissionActivityMock).toHaveBeenCalledWith('5', { page: 1, perPage: 15 })
  })
})
