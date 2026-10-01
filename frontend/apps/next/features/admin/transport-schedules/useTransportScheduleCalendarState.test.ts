import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useTransportScheduleCalendarState } from './useTransportScheduleCalendarState'

const fetchServiceRequestsMock = vi.fn()
const fetchServiceRequestMock = vi.fn()
const fetchVehiclesMock = vi.fn()
const fetchTransportPersonnelMock = vi.fn()
const fetchBranchesMock = vi.fn()
const createTransportScheduleMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchServiceRequests: (...args: unknown[]) => fetchServiceRequestsMock(...args),
    fetchServiceRequest: (...args: unknown[]) => fetchServiceRequestMock(...args),
    fetchVehicles: (...args: unknown[]) => fetchVehiclesMock(...args),
    fetchTransportPersonnel: (...args: unknown[]) => fetchTransportPersonnelMock(...args),
    fetchBranches: (...args: unknown[]) => fetchBranchesMock(...args),
    createTransportSchedule: (...args: unknown[]) => createTransportScheduleMock(...args),
  }
})

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

const pendingRequest = {
  id: 1,
  uuid: 'uuid-1',
  organization_id: 10,
  request_code: 'SOL-2026-0142',
  requested_at: '2026-09-24T09:15:00-05:00',
  organization: { id: 10, legal_name: 'Textiles del Caribe S.A.S.' },
  branch: { id: 3, name: 'Bodega Central' },
}

const secondPendingRequest = {
  id: 2,
  uuid: 'uuid-2',
  organization_id: 10,
  request_code: 'SOL-2026-0139',
  requested_at: '2026-09-20T09:15:00-05:00',
  organization: { id: 10, legal_name: 'Constructora Los Cerros' },
  branch: { id: 3, name: 'Bodega Central' },
}

const eligibleItem = {
  id: 40,
  item_sequence: 1,
  waste_id: 20,
  waste_name_snapshot: 'Aceite usado',
  estimated_quantity: '10.00',
  item_status: { id: 2, code: 'ACCEPTED', name: 'Aceptado' },
}

function renderState(overrides: { isPlatformStaff?: boolean; effectiveOrganizationId?: number | null } = {}) {
  return renderHook(() =>
    useTransportScheduleCalendarState({
      effectiveOrganizationId: 'effectiveOrganizationId' in overrides ? (overrides.effectiveOrganizationId ?? null) : 10,
      isPlatformStaff: overrides.isPlatformStaff ?? false,
    })
  )
}

describe('useTransportScheduleCalendarState', () => {
  beforeEach(() => {
    fetchServiceRequestsMock.mockResolvedValue({ ...emptyPage, data: [pendingRequest, secondPendingRequest] })
    fetchServiceRequestMock.mockResolvedValue({
      service_request: { id: pendingRequest.id, branch: { id: 3, name: 'Bodega Central' }, items: [eligibleItem] },
    })
    fetchVehiclesMock.mockResolvedValue({ ...emptyPage, data: [{ id: 5, plate_number: 'ABC123' }] })
    fetchTransportPersonnelMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 6, person: { id: 1, full_name: 'Juan Pérez' } }],
    })
    fetchBranchesMock.mockResolvedValue({ ...emptyPage, data: [{ id: 4, name: 'Planta de Tratamiento' }] })
    createTransportScheduleMock.mockResolvedValue({ transport_schedule: { id: 99, schedule_number: 'PRG-10-XYZ' } })
  })

  afterEach(() => {
    fetchServiceRequestsMock.mockReset()
    fetchServiceRequestMock.mockReset()
    fetchVehiclesMock.mockReset()
    fetchTransportPersonnelMock.mockReset()
    fetchBranchesMock.mockReset()
    createTransportScheduleMock.mockReset()
  })

  test('does not fetch anything without an effective organization', () => {
    renderState({ effectiveOrganizationId: null })

    expect(fetchServiceRequestsMock).not.toHaveBeenCalled()
    expect(fetchVehiclesMock).not.toHaveBeenCalled()
  })

  test('loads real pending requests sorted by requested_at, and the vehicle/personnel/branch catalogs', async () => {
    const { result } = renderState()

    await waitFor(() => expect(result.current.pendingRequests).toHaveLength(2))
    expect(result.current.pendingRequests.map((item) => item.id)).toEqual([2, 1])
    await waitFor(() => expect(result.current.vehicles).toHaveLength(1))
    expect(result.current.personnel).toHaveLength(1)
    expect(result.current.branches).toHaveLength(1)
    expect(result.current.scheduledEvents).toEqual([])
    expect(result.current.isDialogOpen).toBe(false)
  })

  test('beginDrop opens the dialog and resolves the eligible items for that request', async () => {
    const { result } = renderState()
    await waitFor(() => expect(result.current.pendingRequests).toHaveLength(2))

    act(() => {
      result.current.beginDrop(1, '2026-09-30T10:00:00-05:00', false)
    })

    expect(result.current.isDialogOpen).toBe(true)
    expect(result.current.pendingDrop?.request.id).toBe(1)
    expect(result.current.pendingDrop?.isLoadingItems).toBe(true)

    await waitFor(() => expect(result.current.pendingDrop?.isLoadingItems).toBe(false))
    expect(result.current.pendingDrop?.eligibleItems).toEqual([eligibleItem])
    expect(result.current.pendingDrop?.sourceBranchId).toBe(3)
    expect(result.current.pendingDrop?.itemsError).toBeNull()
  })

  test('beginDrop with an unknown request id does not open the dialog', async () => {
    const { result } = renderState()
    await waitFor(() => expect(result.current.pendingRequests).toHaveLength(2))

    act(() => {
      result.current.beginDrop(999999, '2026-09-30T10:00:00-05:00', false)
    })

    expect(result.current.isDialogOpen).toBe(false)
    expect(result.current.pendingDrop).toBeNull()
  })

  test('a request with no eligible items blocks confirmation with the expected message', async () => {
    fetchServiceRequestMock.mockResolvedValue({
      service_request: { id: 1, branch: { id: 3, name: 'Bodega Central' }, items: [] },
    })
    const { result } = renderState()
    await waitFor(() => expect(result.current.pendingRequests).toHaveLength(2))

    act(() => {
      result.current.beginDrop(1, '2026-09-30T10:00:00-05:00', false)
    })
    await waitFor(() => expect(result.current.pendingDrop?.isLoadingItems).toBe(false))

    expect(result.current.pendingDrop?.eligibleItems).toEqual([])
    expect(result.current.pendingDrop?.itemsError).toBe(
      'Esta solicitud no tiene ítems Aceptados pendientes de programar para su organización.'
    )

    await act(async () => {
      await result.current.confirmAssignment({ driverId: 6, assistantId: null, vehicleId: 5, destinationBranchId: 4 })
    })

    expect(createTransportScheduleMock).not.toHaveBeenCalled()
  })

  test('confirmAssignment creates a real transport schedule with all eligible items at their full estimated quantity, and assistant_personnel_id null when not chosen', async () => {
    const { result } = renderState()
    await waitFor(() => expect(result.current.pendingRequests).toHaveLength(2))

    act(() => {
      result.current.beginDrop(1, '2026-09-30T10:00:00-05:00', false)
    })
    await waitFor(() => expect(result.current.pendingDrop?.isLoadingItems).toBe(false))

    await act(async () => {
      await result.current.confirmAssignment({ driverId: 6, assistantId: null, vehicleId: 5, destinationBranchId: 4 })
    })

    expect(createTransportScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        waste_service_request_id: 1,
        vehicle_id: 5,
        transport_personnel_id: 6,
        assistant_personnel_id: null,
        source_branch_id: 3,
        destination_branch_id: 4,
        scheduled_pickup_at: '2026-09-30T10:00:00-05:00',
        priority: 'MEDIUM',
        requires_special_handling: false,
        items: [{ waste_service_request_item_id: 40, scheduled_quantity: 10 }],
      })
    )
    expect(result.current.pendingRequests.some((item) => item.id === 1)).toBe(false)
    expect(result.current.scheduledEvents).toHaveLength(1)
    expect(result.current.scheduledEvents[0]).toMatchObject({
      start: '2026-09-30T10:00:00-05:00',
      allDay: false,
      extendedProps: expect.objectContaining({
        request_code: 'SOL-2026-0142',
        driver_name: 'Juan Pérez',
        assistant_name: '—',
        vehicle_label: 'ABC123',
      }),
    })
    expect(result.current.isDialogOpen).toBe(false)
    expect(result.current.pendingDrop).toBeNull()
  })

  test('confirmAssignment includes assistant_personnel_id when an assistant is chosen', async () => {
    const { result } = renderState()
    await waitFor(() => expect(result.current.pendingRequests).toHaveLength(2))

    act(() => {
      result.current.beginDrop(1, '2026-09-30T10:00:00-05:00', false)
    })
    await waitFor(() => expect(result.current.pendingDrop?.isLoadingItems).toBe(false))

    await act(async () => {
      await result.current.confirmAssignment({ driverId: 6, assistantId: 6, vehicleId: 5, destinationBranchId: 4 })
    })

    expect(createTransportScheduleMock).toHaveBeenCalledWith(expect.objectContaining({ assistant_personnel_id: 6 }))
  })

  test('shows a readable error and keeps the flow usable when the API call fails', async () => {
    createTransportScheduleMock.mockRejectedValue(new Error('Vehículo no disponible.'))
    const { result } = renderState()
    await waitFor(() => expect(result.current.pendingRequests).toHaveLength(2))

    act(() => {
      result.current.beginDrop(1, '2026-09-30T10:00:00-05:00', false)
    })
    await waitFor(() => expect(result.current.pendingDrop?.isLoadingItems).toBe(false))

    await act(async () => {
      await result.current.confirmAssignment({ driverId: 6, assistantId: null, vehicleId: 5, destinationBranchId: 4 })
    })

    expect(result.current.creationError).toBe('Vehículo no disponible.')
    expect(result.current.isDialogOpen).toBe(true)
    expect(result.current.pendingDrop).not.toBeNull()
    expect(result.current.pendingRequests.some((item) => item.id === 1)).toBe(true)
  })

  test('cancelAssignment closes the dialog and keeps the request pending', async () => {
    const { result } = renderState()
    await waitFor(() => expect(result.current.pendingRequests).toHaveLength(2))

    act(() => {
      result.current.beginDrop(1, '2026-09-30T10:00:00-05:00', false)
    })
    act(() => {
      result.current.cancelAssignment()
    })

    expect(result.current.isDialogOpen).toBe(false)
    expect(result.current.pendingDrop).toBeNull()
    expect(result.current.pendingRequests).toHaveLength(2)
    expect(result.current.scheduledEvents).toHaveLength(0)
  })
})
