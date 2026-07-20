import { render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { TransportScheduleDetailScreen } from './TransportScheduleDetailScreen'

const fetchTransportScheduleMock = vi.fn()
const submitTransportScheduleMock = vi.fn()
const confirmTransportScheduleMock = vi.fn()
const cancelTransportScheduleMock = vi.fn()
const createManifestLoadMock = vi.fn()
const searchContactsMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchTransportSchedule: (...args: unknown[]) => fetchTransportScheduleMock(...args),
    submitTransportSchedule: (...args: unknown[]) => submitTransportScheduleMock(...args),
    confirmTransportSchedule: (...args: unknown[]) => confirmTransportScheduleMock(...args),
    cancelTransportSchedule: (...args: unknown[]) => cancelTransportScheduleMock(...args),
    createManifestLoad: (...args: unknown[]) => createManifestLoadMock(...args),
    searchContacts: (...args: unknown[]) => searchContactsMock(...args),
  }
})

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[]; tenant_organization_id: number } | null = null

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

// Dialog (base-ui) depende de matchMedia/ResizeObserver, sin implementación
// en jsdom -- mismo setup ya usado por AppSidebar.test.tsx.
beforeAll(() => {
  window.matchMedia =
    window.matchMedia ??
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  window.ResizeObserver =
    window.ResizeObserver ??
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
})

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
    createManifestLoadMock.mockReset()
    searchContactsMock.mockReset()
    pushMock.mockReset()
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

// Punto de entrada de Manifiesto de Cargue, Fase 3 (2026-07-19, sin frame de
// Figma -- ver docblock del componente para la justificación de la
// precondición `CONF`).
describe('TransportScheduleDetailScreen -- Generar Manifiesto de Cargue', () => {
  beforeEach(() => {
    fetchTransportScheduleMock.mockResolvedValue({
      transport_schedule: baseSchedule({ transport_status: { id: 4, code: 'CONF', name: 'Confirmada', is_final: false } }),
    })
    searchContactsMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 10 })
  })

  afterEach(() => {
    fetchTransportScheduleMock.mockReset()
    createManifestLoadMock.mockReset()
    searchContactsMock.mockReset()
    pushMock.mockReset()
  })

  test('hides the action without manifest_loads.create', async () => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['transport_schedules.read'], tenant_organization_id: 1 }
    render(<TransportScheduleDetailScreen scheduleId={9} />)
    await screen.findByText('PRG-1-ABCDEFGH')

    expect(screen.queryByRole('button', { name: 'Generar Manifiesto de Cargue' })).not.toBeInTheDocument()
  })

  test('hides the action when the schedule is not CONF yet', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['transport_schedules.read', 'manifest_loads.create'],
      tenant_organization_id: 1,
    }
    fetchTransportScheduleMock.mockResolvedValue({
      transport_schedule: baseSchedule({ transport_status: { id: 2, code: 'PEND', name: 'Pend. Asignación', is_final: false } }),
    })
    render(<TransportScheduleDetailScreen scheduleId={9} />)
    await screen.findByText('PRG-1-ABCDEFGH')

    expect(screen.queryByRole('button', { name: 'Generar Manifiesto de Cargue' })).not.toBeInTheDocument()
  })

  test('shows the action for the owner organization with manifest_loads.create in CONF, creates the manifest and redirects', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['transport_schedules.read', 'manifest_loads.create'],
      tenant_organization_id: 1,
    }
    createManifestLoadMock.mockResolvedValue({ manifest_load: { id: 55, manifest_number: 'MAN-1-ABCDEFGH' } })
    render(<TransportScheduleDetailScreen scheduleId={9} />)
    await screen.findByText('PRG-1-ABCDEFGH')

    fireEvent.click(screen.getByRole('button', { name: 'Generar Manifiesto de Cargue' }))
    expect(await screen.findByRole('heading', { name: 'Generar Manifiesto de Cargue' })).toBeInTheDocument()

    // Sin seleccionar firmante -- debe mostrar el error de validación local.
    fireEvent.click(screen.getByRole('button', { name: 'Generar Manifiesto' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Selecciona el firmante del Generador.')
    expect(createManifestLoadMock).not.toHaveBeenCalled()

    searchContactsMock.mockResolvedValue({
      data: [{ id: 40, first_name: 'María', last_name: 'Gómez', document_number: 'CC123', email: null, position_title: 'Coordinadora HSE' }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 10,
    })
    fireEvent.change(screen.getByLabelText('Firmante del Generador'), { target: { value: 'María' } })
    fireEvent.click(await screen.findByText(/María Gómez/))

    fireEvent.click(screen.getByRole('button', { name: 'Generar Manifiesto' }))

    await waitFor(() =>
      expect(createManifestLoadMock).toHaveBeenCalledWith({
        transport_schedule_id: 9,
        generator_signer_person_id: 40,
        load_date: undefined,
        observations: undefined,
      })
    )
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin/manifest-loads/55'))
  })

  // Cierre del gap "0 resultados" (lote 2026-07-19): el firmante del
  // Generador se busca acotado a la organización Generadora de ESTA
  // programación, no a la del actor.
  test('forwards the transport_schedule_id to the contact search', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['transport_schedules.read', 'manifest_loads.create'],
      tenant_organization_id: 1,
    }
    render(<TransportScheduleDetailScreen scheduleId={9} />)
    await screen.findByText('PRG-1-ABCDEFGH')

    fireEvent.click(screen.getByRole('button', { name: 'Generar Manifiesto de Cargue' }))
    expect(await screen.findByRole('heading', { name: 'Generar Manifiesto de Cargue' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Firmante del Generador'), { target: { value: 'María' } })

    await waitFor(() =>
      expect(searchContactsMock).toHaveBeenCalledWith({ q: 'María', perPage: 10, transportScheduleId: 9 })
    )
  })

  test('shows the API validation error when creation fails', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['transport_schedules.read', 'manifest_loads.create'],
      tenant_organization_id: 1,
    }
    searchContactsMock.mockResolvedValue({
      data: [{ id: 40, first_name: 'María', last_name: 'Gómez', document_number: 'CC123', email: null, position_title: null }],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 10,
    })
    createManifestLoadMock.mockRejectedValue(new Error('La persona indicada no pertenece a la organización Generadora.'))
    render(<TransportScheduleDetailScreen scheduleId={9} />)
    await screen.findByText('PRG-1-ABCDEFGH')

    fireEvent.click(screen.getByRole('button', { name: 'Generar Manifiesto de Cargue' }))
    fireEvent.change(await screen.findByLabelText('Firmante del Generador'), { target: { value: 'María' } })
    fireEvent.click(await screen.findByText(/María Gómez/))
    fireEvent.click(screen.getByRole('button', { name: 'Generar Manifiesto' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La persona indicada no pertenece a la organización Generadora.'
    )
  })
})
