import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PreapprovedWastesListScreen } from './PreapprovedWastesListScreen'

const fetchPreapprovedWastesMock = vi.fn()
const activatePreapprovedWasteMock = vi.fn()
const deactivatePreapprovedWasteMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchPreapprovedWastes: (...args: unknown[]) => fetchPreapprovedWastesMock(...args),
    activatePreapprovedWaste: (...args: unknown[]) => activatePreapprovedWasteMock(...args),
    deactivatePreapprovedWaste: (...args: unknown[]) => deactivatePreapprovedWasteMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

type MockUser = { id: number; is_platform_staff: boolean; permissions: string[] } | null
let currentUser: MockUser = { id: 1, is_platform_staff: false, permissions: ['preapproved_wastes.read'] }

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function makeWaste(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 30,
    uuid: 'pw-30',
    tenant_organization_id: 2,
    organization_id: 2,
    branch_id: null,
    waste_category_id: null,
    code: 'PRE-0001',
    name: 'Aceite Usado Preaprobado',
    description: null,
    physical_state_id: null,
    measurement_unit_id: 1,
    average_weight: null,
    generation_frequency_id: null,
    requires_special_transport: false,
    requires_special_ppe: false,
    requires_characterization: false,
    requires_sds: false,
    is_active: true,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    waste_stream_assignments: [
      { id: 1, waste_stream_id: 119, waste_stream: { id: 119, code: 'Y9', name: 'Mezclas', tipo: 'Y' } },
    ],
    waste_un_codes: [],
    treatment_approvals: [
      {
        id: 1,
        branch_treatment_id: 10,
        unit_price: '50000',
        currency: 'COP',
        billing_unit: 'KG',
        minimum_quantity: null,
        maximum_quantity: null,
        requires_lab_analysis: false,
        requires_sds: false,
        restrictions: null,
        valid_from: null,
        valid_until: null,
        technical_status: 'APPROVED',
        commercial_status: 'APPROVED',
        is_active: true,
        branch_treatment: {
          id: 10,
          operational_name: 'Incineración Planta 1',
          branch_id: 3,
          treatment_id: 4,
          max_capacity: null,
          capacity_unit: 'KG',
          treatment: { id: 4, uuid: 't-4', code: 'INC', name: 'Incineración', description: null, is_system: true, is_active: true, created_at: '', updated_at: '' },
          branch: { id: 3, name: 'Planta Norte' },
        },
      },
    ],
    ...overrides,
  }
}

describe('PreapprovedWastesListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['preapproved_wastes.read'] }
    fetchPreapprovedWastesMock.mockResolvedValue({ ...emptyPage, data: [makeWaste()], total: 1 })
    searchOrganizationsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    fetchPreapprovedWastesMock.mockReset()
    activatePreapprovedWasteMock.mockReset()
    deactivatePreapprovedWasteMock.mockReset()
    searchOrganizationsMock.mockReset()
    pushMock.mockReset()
  })

  test('renders the row with name, code, classification badges and commercial terms', async () => {
    render(<PreapprovedWastesListScreen />)

    await screen.findByText('Aceite Usado Preaprobado')
    expect(screen.getByText('PRE-0001')).toBeInTheDocument()
    expect(screen.getByText('Y9')).toBeInTheDocument()
    expect(screen.getByText('50000 COP/KG')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
  })

  test('hides the Organización column and filter for a non-platform-staff actor', async () => {
    render(<PreapprovedWastesListScreen />)
    await screen.findByText('Aceite Usado Preaprobado')

    expect(screen.queryByRole('columnheader', { name: 'Organización' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Organización')).not.toBeInTheDocument()
    expect(fetchPreapprovedWastesMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: undefined }))
  })

  test('shows the Organización column + optional filter for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['preapproved_wastes.read'] }
    fetchPreapprovedWastesMock.mockResolvedValue({
      ...emptyPage,
      data: [makeWaste({ organization: { id: 2, legal_name: 'EcoGestor SAS' } })],
      total: 1,
    })
    render(<PreapprovedWastesListScreen />)

    await screen.findByText('Aceite Usado Preaprobado')
    expect(screen.getByRole('columnheader', { name: 'Organización' })).toBeInTheDocument()
    expect(screen.getByText('EcoGestor SAS')).toBeInTheDocument()
    expect(screen.getByLabelText('Organización')).toBeInTheDocument()
    expect(fetchPreapprovedWastesMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: undefined }))
  })

  test('platform staff selecting an organization narrows the fetch to organization_id', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['preapproved_wastes.read'] }
    searchOrganizationsMock.mockResolvedValue({
      data: [{ id: 9, legal_name: 'EcoGestor SAS', tax_id: '900123456-7' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 10,
    })
    render(<PreapprovedWastesListScreen />)
    await screen.findByText('Aceite Usado Preaprobado')
    fetchPreapprovedWastesMock.mockClear()

    fireEvent.change(screen.getByLabelText('Organización'), { target: { value: 'EcoGestor' } })
    const option = await screen.findByText(/EcoGestor SAS/)
    fireEvent.click(option)

    await vi.waitFor(() => {
      expect(fetchPreapprovedWastesMock).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 9 }))
    })
  })

  test('applies search with debounce', async () => {
    render(<PreapprovedWastesListScreen />)
    await screen.findByText('Aceite Usado Preaprobado')
    fetchPreapprovedWastesMock.mockClear()

    fireEvent.change(screen.getByLabelText('Buscar residuos preaprobados'), { target: { value: 'Aceite' } })

    await vi.waitFor(() => {
      expect(fetchPreapprovedWastesMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'Aceite' }))
    })
  })

  test('navigates to /admin/preapproved-wastes/new when "+ Crear Residuo Preaprobado" is clicked', async () => {
    render(<PreapprovedWastesListScreen />)
    await screen.findByText('Aceite Usado Preaprobado')

    fireEvent.click(screen.getByRole('button', { name: '+ Crear Residuo Preaprobado' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/preapproved-wastes/new')
  })

  test('navigates to the detail page when the row is clicked', async () => {
    render(<PreapprovedWastesListScreen />)
    await screen.findByText('Aceite Usado Preaprobado')

    fireEvent.click(screen.getByText('Aceite Usado Preaprobado'))

    expect(pushMock).toHaveBeenCalledWith('/admin/preapproved-wastes/30')
  })

  test('"Inactivar" calls deactivatePreapprovedWaste and updates the row', async () => {
    deactivatePreapprovedWasteMock.mockResolvedValueOnce({ waste: { ...makeWaste(), is_active: false } })
    render(<PreapprovedWastesListScreen />)
    await screen.findByText('Aceite Usado Preaprobado')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Acciones para Aceite Usado Preaprobado' }))
    })
    const menu = await screen.findByRole('menu', {}, { timeout: 3000 })
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inactivar' }))
    })

    expect(deactivatePreapprovedWasteMock).toHaveBeenCalledWith(30)
    await screen.findByText('Inactivo')
  })
})
