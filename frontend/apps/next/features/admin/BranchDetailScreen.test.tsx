import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchDetailScreen } from './BranchDetailScreen'

const fetchBranchMock = vi.fn()
const fetchBranchTypesMock = vi.fn()
const fetchCountriesMock = vi.fn()
const fetchDepartmentsMock = vi.fn()
const fetchMunicipalitiesMock = vi.fn()
const fetchLocalitiesMock = vi.fn()
const updateBranchMock = vi.fn()
const activateBranchMock = vi.fn()
const deactivateBranchMock = vi.fn()
const fetchBranchUsersMock = vi.fn()
const fetchBranchContactsMock = vi.fn()
const fetchBranchActivityMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchBranch: (...args: unknown[]) => fetchBranchMock(...args),
    fetchBranchTypes: (...args: unknown[]) => fetchBranchTypesMock(...args),
    fetchCountries: (...args: unknown[]) => fetchCountriesMock(...args),
    fetchDepartments: (...args: unknown[]) => fetchDepartmentsMock(...args),
    fetchMunicipalities: (...args: unknown[]) => fetchMunicipalitiesMock(...args),
    fetchLocalities: (...args: unknown[]) => fetchLocalitiesMock(...args),
    updateBranch: (...args: unknown[]) => updateBranchMock(...args),
    activateBranch: (...args: unknown[]) => activateBranchMock(...args),
    deactivateBranch: (...args: unknown[]) => deactivateBranchMock(...args),
    fetchBranchUsers: (...args: unknown[]) => fetchBranchUsersMock(...args),
    fetchBranchContacts: (...args: unknown[]) => fetchBranchContactsMock(...args),
    fetchBranchActivity: (...args: unknown[]) => fetchBranchActivityMock(...args),
  }
})

const useRequireAuthMock = vi.fn((_permission?: string) => ({ user: { id: 1 }, isLoading: false, isAuthorized: true }))

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function branchDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10,
    uuid: 'branch-10',
    tenant_organization_id: 1,
    organization_id: 1,
    branch_type_id: 1,
    code: 'S-001',
    name: 'Planta Norte',
    status: 'ACTIVE',
    country_id: 1,
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
    organization: { id: 1, legal_name: 'EcoRecicla S.A.S.' },
    branch_type: { id: 1, uuid: 'bt-1', code: 'OPS', name: 'Operativa', category: 'A', is_logistics: false, is_storage: false, is_treatment: false, is_dispatch: false, sort_order: 1, is_active: true, created_at: '', updated_at: '' },
    country: { id: 1, uuid: 'c-1', iso_code: 'CO', name: 'Colombia', is_active: true, created_at: '', updated_at: '' },
    department: null,
    municipality: null,
    locality: null,
    created_by: { id: 1, username: 'admin' },
    updated_by: null,
    users_count: 4,
    ...overrides,
  }
}

describe('BranchDetailScreen', () => {
  beforeEach(() => {
    fetchBranchMock.mockResolvedValue({ branch: branchDetail() })
    fetchBranchTypesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'bt-1', code: 'OPS', name: 'Operativa', category: 'A', is_logistics: false, is_storage: false, is_treatment: false, is_dispatch: false, sort_order: 1, is_active: true, created_at: '', updated_at: '' }],
    })
    fetchCountriesMock.mockResolvedValue({ ...emptyPage, data: [{ id: 1, uuid: 'c-1', iso_code: 'CO', name: 'Colombia', is_active: true, created_at: '', updated_at: '' }] })
    fetchDepartmentsMock.mockResolvedValue({ ...emptyPage, data: [{ id: 5, uuid: 'd-5', country_id: 1, dane_code: '11', name: 'Cundinamarca', is_active: true, created_at: '', updated_at: '' }] })
    fetchMunicipalitiesMock.mockResolvedValue(emptyPage)
    fetchLocalitiesMock.mockResolvedValue(emptyPage)
    fetchBranchUsersMock.mockResolvedValue(emptyPage)
    fetchBranchContactsMock.mockResolvedValue(emptyPage)
    fetchBranchActivityMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    fetchBranchMock.mockReset()
    fetchBranchTypesMock.mockReset()
    fetchCountriesMock.mockReset()
    fetchDepartmentsMock.mockReset()
    fetchMunicipalitiesMock.mockReset()
    fetchLocalitiesMock.mockReset()
    updateBranchMock.mockReset()
    activateBranchMock.mockReset()
    deactivateBranchMock.mockReset()
    fetchBranchUsersMock.mockReset()
    fetchBranchContactsMock.mockReset()
    fetchBranchActivityMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the branches.read permission via useRequireAuth', async () => {
    render(<BranchDetailScreen branchId={10} />)
    await screen.findByText('Planta Norte')

    expect(useRequireAuthMock).toHaveBeenCalledWith('branches.read')
  })

  test('shows the header with status badge, branch type badge and organization', async () => {
    render(<BranchDetailScreen branchId={10} />)

    const title = await screen.findByText('Planta Norte')
    const headerCard = title.closest('[data-slot="card"]') as HTMLElement
    expect(within(headerCard).getByText('Activa')).toBeInTheDocument()
    expect(within(headerCard).getByText('Operativa')).toBeInTheDocument()
    expect(within(headerCard).getByText(/EcoRecicla S\.A\.S\./)).toBeInTheDocument()
  })

  test('shows the sidebar summary with the real users_count', async () => {
    render(<BranchDetailScreen branchId={10} />)

    await screen.findByText('Planta Norte')
    const summaryHeading = screen.getByText('Resumen')
    const summaryCard = summaryHeading.closest('[data-slot="card"]') as HTMLElement
    expect(within(summaryCard).getByText('Usuarios')).toBeInTheDocument()
    expect(within(summaryCard).getByText('4')).toBeInTheDocument()
  })

  test('toggles active state', async () => {
    deactivateBranchMock.mockResolvedValueOnce({ branch: { ...branchDetail(), is_active: false, status: 'INACTIVE' } })
    render(<BranchDetailScreen branchId={10} />)
    await screen.findByText('Planta Norte')

    fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))

    await screen.findByRole('button', { name: 'Activar' })
    expect(deactivateBranchMock).toHaveBeenCalledWith(10)
  })

  test('cascades País -> Departamento, loading departments for the branch country', async () => {
    render(<BranchDetailScreen branchId={10} />)
    await screen.findByText('Planta Norte')

    expect(fetchDepartmentsMock).toHaveBeenCalledWith(expect.objectContaining({ countryId: 1 }))
  })

  test('lazy-loads the Usuarios tab data only once opened', async () => {
    render(<BranchDetailScreen branchId={10} />)
    await screen.findByText('Planta Norte')

    expect(fetchBranchUsersMock).toHaveBeenCalledWith(10, { perPage: 15 })
    expect(fetchBranchContactsMock).not.toHaveBeenCalled()
  })

  test('lazy-loads the Contactos tab only when selected', async () => {
    render(<BranchDetailScreen branchId={10} />)
    await screen.findByText('Planta Norte')

    const tabs = screen.getByRole('tablist')
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Contactos' }))

    await act(async () => {})
    expect(fetchBranchContactsMock).toHaveBeenCalledWith(10, { perPage: 15 })
  })

  test('saves changes from the Información General form', async () => {
    updateBranchMock.mockResolvedValueOnce({ branch: branchDetail({ name: 'Planta Norte Actualizada' }) })
    render(<BranchDetailScreen branchId={10} />)
    await screen.findByText('Planta Norte')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Planta Norte Actualizada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await screen.findByText('Cambios guardados.')
    expect(updateBranchMock).toHaveBeenCalledWith(10, expect.objectContaining({ name: 'Planta Norte Actualizada' }))
  })
})
