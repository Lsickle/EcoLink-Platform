import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ServiceRequestDetailScreen } from './ServiceRequestDetailScreen'

const fetchServiceRequestMock = vi.fn()
const submitServiceRequestMock = vi.fn()
const cancelServiceRequestMock = vi.fn()
const fetchCancellationReasonsMock = vi.fn()
const approveServiceRequestItemMock = vi.fn()
const rejectServiceRequestItemMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchServiceRequest: (...args: unknown[]) => fetchServiceRequestMock(...args),
    submitServiceRequest: (...args: unknown[]) => submitServiceRequestMock(...args),
    cancelServiceRequest: (...args: unknown[]) => cancelServiceRequestMock(...args),
    fetchCancellationReasons: (...args: unknown[]) => fetchCancellationReasonsMock(...args),
    approveServiceRequestItem: (...args: unknown[]) => approveServiceRequestItemMock(...args),
    rejectServiceRequestItem: (...args: unknown[]) => rejectServiceRequestItemMock(...args),
  }
})

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[]; tenant_organization_id: number } | null = null

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const DRAFT_STATUS = {
  id: 1,
  code: 'DRAFT',
  name: 'Borrador',
  sequence_order: 1,
  is_initial_status: true,
  is_terminal_status: false,
  is_system_status: true,
  blocks_editing: false,
}

function baseServiceRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
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
    estimated_total_weight: '850.00',
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
    observations: 'Coordinar con el jefe de bodega.',
    request_source: 'PORTAL',
    priority: 'HIGH',
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
    service_status: DRAFT_STATUS,
    cancellation_reason: null,
    measurement_unit: null,
    items: [
      {
        id: 40,
        uuid: 'sri-40',
        service_request_id: 7,
        item_sequence: 1,
        waste_id: 20,
        waste_treatment_approval_id: 100,
        waste_name_snapshot: 'Aceite Lubricante Usado',
        waste_code_snapshot: 'RSI-001',
        treatment_snapshot: 'Coprocesamiento',
        estimated_quantity: '850.00',
        actual_quantity: null,
        estimated_weight: null,
        actual_weight: null,
        measurement_unit_id: 1,
        packaging_type: 'Tambor',
        physical_state_id: null,
        is_stackable: false,
        requires_forklift: false,
        requires_isolation: false,
        height: null,
        width: null,
        length: null,
        calculated_volume: null,
        item_status_id: 1,
        observations: null,
        is_active: true,
        metadata: null,
        created_at: '',
        updated_at: '',
        waste: { id: 20, name: 'Aceite Lubricante Usado', code: 'RSI-001', organization_id: 1 },
        waste_treatment_approval: {
          id: 100,
          organization: { id: 2, legal_name: 'EcoGestor SAS' },
          branch_treatment: { id: 10, treatment: { id: 3, name: 'Coprocesamiento' } },
        },
        item_status: { id: 1, code: 'PENDING', name: 'Pendiente' },
        measurement_unit: { id: 1, uuid: 'mu-1', code: 'KG', name: 'Kilogramo', is_system: true, is_active: true, created_at: '', updated_at: '' },
        physical_state: null,
      },
    ],
    ...overrides,
  }
}

describe('ServiceRequestDetailScreen', () => {
  beforeEach(() => {
    submitServiceRequestMock.mockResolvedValue({ service_request: { id: 7 } })
    cancelServiceRequestMock.mockResolvedValue({ service_request: { id: 7 } })
    fetchCancellationReasonsMock.mockResolvedValue({
      data: [
        { id: 1, code: 'NO_LONGER_NEEDED', name: 'Ya no se necesita el servicio', is_other: false, is_system: true, is_active: true },
        { id: 2, code: 'OTHER', name: 'Otra razón', is_other: true, is_system: true, is_active: true },
      ],
    })
    approveServiceRequestItemMock.mockResolvedValue({ item: { id: 40 } })
    rejectServiceRequestItemMock.mockResolvedValue({ item: { id: 40 } })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('the owning Generador sees the full item and header actions (Enviar/Cancelar) in DRAFT', async () => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['service_requests.update', 'service_requests.cancel'], tenant_organization_id: 1 }
    fetchServiceRequestMock.mockResolvedValue({ service_request: baseServiceRequest() })

    render(<ServiceRequestDetailScreen serviceRequestId={7} />)

    await screen.findByText('SR-1-ABCDEFGH')
    expect(screen.getByText('Aceite Lubricante Usado')).toBeInTheDocument()
    expect(screen.getByText('Coprocesamiento')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar Solicitud' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar Solicitud' })).toBeInTheDocument()
  })

  test('clicking "Cancelar Solicitud" loads the real motives catalog and confirms with the selected reason', async () => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['service_requests.update', 'service_requests.cancel'], tenant_organization_id: 1 }
    fetchServiceRequestMock.mockResolvedValue({ service_request: baseServiceRequest() })

    render(<ServiceRequestDetailScreen serviceRequestId={7} />)
    await screen.findByText('SR-1-ABCDEFGH')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar Solicitud' }))

    await vi.waitFor(() => expect(fetchCancellationReasonsMock).toHaveBeenCalledWith({ activeOnly: true }))
    const confirmButton = await screen.findByRole('button', { name: 'Confirmar Cancelación' })
    expect(confirmButton).toBeDisabled()

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Motivo de Cancelación *'))
    })
    const reasonOption = await screen.findByRole('option', { name: 'Ya no se necesita el servicio' })
    await act(async () => {
      fireEvent.pointerDown(reasonOption)
      fireEvent.click(reasonOption)
    })

    expect(confirmButton).toBeEnabled()
    fireEvent.click(confirmButton)

    await vi.waitFor(() =>
      expect(cancelServiceRequestMock).toHaveBeenCalledWith(7, { cancellation_reason_id: 1, cancellation_details: undefined })
    )
  })

  test('selecting the "Otra razón" motive requires cancellation details before confirming', async () => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['service_requests.update', 'service_requests.cancel'], tenant_organization_id: 1 }
    fetchServiceRequestMock.mockResolvedValue({ service_request: baseServiceRequest() })

    render(<ServiceRequestDetailScreen serviceRequestId={7} />)
    await screen.findByText('SR-1-ABCDEFGH')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar Solicitud' }))
    const confirmButton = await screen.findByRole('button', { name: 'Confirmar Cancelación' })

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Motivo de Cancelación *'))
    })
    const otherOption = await screen.findByRole('option', { name: 'Otra razón' })
    await act(async () => {
      fireEvent.pointerDown(otherOption)
      fireEvent.click(otherOption)
    })

    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Detalle de la cancelación/), { target: { value: 'Cambio de proveedor.' } })
    expect(confirmButton).toBeEnabled()

    fireEvent.click(confirmButton)
    await vi.waitFor(() =>
      expect(cancelServiceRequestMock).toHaveBeenCalledWith(7, {
        cancellation_reason_id: 2,
        cancellation_details: 'Cambio de proveedor.',
      })
    )
  })

  test('clicking "Enviar Solicitud" calls submitServiceRequest and reloads', async () => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['service_requests.update'], tenant_organization_id: 1 }
    fetchServiceRequestMock.mockResolvedValue({ service_request: baseServiceRequest() })

    render(<ServiceRequestDetailScreen serviceRequestId={7} />)
    await screen.findByText('SR-1-ABCDEFGH')

    fireEvent.click(screen.getByRole('button', { name: 'Enviar Solicitud' }))

    await vi.waitFor(() => expect(submitServiceRequestMock).toHaveBeenCalledWith(7))
    await vi.waitFor(() => expect(fetchServiceRequestMock).toHaveBeenCalledTimes(2))
  })

  test('a Gestor who owns the item sees "Aprobar"/"Rechazar", but not the header Enviar/Cancelar actions', async () => {
    currentUser = { id: 2, is_platform_staff: false, permissions: ['service_requests.evaluate'], tenant_organization_id: 2 }
    fetchServiceRequestMock.mockResolvedValue({ service_request: baseServiceRequest() })

    render(<ServiceRequestDetailScreen serviceRequestId={7} />)
    await screen.findByText('SR-1-ABCDEFGH')

    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enviar Solicitud' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar Solicitud' })).not.toBeInTheDocument()
  })

  test('clicking "Aprobar" calls approveServiceRequestItem for that item', async () => {
    currentUser = { id: 2, is_platform_staff: false, permissions: ['service_requests.evaluate'], tenant_organization_id: 2 }
    fetchServiceRequestMock.mockResolvedValue({ service_request: baseServiceRequest() })

    render(<ServiceRequestDetailScreen serviceRequestId={7} />)
    await screen.findByText('SR-1-ABCDEFGH')

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))

    await vi.waitFor(() => expect(approveServiceRequestItemMock).toHaveBeenCalledWith(40))
  })

  test('rejecting an item requires a reason before confirming', async () => {
    currentUser = { id: 2, is_platform_staff: false, permissions: ['service_requests.evaluate'], tenant_organization_id: 2 }
    fetchServiceRequestMock.mockResolvedValue({ service_request: baseServiceRequest() })

    render(<ServiceRequestDetailScreen serviceRequestId={7} />)
    await screen.findByText('SR-1-ABCDEFGH')

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    const confirmButton = await screen.findByRole('button', { name: 'Confirmar Rechazo' })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Motivo del rechazo/), { target: { value: 'No cumple con el empaque requerido.' } })
    expect(confirmButton).toBeEnabled()

    fireEvent.click(confirmButton)
    await vi.waitFor(() =>
      expect(rejectServiceRequestItemMock).toHaveBeenCalledWith(40, { notes: 'No cumple con el empaque requerido.' })
    )
  })

  test('a Gestor with no items of their own in this request cannot evaluate anything', async () => {
    currentUser = { id: 3, is_platform_staff: false, permissions: ['service_requests.evaluate'], tenant_organization_id: 3 }
    fetchServiceRequestMock.mockResolvedValue({ service_request: baseServiceRequest() })

    render(<ServiceRequestDetailScreen serviceRequestId={7} />)
    await screen.findByText('SR-1-ABCDEFGH')

    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument()
  })

  test('renders reduced items (other Gestor) with the "other_items_count" badge, without leaking their data', async () => {
    currentUser = { id: 2, is_platform_staff: false, permissions: [], tenant_organization_id: 2 }
    fetchServiceRequestMock.mockResolvedValue({
      service_request: baseServiceRequest({
        items: [
          { id: 40, item_sequence: 1 },
          {
            id: 41,
            uuid: 'sri-41',
            service_request_id: 7,
            item_sequence: 2,
            waste_id: 21,
            waste_treatment_approval_id: 101,
            waste_name_snapshot: 'Envases Contaminados',
            waste_code_snapshot: 'RSI-003',
            treatment_snapshot: 'Reciclaje',
            estimated_quantity: '100.00',
            actual_quantity: null,
            estimated_weight: null,
            actual_weight: null,
            measurement_unit_id: 1,
            packaging_type: null,
            physical_state_id: null,
            is_stackable: false,
            requires_forklift: false,
            requires_isolation: false,
            height: null,
            width: null,
            length: null,
            calculated_volume: null,
            item_status_id: 1,
            observations: null,
            is_active: true,
            metadata: null,
            created_at: '',
            updated_at: '',
            waste: { id: 21, name: 'Envases Contaminados', code: 'RSI-003', organization_id: 1 },
            waste_treatment_approval: {
              id: 101,
              organization: { id: 2, legal_name: 'EcoGestor SAS' },
              branch_treatment: { id: 11, treatment: { id: 5, name: 'Reciclaje' } },
            },
            item_status: { id: 1, code: 'PENDING', name: 'Pendiente' },
            measurement_unit: { id: 1, uuid: 'mu-1', code: 'KG', name: 'Kilogramo', is_system: true, is_active: true, created_at: '', updated_at: '' },
            physical_state: null,
          },
        ],
        other_items_count: 1,
      }),
    })

    render(<ServiceRequestDetailScreen serviceRequestId={7} />)
    await screen.findByText('SR-1-ABCDEFGH')

    expect(screen.getByText('+1 ítem(s) de otros Gestores')).toBeInTheDocument()
    expect(screen.getByText('Ítem de otro Gestor -- sin acceso al detalle.')).toBeInTheDocument()
    expect(screen.getByText('Envases Contaminados')).toBeInTheDocument()
  })
})
