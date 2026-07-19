import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TransportDispatchBoardScreen } from './TransportDispatchBoardScreen'

const fetchTransportRoutesMock = vi.fn()
const fetchTransportRouteMock = vi.fn()
const fetchTransportSchedulesMock = vi.fn()
const assignTransportScheduleToRouteMock = vi.fn()
const createTransportRouteMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchTransportRoutes: (...args: unknown[]) => fetchTransportRoutesMock(...args),
    fetchTransportRoute: (...args: unknown[]) => fetchTransportRouteMock(...args),
    fetchTransportSchedules: (...args: unknown[]) => fetchTransportSchedulesMock(...args),
    assignTransportScheduleToRoute: (...args: unknown[]) => assignTransportScheduleToRouteMock(...args),
    createTransportRoute: (...args: unknown[]) => createTransportRouteMock(...args),
  }
})

let currentUser: { id: number; is_platform_staff: boolean; tenant_organization_id: number; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  tenant_organization_id: 10,
  permissions: ['transport_routes.read', 'transport_routes.create', 'transport_schedules.update'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function route(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'route-1',
    organization_id: 10,
    route_code: 'RUTA-10-ABCDEFGH',
    name: 'Ruta Zona Norte',
    route_date: null,
    observations: null,
    is_active: true,
    metadata: null,
    created_at: '2026-07-19T00:00:00Z',
    updated_at: '2026-07-19T00:00:00Z',
    stops_count: 1,
    ...overrides,
  }
}

function schedule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 9,
    uuid: 'sch-9',
    tenant_organization_id: 10,
    organization_id: 10,
    waste_service_request_id: 7,
    schedule_number: 'PRG-10-AAAAAAAA',
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
    transport_status: { id: 4, code: 'CONF', name: 'Confirmada', is_final: false },
    vehicle: { id: 5, plate_number: 'ABC123' },
    ...overrides,
  }
}

describe('TransportDispatchBoardScreen', () => {
  beforeEach(() => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      tenant_organization_id: 10,
      permissions: ['transport_routes.read', 'transport_routes.create', 'transport_schedules.update'],
    }
    fetchTransportRoutesMock.mockResolvedValue({ ...emptyPage, data: [route()], total: 1 })
    fetchTransportRouteMock.mockResolvedValue({
      transport_route: {
        ...route(),
        organization: { id: 10, legal_name: 'Gestor Ambiental S.A.S.' },
        stops: [{ id: 1, uuid: 'stop-1', transport_route_id: 1, transport_schedule_id: 9, stop_sequence: 1, observations: null }],
      },
    })
    fetchTransportSchedulesMock.mockResolvedValue({
      ...emptyPage,
      data: [
        schedule({ id: 9, schedule_number: 'PRG-10-AAAAAAAA' }), // ya asignada a la ruta
        schedule({ id: 10, schedule_number: 'PRG-10-BBBBBBBB', vehicle: { id: 5, plate_number: 'XYZ789' } }), // sin ruta
        schedule({
          id: 11,
          schedule_number: 'PRG-10-CCCCCCCC',
          transport_status: { id: 7, code: 'CANC', name: 'Cancelada', is_final: true },
        }), // final -- excluida
      ],
      total: 3,
    })
  })

  afterEach(() => {
    fetchTransportRoutesMock.mockReset()
    fetchTransportRouteMock.mockReset()
    fetchTransportSchedulesMock.mockReset()
    assignTransportScheduleToRouteMock.mockReset()
    createTransportRouteMock.mockReset()
  })

  test('lists only schedules without a route stop and excludes final statuses', async () => {
    render(<TransportDispatchBoardScreen />)

    await screen.findByText('PRG-10-BBBBBBBB')
    expect(screen.queryByText('PRG-10-AAAAAAAA')).not.toBeInTheDocument()
    expect(screen.queryByText('PRG-10-CCCCCCCC')).not.toBeInTheDocument()
  })

  test('lists existing routes with their stop count', async () => {
    render(<TransportDispatchBoardScreen />)

    await screen.findByText('RUTA-10-ABCDEFGH')
    expect(screen.getByText('Ruta Zona Norte')).toBeInTheDocument()
  })

  test('assigns an unassigned schedule to an existing route', async () => {
    assignTransportScheduleToRouteMock.mockResolvedValue({
      route_stop: { id: 2, stop_sequence: 2, transport_route: { id: 1, route_code: 'RUTA-10-ABCDEFGH' } },
    })
    render(<TransportDispatchBoardScreen />)
    await screen.findByText('PRG-10-BBBBBBBB')

    fireEvent.click(screen.getByLabelText('Ruta para PRG-10-BBBBBBBB'))
    const option = await screen.findByRole('option', { name: /Ruta Zona Norte/ })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Asignar' }))

    await waitFor(() => expect(assignTransportScheduleToRouteMock).toHaveBeenCalledWith(10, { transport_route_id: 1 }))
  })

  test('creates a new route inline', async () => {
    createTransportRouteMock.mockResolvedValue({
      transport_route: { ...route({ id: 2, route_code: 'RUTA-10-NEWROUTE', name: 'Ruta Zona Sur', stops_count: 0 }) },
    })
    render(<TransportDispatchBoardScreen />)
    await screen.findByText('PRG-10-BBBBBBBB')

    fireEvent.click(screen.getByRole('button', { name: '+ Nueva Ruta' }))
    fireEvent.change(screen.getByLabelText('Nombre de la Nueva Ruta'), { target: { value: 'Ruta Zona Sur' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }))

    await waitFor(() =>
      expect(createTransportRouteMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ruta Zona Sur' }))
    )
    expect(await screen.findByText('RUTA-10-NEWROUTE')).toBeInTheDocument()
  })

  test('hides the assign column and "+ Nueva Ruta" without the required permissions', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      tenant_organization_id: 10,
      permissions: ['transport_routes.read'],
    }
    render(<TransportDispatchBoardScreen />)
    await screen.findByText('PRG-10-BBBBBBBB')

    expect(screen.queryByRole('button', { name: '+ Nueva Ruta' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Ruta para PRG-10-BBBBBBBB')).not.toBeInTheDocument()
  })
})
