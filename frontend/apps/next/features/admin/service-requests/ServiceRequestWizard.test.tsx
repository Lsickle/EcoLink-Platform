import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ServiceRequestWizard } from './ServiceRequestWizard'

const fetchBranchesMock = vi.fn()
const fetchMeasurementUnitsMock = vi.fn()
const fetchPhysicalStatesMock = vi.fn()
const fetchPackagingTypesMock = vi.fn()
const fetchServiceRequestCounterpartiesMock = vi.fn()
const fetchEligibleWastesForCounterpartyMock = vi.fn()
const createServiceRequestMock = vi.fn()
const updateServiceRequestMock = vi.fn()
const submitServiceRequestMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchBranches: (...args: unknown[]) => fetchBranchesMock(...args),
    fetchMeasurementUnits: (...args: unknown[]) => fetchMeasurementUnitsMock(...args),
    fetchPhysicalStates: (...args: unknown[]) => fetchPhysicalStatesMock(...args),
    fetchPackagingTypes: (...args: unknown[]) => fetchPackagingTypesMock(...args),
    fetchServiceRequestCounterparties: (...args: unknown[]) => fetchServiceRequestCounterpartiesMock(...args),
    fetchEligibleWastesForCounterparty: (...args: unknown[]) => fetchEligibleWastesForCounterpartyMock(...args),
    createServiceRequest: (...args: unknown[]) => createServiceRequestMock(...args),
    updateServiceRequest: (...args: unknown[]) => updateServiceRequestMock(...args),
    submitServiceRequest: (...args: unknown[]) => submitServiceRequestMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[]; tenant_organization_id: number } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['service_requests.create', 'service_requests.update'],
  tenant_organization_id: 1,
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function waste(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 20,
    uuid: 'w-20',
    organization_id: 1,
    branch_id: null,
    waste_category_id: 1,
    code: 'RSI-001',
    name: 'Aceite Lubricante Usado',
    description: null,
    status: 'CLS',
    waste_danger: null,
    waste_type_id: 1,
    is_template: false,
    is_preapproved: false,
    preapproved_by_organization_id: null,
    requires_characterization: false,
    requires_sds: false,
    physical_state_id: null,
    measurement_unit_id: 1,
    average_weight: null,
    generation_frequency_id: null,
    requires_special_transport: false,
    requires_special_ppe: false,
    operational_status_id: 1,
    quantity: null,
    generation_date: null,
    internal_reference: null,
    operational_notes: null,
    is_active: true,
    created_at: '',
    updated_at: '',
    created_by: null,
    updated_by: null,
    waste_category: { id: 1, code: 'INDUSTRIAL', name: 'Industrial' },
    ...overrides,
  }
}

function viableApproval(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 100,
    uuid: 'ta-100',
    tenant_organization_id: null,
    organization_id: 2,
    waste_id: 20,
    branch_treatment_id: 10,
    version: 1,
    commercial_status: 'APPROVED',
    technical_status: 'APPROVED',
    unit_price: '150.00',
    currency: 'COP',
    billing_unit: 'KG',
    minimum_quantity: null,
    maximum_quantity: null,
    requires_lab_analysis: false,
    requires_sds: false,
    restrictions: null,
    commercial_notes: null,
    technical_notes: null,
    technical_approved_at: null,
    technical_approved_by: null,
    commercial_approved_at: null,
    commercial_approved_by: null,
    valid_from: null,
    valid_until: null,
    is_active: true,
    metadata: null,
    created_at: '',
    updated_at: '',
    organization: { id: 2, legal_name: 'EcoGestor SAS' },
    branch_treatment: {
      id: 10,
      operational_name: 'Horno 1',
      branch_id: 7,
      treatment_id: 3,
      max_capacity: null,
      capacity_unit: 'KG',
      treatment: { id: 3, name: 'Coprocesamiento' },
      branch: { id: 7, name: 'Planta Norte' },
    },
    ...overrides,
  }
}

// Residuo elegible tal como lo devuelve `GET /service-requests/eligible-wastes`
// (2026-08-18): ya viene acotado a la contraparte y con la atribución resuelta
// por el backend.
function eligibleWaste(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    waste: { id: 20, name: 'Aceite Lubricante Usado', code: 'RSI-001', waste_category: { id: 1, name: 'Aceites' } },
    approvals: [
      { id: 100, gestor_organization_id: 3, gestor_name: 'EcoGestor SAS', treatment_name: 'Coprocesamiento' },
    ],
    ...overrides,
  }
}

async function elegirDestinatario() {
  await screen.findByRole('heading', { name: 'Paso 1 de 6 — Información General' })
  fireEvent.click(await screen.findByRole('combobox', { name: /Destinatario de la Solicitud/ }))
  fireEvent.click(await screen.findByRole('option', { name: /EcoGestor SAS/ }))
}

async function goToStep2() {
  await elegirDestinatario()
  fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))
  await screen.findByRole('heading', { name: 'Paso 2 de 6 — Selección de Residuos' })
}

describe('ServiceRequestWizard', () => {
  beforeEach(() => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['service_requests.create', 'service_requests.update'],
      tenant_organization_id: 1,
    }
    fetchBranchesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 3, uuid: 'br-3', name: 'Sede Principal', organization_id: 1 }],
    })
    fetchMeasurementUnitsMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'mu-1', code: 'KG', name: 'Kilogramo', is_system: true, is_active: true, created_at: '', updated_at: '' }],
    })
    fetchPhysicalStatesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'ps-1', code: 'LIQUID', name: 'Líquido', is_system: true, is_active: true, created_at: '', updated_at: '' }],
    })
    fetchPackagingTypesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'pt-1', code: 'DRUM', name: 'Tambor', is_system: true, is_active: true, created_at: '', updated_at: '' }],
    })
    fetchServiceRequestCounterpartiesMock.mockResolvedValue({
      counterparties: [
        { id: 3, legal_name: 'EcoGestor SAS', tax_id: '900123456-1', role: 'GESTOR', ready_wastes_count: 1 },
      ],
    })
    fetchEligibleWastesForCounterpartyMock.mockResolvedValue({ wastes: [eligibleWaste()] })
    createServiceRequestMock.mockResolvedValue({ service_request: { id: 500, request_code: 'SR-1-ABCDEFGH' } })
    submitServiceRequestMock.mockResolvedValue({ service_request: { id: 500 } })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('hides the "Organización" selector for a tenant actor and shows Step 1', async () => {
    render(<ServiceRequestWizard />)
    await screen.findByRole('heading', { name: 'Paso 1 de 6 — Información General' })

    expect(screen.queryByLabelText('Organización')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Sede Solicitante *')).toBeInTheDocument()
  })

  // La elegibilidad se resolvía en el cliente: se pedían TODOS los residuos
  // `APR` y luego sus evaluaciones RESIDUO POR RESIDUO (N+1 de red), y el
  // wizard filtraba por eje técnico. Desde el destinatario único (2026-08-18)
  // eso vive en el backend, que además acota a la contraparte elegida -- las
  // reglas de elegibilidad se prueban en `ServiceRequestControllerTest`.
  test('el Paso 2 pide los residuos ya acotados a la contraparte, en UNA sola llamada', async () => {
    render(<ServiceRequestWizard />)
    await goToStep2()

    await vi.waitFor(() => expect(fetchEligibleWastesForCounterpartyMock).toHaveBeenCalledWith(3, expect.anything()))
    expect(fetchEligibleWastesForCounterpartyMock).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Aceite Lubricante Usado')).toBeInTheDocument()
    expect(screen.getByText(/Coprocesamiento/)).toBeInTheDocument()
  })

  // El wizard ya no vuelve a filtrar lo que el backend devolvió: si lo hiciera,
  // las dos reglas se separarían con el tiempo.
  test('muestra lo que devuelve el backend, sin filtrar de nuevo en el cliente', async () => {
    fetchEligibleWastesForCounterpartyMock.mockResolvedValue({
      wastes: [
        eligibleWaste(),
        eligibleWaste({ waste: { id: 21, name: 'Solvente Agotado', code: 'RSI-002', waste_category: null } }),
      ],
    })

    render(<ServiceRequestWizard />)
    await goToStep2()

    expect(await screen.findByText('Aceite Lubricante Usado')).toBeInTheDocument()
    expect(screen.getByText('Solvente Agotado')).toBeInTheDocument()
  })

  // El destinatario ANTES que los residuos: sin él no hay nada que ofrecer.
  test('el Paso 2 no pide residuos mientras no haya destinatario', async () => {
    render(<ServiceRequestWizard />)
    await screen.findByRole('heading', { name: 'Paso 1 de 6 — Información General' })
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))

    await screen.findByRole('heading', { name: 'Paso 2 de 6 — Selección de Residuos' })
    expect(fetchEligibleWastesForCounterpartyMock).not.toHaveBeenCalled()
  })

  // NO se prueba aquí que cambiar de destinatario descarte los residuos ya
  // elegidos, aunque el componente lo haga (`setItems([])` en el
  // `onValueChange` del selector): abrir el Select de Base UI una SEGUNDA vez
  // no registra en jsdom, y forzarlo daría un test que pasa por accidente.
  // La garantía de fondo no depende de la UI: `store()` rechaza cualquier ítem
  // que no resuelva al destinatario elegido, así que una selección obsoleta se
  // frena en el backend -- cubierto en `ServiceRequestControllerTest`.

  // El rol distingue por dónde entra la contraparte, y los residuos listos
  // evitan que se elija un destinatario que lleve a un paso 2 vacío.
  test('el selector de destinatario muestra el rol y cuántos residuos hay listos', async () => {
    render(<ServiceRequestWizard />)
    await screen.findByRole('heading', { name: 'Paso 1 de 6 — Información General' })
    fireEvent.click(await screen.findByRole('combobox', { name: /Destinatario de la Solicitud/ }))

    expect(await screen.findByRole('option', { name: /EcoGestor SAS · Gestor · 1 residuo\(s\) listo\(s\)/ })).toBeInTheDocument()
  })

  test('si no hay contrapartes con residuos listos lo explica, en vez de dejar el selector vacío', async () => {
    fetchServiceRequestCounterpartiesMock.mockResolvedValue({ counterparties: [] })

    render(<ServiceRequestWizard />)
    await screen.findByRole('heading', { name: 'Paso 1 de 6 — Información General' })

    expect(await screen.findByText(/No hay Gestores ni Subgestores con residuos aprobados/i)).toBeInTheDocument()
  })

  test('"Guardar Borrador" without any selected item shows a validation error and does not call the API', async () => {
    render(<ServiceRequestWizard />)
    await screen.findByRole('heading', { name: 'Paso 1 de 6 — Información General' })

    fireEvent.click(screen.getByRole('button', { name: 'Guardar Borrador' }))

    expect(await screen.findByText(/Debe seleccionar al menos un residuo/)).toBeInTheDocument()
    expect(createServiceRequestMock).not.toHaveBeenCalled()
  })

  test('selecting a waste in Step 2 adds it to "Residuos Seleccionados" with its quantity/unit inputs', async () => {
    render(<ServiceRequestWizard />)
    await goToStep2()

    const checkbox = await screen.findByRole('checkbox', { name: 'Seleccionar Aceite Lubricante Usado' })
    fireEvent.click(checkbox)

    expect(await screen.findByText(/RESIDUOS SELECCIONADOS · 1 seleccionado/)).toBeInTheDocument()
    expect(screen.getByLabelText('Cantidad')).toBeInTheDocument()
  })

  async function selectBranch() {
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Sede Solicitante *'))
    })
    const branchOption = await screen.findByRole('option', { name: 'Sede Principal' })
    await act(async () => {
      fireEvent.pointerDown(branchOption)
      fireEvent.click(branchOption)
    })
  }

  test('full happy path: create + submit on the final step', async () => {
    render(<ServiceRequestWizard />)
    await screen.findByRole('heading', { name: 'Paso 1 de 6 — Información General' })
    fireEvent.change(screen.getByLabelText('Fecha Deseada de Recolección *'), { target: { value: '2026-08-01' } })
    await selectBranch()
    await elegirDestinatario()

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))
    await screen.findByRole('heading', { name: 'Paso 2 de 6 — Selección de Residuos' })

    const checkbox = await screen.findByRole('checkbox', { name: 'Seleccionar Aceite Lubricante Usado' })
    fireEvent.click(checkbox)
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '850' } })

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Unidad'))
    })
    const unitOption = await screen.findByRole('option', { name: 'KG' })
    await act(async () => {
      fireEvent.pointerDown(unitOption)
      fireEvent.click(unitOption)
    })

    // Avanza hasta el Paso 6 (Confirmación).
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))
    }
    await screen.findByRole('heading', { name: 'Paso 6 de 6 — Confirmación y Envío' })

    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitud/ }))

    await vi.waitFor(() => expect(createServiceRequestMock).toHaveBeenCalled())
    const [payload] = createServiceRequestMock.mock.calls[0]
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0]).toMatchObject({ waste_id: 20, waste_treatment_approval_id: 100, estimated_quantity: 850 })
    expect(payload.branch_id).toBe(3)

    await vi.waitFor(() => expect(submitServiceRequestMock).toHaveBeenCalledWith(500))
    expect(pushMock).toHaveBeenCalledWith('/admin/service-requests/500')
  })

  test('items become read-only in Step 2 once the request has been created (no item-sync endpoint)', async () => {
    render(<ServiceRequestWizard />)
    await screen.findByRole('heading', { name: 'Paso 1 de 6 — Información General' })
    await selectBranch()
    await elegirDestinatario()

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))
    await screen.findByRole('heading', { name: 'Paso 2 de 6 — Selección de Residuos' })

    const checkbox = await screen.findByRole('checkbox', { name: 'Seleccionar Aceite Lubricante Usado' })
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Borrador' }))

    await vi.waitFor(() => expect(createServiceRequestMock).toHaveBeenCalled())
    expect(await screen.findByText(/no se pueden modificar/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Aceite Lubricante Usado' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })
})
