import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { UnloadRequestDetailScreen } from './UnloadRequestDetailScreen'

const fetchUnloadRequestMock = vi.fn()
const submitUnloadRequestMock = vi.fn()
const approveUnloadRequestMock = vi.fn()
const rejectUnloadRequestMock = vi.fn()
const fetchBranchLocationsMock = vi.fn()
const confirmPlantReceptionScheduleMock = vi.fn()
const createManifestUnloadMock = vi.fn()
const searchContactsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchUnloadRequest: (...args: unknown[]) => fetchUnloadRequestMock(...args),
    submitUnloadRequest: (...args: unknown[]) => submitUnloadRequestMock(...args),
    approveUnloadRequest: (...args: unknown[]) => approveUnloadRequestMock(...args),
    rejectUnloadRequest: (...args: unknown[]) => rejectUnloadRequestMock(...args),
    fetchBranchLocations: (...args: unknown[]) => fetchBranchLocationsMock(...args),
    confirmPlantReceptionSchedule: (...args: unknown[]) => confirmPlantReceptionScheduleMock(...args),
    createManifestUnload: (...args: unknown[]) => createManifestUnloadMock(...args),
    searchContacts: (...args: unknown[]) => searchContactsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[]; tenant_organization_id: number } | null = null

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

// carrier_organization_id=1 (transportador) -- receiving_branch.organization_id=2
// (Gestor receptor, organización DISTINTA).
function baseUnloadRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
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
    manifest_load: null,
    transport_schedule: { id: 9, schedule_number: 'PRG-1-ABCDEFGH', organization_id: 1 },
    origin_branch: { id: 2, name: 'Bodega Central', organization_id: 1 },
    carrier_organization: { id: 1, legal_name: 'Transportes ABC S.A.S.' },
    vehicle: { id: 5, plate_number: 'ABC123' },
    transport_personnel: { id: 6, person: { id: 7, first_name: 'Juan', last_name: 'Pérez' } },
    items: [
      {
        id: 100,
        uuid: 'uri-100',
        unload_request_id: 12,
        manifest_load_item_id: null,
        waste_id: 20,
        requested_quantity: '10.000',
        unit_of_measure: 'KG',
        packaging_type: null,
        line_number: 1,
        is_active: true,
        waste: { id: 20, name: 'Aceite usado', code: 'A-001' },
      },
    ],
    active_reception_schedule: null,
    ...overrides,
  }
}

describe('UnloadRequestDetailScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['unload_requests.read'], tenant_organization_id: 1 }
    fetchUnloadRequestMock.mockResolvedValue({ unload_request: baseUnloadRequest() })
    fetchBranchLocationsMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 })
  })

  afterEach(() => {
    fetchUnloadRequestMock.mockReset()
    submitUnloadRequestMock.mockReset()
    approveUnloadRequestMock.mockReset()
    rejectUnloadRequestMock.mockReset()
    fetchBranchLocationsMock.mockReset()
    confirmPlantReceptionScheduleMock.mockReset()
    createManifestUnloadMock.mockReset()
    searchContactsMock.mockReset()
    pushMock.mockReset()
  })

  test('renders request number, receiving branch, carrier and items', async () => {
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)

    await screen.findByText('SOL-1-ABCDEFGH')
    expect(screen.getAllByText('Planta Norte').length).toBeGreaterThan(0)
    expect(screen.getByText(/Transportes ABC S.A.S./)).toBeInTheDocument()
    expect(screen.getByText('Aceite usado')).toBeInTheDocument()
    expect(screen.getByText('Enviada')).toBeInTheDocument()
  })

  test('hides transition actions without any unload_requests permission', async () => {
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)
    await screen.findByText('SOL-1-ABCDEFGH')

    expect(screen.queryByRole('button', { name: 'Enviar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument()
  })

  test('shows "Enviar" for the carrier owner in DRAFT and submits', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['unload_requests.read', 'unload_requests.update'],
      tenant_organization_id: 1,
    }
    fetchUnloadRequestMock.mockResolvedValue({
      unload_request: baseUnloadRequest({ unload_request_status: { id: 1, code: 'DRAFT', name: 'Borrador', is_final: false } }),
    })
    submitUnloadRequestMock.mockResolvedValue({ unload_request: { id: 12 } })
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)
    await screen.findByText('SOL-1-ABCDEFGH')

    fetchUnloadRequestMock.mockResolvedValue({
      unload_request: baseUnloadRequest({ unload_request_status: { id: 2, code: 'SUBMITTED', name: 'Enviada', is_final: false } }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(submitUnloadRequestMock).toHaveBeenCalledWith(12))
  })

  test('hides "Aprobar" for the carrier owner (not the receiving organization)', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['unload_requests.read', 'unload_requests.decide'],
      tenant_organization_id: 1,
    }
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)
    await screen.findByText('SOL-1-ABCDEFGH')

    // El actor pertenece a la organización carrier (1), NO a la receptora (2).
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument()
  })

  test('shows "Aprobar" for the receiving organization owner', async () => {
    currentUser = {
      id: 2,
      is_platform_staff: false,
      permissions: ['unload_requests.read', 'unload_requests.decide'],
      tenant_organization_id: 2,
    }
    approveUnloadRequestMock.mockResolvedValue({ unload_request: { id: 12 } })
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)
    await screen.findByText('SOL-1-ABCDEFGH')

    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument()
  })

  test('rejects with a reason', async () => {
    currentUser = {
      id: 2,
      is_platform_staff: false,
      permissions: ['unload_requests.read', 'unload_requests.decide'],
      tenant_organization_id: 2,
    }
    rejectUnloadRequestMock.mockResolvedValue({ unload_request: { id: 12 } })
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)
    await screen.findByText('SOL-1-ABCDEFGH')

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    fireEvent.change(screen.getByLabelText('Motivo de Rechazo'), { target: { value: 'Documentación incompleta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }))

    await waitFor(() =>
      expect(rejectUnloadRequestMock).toHaveBeenCalledWith(12, { rejection_reason: 'Documentación incompleta' })
    )
  })

  test('shows the plant reception schedule panel note when the request is not Approved', async () => {
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)
    await screen.findByText('SOL-1-ABCDEFGH')

    expect(screen.getByText(/solo puede proponerse sobre una solicitud Aprobada/)).toBeInTheDocument()
  })

  test('shows "Programar Recepción" button once Approved with manage permission', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['unload_requests.read', 'plant_reception_schedules.manage'],
      tenant_organization_id: 1,
    }
    fetchUnloadRequestMock.mockResolvedValue({
      unload_request: baseUnloadRequest({ unload_request_status: { id: 3, code: 'APPROVED', name: 'Aprobada', is_final: true } }),
    })
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)
    await screen.findByText('SOL-1-ABCDEFGH')

    expect(await screen.findByRole('button', { name: '+ Programar Recepción' })).toBeInTheDocument()
  })

  test('shows the load error message when fetching fails', async () => {
    fetchUnloadRequestMock.mockRejectedValue(new Error('boom'))
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })
})

describe('UnloadRequestDetailScreen -- Generar Manifiesto de Descargue', () => {
  const approvedWithConfirmedSchedule = () =>
    baseUnloadRequest({
      unload_request_status: { id: 3, code: 'APPROVED', name: 'Aprobada', is_final: false },
      active_reception_schedule: {
        id: 200,
        uuid: 'prs-200',
        tenant_organization_id: 2,
        unload_request_id: 12,
        receiving_branch_id: 3,
        dock_location_id: null,
        scheduled_date: '2026-07-22',
        scheduled_start_at: '2026-07-22T08:00:00Z',
        scheduled_end_at: '2026-07-22T10:00:00Z',
        proposed_by_role: 'LOGISTICS_COORDINATOR',
        proposed_by_user_id: 1,
        proposed_at: '2026-07-20T00:00:00Z',
        counter_proposed_date: null,
        counter_proposed_start_at: null,
        counter_proposed_end_at: null,
        counter_proposed_by: null,
        counter_proposed_at: null,
        confirmed_by: 2,
        confirmed_at: '2026-07-20T01:00:00Z',
        status: 'CONFIRMED',
        reschedule_reason: null,
        rejection_reason: null,
        version_number: 1,
        parent_schedule_id: null,
        is_active: true,
      },
    })

  beforeEach(() => {
    fetchUnloadRequestMock.mockResolvedValue({ unload_request: approvedWithConfirmedSchedule() })
    fetchBranchLocationsMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 })
    searchContactsMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 10 })
  })

  test('hides the action without manifest_unloads.create', async () => {
    currentUser = {
      id: 2,
      is_platform_staff: false,
      permissions: ['unload_requests.read'],
      tenant_organization_id: 2,
    }
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)
    await screen.findByText('SOL-1-ABCDEFGH')

    expect(screen.queryByRole('button', { name: 'Generar Manifiesto de Descargue' })).not.toBeInTheDocument()
  })

  test('hides the action for the carrier organization (not the receiving owner)', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['unload_requests.read', 'manifest_unloads.create'],
      tenant_organization_id: 1,
    }
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)
    await screen.findByText('SOL-1-ABCDEFGH')

    expect(screen.queryByRole('button', { name: 'Generar Manifiesto de Descargue' })).not.toBeInTheDocument()
  })

  test('hides the action when the reception schedule is not CONFIRMED yet', async () => {
    currentUser = {
      id: 2,
      is_platform_staff: false,
      permissions: ['unload_requests.read', 'manifest_unloads.create'],
      tenant_organization_id: 2,
    }
    fetchUnloadRequestMock.mockResolvedValue({
      unload_request: baseUnloadRequest({
        unload_request_status: { id: 3, code: 'APPROVED', name: 'Aprobada', is_final: false },
        active_reception_schedule: null,
      }),
    })
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)
    await screen.findByText('SOL-1-ABCDEFGH')

    expect(screen.queryByRole('button', { name: 'Generar Manifiesto de Descargue' })).not.toBeInTheDocument()
  })

  test('shows the action for the receiving owner once Approved + Confirmed, creates the manifest and redirects', async () => {
    currentUser = {
      id: 2,
      is_platform_staff: false,
      permissions: ['unload_requests.read', 'manifest_unloads.create'],
      tenant_organization_id: 2,
    }
    createManifestUnloadMock.mockResolvedValue({ manifest_unload: { id: 77, manifest_number: 'MUN-2-ABCDEFGH' } })
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)
    await screen.findByText('SOL-1-ABCDEFGH')

    fireEvent.click(screen.getByRole('button', { name: 'Generar Manifiesto de Descargue' }))
    expect(await screen.findByRole('heading', { name: 'Generar Manifiesto de Descargue' })).toBeInTheDocument()

    // Sin seleccionar firmante -- debe mostrar el error de validación local.
    fireEvent.click(screen.getByRole('button', { name: 'Generar Manifiesto' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona el firmante del Receptor.')
    expect(createManifestUnloadMock).not.toHaveBeenCalled()

    searchContactsMock.mockResolvedValue({
      data: [{ id: 90, first_name: 'Ana', last_name: 'Restrepo', document_number: 'CC999', email: null, position_title: 'Jefe de Planta' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 10,
    })
    fireEvent.change(screen.getByLabelText('Firmante del Receptor'), { target: { value: 'Ana' } })
    fireEvent.click(await screen.findByText(/Ana Restrepo/))

    fireEvent.click(screen.getByRole('button', { name: 'Generar Manifiesto' }))

    await waitFor(() =>
      expect(createManifestUnloadMock).toHaveBeenCalledWith({
        unload_request_id: 12,
        receiver_person_id: 90,
        unload_date: undefined,
        observations: undefined,
      })
    )
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin/manifest-unloads/77'))
  })

  test('shows the API validation error when creation fails', async () => {
    currentUser = {
      id: 2,
      is_platform_staff: false,
      permissions: ['unload_requests.read', 'manifest_unloads.create'],
      tenant_organization_id: 2,
    }
    searchContactsMock.mockResolvedValue({
      data: [{ id: 90, first_name: 'Ana', last_name: 'Restrepo', document_number: 'CC999', email: null, position_title: null }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 10,
    })
    createManifestUnloadMock.mockRejectedValue(new Error('Ya existe un manifiesto de descargue activo para esta solicitud.'))
    render(<UnloadRequestDetailScreen unloadRequestId={12} />)
    await screen.findByText('SOL-1-ABCDEFGH')

    fireEvent.click(screen.getByRole('button', { name: 'Generar Manifiesto de Descargue' }))
    fireEvent.change(await screen.findByLabelText('Firmante del Receptor'), { target: { value: 'Ana' } })
    fireEvent.click(await screen.findByText(/Ana Restrepo/))
    fireEvent.click(screen.getByRole('button', { name: 'Generar Manifiesto' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya existe un manifiesto de descargue activo para esta solicitud.'
    )
  })
})
