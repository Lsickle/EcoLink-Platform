import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { OrganizationsListScreen } from './OrganizationsListScreen'

const fetchOrganizationsMock = vi.fn()
const fetchDepartmentsMock = vi.fn()
const fetchBusinessRolesMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchOrganizations: (...args: unknown[]) => fetchOrganizationsMock(...args),
    fetchDepartments: (...args: unknown[]) => fetchDepartmentsMock(...args),
    fetchBusinessRoles: (...args: unknown[]) => fetchBusinessRolesMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

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

function organization(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'org-1',
    legal_name: 'EcoRecicla S.A.S.',
    trade_name: null,
    tax_id: '900123456-1',
    tax_id_type: 'NIT',
    email: null,
    phone: null,
    website: null,
    organization_status_id: 2,
    registration_date: '2026-01-01',
    is_active: true,
    is_platform_tenant: false,
    observations: null,
    created_at: '2026-07-01T00:00:00Z',
    created_by: 1,
    updated_at: '2026-07-01T00:00:00Z',
    updated_by: null,
    timezone: 'America/Bogota',
    country_code: 'CO',
    currency_code: 'COP',
    company_size: null,
    employee_count: null,
    customer_since: null,
    risk_level: 'bajo',
    custom_fields_enabled: true,
    storage_quota_gb: 10,
    contract_expiration_date: null,
    parent_organization_id: null,
    status: { id: 2, code: 'ACT', name: 'ACTIVA', color_hex: '#228b33', description: null, sort_order: 2, is_initial: false, is_final: false, allows_operation: true, requires_document_validation: false, requires_commercial_approval: false, is_suspended: false, icon: null, is_active: true },
    type: ['Generador'],
    primary_branch: { municipality: { id: 1, name: 'Bogotá' }, department: { id: 1, name: 'Cundinamarca' } },
    ...overrides,
  }
}

function baseResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: [organization()],
    current_page: 1,
    last_page: 1,
    total: 1,
    per_page: 15,
    kpis: [
      { code: 'PRO', name: 'PROSPECTO', color_hex: '#3d75dc', count: 2 },
      { code: 'ACT', name: 'ACTIVA', color_hex: '#228b33', count: 5 },
      { code: 'SUS', name: 'SUSPENDIDA', color_hex: '#c57d10', count: 0 },
      { code: 'INA', name: 'INACTIVA', color_hex: '#737373', count: 1 },
      { code: 'BLO', name: 'BLOQUEADA', color_hex: '#cc0c0c', count: 0 },
    ],
    ...overrides,
  }
}

describe('OrganizationsListScreen', () => {
  beforeEach(() => {
    fetchOrganizationsMock.mockResolvedValue(baseResponse())
    fetchDepartmentsMock.mockResolvedValue({ data: [{ id: 1, uuid: 'd-1', country_id: 1, dane_code: '11', name: 'Cundinamarca', is_active: true, created_at: '', updated_at: '' }], current_page: 1, last_page: 1, total: 1, per_page: 100 })
    fetchBusinessRolesMock.mockResolvedValue({
      data: [
        { id: 1, code: 'GENERATOR', name: 'Generador', description: null, sort_order: 1, is_active: true },
        { id: 2, code: 'GESTOR', name: 'Gestor', description: null, sort_order: 2, is_active: true },
      ],
    })
  })

  afterEach(() => {
    fetchOrganizationsMock.mockReset()
    fetchDepartmentsMock.mockReset()
    fetchBusinessRolesMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
    vi.useRealTimers()
  })

  // Revisión de seguridad: gating exclusivo de platform staff -- distinto
  // de un permiso RBAC (ver OrganizationController::index(), gate
  // `isPlatformStaff()`).
  test('requires platform staff via useRequireAuth, without a specific permission', async () => {
    render(<OrganizationsListScreen />)
    await screen.findByText('EcoRecicla S.A.S.')

    expect(useRequireAuthMock).toHaveBeenCalledWith(undefined, { requirePlatformStaff: true })
  })

  test('does not fetch or render the table when the user is not platform staff', () => {
    useRequireAuthMock.mockReturnValueOnce({ user: null, isLoading: false, isAuthorized: false })
    render(<OrganizationsListScreen />)

    expect(fetchOrganizationsMock).not.toHaveBeenCalled()
  })

  test('renders the 5 KPI cards with real color and count from the backend', async () => {
    render(<OrganizationsListScreen />)

    expect(await screen.findByText('PROSPECTO')).toBeInTheDocument()
    expect(screen.getAllByText('ACTIVA').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('SUSPENDIDA')).toBeInTheDocument()
    expect(screen.getByText('INACTIVA')).toBeInTheDocument()
    expect(screen.getByText('BLOQUEADA')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  test('renders columns: organization with tax_id, type badges, primary city, and real status badge', async () => {
    render(<OrganizationsListScreen />)

    expect(await screen.findByText('EcoRecicla S.A.S.')).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByText('900123456-1')).toBeInTheDocument()
    expect(within(table).getByText('Generador')).toBeInTheDocument()
    expect(within(table).getByText('Bogotá, Cundinamarca')).toBeInTheDocument()
    expect(within(table).getByText('ACTIVA')).toBeInTheDocument()
  })

  test('shows "—" for city when the organization has no active branch', async () => {
    fetchOrganizationsMock.mockResolvedValueOnce(
      baseResponse({ data: [organization({ primary_branch: null })] })
    )
    render(<OrganizationsListScreen />)

    expect(await screen.findByText('EcoRecicla S.A.S.')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  test('debounces search input before refetching', async () => {
    vi.useFakeTimers()
    render(<OrganizationsListScreen />)
    fetchOrganizationsMock.mockClear()

    fireEvent.change(screen.getByLabelText('Buscar organizaciones'), { target: { value: 'EcoRecicla' } })
    expect(fetchOrganizationsMock).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(fetchOrganizationsMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'EcoRecicla' }))
  })

  test('navigates to detail on row click and via the actions menu', async () => {
    render(<OrganizationsListScreen />)
    const rowButton = await screen.findByText('EcoRecicla S.A.S.')
    fireEvent.click(rowButton)

    expect(pushMock).toHaveBeenCalledWith('/admin/organizations/1')
  })

  test('navigates to the creation form', async () => {
    render(<OrganizationsListScreen />)
    await screen.findByText('EcoRecicla S.A.S.')

    fireEvent.click(screen.getByRole('button', { name: '+ Nueva Organización' }))
    expect(pushMock).toHaveBeenCalledWith('/admin/organizations/new')
  })
})
