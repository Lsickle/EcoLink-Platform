import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CreateUserForm } from './CreateUserForm'

const createUserMock = vi.fn()
const fetchRolesMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createUser: (...args: unknown[]) => createUserMock(...args),
    fetchRoles: (...args: unknown[]) => fetchRolesMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const useRequireAuthMock = vi.fn<
  (permission?: string) => {
    user: { id: number; is_platform_staff?: boolean } | null
    isLoading: boolean
    isAuthorized: boolean
  }
>(() => ({ user: { id: 1, is_platform_staff: false }, isLoading: false, isAuthorized: true }))

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function role(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'r-1',
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

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText('Número de documento'), { target: { value: '123456789' } })
  fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Gomez' } })
  fireEvent.change(screen.getByLabelText('Nombre de usuario'), { target: { value: 'ana.gomez' } })
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.com' } })
}

describe('CreateUserForm', () => {
  beforeEach(() => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: false }, isLoading: false, isAuthorized: true })
    fetchRolesMock.mockResolvedValue({
      data: [role(), role({ id: 2, code: 'ADMINISTRADOR', name: 'Administrador' })],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 50,
    })
    searchOrganizationsMock.mockResolvedValue({
      data: [
        { id: 10, legal_name: 'EmpresaGenerador S.A.S.', tax_id: '900123456-1' },
        { id: 11, legal_name: 'Otra Organización S.A.S.', tax_id: '900654321-2' },
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 50,
    })
  })

  afterEach(() => {
    createUserMock.mockReset()
    fetchRolesMock.mockReset()
    searchOrganizationsMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the users.read permission via useRequireAuth', async () => {
    render(<CreateUserForm />)
    await screen.findByText('Operador')

    expect(useRequireAuthMock).toHaveBeenCalledWith('users.read')
  })

  test('does not fetch roles or render the form when not authorized', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<CreateUserForm />)

    expect(fetchRolesMock).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Correo electrónico')).not.toBeInTheDocument()
  })

  // Mecanismo de invitación (CU-006.1 modificado): store() ya no acepta
  // password/password_confirmation -- el usuario nace PENDING_ACTIVATION y
  // fija su propia contraseña al aceptar el correo de invitación.
  test('does not render password fields -- the backend no longer accepts them', async () => {
    render(<CreateUserForm />)
    await screen.findByText('Operador')

    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument()
    expect(screen.getByText(/se enviará una invitación por correo electrónico/i)).toBeInTheDocument()
  })

  // Gap de staging (backend ya cerrado, RN-181/UserProvisioningService::
  // createPendingUser()): un admin de tenant normal (no platform staff)
  // nunca ve el selector de Organización -- para ese actor `organization_id`
  // es solo informativo en el backend, sin efecto en el tenant del usuario
  // nuevo, así que exponerlo aquí sería confuso.
  test('does not expose an organization selector for a non-platform-staff actor', async () => {
    render(<CreateUserForm />)
    await screen.findByText('Operador')

    expect(screen.queryByLabelText(/organizaci[oó]n/i)).not.toBeInTheDocument()
    expect(searchOrganizationsMock).not.toHaveBeenCalled()
  })

  // Selector "Organización" (gap de staging, ver docblock arriba) --
  // reutiliza OrganizationQuickSelect, visible SOLO para platform staff,
  // mismo criterio que WasteWizard.tsx/ServiceRequestWizard.tsx.
  test('shows the "Organización" selector for a platform staff actor', async () => {
    useRequireAuthMock.mockReturnValue({
      user: { id: 1, is_platform_staff: true },
      isLoading: false,
      isAuthorized: true,
    })
    render(<CreateUserForm />)
    await screen.findByText('Operador')

    expect(screen.getByLabelText('Organización')).toBeInTheDocument()
  })

  test('platform staff: submits createUser with organization_id when an organization is selected', async () => {
    useRequireAuthMock.mockReturnValue({
      user: { id: 1, is_platform_staff: true },
      isLoading: false,
      isAuthorized: true,
    })
    createUserMock.mockResolvedValueOnce({ user: { id: 9 } })
    render(<CreateUserForm />)
    await screen.findByText('Operador')

    fillRequiredFields()
    fireEvent.change(screen.getByLabelText('Organización'), { target: { value: 'EmpresaGenerador' } })
    fireEvent.click(await screen.findByRole('button', { name: /EmpresaGenerador S\.A\.S\./ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear usuario/i }))
    })

    expect(createUserMock).toHaveBeenCalledWith(expect.objectContaining({ organization_id: 10 }))
  })

  test('platform staff: submits createUser without organization_id when no organization is selected', async () => {
    useRequireAuthMock.mockReturnValue({
      user: { id: 1, is_platform_staff: true },
      isLoading: false,
      isAuthorized: true,
    })
    createUserMock.mockResolvedValueOnce({ user: { id: 9 } })
    render(<CreateUserForm />)
    await screen.findByText('Operador')

    fillRequiredFields()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear usuario/i }))
    })

    expect(createUserMock).toHaveBeenCalled()
    const payload = createUserMock.mock.calls[0]![0]
    expect(payload.organization_id).toBeUndefined()
  })

  test('submits the payload with role_ids as numbers and redirects on success', async () => {
    createUserMock.mockResolvedValueOnce({ user: { id: 9 } })
    render(<CreateUserForm />)
    await screen.findByText('Operador')

    fillRequiredFields()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Operador' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear usuario/i }))
    })

    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        document_number: '123456789',
        first_name: 'Ana',
        last_name: 'Gomez',
        username: 'ana.gomez',
        email: 'ana@example.com',
        role_ids: [1],
      })
    )
    const payload = createUserMock.mock.calls[0]![0]
    expect(payload.password).toBeUndefined()
    expect(payload.password_confirmation).toBeUndefined()
    expect(pushMock).toHaveBeenCalledWith('/admin/users')
  })

  test('surfaces a 422 field error from the backend (e.g. duplicate email)', async () => {
    const { ApiValidationError } = await import('app/features/admin/api')
    createUserMock.mockRejectedValueOnce(new ApiValidationError('Error de validación.', { email: ['ya existe'] }))
    render(<CreateUserForm />)
    await screen.findByText('Operador')

    fillRequiredFields()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear usuario/i }))
    })

    expect(await screen.findByText('ya existe')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })

  test('rejects a missing username before calling the API', async () => {
    render(<CreateUserForm />)
    await screen.findByText('Operador')

    fireEvent.change(screen.getByLabelText('Número de documento'), { target: { value: '123456789' } })
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Gomez' } })
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.com' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear usuario/i }))
    })

    expect(screen.getByText('Ingresa un nombre de usuario.')).toBeInTheDocument()
    expect(createUserMock).not.toHaveBeenCalled()
  })
})
