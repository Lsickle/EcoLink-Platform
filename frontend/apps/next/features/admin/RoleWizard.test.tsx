import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RoleWizard } from './RoleWizard'

const fetchRolesMock = vi.fn()
const fetchRoleMock = vi.fn()
const fetchPermissionsMock = vi.fn()
const createRoleMock = vi.fn()
const assignPermissionToRoleMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchRoles: (...args: unknown[]) => fetchRolesMock(...args),
    fetchRole: (...args: unknown[]) => fetchRoleMock(...args),
    fetchPermissions: (...args: unknown[]) => fetchPermissionsMock(...args),
    createRole: (...args: unknown[]) => createRoleMock(...args),
    assignPermissionToRole: (...args: unknown[]) => assignPermissionToRoleMock(...args),
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

const PERMISSIONS = [
  permission({ id: 1, code: 'users.create', name: 'Crear usuarios', module: 'users' }),
  permission({ id: 2, code: 'users.read', name: 'Ver usuarios', module: 'users' }),
  permission({ id: 3, code: 'roles.create', name: 'Crear roles', module: 'roles' }),
  permission({ id: 4, code: 'permissions.read', name: 'Ver permisos', module: 'permissions' }),
]

function existingRole(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 5,
    uuid: 'r-5',
    code: 'OPERADOR',
    name: 'Operador',
    description: null,
    is_system: false,
    is_editable: true,
    priority_level: 5,
    is_active: true,
    tenant_organization_id: 1,
    created_at: '2026-01-01',
    ...overrides,
  }
}

async function goToStep2() {
  fireEvent.change(screen.getByLabelText(/código/i), { target: { value: 'COORD_LOGISTICA' } })
  fireEvent.change(screen.getByLabelText(/^nombre$/i), { target: { value: 'Coordinador de logística' } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
  })
}

async function goToStep3() {
  await goToStep2()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
  })
}

async function goToStep4() {
  await goToStep3()
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
  })
}

describe('RoleWizard', () => {
  beforeEach(() => {
    fetchRolesMock.mockResolvedValue({
      data: [existingRole()],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 100,
    })
    fetchPermissionsMock.mockResolvedValue({
      data: PERMISSIONS,
      current_page: 1,
      last_page: 1,
      total: PERMISSIONS.length,
      per_page: 50,
    })
  })

  afterEach(() => {
    fetchRolesMock.mockReset()
    fetchRoleMock.mockReset()
    fetchPermissionsMock.mockReset()
    createRoleMock.mockReset()
    assignPermissionToRoleMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the roles.read permission via useRequireAuth', async () => {
    render(<RoleWizard />)
    await screen.findByLabelText(/código/i)

    expect(useRequireAuthMock).toHaveBeenCalledWith('roles.read')
  })

  test('does not render the wizard form when the user lacks roles.read', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<RoleWizard />)

    expect(screen.queryByLabelText(/código/i)).not.toBeInTheDocument()
  })

  test('starts on step 1 with a 4-step indicator', async () => {
    render(<RoleWizard />)
    await screen.findByLabelText(/código/i)

    expect(screen.getByText(/paso 1 de 4/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/código/i)).toBeInTheDocument()
  })

  test('blocks advancing past step 1 with an invalid code (contains spaces)', async () => {
    render(<RoleWizard />)
    await screen.findByLabelText(/código/i)

    fireEvent.change(screen.getByLabelText(/código/i), { target: { value: 'coordinador logistica' } })
    fireEvent.change(screen.getByLabelText(/^nombre$/i), { target: { value: 'Coordinador' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    })

    expect(screen.getByText(/usa solo letras, números y guión bajo/i)).toBeInTheDocument()
    expect(screen.getByText(/paso 1 de 4/i)).toBeInTheDocument()
  })

  test('selecting a template preloads its permissions into step 3', async () => {
    fetchRoleMock.mockResolvedValueOnce({
      role: { ...existingRole(), risk_level: 'bajo', permissions: [PERMISSIONS[0], PERMISSIONS[2]] },
    })
    render(<RoleWizard />)
    await screen.findByLabelText(/código/i)

    fireEvent.click(screen.getByRole('combobox', { name: /usar como plantilla/i }))
    const option = await screen.findByRole('option', { name: 'Operador' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })
    await screen.findByText(/permisos precargados desde la plantilla/i)

    await goToStep3()

    expect(screen.getByRole('checkbox', { name: 'Crear usuarios' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Crear roles' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Ver usuarios' })).not.toBeChecked()
  })

  test('step 3 groups permissions into exactly the 3 real modules', async () => {
    render(<RoleWizard />)
    await screen.findByLabelText(/código/i)
    await goToStep3()

    expect(screen.getByText('Usuarios')).toBeInTheDocument()
    expect(screen.getByText('Roles')).toBeInTheDocument()
    expect(screen.getByText('Permisos')).toBeInTheDocument()
  })

  test('step 4 summarizes the role and permission count, and back navigation preserves state', async () => {
    render(<RoleWizard />)
    await screen.findByLabelText(/código/i)
    await goToStep3()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Crear usuarios' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ver usuarios' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    })

    expect(screen.getByText(/paso 4 de 4/i)).toBeInTheDocument()
    expect(screen.getByText('COORD_LOGISTICA')).toBeInTheDocument()
    expect(screen.getByText('Coordinador de logística')).toBeInTheDocument()
    expect(screen.getByText(/2 permisos seleccionados/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /atr[aá]s/i }))
    expect(screen.getByRole('checkbox', { name: 'Crear usuarios' })).toBeChecked()

    fireEvent.click(screen.getByRole('button', { name: /atr[aá]s/i }))
    fireEvent.click(screen.getByRole('button', { name: /atr[aá]s/i }))
    expect(screen.getByDisplayValue('COORD_LOGISTICA')).toBeInTheDocument()
  })

  // Flujo completo del Paso 4 "Crear Rol": (a) POST /api/admin/roles, (b)
  // Promise.all de POST /api/admin/permissions/{id}/assign por cada permiso
  // marcado con role_id del rol recién creado, (c) redirige a su detalle.
  test('submitting creates the role, assigns every selected permission in parallel, and redirects', async () => {
    createRoleMock.mockResolvedValueOnce({ role: { ...existingRole(), id: 42, code: 'COORD_LOGISTICA' } })
    assignPermissionToRoleMock.mockResolvedValue({ message: 'ok' })

    render(<RoleWizard />)
    await screen.findByLabelText(/código/i)
    await goToStep3()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Crear usuarios' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ver usuarios' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /siguiente/i }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear rol/i }))
    })

    expect(createRoleMock).toHaveBeenCalledWith({
      code: 'COORD_LOGISTICA',
      name: 'Coordinador de logística',
      description: undefined,
      priority_level: 1,
    })
    expect(assignPermissionToRoleMock).toHaveBeenCalledTimes(2)
    expect(assignPermissionToRoleMock).toHaveBeenCalledWith(1, { role_id: 42 })
    expect(assignPermissionToRoleMock).toHaveBeenCalledWith(2, { role_id: 42 })
    expect(pushMock).toHaveBeenCalledWith('/admin/roles/42')
  })

  test('does not render a "Rol del Sistema" or "Rol Activo" toggle anywhere in the wizard', async () => {
    render(<RoleWizard />)
    await screen.findByLabelText(/código/i)

    expect(screen.queryByText(/rol del sistema/i)).not.toBeInTheDocument()

    await goToStep2()
    expect(screen.queryByText(/rol del sistema/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/rol activo/i)).not.toBeInTheDocument()
  })
})
