import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TransportSchedulesListScreen } from './TransportSchedulesListScreen'

const fetchTransportSchedulesMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchTransportSchedules: (...args: unknown[]) => fetchTransportSchedulesMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['transport_schedules.read', 'transport_schedules.create'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function schedulesPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...emptyPage,
    data: [
      {
        id: 9,
        uuid: 'sch-9',
        tenant_organization_id: 1,
        organization_id: 1,
        waste_service_request_id: 7,
        schedule_number: 'PRG-1-ABCDEFGH',
        source_branch_id: 3,
        destination_branch_id: 4,
        vehicle_id: 5,
        transport_personnel_id: 6,
        responsible_user_id: null,
        scheduled_pickup_at: '2026-08-01T10:00:00Z',
        pickup_window_start: null,
        pickup_window_end: null,
        priority: 'MEDIUM',
        estimated_weight_kg: null,
        estimated_volume_m3: null,
        planned_distance_km: null,
        planned_duration_minutes: null,
        requires_special_handling: false,
        observations: null,
        version_number: 1,
        parent_schedule_id: null,
        is_active: true,
        metadata: null,
        created_at: '2026-07-19T00:00:00Z',
        updated_at: '2026-07-19T00:00:00Z',
        organization: { id: 1, legal_name: 'Gestor Ambiental S.A.S.' },
        waste_service_request: { id: 7, request_code: 'SR-1-ABCDEFGH' },
        transport_status: { id: 1, code: 'BOR', name: 'Borrador', sort_order: 1, is_initial: true, is_final: false },
        vehicle: { id: 5, plate_number: 'ABC123' },
      },
    ],
    total: 1,
    ...overrides,
  }
}

describe('TransportSchedulesListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['transport_schedules.read', 'transport_schedules.create'] }
    fetchTransportSchedulesMock.mockResolvedValue(schedulesPage())
  })

  afterEach(() => {
    fetchTransportSchedulesMock.mockReset()
    pushMock.mockReset()
  })

  test('renders the schedule number, vehicle plate and status badge', async () => {
    render(<TransportSchedulesListScreen />)

    await screen.findByText('PRG-1-ABCDEFGH')
    expect(screen.getByText('SR-1-ABCDEFGH')).toBeInTheDocument()
    expect(screen.getByText('ABC123')).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
  })

  test('does not show the "Organización" column for a tenant actor', async () => {
    render(<TransportSchedulesListScreen />)
    await screen.findByText('PRG-1-ABCDEFGH')

    expect(screen.queryByText('Gestor Ambiental S.A.S.')).not.toBeInTheDocument()
  })

  test('shows the "Organización" column for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['transport_schedules.read'] }
    render(<TransportSchedulesListScreen />)

    expect(await screen.findByText('Gestor Ambiental S.A.S.')).toBeInTheDocument()
  })

  test('filters by status', async () => {
    render(<TransportSchedulesListScreen />)
    await screen.findByText('PRG-1-ABCDEFGH')
    fetchTransportSchedulesMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    const option = await screen.findByRole('option', { name: 'Confirmada' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchTransportSchedulesMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'CONF' }))
  })

  test('navigates to the detail page when a row is clicked', async () => {
    render(<TransportSchedulesListScreen />)
    await screen.findByText('PRG-1-ABCDEFGH')

    fireEvent.click(screen.getByText('PRG-1-ABCDEFGH'))

    expect(pushMock).toHaveBeenCalledWith('/admin/transport-schedules/9')
  })

  test('navigates to the create form when "+ Nueva Programación" is clicked', async () => {
    render(<TransportSchedulesListScreen />)
    await screen.findByText('PRG-1-ABCDEFGH')

    fireEvent.click(screen.getByRole('button', { name: '+ Nueva Programación' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/transport-schedules/new')
  })

  test('hides the create button without transport_schedules.create', async () => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['transport_schedules.read'] }
    render(<TransportSchedulesListScreen />)
    await screen.findByText('PRG-1-ABCDEFGH')

    expect(screen.queryByRole('button', { name: '+ Nueva Programación' })).not.toBeInTheDocument()
  })

  test('shows an empty message when there are no results', async () => {
    fetchTransportSchedulesMock.mockResolvedValue(emptyPage)
    render(<TransportSchedulesListScreen />)

    expect(await screen.findByText(/No hay programaciones de transporte/i)).toBeInTheDocument()
  })
})
