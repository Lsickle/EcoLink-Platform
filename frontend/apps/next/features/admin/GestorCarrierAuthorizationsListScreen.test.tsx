import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { GestorCarrierAuthorizationsListScreen } from './GestorCarrierAuthorizationsListScreen'

const fetchGestorCarrierAuthorizationsMock = vi.fn()
const createGestorCarrierAuthorizationMock = vi.fn()
const revokeGestorCarrierAuthorizationMock = vi.fn()
const searchOrganizationsMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchGestorCarrierAuthorizations: (...args: unknown[]) => fetchGestorCarrierAuthorizationsMock(...args),
    createGestorCarrierAuthorization: (...args: unknown[]) => createGestorCarrierAuthorizationMock(...args),
    revokeGestorCarrierAuthorization: (...args: unknown[]) => revokeGestorCarrierAuthorizationMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['gestor_carrier_authorizations.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function authorization(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 4,
    uuid: 'gca-4',
    gestor_organization_id: 2,
    carrier_organization_id: 6,
    authorized_by: 1,
    authorized_at: '2026-07-20T00:00:00Z',
    revoked_by: null,
    revoked_at: null,
    observations: null,
    is_active: true,
    created_at: '2026-07-20T00:00:00Z',
    updated_at: '2026-07-20T00:00:00Z',
    gestor_organization: { id: 2, legal_name: 'Gestor Ambiental S.A.S.' },
    carrier_organization: { id: 6, legal_name: 'Transportes Rápidos S.A.S.' },
    ...overrides,
  }
}

describe('GestorCarrierAuthorizationsListScreen', () => {
  beforeEach(() => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['gestor_carrier_authorizations.read', 'gestor_carrier_authorizations.create', 'gestor_carrier_authorizations.revoke'],
    }
    fetchGestorCarrierAuthorizationsMock.mockResolvedValue({ ...emptyPage, data: [authorization()], total: 1 })
    searchOrganizationsMock.mockResolvedValue({ ...emptyPage, data: [] })
  })

  afterEach(() => {
    fetchGestorCarrierAuthorizationsMock.mockReset()
    createGestorCarrierAuthorizationMock.mockReset()
    revokeGestorCarrierAuthorizationMock.mockReset()
    searchOrganizationsMock.mockReset()
  })

  test('renders the gestor, carrier and active status badge', async () => {
    render(<GestorCarrierAuthorizationsListScreen />)

    await screen.findByText('Gestor Ambiental S.A.S.')
    expect(screen.getByText('Transportes Rápidos S.A.S.')).toBeInTheDocument()
    expect(screen.getByText('Vigente')).toBeInTheDocument()
  })

  test('revokes an active authorization', async () => {
    revokeGestorCarrierAuthorizationMock.mockResolvedValue({ gestor_carrier_authorization: authorization({ is_active: false }) })
    render(<GestorCarrierAuthorizationsListScreen />)
    await screen.findByText('Gestor Ambiental S.A.S.')

    fireEvent.click(screen.getByRole('button', { name: 'Revocar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revocación' }))

    await waitFor(() => expect(revokeGestorCarrierAuthorizationMock).toHaveBeenCalledWith(4))
  })

  test('hides "Revocar" without the revoke permission', async () => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['gestor_carrier_authorizations.read'] }
    render(<GestorCarrierAuthorizationsListScreen />)
    await screen.findByText('Gestor Ambiental S.A.S.')

    expect(screen.queryByRole('button', { name: 'Revocar' })).not.toBeInTheDocument()
  })

  test('creates an authorization for a tenant Gestor (own organization, no gestor selector)', async () => {
    createGestorCarrierAuthorizationMock.mockResolvedValue({ gestor_carrier_authorization: authorization() })
    render(<GestorCarrierAuthorizationsListScreen />)
    await screen.findByText('Gestor Ambiental S.A.S.')

    fireEvent.click(screen.getByRole('button', { name: '+ Autorizar Transportador' }))
    expect(screen.queryByLabelText('Organización Gestor')).not.toBeInTheDocument()

    searchOrganizationsMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 9, legal_name: 'Carga Express S.A.S.', tax_id: '900987654' }],
    })
    fireEvent.change(screen.getByLabelText('Organización Transportadora'), { target: { value: 'Carga' } })
    fireEvent.click(await screen.findByText('Carga Express S.A.S.'))
    fireEvent.click(screen.getByRole('button', { name: 'Autorizar' }))

    await waitFor(() =>
      expect(createGestorCarrierAuthorizationMock).toHaveBeenCalledWith(
        expect.objectContaining({ carrier_organization_id: 9 })
      )
    )
  })

  test('shows an empty message when there are no authorizations', async () => {
    fetchGestorCarrierAuthorizationsMock.mockResolvedValue(emptyPage)
    render(<GestorCarrierAuthorizationsListScreen />)

    expect(await screen.findByText(/No hay autorizaciones de transportador/)).toBeInTheDocument()
  })
})
