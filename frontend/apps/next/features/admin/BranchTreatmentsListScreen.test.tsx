import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchTreatmentsListScreen } from './BranchTreatmentsListScreen'

const fetchBranchTreatmentsMock = vi.fn()
const fetchTreatmentsMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchBranchTreatments: (...args: unknown[]) => fetchBranchTreatmentsMock(...args),
    fetchTreatments: (...args: unknown[]) => fetchTreatmentsMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['branch_treatments.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function branchTreatmentsPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...emptyPage,
    data: [
      {
        id: 10,
        uuid: 'bt-10',
        organization_id: 1,
        branch_id: 7,
        treatment_id: 3,
        internal_code: 'BT-001',
        operational_name: 'Horno 1',
        max_capacity: '5000.00',
        capacity_unit: 'KG',
        operational_status: 'ACTIVE',
        is_active: true,
        created_at: '2026-07-17T00:00:00Z',
        updated_at: '2026-07-17T00:00:00Z',
        created_by: 1,
        updated_by: 1,
        organization: { id: 1, legal_name: 'EcoGestor SAS' },
        branch: { id: 7, name: 'Planta Norte' },
        treatment: { id: 3, code: 'INCIN', name: 'Incineración' },
      },
    ],
    total: 1,
    kpis: { total: 4, active: 3, inactive: 1 },
    ...overrides,
  }
}

describe('BranchTreatmentsListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['branch_treatments.read'] }
    fetchBranchTreatmentsMock.mockResolvedValue(branchTreatmentsPage())
    fetchTreatmentsMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 3, uuid: 'treat-3', code: 'INCIN', name: 'Incineración', treatment_type: 'THERMAL', risk_level: 'HIGH', is_active: true }],
    })
    searchOrganizationsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    fetchBranchTreatmentsMock.mockReset()
    fetchTreatmentsMock.mockReset()
    searchOrganizationsMock.mockReset()
    pushMock.mockReset()
  })

  test('shows the 3 KPIs (plain object)', async () => {
    render(<BranchTreatmentsListScreen />)

    await screen.findByText('Planta Norte')
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('Activos')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  test('renders the Sucursal/Organización/Tratamiento/Capacidad/Estado columns', async () => {
    render(<BranchTreatmentsListScreen />)
    await screen.findByText('Planta Norte')

    expect(screen.getByText('EcoGestor SAS')).toBeInTheDocument()
    expect(screen.getByText('Incineración')).toBeInTheDocument()
    expect(screen.getByText('5000.00 KG')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
  })

  test('hides the Organización filter for a non-platform-staff actor', async () => {
    render(<BranchTreatmentsListScreen />)
    await screen.findByText('Planta Norte')

    expect(screen.queryByLabelText('Organización')).not.toBeInTheDocument()
  })

  test('shows the Organización filter for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['branch_treatments.read'] }
    render(<BranchTreatmentsListScreen />)
    await screen.findByText('Planta Norte')

    expect(screen.getByLabelText('Organización')).toBeInTheDocument()
  })

  test('navigates to /admin/branch-treatments/new when "Crear Tratamiento de Sede" is clicked', async () => {
    render(<BranchTreatmentsListScreen />)
    await screen.findByText('Planta Norte')

    fireEvent.click(screen.getByRole('button', { name: /crear tratamiento de sede/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/branch-treatments/new')
  })

  test('navigates to the detail page when a row is clicked', async () => {
    render(<BranchTreatmentsListScreen />)
    await screen.findByText('Planta Norte')

    fireEvent.click(screen.getByText('Planta Norte'))

    expect(pushMock).toHaveBeenCalledWith('/admin/branch-treatments/10')
  })
})
