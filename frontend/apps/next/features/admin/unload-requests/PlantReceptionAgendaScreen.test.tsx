import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PlantReceptionAgendaScreen } from './PlantReceptionAgendaScreen'

const fetchBranchesMock = vi.fn()
const fetchUnloadRequestsMock = vi.fn()
const fetchPlantReceptionSchedulesMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchBranches: (...args: unknown[]) => fetchBranchesMock(...args),
    fetchUnloadRequests: (...args: unknown[]) => fetchUnloadRequestsMock(...args),
    fetchPlantReceptionSchedules: (...args: unknown[]) => fetchPlantReceptionSchedulesMock(...args),
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

function agendaSchedule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 77,
    uuid: 'pcs-77',
    tenant_organization_id: 2,
    unload_request_id: 12,
    receiving_branch_id: 3,
    dock_location_id: 8,
    scheduled_date: '2026-07-23',
    scheduled_start_at: '2026-07-23T07:00:00Z',
    scheduled_end_at: '2026-07-23T10:00:00Z',
    proposed_by_role: 'GENERATOR',
    proposed_by_user_id: 5,
    proposed_at: '2026-07-20T00:00:00Z',
    counter_proposed_date: null,
    counter_proposed_start_at: null,
    counter_proposed_end_at: null,
    counter_proposed_by: null,
    counter_proposed_at: null,
    confirmed_by: null,
    confirmed_at: null,
    status: 'PROPOSED',
    reschedule_reason: null,
    rejection_reason: null,
    version_number: 1,
    parent_schedule_id: null,
    is_active: true,
    dock_location: { id: 8, code: 'M3', name: 'Muelle 3' },
    proposed_by_user: { id: 5, username: 'jgomez' },
    counter_proposed_by_user: null,
    confirmed_by_user: null,
    unload_request: { id: 12, request_number: 'SOL-1-ABCDEFGH', receiving_branch_id: 3, carrier_organization_id: 1 },
    ...overrides,
  }
}

function paginated<T>(data: T[], perPage = 50) {
  return { data, current_page: 1, last_page: 1, total: data.length, per_page: perPage }
}

describe('PlantReceptionAgendaScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['plant_reception_schedules.read'] }
    fetchBranchesMock.mockResolvedValue(paginated([{ id: 3, name: 'Planta Norte', organization_id: 2 }], 100))
    fetchPlantReceptionSchedulesMock.mockResolvedValue(paginated([]))
  })

  afterEach(() => {
    fetchBranchesMock.mockReset()
    fetchUnloadRequestsMock.mockReset()
    fetchPlantReceptionSchedulesMock.mockReset()
    pushMock.mockReset()
  })

  test('groups scheduled requests by date and lists unscheduled ones separately', async () => {
    fetchUnloadRequestsMock.mockResolvedValue(paginated([unloadRequest()]))
    fetchPlantReceptionSchedulesMock.mockResolvedValue(paginated([agendaSchedule()]))

    render(<PlantReceptionAgendaScreen />)

    expect(await screen.findByText('SOL-1-ABCDEFGH')).toBeInTheDocument()
    expect(screen.getByText(/Transportes ABC S.A.S./)).toBeInTheDocument()
    expect(screen.getByText(/Muelle 3/)).toBeInTheDocument()

    // Filtra por la sede seleccionada -- mismo criterio que el resto de
    // pantallas de este archivo, nunca se manda un filtro que el actor no
    // eligió.
    expect(fetchUnloadRequestsMock).toHaveBeenCalledWith(
      expect.objectContaining({ receivingBranchId: 3, status: 'APPROVED' })
    )
    expect(fetchPlantReceptionSchedulesMock).toHaveBeenCalledWith(
      expect.objectContaining({ receivingBranchId: 3, dateFrom: expect.any(String), dateTo: expect.any(String) })
    )
  })

  test('excludes superseded (inactive) schedule versions from the agenda', async () => {
    fetchUnloadRequestsMock.mockResolvedValue(paginated([unloadRequest()]))
    fetchPlantReceptionSchedulesMock.mockResolvedValue(
      paginated([agendaSchedule({ id: 76, status: 'SUPERSEDED', is_active: false })])
    )

    render(<PlantReceptionAgendaScreen />)

    expect(await screen.findByText('Sin Programar')).toBeInTheDocument()
    expect(screen.getByText(/Aprobada, sin franja propuesta/)).toBeInTheDocument()
  })

  test('shows requests without an active schedule under "Sin Programar"', async () => {
    fetchUnloadRequestsMock.mockResolvedValue(paginated([unloadRequest()]))
    fetchPlantReceptionSchedulesMock.mockResolvedValue(paginated([]))

    render(<PlantReceptionAgendaScreen />)

    expect(await screen.findByText('Sin Programar')).toBeInTheDocument()
    expect(screen.getByText(/Aprobada, sin franja propuesta/)).toBeInTheDocument()
  })

  test('navigates to the unload request detail when a card is clicked', async () => {
    fetchUnloadRequestsMock.mockResolvedValue(paginated([unloadRequest()]))
    fetchPlantReceptionSchedulesMock.mockResolvedValue(paginated([]))

    render(<PlantReceptionAgendaScreen />)

    fireEvent.click(await screen.findByText('SOL-1-ABCDEFGH'))

    expect(pushMock).toHaveBeenCalledWith('/admin/unload-requests/12')
  })

  test('shows an empty message when there are no approved requests for the selected plant', async () => {
    fetchUnloadRequestsMock.mockResolvedValue(paginated([], 50))

    render(<PlantReceptionAgendaScreen />)

    expect(await screen.findByText(/No hay solicitudes Aprobadas pendientes/)).toBeInTheDocument()
  })
})
