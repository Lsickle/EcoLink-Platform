import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TransportScheduleDetailScreen } from './TransportScheduleDetailScreen'

const fetchTransportScheduleMock = vi.fn()
const submitTransportScheduleMock = vi.fn()
const confirmTransportScheduleMock = vi.fn()
const cancelTransportScheduleMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchTransportSchedule: (...args: unknown[]) => fetchTransportScheduleMock(...args),
    submitTransportSchedule: (...args: unknown[]) => submitTransportScheduleMock(...args),
    confirmTransportSchedule: (...args: unknown[]) => confirmTransportScheduleMock(...args),
    cancelTransportSchedule: (...args: unknown[]) => cancelTransportScheduleMock(...args),
  }
})

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[]; tenant_organization_id: number } | null = null

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

function baseSchedule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
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
    waste_service_request: { id: 7, request_code: 'SR-1-ABCDEFGH', organization_id: 2 },
    transport_status: { id: 1, code: 'BOR', name: 'Borrador', is_final: false },
    source_branch: { id: 3, name: 'Bodega Central' },
    destination_branch: { id: 4, name: 'Planta de Tratamiento' },
    vehicle: { id: 5, plate_number: 'ABC123', brand: 'Chevrolet', model: 'NPR' },
    transport_personnel: {
      id: 6,
      license_number: 'C2-12345',
      license_category: 'C2',
      has_hazmat_permit: false,
      person: { id: 1, first_name: 'Juan', last_name: 'Pérez' },
    },
    responsible_user: null,
    items: [
      {
        id: 30,
        uuid: 'tsi-30',
        transport_schedule_id: 9,
        waste_service_request_item_id: 40,
        waste_id: 20,
        scheduled_quantity: '10.00',
        measurement_unit_id: 1,
        estimated_weight_kg: '100.00',
        estimated_volume_m3: null,
        container_quantity: null,
        packaging_type: null,
        length_cm: null,
        width_cm: null,
        height_cm: null,
        requires_special_handling: false,
        observations: null,
        is_active: true,
        metadata: null,
        waste: { id: 20, name: 'Aceite usado', code: 'A-001' },
        measurement_unit: { id: 1, code: 'KG', name: 'Kilogramos' },
      },
    ],
    route_stop: null,
    ...overrides,
  }
}

describe('TransportScheduleDetailScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['transport_schedules.read'], tenant_organization_id: 1 }
    fetchTransportScheduleMock.mockResolvedValue({ transport_schedule: baseSchedule() })
  })

  afterEach(() => {
    fetchTransportScheduleMock.mockReset()
    submitTransportScheduleMock.mockReset()
    confirmTransportScheduleMock.mockReset()
    cancelTransportScheduleMock.mockReset()
  })

  test('renders schedule number, vehicle, driver and items', async () => {
    render(<TransportScheduleDetailScreen scheduleId={9} />)

    await screen.findByText('PRG-1-ABCDEFGH')
    expect(screen.getByText(/ABC123/)).toBeInTheDocument()
    expect(screen.getByText(/Juan Pérez/)).toBeInTheDocument()
    expect(screen.getByText('Aceite usado')).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
  })

  test('hides transition actions without transport_schedules.update/.cancel', async () => {
    render(<TransportScheduleDetailScreen scheduleId={9} />)
    await screen.findByText('PRG-1-ABCDEFGH')

    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
  })

  test('submits a BOR schedule and reloads', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['transport_schedules.read', 'transport_schedules.update'],
      tenant_organization_id: 1,
    }
    submitTransportScheduleMock.mockResolvedValue({ transport_schedule: { id: 9 } })
    render(<TransportScheduleDetailScreen scheduleId={9} />)
    await screen.findByText('PRG-1-ABCDEFGH')

    fetchTransportScheduleMock.mockResolvedValue({
      transport_schedule: baseSchedule({ transport_status: { id: 2, code: 'PEND', name: 'Pend. Asignación', is_final: false } }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(submitTransportScheduleMock).toHaveBeenCalledWith(9))
    expect(await screen.findByText('Pend. Asignación')).toBeInTheDocument()
  })

  test('shows the confirm action in PEND and cancel action with permission', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['transport_schedules.read', 'transport_schedules.update', 'transport_schedules.cancel'],
      tenant_organization_id: 1,
    }
    fetchTransportScheduleMock.mockResolvedValue({
      transport_schedule: baseSchedule({ transport_status: { id: 2, code: 'PEND', name: 'Pend. Asignación', is_final: false } }),
    })
    render(<TransportScheduleDetailScreen scheduleId={9} />)
    await screen.findByText('PRG-1-ABCDEFGH')

    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
  })

  test('cancels the schedule and reloads', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['transport_schedules.read', 'transport_schedules.cancel'],
      tenant_organization_id: 1,
    }
    cancelTransportScheduleMock.mockResolvedValue({ transport_schedule: { id: 9 } })
    render(<TransportScheduleDetailScreen scheduleId={9} />)
    await screen.findByText('PRG-1-ABCDEFGH')

    fetchTransportScheduleMock.mockResolvedValue({
      transport_schedule: baseSchedule({ transport_status: { id: 7, code: 'CANC', name: 'Cancelada', is_final: true } }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(cancelTransportScheduleMock).toHaveBeenCalledWith(9))
    expect(await screen.findByText('Cancelada')).toBeInTheDocument()
  })

  test('hides all transition actions once the schedule is final', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['transport_schedules.read', 'transport_schedules.update', 'transport_schedules.cancel'],
      tenant_organization_id: 1,
    }
    fetchTransportScheduleMock.mockResolvedValue({
      transport_schedule: baseSchedule({ transport_status: { id: 7, code: 'CANC', name: 'Cancelada', is_final: true } }),
    })
    render(<TransportScheduleDetailScreen scheduleId={9} />)
    await screen.findByText('PRG-1-ABCDEFGH')

    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirmar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
  })

  test('shows the load error message when fetching fails', async () => {
    fetchTransportScheduleMock.mockRejectedValue(new Error('boom'))
    render(<TransportScheduleDetailScreen scheduleId={9} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })
})
