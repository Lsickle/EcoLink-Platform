import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CreateTransportScheduleForm } from './CreateTransportScheduleForm'

const createTransportScheduleMock = vi.fn()
const fetchVehiclesMock = vi.fn()
const fetchTransportPersonnelMock = vi.fn()
const fetchBranchesMock = vi.fn()
const fetchServiceRequestsMock = vi.fn()
const fetchServiceRequestMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createTransportSchedule: (...args: unknown[]) => createTransportScheduleMock(...args),
    fetchVehicles: (...args: unknown[]) => fetchVehiclesMock(...args),
    fetchTransportPersonnel: (...args: unknown[]) => fetchTransportPersonnelMock(...args),
    fetchBranches: (...args: unknown[]) => fetchBranchesMock(...args),
    fetchServiceRequests: (...args: unknown[]) => fetchServiceRequestsMock(...args),
    fetchServiceRequest: (...args: unknown[]) => fetchServiceRequestMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; tenant_organization_id: number; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  tenant_organization_id: 10,
  permissions: ['transport_schedules.create'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

describe('CreateTransportScheduleForm', () => {
  beforeEach(() => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      tenant_organization_id: 10,
      permissions: ['transport_schedules.create'],
    }
    fetchVehiclesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 5, plate_number: 'ABC123' }],
      kpis: { total: 1, active: 1, inactive: 0 },
    })
    fetchTransportPersonnelMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 6, license_number: 'C2-12345', person: { id: 1, full_name: 'Juan Pérez', document_number: '123' } }],
    })
    fetchBranchesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 4, name: 'Planta de Tratamiento' }],
      kpis: { total: 1, active: 1, inactive: 0, suspended: 0 },
    })
    fetchServiceRequestsMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 7, request_code: 'SR-1-ABCDEFGH', branch: { id: 3, name: 'Bodega Central' } }],
    })
    fetchServiceRequestMock.mockResolvedValue({
      service_request: {
        id: 7,
        request_code: 'SR-1-ABCDEFGH',
        branch: { id: 3, name: 'Bodega Central' },
        items: [
          {
            id: 40,
            item_sequence: 1,
            waste_id: 20,
            waste_name_snapshot: 'Aceite usado',
            estimated_quantity: '10.00',
            item_status: { id: 2, code: 'ACCEPTED', name: 'Aceptado' },
            waste_treatment_approval: { organization: { id: 10, legal_name: 'Gestor Ambiental S.A.S.' } },
          },
        ],
      },
    })
  })

  afterEach(() => {
    createTransportScheduleMock.mockReset()
    fetchVehiclesMock.mockReset()
    fetchTransportPersonnelMock.mockReset()
    fetchBranchesMock.mockReset()
    fetchServiceRequestsMock.mockReset()
    fetchServiceRequestMock.mockReset()
    pushMock.mockReset()
  })

  async function selectServiceRequest() {
    fireEvent.change(screen.getByLabelText('Solicitud de Servicio de Origen'), { target: { value: 'SR-1' } })
    const option = await screen.findByRole('button', { name: /SR-1-ABCDEFGH/ })
    fireEvent.click(option)
    await screen.findByText(/Aceite usado/)
  }

  test('hides the "Organización que programa" selector for a non-platform-staff actor', async () => {
    render(<CreateTransportScheduleForm />)
    await screen.findByLabelText('Solicitud de Servicio de Origen')

    expect(screen.queryByLabelText('Organización que programa')).not.toBeInTheDocument()
  })

  test('searches and selects the source service request, listing its accepted items', async () => {
    render(<CreateTransportScheduleForm />)
    await selectServiceRequest()

    expect(screen.getByText(/SR-1-ABCDEFGH · Bodega Central/)).toBeInTheDocument()
    expect(screen.getByText('Aceite usado')).toBeInTheDocument()
  })

  test('shows a notice when the organization has no active drivers', async () => {
    fetchTransportPersonnelMock.mockResolvedValue(emptyPage)
    render(<CreateTransportScheduleForm />)
    await screen.findByLabelText('Solicitud de Servicio de Origen')

    expect(await screen.findByText(/no tiene conductores activos registrados/)).toBeInTheDocument()
  })

  test('requires at least one selected item, a vehicle and a pickup date before submitting', async () => {
    render(<CreateTransportScheduleForm />)
    await selectServiceRequest()

    fireEvent.click(screen.getByRole('button', { name: 'Crear Programación' }))

    expect(await screen.findByText('Selecciona al menos un ítem para programar.')).toBeInTheDocument()
    expect(createTransportScheduleMock).not.toHaveBeenCalled()
  })

  test('creates a transport schedule with the selected item and redirects to the detail page', async () => {
    createTransportScheduleMock.mockResolvedValueOnce({ transport_schedule: { id: 99, schedule_number: 'PRG-10-XYZ' } })
    render(<CreateTransportScheduleForm />)
    await selectServiceRequest()

    fireEvent.click(screen.getByRole('checkbox', { name: /Seleccionar ítem Aceite usado/ }))

    fireEvent.click(screen.getByLabelText('Vehículo'))
    const vehicleOption = await screen.findByRole('option', { name: 'ABC123' })
    await act(async () => {
      fireEvent.pointerDown(vehicleOption)
      fireEvent.click(vehicleOption)
    })

    fireEvent.click(screen.getByLabelText('Sede de Destino'))
    const branchOption = await screen.findByRole('option', { name: 'Planta de Tratamiento' })
    await act(async () => {
      fireEvent.pointerDown(branchOption)
      fireEvent.click(branchOption)
    })

    fireEvent.click(screen.getByLabelText('Conductor'))
    const driverOption = await screen.findByRole('option', { name: /Juan Pérez/ })
    await act(async () => {
      fireEvent.pointerDown(driverOption)
      fireEvent.click(driverOption)
    })

    fireEvent.change(screen.getByLabelText('Fecha y Hora Programada de Recolección'), {
      target: { value: '2026-08-01T10:00' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Crear Programación' }))

    await waitFor(() => expect(createTransportScheduleMock).toHaveBeenCalled())
    expect(createTransportScheduleMock).toHaveBeenCalledWith(
      expect.objectContaining({
        waste_service_request_id: 7,
        vehicle_id: 5,
        transport_personnel_id: 6,
        source_branch_id: 3,
        destination_branch_id: 4,
        scheduled_pickup_at: '2026-08-01T10:00',
        items: [{ waste_service_request_item_id: 40, scheduled_quantity: 10 }],
      })
    )
    expect(pushMock).toHaveBeenCalledWith('/admin/transport-schedules/99')
  })
})
