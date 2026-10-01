import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { OrganizationSidebarModulesScreen } from './OrganizationSidebarModulesScreen'

const fetchOrganizationMock = vi.fn()
const fetchOrganizationSidebarModulesMock = vi.fn()
const enableOrganizationSidebarModuleMock = vi.fn()
const disableOrganizationSidebarModuleMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchOrganization: (...args: unknown[]) => fetchOrganizationMock(...args),
    fetchOrganizationSidebarModules: (...args: unknown[]) => fetchOrganizationSidebarModulesMock(...args),
    enableOrganizationSidebarModule: (...args: unknown[]) => enableOrganizationSidebarModuleMock(...args),
    disableOrganizationSidebarModule: (...args: unknown[]) => disableOrganizationSidebarModuleMock(...args),
  }
})

const defaultUseRequireAuthResult = {
  user: { id: 1, is_platform_staff: true },
  isLoading: false,
  isAuthorized: true,
}

const useRequireAuthMock = vi.fn<
  (permission?: string, options?: { requirePlatformStaff?: boolean }) => {
    user: { id: number; is_platform_staff?: boolean } | null
    isLoading: boolean
    isAuthorized: boolean
  }
>(() => defaultUseRequireAuthResult)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string, options?: { requirePlatformStaff?: boolean }) =>
    useRequireAuthMock(permission, options),
}))

function organizationDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 7,
    uuid: 'org-7',
    legal_name: 'EcoRecicla S.A.S.',
    trade_name: 'EcoRecicla',
    tax_id: '900123456-1',
    tax_id_type: 'NIT',
    email: 'contacto@ecorecicla.co',
    phone: null,
    website: null,
    organization_status_id: 2,
    registration_date: '2026-01-01',
    is_active: true,
    is_platform_tenant: false,
    observations: null,
    created_at: '2026-07-01T00:00:00Z',
    created_by: { id: 1, username: 'admin' },
    updated_at: '2026-07-01T00:00:00Z',
    updated_by: null,
    economic_activity_code: null,
    economic_activity_name: null,
    environmental_authority: null,
    environmental_registration: null,
    billing_email: null,
    support_email: null,
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
    status: {
      id: 2,
      code: 'ACT',
      name: 'ACTIVA',
      color_hex: '#228b33',
      description: null,
      sort_order: 2,
      is_initial: false,
      is_final: false,
      allows_operation: true,
      requires_document_validation: false,
      requires_commercial_approval: false,
      is_suspended: false,
      icon: null,
      is_active: true,
    },
    type: ['Generador'],
    primary_business_role_id: 1,
    primary_branch: null,
    branches_count: 2,
    contacts_count: 3,
    users_count: 1,
    branch_treatments_count: 1,
    linked_subgestores_count: 1,
    gestor_operates_in_platform: null,
    ...overrides,
  }
}

function sidebarModules(overrides: Partial<Record<number, Partial<Record<string, unknown>>>> = {}) {
  const base = [
    { id: 1, code: 'ORGANIZACION', name: 'Organización', sort_order: 1, is_active: true, is_enabled: true, enabled_at: '2026-09-01T00:00:00Z' },
    { id: 2, code: 'RESIDUOS', name: 'Residuos', sort_order: 2, is_active: true, is_enabled: false, enabled_at: null },
    { id: 3, code: 'SERVICIOS', name: 'Servicios', sort_order: 3, is_active: true, is_enabled: false, enabled_at: null },
    { id: 4, code: 'LOGISTICA', name: 'Logística', sort_order: 4, is_active: true, is_enabled: false, enabled_at: null },
    { id: 5, code: 'OPERACIONES', name: 'Operaciones', sort_order: 5, is_active: true, is_enabled: false, enabled_at: null },
    { id: 6, code: 'CERTIFICADOS', name: 'Certificados', sort_order: 6, is_active: true, is_enabled: false, enabled_at: null },
    { id: 7, code: 'ADMINISTRACION', name: 'Administración', sort_order: 7, is_active: true, is_enabled: true, enabled_at: '2026-09-01T00:00:00Z' },
  ]
  return base.map((module) => ({ ...module, ...(overrides[module.id] ?? {}) }))
}

describe('OrganizationSidebarModulesScreen', () => {
  beforeEach(() => {
    fetchOrganizationMock.mockResolvedValue({ organization: organizationDetail() })
    fetchOrganizationSidebarModulesMock.mockResolvedValue({ data: sidebarModules() })
  })

  afterEach(() => {
    fetchOrganizationMock.mockReset()
    fetchOrganizationSidebarModulesMock.mockReset()
    enableOrganizationSidebarModuleMock.mockReset()
    disableOrganizationSidebarModuleMock.mockReset()
    useRequireAuthMock.mockClear()
    useRequireAuthMock.mockReturnValue(defaultUseRequireAuthResult)
  })

  test('gates the screen via useRequireAuth with requirePlatformStaff', async () => {
    render(<OrganizationSidebarModulesScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    expect(useRequireAuthMock).toHaveBeenCalledWith(undefined, { requirePlatformStaff: true })
  })

  test('shows the organization header and the 7 modules with their current state', async () => {
    render(<OrganizationSidebarModulesScreen organizationId={7} />)

    await screen.findByText('EcoRecicla S.A.S.')
    expect(screen.getByText('Generador')).toBeInTheDocument()
    expect(screen.getByText('ACTIVA')).toBeInTheDocument()

    expect(await screen.findByText('Organización')).toBeInTheDocument()
    expect(screen.getByText('Residuos')).toBeInTheDocument()
    expect(screen.getByText('Servicios')).toBeInTheDocument()
    expect(screen.getByText('Logística')).toBeInTheDocument()
    expect(screen.getByText('Operaciones')).toBeInTheDocument()
    expect(screen.getByText('Certificados')).toBeInTheDocument()
    expect(screen.getByText('Administración')).toBeInTheDocument()

    const organizacionSwitch = screen.getByRole('checkbox', { name: 'Organización' })
    const residuosSwitch = screen.getByRole('checkbox', { name: 'Residuos' })
    expect(organizacionSwitch).toBeChecked()
    expect(residuosSwitch).not.toBeChecked()
  })

  test('enables a disabled module', async () => {
    enableOrganizationSidebarModuleMock.mockResolvedValueOnce({ message: 'ok' })
    render(<OrganizationSidebarModulesScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    const residuosSwitch = await screen.findByRole('checkbox', { name: 'Residuos' })
    fireEvent.click(residuosSwitch)

    await act(async () => {})
    expect(enableOrganizationSidebarModuleMock).toHaveBeenCalledWith(7, 2)
    expect(screen.getByRole('checkbox', { name: 'Residuos' })).toBeChecked()
  })

  test('disables an enabled module', async () => {
    disableOrganizationSidebarModuleMock.mockResolvedValueOnce({ message: 'ok' })
    render(<OrganizationSidebarModulesScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    const organizacionSwitch = await screen.findByRole('checkbox', { name: 'Organización' })
    fireEvent.click(organizacionSwitch)

    await act(async () => {})
    expect(disableOrganizationSidebarModuleMock).toHaveBeenCalledWith(7, 1)
    expect(screen.getByRole('checkbox', { name: 'Organización' })).not.toBeChecked()
  })

  test('shows a per-row error and keeps the previous state when the toggle fails', async () => {
    enableOrganizationSidebarModuleMock.mockRejectedValueOnce(new Error('No se pudo habilitar el módulo.'))
    render(<OrganizationSidebarModulesScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    const residuosSwitch = await screen.findByRole('checkbox', { name: 'Residuos' })
    fireEvent.click(residuosSwitch)

    await screen.findByText('No se pudo habilitar el módulo.')
    expect(screen.getByRole('checkbox', { name: 'Residuos' })).not.toBeChecked()
  })
})
