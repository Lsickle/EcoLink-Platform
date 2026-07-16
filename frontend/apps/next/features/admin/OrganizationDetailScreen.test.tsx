import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { OrganizationDetailScreen } from './OrganizationDetailScreen'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const fetchOrganizationMock = vi.fn()
const fetchCountriesMock = vi.fn()
const fetchOrganizationStatusesMock = vi.fn()
const fetchBusinessRolesMock = vi.fn()
const updateOrganizationMock = vi.fn()
const activateOrganizationMock = vi.fn()
const deactivateOrganizationMock = vi.fn()
const fetchOrganizationBranchesMock = vi.fn()
const fetchOrganizationContactsMock = vi.fn()
const createOrganizationContactMock = vi.fn()
const revokeOrganizationContactMock = vi.fn()
const searchContactsMock = vi.fn()
const fetchOrganizationUsersMock = vi.fn()
const fetchOrganizationActivityMock = vi.fn()
const assignBusinessRoleToOrganizationMock = vi.fn()
const revokeBusinessRoleFromOrganizationMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchOrganization: (...args: unknown[]) => fetchOrganizationMock(...args),
    fetchCountries: (...args: unknown[]) => fetchCountriesMock(...args),
    fetchOrganizationStatuses: (...args: unknown[]) => fetchOrganizationStatusesMock(...args),
    fetchBusinessRoles: (...args: unknown[]) => fetchBusinessRolesMock(...args),
    updateOrganization: (...args: unknown[]) => updateOrganizationMock(...args),
    activateOrganization: (...args: unknown[]) => activateOrganizationMock(...args),
    deactivateOrganization: (...args: unknown[]) => deactivateOrganizationMock(...args),
    fetchOrganizationBranches: (...args: unknown[]) => fetchOrganizationBranchesMock(...args),
    fetchOrganizationContacts: (...args: unknown[]) => fetchOrganizationContactsMock(...args),
    createOrganizationContact: (...args: unknown[]) => createOrganizationContactMock(...args),
    revokeOrganizationContact: (...args: unknown[]) => revokeOrganizationContactMock(...args),
    searchContacts: (...args: unknown[]) => searchContactsMock(...args),
    fetchOrganizationUsers: (...args: unknown[]) => fetchOrganizationUsersMock(...args),
    fetchOrganizationActivity: (...args: unknown[]) => fetchOrganizationActivityMock(...args),
    assignBusinessRoleToOrganization: (...args: unknown[]) => assignBusinessRoleToOrganizationMock(...args),
    revokeBusinessRoleFromOrganization: (...args: unknown[]) => revokeBusinessRoleFromOrganizationMock(...args),
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
    primary_branch: null,
    branches_count: 2,
    contacts_count: 3,
    users_count: 1,
    ...overrides,
  }
}

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

describe('OrganizationDetailScreen', () => {
  beforeEach(() => {
    fetchOrganizationMock.mockResolvedValue({ organization: organizationDetail() })
    fetchCountriesMock.mockResolvedValue({
      data: [{ id: 1, uuid: 'c-1', iso_code: 'CO', name: 'Colombia', is_active: true, created_at: '', updated_at: '' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 300,
    })
    fetchOrganizationStatusesMock.mockResolvedValue({
      data: [
        { id: 2, code: 'ACT', name: 'ACTIVA', color_hex: '#228b33', sort_order: 2, is_active: true },
        { id: 3, code: 'SUS', name: 'SUSPENDIDA', color_hex: '#c57d10', sort_order: 3, is_active: true },
      ],
    })
    fetchBusinessRolesMock.mockResolvedValue({
      data: [
        { id: 1, code: 'GENERATOR', name: 'Generador', description: null, sort_order: 1, is_active: true },
        { id: 2, code: 'GESTOR', name: 'Gestor', description: null, sort_order: 2, is_active: true },
      ],
    })
    fetchOrganizationBranchesMock.mockResolvedValue(emptyPage)
    fetchOrganizationContactsMock.mockResolvedValue(emptyPage)
    fetchOrganizationUsersMock.mockResolvedValue(emptyPage)
    fetchOrganizationActivityMock.mockResolvedValue(emptyPage)
    searchContactsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    fetchOrganizationMock.mockReset()
    fetchCountriesMock.mockReset()
    fetchOrganizationStatusesMock.mockReset()
    fetchBusinessRolesMock.mockReset()
    updateOrganizationMock.mockReset()
    activateOrganizationMock.mockReset()
    deactivateOrganizationMock.mockReset()
    fetchOrganizationBranchesMock.mockReset()
    fetchOrganizationContactsMock.mockReset()
    createOrganizationContactMock.mockReset()
    revokeOrganizationContactMock.mockReset()
    searchContactsMock.mockReset()
    fetchOrganizationUsersMock.mockReset()
    fetchOrganizationActivityMock.mockReset()
    assignBusinessRoleToOrganizationMock.mockReset()
    revokeBusinessRoleFromOrganizationMock.mockReset()
    useRequireAuthMock.mockClear()
    pushMock.mockReset()
  })

  test('requires platform staff via useRequireAuth, without a specific permission', async () => {
    render(<OrganizationDetailScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    expect(useRequireAuthMock).toHaveBeenCalledWith(undefined, { requirePlatformStaff: true })
  })

  test('shows the header with real status badge and type badges', async () => {
    render(<OrganizationDetailScreen organizationId={7} />)

    const title = await screen.findByText('EcoRecicla S.A.S.')
    const headerCard = title.closest('[data-slot="card"]') as HTMLElement
    expect(within(headerCard).getByText('ACTIVA')).toBeInTheDocument()
    expect(within(headerCard).getByText('Generador')).toBeInTheDocument()
  })

  test('shows the sidebar summary with real branches/people/users counts', async () => {
    render(<OrganizationDetailScreen organizationId={7} />)

    await screen.findByText('EcoRecicla S.A.S.')
    const summaryHeading = screen.getByText('Resumen')
    const summaryCard = summaryHeading.closest('[data-slot="card"]') as HTMLElement
    expect(within(summaryCard).getByText('Sedes')).toBeInTheDocument()
    expect(within(summaryCard).getByText('2')).toBeInTheDocument()
    expect(within(summaryCard).getByText('Contactos')).toBeInTheDocument()
    expect(within(summaryCard).getByText('3')).toBeInTheDocument()
  })

  test('toggles active state', async () => {
    deactivateOrganizationMock.mockResolvedValueOnce({ organization: { ...organizationDetail(), is_active: false } })
    render(<OrganizationDetailScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))

    await screen.findByRole('button', { name: 'Activar' })
    expect(deactivateOrganizationMock).toHaveBeenCalledWith(7)
  })

  test('assigns a business role via checkbox (Tipos de Organización)', async () => {
    assignBusinessRoleToOrganizationMock.mockResolvedValueOnce({ message: 'ok' })
    render(<OrganizationDetailScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    const gestorCheckbox = await screen.findByRole('checkbox', { name: 'Gestor' })
    expect(gestorCheckbox).not.toBeChecked()

    fireEvent.click(gestorCheckbox)

    await act(async () => {})
    expect(assignBusinessRoleToOrganizationMock).toHaveBeenCalledWith(7, 2)
  })

  test('revokes an already-assigned business role via checkbox', async () => {
    revokeBusinessRoleFromOrganizationMock.mockResolvedValueOnce({ message: 'ok' })
    render(<OrganizationDetailScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    const generatorCheckbox = await screen.findByRole('checkbox', { name: 'Generador' })
    expect(generatorCheckbox).toBeChecked()

    fireEvent.click(generatorCheckbox)

    await act(async () => {})
    expect(revokeBusinessRoleFromOrganizationMock).toHaveBeenCalledWith(7, 1)
  })

  test('lazy-loads the Sedes tab data only once opened', async () => {
    render(<OrganizationDetailScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    expect(fetchOrganizationBranchesMock).toHaveBeenCalledWith(7, { perPage: 15 })
    expect(fetchOrganizationContactsMock).not.toHaveBeenCalled()
  })

  test('lazy-loads the Contactos tab only when selected', async () => {
    render(<OrganizationDetailScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    const tabs = screen.getByRole('tablist')
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Contactos' }))

    await act(async () => {})
    expect(fetchOrganizationContactsMock).toHaveBeenCalledWith(7, { perPage: 15 })
  })

  test('saves changes from the Información General form', async () => {
    updateOrganizationMock.mockResolvedValueOnce({ organization: organizationDetail({ legal_name: 'EcoRecicla Actualizada' }) })
    render(<OrganizationDetailScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    fireEvent.change(screen.getByLabelText('Razón Social'), { target: { value: 'EcoRecicla Actualizada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await screen.findByText('Cambios guardados.')
    expect(updateOrganizationMock).toHaveBeenCalledWith(7, expect.objectContaining({ legal_name: 'EcoRecicla Actualizada' }))
  })

  test('navigates to /admin/branches/new with organizationId when "Crear Sede" is clicked (Sedes tab)', async () => {
    render(<OrganizationDetailScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    fireEvent.click(screen.getByRole('button', { name: '+ Crear Sede' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/branches/new?organizationId=7')
  })

  test('navigates to /admin/branches/{id} when a Sedes row is clicked', async () => {
    fetchOrganizationBranchesMock.mockResolvedValueOnce({
      ...emptyPage,
      data: [
        {
          id: 42,
          uuid: 'branch-42',
          organization_id: 7,
          branch_type_id: 1,
          code: 'S-001',
          name: 'Planta Norte',
          status: 'ACTIVE',
          address: null,
          phone: null,
          email: null,
          environmental_license: null,
          license_expiration_date: null,
          operational_capacity: null,
          is_active: true,
          created_at: '2026-07-01T00:00:00Z',
          branch_type: null,
        },
      ],
    })
    render(<OrganizationDetailScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    fireEvent.click(await screen.findByText('Planta Norte'))

    expect(pushMock).toHaveBeenCalledWith('/admin/branches/42')
  })

  test('creates a new contact from the Contactos tab', async () => {
    createOrganizationContactMock.mockResolvedValueOnce({ organization_contact: { id: 1 } })
    fetchOrganizationContactsMock.mockResolvedValue(emptyPage)
    render(<OrganizationDetailScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    fireEvent.click(within(screen.getByRole('tablist')).getByRole('tab', { name: 'Contactos' }))
    fireEvent.click(await screen.findByRole('button', { name: '+ Crear Contacto' }))

    fireEvent.change(screen.getByLabelText('Número de Documento'), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText('Apellidos'), { target: { value: 'Pérez' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear Contacto' }))

    await act(async () => {})
    expect(createOrganizationContactMock).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ document_type: 'CC', document_number: '123456', first_name: 'Ana', last_name: 'Pérez' })
    )
  })

  // timeout ampliado -- el debounce real de 300ms de searchContacts() (más
  // el polling de findByRole) puede exceder el default de 5000ms bajo
  // contención de CPU al correr la suite completa en paralelo (flake visto
  // en CI local, no relacionado con la lógica del test).
  test(
    'links an existing contact via searchContacts() from the Contactos tab',
    async () => {
      searchContactsMock.mockResolvedValueOnce({
        ...emptyPage,
        data: [{ id: 9, first_name: 'Carlos', last_name: 'Gómez', document_number: '999', email: null }],
      })
      createOrganizationContactMock.mockResolvedValueOnce({ organization_contact: { id: 2 } })
      render(<OrganizationDetailScreen organizationId={7} />)
      await screen.findByText('EcoRecicla S.A.S.')

      fireEvent.click(within(screen.getByRole('tablist')).getByRole('tab', { name: 'Contactos' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Vincular Contacto Existente' }))
      fireEvent.change(screen.getByLabelText('Buscar contacto'), { target: { value: 'Carlos' } })

      const resultButton = await screen.findByRole('button', { name: /Carlos Gómez/ }, { timeout: 2000 })
      fireEvent.click(resultButton)

      fireEvent.click(screen.getByRole('button', { name: 'Vincular' }))

      await act(async () => {})
      expect(createOrganizationContactMock).toHaveBeenCalledWith(7, expect.objectContaining({ existing_contact_id: 9 }))
    },
    10000
  )

  test('revokes a contact with confirmation from the Contactos tab', async () => {
    fetchOrganizationContactsMock.mockResolvedValue({
      ...emptyPage,
      data: [
        {
          id: 5,
          uuid: 'contact-5',
          document_type: 'CC',
          document_number: '111',
          first_name: 'Luis',
          middle_name: null,
          last_name: 'Ramírez',
          second_last_name: null,
          full_name: 'Luis Ramírez',
          email: null,
          phone: null,
          is_active: true,
          created_at: '2026-07-01T00:00:00Z',
          has_user_account: false,
          organization_contact_id: 55,
          position_title: 'Comercial',
          relationship_type: 'Empleado',
          is_primary: false,
          branch_id: null,
          start_date: null,
          link_is_active: true,
        },
      ],
    })
    revokeOrganizationContactMock.mockResolvedValueOnce({ organization_contact: { id: 55 } })
    render(<OrganizationDetailScreen organizationId={7} />)
    await screen.findByText('EcoRecicla S.A.S.')

    fireEvent.click(within(screen.getByRole('tablist')).getByRole('tab', { name: 'Contactos' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Revocar contacto Luis Ramírez' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))

    await act(async () => {})
    expect(revokeOrganizationContactMock).toHaveBeenCalledWith(7, 55)
  })
})
