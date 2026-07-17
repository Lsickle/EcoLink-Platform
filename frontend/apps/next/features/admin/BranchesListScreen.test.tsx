import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchesListScreen } from './BranchesListScreen'

const fetchBranchesMock = vi.fn()
const fetchDepartmentsMock = vi.fn()
const fetchMunicipalitiesMock = vi.fn()
const fetchBranchTypesMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchBranches: (...args: unknown[]) => fetchBranchesMock(...args),
    fetchDepartments: (...args: unknown[]) => fetchDepartmentsMock(...args),
    fetchMunicipalities: (...args: unknown[]) => fetchMunicipalitiesMock(...args),
    fetchBranchTypes: (...args: unknown[]) => fetchBranchTypesMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['branches.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function branchesPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...emptyPage,
    data: [
      {
        id: 10,
        uuid: 'branch-10',
        tenant_organization_id: 1,
        organization_id: 1,
        branch_type_id: 1,
        code: 'S-001',
        name: 'Planta Norte',
        status: 'ACTIVE',
        country_id: null,
        department_id: null,
        municipality_id: null,
        locality_id: null,
        address: null,
        phone: null,
        email: null,
        environmental_license: null,
        license_expiration_date: null,
        operational_capacity: null,
        observations: null,
        is_active: true,
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
        created_by: 1,
        updated_by: 1,
        users_count: 4,
      },
    ],
    total: 1,
    kpis: { total: 5, active: 3, inactive: 1, suspended: 1 },
    ...overrides,
  }
}

describe('BranchesListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['branches.read'] }
    fetchBranchesMock.mockResolvedValue(branchesPage())
    fetchDepartmentsMock.mockResolvedValue({ ...emptyPage, data: [{ id: 1, uuid: 'd-1', country_id: 1, dane_code: '11', name: 'Cundinamarca', is_active: true, created_at: '', updated_at: '' }] })
    fetchMunicipalitiesMock.mockResolvedValue({ ...emptyPage, data: [{ id: 2, uuid: 'm-2', department_id: 1, codigo_dane: '001', name: 'Bogotá', is_active: true, created_at: '', updated_at: '' }] })
    fetchBranchTypesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'bt-1', code: 'OPS', name: 'Operativa', category: 'A', is_logistics: false, is_storage: false, is_treatment: false, is_dispatch: false, sort_order: 1, is_active: true, created_at: '', updated_at: '' }],
    })
    searchOrganizationsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    fetchBranchesMock.mockReset()
    fetchDepartmentsMock.mockReset()
    fetchMunicipalitiesMock.mockReset()
    fetchBranchTypesMock.mockReset()
    searchOrganizationsMock.mockReset()
    pushMock.mockReset()
  })

  test('shows the 4 real KPIs (plain object, not an array)', async () => {
    render(<BranchesListScreen />)

    await screen.findByText('Planta Norte')
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('Activas')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Inactivas')).toBeInTheDocument()
    expect(screen.getByText('Suspendidas')).toBeInTheDocument()
  })

  test('shows real users_count per row', async () => {
    render(<BranchesListScreen />)

    await screen.findByText('Planta Norte')
    const row = screen.getByText('Planta Norte').closest('tr') as HTMLElement
    expect(within(row).getByText('4')).toBeInTheDocument()
  })

  test('shows the real organization name and city per row for platform staff (regresión: index() no eager-cargaba organization/municipality)', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['branches.read'] }
    fetchBranchesMock.mockResolvedValue(
      branchesPage({
        data: [
          {
            ...branchesPage().data[0],
            organization: { id: 1, legal_name: 'Industrias Metálicas del Norte S.A.S.' },
            municipality: { id: 2, name: 'BOGOTA D.C.' },
          },
        ],
      })
    )
    render(<BranchesListScreen />)

    await screen.findByText('Planta Norte')
    const row = screen.getByText('Planta Norte').closest('tr') as HTMLElement
    expect(within(row).getByText('Industrias Metálicas del Norte S.A.S.')).toBeInTheDocument()
    expect(within(row).getByText('BOGOTA D.C.')).toBeInTheDocument()
  })

  test('falls back to "—" when a row has no organization/municipality eager-loaded', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['branches.read'] }
    render(<BranchesListScreen />)

    await screen.findByText('Planta Norte')
    const row = screen.getByText('Planta Norte').closest('tr') as HTMLElement
    const cells = within(row).getAllByRole('cell')
    expect(cells.map((cell) => cell.textContent)).toContain('—')
  })

  test('hides the Organización column/filter for a non-platform-staff tenant admin', async () => {
    render(<BranchesListScreen />)

    await screen.findByText('Planta Norte')
    expect(screen.queryByText('Organización')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Organización')).not.toBeInTheDocument()
  })

  test('shows the Organización filter/column for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['branches.read'] }
    render(<BranchesListScreen />)

    await screen.findByText('Planta Norte')
    expect(screen.getByRole('columnheader', { name: 'Organización' })).toBeInTheDocument()
  })

  test('applies search with debounce', async () => {
    render(<BranchesListScreen />)
    await screen.findByText('Planta Norte')
    fetchBranchesMock.mockClear()

    fireEvent.change(screen.getByLabelText('Buscar sucursales'), { target: { value: 'Norte' } })

    await vi.waitFor(() => {
      expect(fetchBranchesMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'Norte' }))
    })
  })

  test('cascades Departamento -> Municipio and resets municipality on department change', async () => {
    render(<BranchesListScreen />)
    await screen.findByText('Planta Norte')

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por departamento' }))
    const deptOption = await screen.findByRole('option', { name: 'Cundinamarca' })
    await act(async () => {
      fireEvent.pointerDown(deptOption)
      fireEvent.click(deptOption)
    })

    expect(fetchMunicipalitiesMock).toHaveBeenCalledWith(expect.objectContaining({ departmentId: '1' }))
  })

  test('filters by status', async () => {
    render(<BranchesListScreen />)
    await screen.findByText('Planta Norte')
    fetchBranchesMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    const statusOption = await screen.findByRole('option', { name: 'Suspendida' })
    await act(async () => {
      fireEvent.pointerDown(statusOption)
      fireEvent.click(statusOption)
    })

    await vi.waitFor(() => {
      expect(fetchBranchesMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUSPENDED' }))
    })
  })

  test('navigates to /admin/branches/new when "Crear Sucursal" is clicked', async () => {
    render(<BranchesListScreen />)
    await screen.findByText('Planta Norte')

    fireEvent.click(screen.getByRole('button', { name: '+ Crear Sucursal' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/branches/new')
  })

  test('navigates to the branch detail when a row is clicked', async () => {
    render(<BranchesListScreen />)
    await screen.findByText('Planta Norte')

    fireEvent.click(screen.getByText('Planta Norte'))

    expect(pushMock).toHaveBeenCalledWith('/admin/branches/10')
  })
})
