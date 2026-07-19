import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ServiceRequestsListScreen } from './ServiceRequestsListScreen'

const fetchServiceRequestsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchServiceRequests: (...args: unknown[]) => fetchServiceRequestsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['service_requests.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function serviceRequestsPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...emptyPage,
    data: [
      {
        id: 7,
        uuid: 'sr-7',
        organization_id: 1,
        branch_id: 3,
        request_code: 'SR-1-ABCDEFGH',
        service_status_id: 1,
        requested_at: '2026-07-01T00:00:00Z',
        requested_collection_date: '2026-08-01',
        estimated_ready_date: null,
        scheduled_collection_date: null,
        estimated_total_weight: null,
        estimated_total_volume: null,
        measurement_unit_id: null,
        packaging_type: null,
        requires_lift_platform: false,
        requires_audit: false,
        requires_photo_record: false,
        requires_container_return: false,
        estimated_height: null,
        estimated_width: null,
        estimated_length: null,
        observations: null,
        request_source: 'PORTAL',
        priority: 'MEDIUM',
        requested_by: null,
        cancellation_reason_id: null,
        cancellation_details: null,
        cancelled_by: null,
        cancelled_at: null,
        is_active: true,
        metadata: null,
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
        organization: { id: 1, legal_name: 'Hospital San José' },
        branch: { id: 3, name: 'Sede Principal' },
        service_status: { id: 1, code: 'DRAFT', name: 'Borrador', sequence_order: 1, is_initial_status: true, is_terminal_status: false, is_system_status: true, blocks_editing: false },
      },
    ],
    total: 1,
    ...overrides,
  }
}

describe('ServiceRequestsListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['service_requests.read'] }
    fetchServiceRequestsMock.mockResolvedValue(serviceRequestsPage())
  })

  afterEach(() => {
    fetchServiceRequestsMock.mockReset()
    pushMock.mockReset()
  })

  test('renders the request code, branch, date and status badge', async () => {
    render(<ServiceRequestsListScreen />)

    await screen.findByText('SR-1-ABCDEFGH')
    expect(screen.getByText('Sede Principal')).toBeInTheDocument()
    expect(screen.getByText('2026-08-01')).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
  })

  test('does not show the "Organización" column for a tenant actor', async () => {
    render(<ServiceRequestsListScreen />)
    await screen.findByText('SR-1-ABCDEFGH')

    expect(screen.queryByText('Hospital San José')).not.toBeInTheDocument()
  })

  test('shows the "Organización" column for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['service_requests.read'] }
    render(<ServiceRequestsListScreen />)

    expect(await screen.findByText('Hospital San José')).toBeInTheDocument()
  })

  test('filters by status', async () => {
    render(<ServiceRequestsListScreen />)
    await screen.findByText('SR-1-ABCDEFGH')
    fetchServiceRequestsMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    const option = await screen.findByRole('option', { name: 'Aprobada' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchServiceRequestsMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'APPROVED' }))
  })

  test('navigates to the detail page when a row is clicked', async () => {
    render(<ServiceRequestsListScreen />)
    await screen.findByText('SR-1-ABCDEFGH')

    fireEvent.click(screen.getByText('SR-1-ABCDEFGH'))

    expect(pushMock).toHaveBeenCalledWith('/admin/service-requests/7')
  })

  test('navigates to the wizard when "+ Nueva Solicitud" is clicked', async () => {
    render(<ServiceRequestsListScreen />)
    await screen.findByText('SR-1-ABCDEFGH')

    fireEvent.click(screen.getByRole('button', { name: '+ Nueva Solicitud' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/service-requests/new')
  })

  test('shows an empty message when there are no results', async () => {
    fetchServiceRequestsMock.mockResolvedValue(emptyPage)
    render(<ServiceRequestsListScreen />)

    expect(await screen.findByText(/No hay solicitudes de servicio/i)).toBeInTheDocument()
  })
})
