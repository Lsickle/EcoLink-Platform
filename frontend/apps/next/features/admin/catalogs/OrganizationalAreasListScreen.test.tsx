import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { OrganizationalAreasListScreen } from './OrganizationalAreasListScreen'

const fetchOrganizationalAreasMock = vi.fn()
const activateOrganizationalAreaMock = vi.fn()
const deactivateOrganizationalAreaMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchOrganizationalAreas: (...args: unknown[]) => fetchOrganizationalAreasMock(...args),
    activateOrganizationalArea: (...args: unknown[]) => activateOrganizationalAreaMock(...args),
    deactivateOrganizationalArea: (...args: unknown[]) => deactivateOrganizationalAreaMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

type MockUser = { id: number; is_platform_staff?: boolean } | null

const useRequireAuthMock = vi.fn<
  (permission?: string) => { user: MockUser; isLoading: boolean; isAuthorized: boolean }
>()

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 10 }

function makeArea(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'oa-1',
    organization_id: 5,
    code: 'GER-COM',
    name: 'Gerencia Comercial',
    parent_area_id: null,
    level: 'Gerencia',
    responsible_person_id: null,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('OrganizationalAreasListScreen', () => {
  beforeEach(() => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: false }, isLoading: false, isAuthorized: true })
    fetchOrganizationalAreasMock.mockResolvedValue({
      data: [
        makeArea(),
        makeArea({ id: 2, uuid: 'oa-2', code: 'DIR-GEN', name: 'Dirección General', level: 'Dirección', is_active: false }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 15,
    })
    searchOrganizationsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    fetchOrganizationalAreasMock.mockReset()
    activateOrganizationalAreaMock.mockReset()
    deactivateOrganizationalAreaMock.mockReset()
    searchOrganizationsMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockReset()
  })

  test('requires the organizational_areas.read permission via useRequireAuth', async () => {
    render(<OrganizationalAreasListScreen />)
    await screen.findByText('Dirección General')

    expect(useRequireAuthMock).toHaveBeenCalledWith('organizational_areas.read')
  })

  test('for a non-platform-staff actor, fetches without an organization_id filter and hides the organization selector', async () => {
    render(<OrganizationalAreasListScreen />)
    await screen.findByText('Dirección General')

    expect(fetchOrganizationalAreasMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: undefined })
    )
    expect(screen.queryByLabelText('Organización')).not.toBeInTheDocument()
  })

  test('for a platform-staff actor, shows an optional organization filter and fetches all areas without organization_id by default', async () => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: true }, isLoading: false, isAuthorized: true })
    render(<OrganizationalAreasListScreen />)
    await screen.findByText('Dirección General')

    expect(screen.getByLabelText('Organización')).toBeInTheDocument()
    expect(fetchOrganizationalAreasMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: undefined })
    )
  })

  test('for a platform-staff actor, selecting an organization from the search narrows the fetch to organization_id', async () => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: true }, isLoading: false, isAuthorized: true })
    searchOrganizationsMock.mockResolvedValue({
      data: [{ id: 7, legal_name: 'ACME S.A.S.', tax_id: '900123456-7' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 10,
    })
    render(<OrganizationalAreasListScreen />)
    await screen.findByText('Dirección General')
    fetchOrganizationalAreasMock.mockClear()

    fireEvent.change(screen.getByLabelText('Organización'), { target: { value: 'ACME' } })
    const option = await screen.findByText(/ACME S\.A\.S\./)
    fireEvent.click(option)

    await vi.waitFor(() => {
      expect(fetchOrganizationalAreasMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7 }))
    })
  })

  test('renders the level for each row', async () => {
    render(<OrganizationalAreasListScreen />)
    await screen.findByText('Dirección General')

    const row = screen.getByText('Gerencia Comercial').closest('tr')
    expect(within(row as HTMLElement).getByText('Gerencia')).toBeInTheDocument()
  })

  test('hides the Organización column for a non-platform-staff actor', async () => {
    render(<OrganizationalAreasListScreen />)
    await screen.findByText('Dirección General')

    expect(screen.queryByRole('columnheader', { name: 'Organización' })).not.toBeInTheDocument()
  })

  test('shows an Organización column for platform staff, falling back to "—" when not eager-loaded', async () => {
    useRequireAuthMock.mockReturnValue({ user: { id: 1, is_platform_staff: true }, isLoading: false, isAuthorized: true })
    fetchOrganizationalAreasMock.mockResolvedValue({
      data: [
        makeArea({ organization: { id: 5, legal_name: 'ACME S.A.S.', tax_id: '900123456-7' } }),
        makeArea({ id: 2, uuid: 'oa-2', code: 'DIR-GEN', name: 'Dirección General', level: 'Dirección', is_active: false }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 15,
    })
    render(<OrganizationalAreasListScreen />)
    await screen.findByText('Dirección General')

    expect(screen.getByRole('columnheader', { name: 'Organización' })).toBeInTheDocument()
    const row1 = screen.getByText('Gerencia Comercial').closest('tr') as HTMLElement
    expect(within(row1).getByText('ACME S.A.S.')).toBeInTheDocument()
    const row2 = screen.getByText('Dirección General').closest('tr') as HTMLElement
    expect(within(row2).getByText('—')).toBeInTheDocument()
  })

  test('navigates to /admin/catalogs/organizational-areas/new when clicking "+ Crear Área"', async () => {
    render(<OrganizationalAreasListScreen />)
    await screen.findByText('Gerencia Comercial')

    fireEvent.click(screen.getByRole('button', { name: /crear área/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/organizational-areas/new')
  })

  test('the actions menu navigates to the detail page for "Ver"', async () => {
    render(<OrganizationalAreasListScreen />)
    await screen.findByText('Dirección General')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Dirección General' }))
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Ver' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/organizational-areas/2')
  })

  test('"Inactivar" calls deactivateOrganizationalArea', async () => {
    deactivateOrganizationalAreaMock.mockResolvedValueOnce({
      organizational_area: { ...makeArea(), is_active: false },
    })
    render(<OrganizationalAreasListScreen />)
    await screen.findByText('Gerencia Comercial')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Gerencia Comercial' }))
    const menu = await screen.findByRole('menu')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inactivar' }))
    })

    expect(deactivateOrganizationalAreaMock).toHaveBeenCalledWith(1)
  })
})
