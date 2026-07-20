import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { UnloadRequestsListScreen } from './UnloadRequestsListScreen'

const fetchUnloadRequestsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchUnloadRequests: (...args: unknown[]) => fetchUnloadRequestsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['unload_requests.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function unloadRequestsPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...emptyPage,
    data: [
      {
        id: 12,
        uuid: 'unl-12',
        tenant_organization_id: 1,
        request_number: 'SOL-1-ABCDEFGH',
        receiving_branch_id: 3,
        manifest_load_id: null,
        transport_schedule_id: 9,
        origin_branch_id: 2,
        carrier_organization_id: 1,
        vehicle_id: 5,
        transport_personnel_id: 6,
        service_modality: 'COLLECTION',
        estimated_arrival_at: null,
        priority: 'MEDIUM',
        rejection_reason: null,
        transport_discrepancy_notes: null,
        is_active: true,
        created_at: '2026-07-20T00:00:00Z',
        updated_at: '2026-07-20T00:00:00Z',
        unload_request_status: { id: 2, code: 'SUBMITTED', name: 'Enviada', sort_order: 2, is_initial: false, is_final: false, is_active: true },
        receiving_branch: { id: 3, name: 'Planta Norte', organization_id: 2 },
        carrier_organization: { id: 1, legal_name: 'Transportes ABC S.A.S.' },
        transport_schedule: { id: 9, schedule_number: 'PRG-1-ABCDEFGH' },
      },
    ],
    total: 1,
    ...overrides,
  }
}

describe('UnloadRequestsListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['unload_requests.read'] }
    fetchUnloadRequestsMock.mockResolvedValue(unloadRequestsPage())
  })

  afterEach(() => {
    fetchUnloadRequestsMock.mockReset()
    pushMock.mockReset()
  })

  test('renders the request number, receiving branch, carrier and status badge', async () => {
    render(<UnloadRequestsListScreen />)

    await screen.findByText('SOL-1-ABCDEFGH')
    expect(screen.getByText('Planta Norte')).toBeInTheDocument()
    expect(screen.getByText('Transportes ABC S.A.S.')).toBeInTheDocument()
    expect(screen.getByText('PRG-1-ABCDEFGH')).toBeInTheDocument()
    expect(screen.getByText('Enviada')).toBeInTheDocument()
  })

  test('filters by status', async () => {
    render(<UnloadRequestsListScreen />)
    await screen.findByText('SOL-1-ABCDEFGH')
    fetchUnloadRequestsMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    const option = await screen.findByRole('option', { name: 'Aprobada' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchUnloadRequestsMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'APPROVED' }))
  })

  test('navigates to the detail page when a row is clicked', async () => {
    render(<UnloadRequestsListScreen />)
    await screen.findByText('SOL-1-ABCDEFGH')

    fireEvent.click(screen.getByText('SOL-1-ABCDEFGH'))

    expect(pushMock).toHaveBeenCalledWith('/admin/unload-requests/12')
  })

  test('shows an empty message when there are no results', async () => {
    fetchUnloadRequestsMock.mockResolvedValue(emptyPage)
    render(<UnloadRequestsListScreen />)

    expect(await screen.findByText(/No hay solicitudes de descargue/i)).toBeInTheDocument()
  })
})
