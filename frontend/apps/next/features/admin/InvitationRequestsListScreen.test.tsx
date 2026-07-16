import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { InvitationRequestsListScreen } from './InvitationRequestsListScreen'

const fetchInvitationRequestsMock = vi.fn()
const approveInvitationRequestMock = vi.fn()
const rejectInvitationRequestMock = vi.fn()
const fetchRolesMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchInvitationRequests: (...args: unknown[]) => fetchInvitationRequestsMock(...args),
    approveInvitationRequest: (...args: unknown[]) => approveInvitationRequestMock(...args),
    rejectInvitationRequest: (...args: unknown[]) => rejectInvitationRequestMock(...args),
    fetchRoles: (...args: unknown[]) => fetchRolesMock(...args),
  }
})

const useRequireAuthMock = vi.fn<
  (permission?: string, options?: { requirePlatformStaff?: boolean }) => {
    user: { id: number } | null
    isLoading: boolean
    isAuthorized: boolean
  }
>(() => ({ user: { id: 1 }, isLoading: false, isAuthorized: true }))

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string, options?: { requirePlatformStaff?: boolean }) =>
    useRequireAuthMock(permission, options),
}))

function invitationRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'ir-1',
    first_name: 'Ana',
    middle_name: null,
    last_name: 'Gomez',
    second_last_name: null,
    document_type: 'CC',
    document_number: '800111333',
    email: 'ana.gomez@example.com',
    phone: null,
    status: 'PENDING',
    created_at: '2026-07-01T00:00:00Z',
    reviewed_by: null,
    reviewed_at: null,
    rejection_reason: null,
    resulting_user_id: null,
    ...overrides,
  }
}

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

// CU-006.1 modificado (mecanismo de invitación, reemplaza el registro
// público eliminado): tabla + filtro por estado + Aprobar/Rechazar.
//
// Hallazgo Alto (especialista-seguridad, 2026-07-14): index()/approve()/
// reject() exigen `users.create` + ser staff de la organización plataforma
// (`is_platform_staff`) -- ver InvitationRequestController.
describe('InvitationRequestsListScreen', () => {
  beforeEach(() => {
    fetchRolesMock.mockResolvedValue({
      data: [role(), role({ id: 2, code: 'ADMINISTRADOR', name: 'Administrador' })],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 100,
    })
  })

  afterEach(() => {
    fetchInvitationRequestsMock.mockReset()
    approveInvitationRequestMock.mockReset()
    rejectInvitationRequestMock.mockReset()
    fetchRolesMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires users.create + is_platform_staff via useRequireAuth', async () => {
    fetchInvitationRequestsMock.mockResolvedValueOnce({
      data: [],
      current_page: 1,
      last_page: 1,
      total: 0,
      per_page: 15,
    })
    render(<InvitationRequestsListScreen />)
    await screen.findByText('No hay solicitudes que coincidan con el filtro.')

    expect(useRequireAuthMock).toHaveBeenCalledWith('users.create', { requirePlatformStaff: true })
  })

  test('does not fetch requests when not authorized', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<InvitationRequestsListScreen />)

    expect(fetchInvitationRequestsMock).not.toHaveBeenCalled()
  })

  test('defaults to filtering by PENDING status', async () => {
    fetchInvitationRequestsMock.mockResolvedValueOnce({
      data: [invitationRequest()],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })
    render(<InvitationRequestsListScreen />)

    await screen.findByText('Ana Gomez')

    expect(fetchInvitationRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING', page: 1 })
    )
  })

  test('shows Aprobar/Rechazar only for PENDING requests', async () => {
    fetchInvitationRequestsMock.mockResolvedValueOnce({
      data: [invitationRequest({ id: 2, status: 'REJECTED', rejection_reason: 'Documentación insuficiente.' })],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })
    render(<InvitationRequestsListScreen />)

    await screen.findByText('Ana Gomez')

    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument()
    expect(screen.getByText('Documentación insuficiente.')).toBeInTheDocument()
  })

  test('approve flow: opens the role picker, requires at least one role, and calls the API', async () => {
    fetchInvitationRequestsMock.mockResolvedValueOnce({
      data: [invitationRequest()],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })
    approveInvitationRequestMock.mockResolvedValueOnce({
      user: { id: 9 },
      invitation_request: invitationRequest({ status: 'APPROVED' }),
    })
    render(<InvitationRequestsListScreen />)

    await screen.findByText('Ana Gomez')
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))

    const dialog = await screen.findByRole('alertdialog')
    // Sin roles seleccionados -- exige al menos uno antes de llamar al API.
    fireEvent.click(within(dialog).getByRole('button', { name: /confirmar aprobación/i }))
    expect(await within(dialog).findByText('Selecciona al menos un rol.')).toBeInTheDocument()
    expect(approveInvitationRequestMock).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Operador' }))
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /confirmar aprobación/i }))
    })

    expect(approveInvitationRequestMock).toHaveBeenCalledWith(1, { role_ids: [1] })
  })

  test('reject flow: sends the optional reason to the API', async () => {
    fetchInvitationRequestsMock.mockResolvedValueOnce({
      data: [invitationRequest()],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })
    rejectInvitationRequestMock.mockResolvedValueOnce({
      invitation_request: invitationRequest({ status: 'REJECTED' }),
    })
    render(<InvitationRequestsListScreen />)

    await screen.findByText('Ana Gomez')
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))

    const dialog = await screen.findByRole('alertdialog')
    fireEvent.change(within(dialog).getByLabelText(/motivo/i), { target: { value: 'Documentación insuficiente.' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /confirmar rechazo/i }))
    })

    expect(rejectInvitationRequestMock).toHaveBeenCalledWith(1, { reason: 'Documentación insuficiente.' })
  })

  test('surfaces the "already reviewed" error from approve()', async () => {
    const { ApiValidationError } = await import('app/features/admin/api')
    fetchInvitationRequestsMock.mockResolvedValueOnce({
      data: [invitationRequest()],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })
    approveInvitationRequestMock.mockRejectedValueOnce(
      new ApiValidationError('x', { invitation_request: ['Esta solicitud ya fue revisada.'] })
    )
    render(<InvitationRequestsListScreen />)

    await screen.findByText('Ana Gomez')
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Operador' }))
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /confirmar aprobación/i }))
    })

    expect(await within(dialog).findByText('Esta solicitud ya fue revisada.')).toBeInTheDocument()
  })
})
