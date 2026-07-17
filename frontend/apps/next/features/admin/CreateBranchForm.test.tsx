import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateBranchForm } from './CreateBranchForm'

const createBranchMock = vi.fn()
const fetchBranchTypesMock = vi.fn()
const fetchCountriesMock = vi.fn()
const fetchDepartmentsMock = vi.fn()
const fetchMunicipalitiesMock = vi.fn()
const fetchLocalitiesMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const pushMock = vi.fn()
let searchParams = new URLSearchParams()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createBranch: (...args: unknown[]) => createBranchMock(...args),
    fetchBranchTypes: (...args: unknown[]) => fetchBranchTypesMock(...args),
    fetchCountries: (...args: unknown[]) => fetchCountriesMock(...args),
    fetchDepartments: (...args: unknown[]) => fetchDepartmentsMock(...args),
    fetchMunicipalities: (...args: unknown[]) => fetchMunicipalitiesMock(...args),
    fetchLocalities: (...args: unknown[]) => fetchLocalitiesMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => searchParams,
}))

let currentUser: { id: number; is_platform_staff: boolean } | null = { id: 1, is_platform_staff: false }

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

describe('CreateBranchForm', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false }
    searchParams = new URLSearchParams()
    fetchBranchTypesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'bt-1', code: 'OPS', name: 'Operativa', category: 'A', is_logistics: false, is_storage: false, is_treatment: false, is_dispatch: false, sort_order: 1, is_active: true, created_at: '', updated_at: '' }],
    })
    fetchCountriesMock.mockResolvedValue({ ...emptyPage, data: [{ id: 1, uuid: 'c-1', iso_code: 'CO', name: 'Colombia', is_active: true, created_at: '', updated_at: '' }] })
    fetchDepartmentsMock.mockResolvedValue({ ...emptyPage, data: [{ id: 5, uuid: 'd-5', country_id: 1, dane_code: '11', name: 'Cundinamarca', is_active: true, created_at: '', updated_at: '' }] })
    fetchMunicipalitiesMock.mockResolvedValue(emptyPage)
    fetchLocalitiesMock.mockResolvedValue(emptyPage)
    searchOrganizationsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    createBranchMock.mockReset()
    fetchBranchTypesMock.mockReset()
    fetchCountriesMock.mockReset()
    fetchDepartmentsMock.mockReset()
    fetchMunicipalitiesMock.mockReset()
    fetchLocalitiesMock.mockReset()
    searchOrganizationsMock.mockReset()
    pushMock.mockReset()
  })

  test('hides the "Organización dueña" selector for a non-platform-staff actor', async () => {
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')

    expect(screen.queryByLabelText('Organización dueña')).not.toBeInTheDocument()
  })

  test('shows the "Organización dueña" selector for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true }
    render(<CreateBranchForm />)

    expect(await screen.findByLabelText('Organización dueña')).toBeInTheDocument()
  })

  test('requires a name and branch type before submitting', async () => {
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')

    fireEvent.click(screen.getByRole('button', { name: 'Crear Sucursal' }))

    expect(await screen.findByText('Ingresa un nombre.')).toBeInTheDocument()
    expect(createBranchMock).not.toHaveBeenCalled()
  })

  test('creates a branch for a non-platform-staff actor without organization_id', async () => {
    createBranchMock.mockResolvedValueOnce({ branch: { id: 99 } })
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Planta Norte' } })
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'S-001' } })
    fireEvent.click(screen.getByRole('combobox', { name: /tipo de sucursal/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Operativa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear Sucursal' }))

    await vi.waitFor(() => expect(createBranchMock).toHaveBeenCalled())
    expect(createBranchMock).toHaveBeenCalledWith(expect.not.objectContaining({ organization_id: expect.anything() }))
    expect(pushMock).toHaveBeenCalledWith('/admin/branches/99')
  })

  test('pre-fills the organization from the organizationId query param for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true }
    searchParams = new URLSearchParams('organizationId=7')
    render(<CreateBranchForm />)

    expect(await screen.findByText('Organización #7')).toBeInTheDocument()
  })

  test('shows the backend validation error on a duplicate code', async () => {
    createBranchMock.mockRejectedValueOnce(
      new ApiValidationError('The given data was invalid.', { code: ['Ya existe una sucursal con este código en la organización.'] })
    )
    render(<CreateBranchForm />)
    await screen.findByLabelText('Nombre')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Planta Norte' } })
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'S-001' } })
    fireEvent.click(screen.getByRole('combobox', { name: /tipo de sucursal/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Operativa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear Sucursal' }))

    expect(await screen.findByText('Ya existe una sucursal con este código en la organización.')).toBeInTheDocument()
  })
})
