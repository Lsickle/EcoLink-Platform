import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PlantReceptionAgendaScreen } from './PlantReceptionAgendaScreen'

const fetchBranchesMock = vi.fn()
const fetchUnloadRequestsMock = vi.fn()
const fetchPlantReceptionScheduleMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchBranches: (...args: unknown[]) => fetchBranchesMock(...args),
    fetchUnloadRequests: (...args: unknown[]) => fetchUnloadRequestsMock(...args),
    fetchPlantReceptionSchedule: (...args: unknown[]) => fetchPlantReceptionScheduleMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: true,
  permissions: ['plant_reception_schedules.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

function unloadRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 12,
    uuid: 'unl-12',
    tenant_organization_id: 1,
    request_number: 'SOL-1-ABCDEFGH',
    receiving_branch_id: 3,
    manifest_load_id: null,
    transport_schedule_id: null,
    origin_branch_id: null,
    carrier_organization_id: 1,
    vehicle_id: null,
    transport_personnel_id: null,
    service_modality: 'COLLECTION',
    estimated_arrival_at: null,
    priority: 'MEDIUM',
    rejection_reason: null,
    transport_discrepancy_notes: null,
    is_active: true,
    created_at: '2026-07-20T00:00:00Z',
    updated_at: '2026-07-20T00:00:00Z',
    unload_request_status: { id: 3, code: 'APPROVED', name: 'Aprobada', sort_order: 3, is_initial: false, is_final: true, is_active: true },
    receiving_branch: { id: 3, name: 'Planta Norte', organization_id: 2 },
    carrier_organization: { id: 1, legal_name: 'Transportes ABC S.A.S.' },
    transport_schedule: null,
    ...overrides,
  }
}

describe('PlantReceptionAgendaScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['plant_reception_schedules.read'] }
    fetchBranchesMock.mockResolvedValue({
      data: [{ id: 3, name: 'Planta Norte', organization_id: 2 }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 100,
    })
  })

  afterEach(() => {
    fetchBranchesMock.mockReset()
    fetchUnloadRequestsMock.mockReset()
    fetchPlantReceptionScheduleMock.mockReset()
    pushMock.mockReset()
  })

  test('groups scheduled requests by date and lists unscheduled ones separately', async () => {
    fetchUnloadRequestsMock.mockResolvedValue({
      data: [unloadRequest()],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 50,
    })
    fetchPlantReceptionScheduleMock.mockResolvedValue({
      plant_reception_schedule: {
        id: 77,
        scheduled_date: '2026-07-23',
        scheduled_start_at: '2026-07-23T07:00:00Z',
        scheduled_end_at: '2026-07-23T10:00:00Z',
        dock_location: { id: 8, code: 'M3', name: 'Muelle 3' },
        status: 'PROPOSED',
      },
    })

    render(<PlantReceptionAgendaScreen />)

    expect(await screen.findByText('SOL-1-ABCDEFGH')).toBeInTheDocument()
    expect(screen.getByText(/Transportes ABC S.A.S./)).toBeInTheDocument()
    expect(screen.getByText(/Muelle 3/)).toBeInTheDocument()
  })

  test('shows requests without an active schedule under "Sin Programar"', async () => {
    fetchUnloadRequestsMock.mockResolvedValue({
      data: [unloadRequest()],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 50,
    })
    fetchPlantReceptionScheduleMock.mockResolvedValue({ plant_reception_schedule: null })

    render(<PlantReceptionAgendaScreen />)

    expect(await screen.findByText('Sin Programar')).toBeInTheDocument()
    expect(screen.getByText(/Aprobada, sin franja propuesta/)).toBeInTheDocument()
  })

  test('navigates to the unload request detail when a card is clicked', async () => {
    fetchUnloadRequestsMock.mockResolvedValue({
      data: [unloadRequest()],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 50,
    })
    fetchPlantReceptionScheduleMock.mockResolvedValue({ plant_reception_schedule: null })

    render(<PlantReceptionAgendaScreen />)

    fireEvent.click(await screen.findByText('SOL-1-ABCDEFGH'))

    expect(pushMock).toHaveBeenCalledWith('/admin/unload-requests/12')
  })

  test('shows an empty message when there are no approved requests for the selected plant', async () => {
    fetchUnloadRequestsMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 50 })

    render(<PlantReceptionAgendaScreen />)

    expect(await screen.findByText(/No hay solicitudes Aprobadas pendientes/)).toBeInTheDocument()
  })
})
