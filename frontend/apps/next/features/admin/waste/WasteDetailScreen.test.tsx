import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WasteDetailScreen } from './WasteDetailScreen'

const fetchWasteMock = vi.fn()
const suspendWasteMock = vi.fn()
const reactivateWasteMock = vi.fn()
const fetchWasteFilesMock = vi.fn()
const fetchWasteActivityMock = vi.fn()
const startReviewWasteMock = vi.fn()
const classifyWasteMock = vi.fn()
const rejectWasteMock = vi.fn()
const fetchWasteTreatmentApprovalsMock = vi.fn()
const fetchWastePreapprovedMatchesMock = vi.fn()
const fetchAvailableBranchTreatmentsMock = vi.fn()
const createDelegatedTreatmentApprovalMock = vi.fn()
const fetchBranchTreatmentsMock = vi.fn()
const createWasteTreatmentApprovalRequestMock = vi.fn()
const usePreapprovedTreatmentMatchMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchWaste: (...args: unknown[]) => fetchWasteMock(...args),
    suspendWaste: (...args: unknown[]) => suspendWasteMock(...args),
    reactivateWaste: (...args: unknown[]) => reactivateWasteMock(...args),
    fetchWasteFiles: (...args: unknown[]) => fetchWasteFilesMock(...args),
    fetchWasteActivity: (...args: unknown[]) => fetchWasteActivityMock(...args),
    startReviewWaste: (...args: unknown[]) => startReviewWasteMock(...args),
    classifyWaste: (...args: unknown[]) => classifyWasteMock(...args),
    rejectWaste: (...args: unknown[]) => rejectWasteMock(...args),
    fetchWasteTreatmentApprovals: (...args: unknown[]) => fetchWasteTreatmentApprovalsMock(...args),
    fetchWastePreapprovedMatches: (...args: unknown[]) => fetchWastePreapprovedMatchesMock(...args),
    fetchAvailableBranchTreatments: (...args: unknown[]) => fetchAvailableBranchTreatmentsMock(...args),
    createDelegatedTreatmentApproval: (...args: unknown[]) => createDelegatedTreatmentApprovalMock(...args),
    fetchBranchTreatments: (...args: unknown[]) => fetchBranchTreatmentsMock(...args),
    createWasteTreatmentApprovalRequest: (...args: unknown[]) => createWasteTreatmentApprovalRequestMock(...args),
    usePreapprovedTreatmentMatch: (...args: unknown[]) => usePreapprovedTreatmentMatchMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: {
  id: number
  is_platform_staff: boolean
  permissions: string[]
  tenant_organization_id?: number | null
} | null = {
  id: 1,
  is_platform_staff: false,
  // Cadena Generador -> Subgestor -> Gestor (2026-08-09): coincide con
  // `baseWaste().organization_id` (1) por defecto -- el actor por defecto
  // de esta suite es el DUEÑO del residuo, preservando el comportamiento
  // que todos los tests preexistentes ya asumían (ver `isOwner`/`canEditWaste`
  // en el componente). Los tests de "vista Subgestor" lo pisan explícitamente.
  tenant_organization_id: 1,
  permissions: [
    'wastes.read',
    'wastes.update',
    'wastes.review',
    'wastes.classify',
    'wastes.reject',
    'treatment_approvals.read',
    'treatment_approvals.create',
  ],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

function baseWaste(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 20,
    uuid: 'waste-20',
    tenant_organization_id: 1,
    organization_id: 1,
    branch_id: 1,
    waste_category_id: 1,
    code: 'RES-0001',
    name: 'Aceite Lubricante Usado',
    description: null,
    status: 'DEC',
    waste_danger: 'TOX',
    waste_danger_characteristic: { code: 'TOX', name: 'TOXICO' },
    waste_type_id: 1,
    is_template: false,
    is_preapproved: false,
    preapproved_by_organization_id: null,
    requires_characterization: false,
    requires_sds: true,
    physical_state_id: 1,
    measurement_unit_id: 1,
    average_weight: null,
    generation_frequency_id: 1,
    requires_special_transport: false,
    requires_special_ppe: false,
    operational_status_id: 1,
    quantity: '85.00',
    generation_date: '2026-06-12',
    internal_reference: null,
    operational_notes: null,
    is_active: true,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    organization: { id: 1, legal_name: 'Hospital San José' },
    branch: { id: 1, name: 'Sede Principal' },
    waste_category: { id: 1, uuid: 'wc-1', code: 'HOSPITALARIO_Y_SIMILARES', name: 'Hospitalario', description: null, is_system: true, is_active: true, created_at: '', updated_at: '' },
    waste_type: { id: 1, uuid: 'wt-1', code: 'OPERATIONAL', name: 'Operacional', description: null, is_system: true, is_active: true, created_at: '', updated_at: '' },
    physical_state: { id: 1, uuid: 'ps-1', code: 'LIQUID', name: 'Líquido', is_system: true, is_active: true, created_at: '', updated_at: '' },
    measurement_unit: { id: 1, uuid: 'mu-1', code: 'KG', name: 'Kilogramo', is_system: true, is_active: true, created_at: '', updated_at: '' },
    generation_frequency: { id: 1, uuid: 'gf-1', code: 'MONTHLY', name: 'Mensual', is_system: true, is_active: true, created_at: '', updated_at: '' },
    operational_status: { id: 1, uuid: 'os-1', code: 'ACTIVE', name: 'Activo', description: null, is_system: true, is_active: true, created_at: '', updated_at: '' },
    waste_stream_assignments: [
      { id: 1, waste_stream_id: 1, is_primary: true, waste_stream: { id: 1, uuid: 'ws-1', tenant_organization_id: null, code: 'Y8', name: 'Aceites minerales', description: null, tipo: 'Y', requires_manifest: true, requires_special_transport: false, is_system: true, is_active: true, metadata: null, created_at: '', updated_at: '' } },
    ],
    waste_un_codes: [],
    waste_hazard_characteristics: [
      { id: 1, hazard_characteristic_id: 1, hazard_characteristic: { id: 1, uuid: 'hc-1', code: 'TOXICO', name: 'Tóxico', risk_level: 7, description: null, is_system: true, is_active: true, created_at: '', updated_at: '' } },
    ],
    created_by: { id: 1, username: 'admin' },
    updated_by: { id: 1, username: 'admin' },
    has_viable_treatment: false,
    treatment_approval_mode: 'owner',
    ...overrides,
  }
}

// Evaluación del Gestor tal como la devuelve
// `GET /admin/wastes/{waste}/treatment-approvals`.
function approvalFixture() {
  return {
    id: 5,
    uuid: 'ta-5',
    organization_id: 2,
    waste_id: 20,
    branch_treatment_id: 10,
    version: 1,
    commercial_status: 'QUOTED',
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
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    organization: { id: 2, legal_name: 'EcoGestor SAS' },
    branch_treatment: {
      id: 10,
      operational_name: 'Horno 1',
      branch_id: 7,
      treatment_id: 3,
      max_capacity: null,
      capacity_unit: 'KG',
      treatment: { id: 3, uuid: 'treat-3', code: 'INCIN', name: 'Incineración' },
      branch: { id: 7, name: 'Planta Norte' },
    },
  }
}

describe('WasteDetailScreen', () => {
  beforeEach(() => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      tenant_organization_id: 1,
      permissions: [
        'wastes.read',
        'wastes.update',
        'wastes.review',
        'wastes.classify',
        'wastes.reject',
        'treatment_approvals.read',
        'treatment_approvals.create',
      ],
    }
    fetchWasteMock.mockResolvedValue({ waste: baseWaste() })
    fetchWasteTreatmentApprovalsMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 })
    fetchWastePreapprovedMatchesMock.mockResolvedValue({ matches: [] })
    fetchAvailableBranchTreatmentsMock.mockResolvedValue({ branch_treatments: [] })
    fetchBranchTreatmentsMock.mockResolvedValue({
      data: [],
      current_page: 1,
      last_page: 1,
      total: 0,
      per_page: 15,
      kpis: { total: 0, active: 0, inactive: 0 },
    })
    fetchWasteFilesMock.mockResolvedValue({
      files: {
        WASTE_PHOTO: [
          {
            id: 100,
            uuid: 'file-100',
            tenant_organization_id: 1,
            entity_type: 'WASTE',
            entity_id: 20,
            file_category: 'WASTE_PHOTO',
            original_filename: 'foto1.jpg',
            stored_filename: 'uuid.jpg',
            file_extension: 'jpg',
            mime_type: 'image/jpeg',
            file_size_bytes: 102400,
            file_hash_sha256: null,
            storage_provider: 'local',
            storage_path: 'files/waste/20/waste_photo/uuid.jpg',
            visibility_level: 'INTERNAL',
            description: null,
            uploaded_by_user_id: 1,
            uploaded_at: '2026-07-01T00:00:00Z',
            is_active: true,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-07-01T00:00:00Z',
          },
        ],
      },
    })
    fetchWasteActivityMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 })
  })

  afterEach(() => {
    fetchWasteMock.mockReset()
    fetchWasteFilesMock.mockReset()
    fetchWasteActivityMock.mockReset()
    startReviewWasteMock.mockReset()
    classifyWasteMock.mockReset()
    rejectWasteMock.mockReset()
    fetchWasteTreatmentApprovalsMock.mockReset()
    fetchWastePreapprovedMatchesMock.mockReset()
    fetchAvailableBranchTreatmentsMock.mockReset()
    fetchBranchTreatmentsMock.mockReset()
    createWasteTreatmentApprovalRequestMock.mockReset()
    usePreapprovedTreatmentMatchMock.mockReset()
    pushMock.mockReset()
  })

  test('shows the waste name, status badge and waste_danger badge with the full hazard characteristic name (not the short code)', async () => {
    render(<WasteDetailScreen wasteId={20} />)

    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.getByText('Declarado')).toBeInTheDocument()
    expect(screen.getByText('TOXICO')).toBeInTheDocument()
    expect(screen.queryByText('TOX')).not.toBeInTheDocument()
  })

  test('shows "Enviar a Revisión" when status=DEC and actor has wastes.review', async () => {
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.getByRole('button', { name: 'Enviar a Revisión' })).toBeInTheDocument()
  })

  test('hides "Clasificar" when status is not REV', async () => {
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.queryByRole('button', { name: 'Clasificar' })).not.toBeInTheDocument()
  })

  test('shows "Clasificar" when status=REV and actor has wastes.classify', async () => {
    fetchWasteMock.mockResolvedValue({ waste: baseWaste({ status: 'REV' }) })
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.getByRole('button', { name: 'Clasificar' })).toBeInTheDocument()
  })

  test('calls startReviewWaste when "Enviar a Revisión" is clicked', async () => {
    startReviewWasteMock.mockResolvedValue({ waste: baseWaste({ status: 'REV' }) })
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByRole('button', { name: 'Enviar a Revisión' }))

    await vi.waitFor(() => {
      expect(startReviewWasteMock).toHaveBeenCalledWith(20)
    })
  })

  test('rejecting requires a reason and calls rejectWaste', async () => {
    rejectWasteMock.mockResolvedValue({ waste: baseWaste({ status: 'BR' }) })
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    fireEvent.change(screen.getByLabelText('Motivo del rechazo'), { target: { value: 'Datos incompletos' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Rechazo' }))

    await vi.waitFor(() => {
      expect(rejectWasteMock).toHaveBeenCalledWith(20, { reason: 'Datos incompletos' })
    })
  })

  test('shows "Editar en el Asistente" while status is BR, routes to the wizard edit route', async () => {
    fetchWasteMock.mockResolvedValue({ waste: baseWaste({ status: 'BR' }) })
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByRole('button', { name: 'Editar en el Asistente' }))
    expect(pushMock).toHaveBeenCalledWith('/admin/wastes/20/edit')
  })

  test('Evidencias tab lists uploaded files grouped by category with a download link', async () => {
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByRole('tab', { name: 'Evidencias' }))

    expect(await screen.findByText('foto1.jpg')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /descargar/i })).toBeInTheDocument()
  })

  test('Tratamientos tab lists existing evaluations with status badges and price', async () => {
    fetchWasteTreatmentApprovalsMock.mockResolvedValue({
      data: [
        approvalFixture(),
      ],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })

    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))

    expect(await screen.findByText('EcoGestor SAS')).toBeInTheDocument()
    expect(screen.getByText('Incineración')).toBeInTheDocument()
    expect(screen.getByText('Aprobado')).toBeInTheDocument()
    expect(screen.getByText('Cotizado')).toBeInTheDocument()
    expect(screen.getByText('150.00 COP/KG')).toBeInTheDocument()
  })

  // Pedido del usuario (2026-08-14): el rechazo debe llegar al Generador CON
  // el motivo. Antes solo veía el badge "Rechazado" y no sabía qué corregir.
  test('Tratamientos tab shows the rejection reason so the owner knows why', async () => {
    fetchWasteTreatmentApprovalsMock.mockResolvedValue({
      data: [
        {
          ...approvalFixture(),
          technical_status: 'REJECTED',
          technical_notes: 'El tratamiento no aplica a esta corriente.',
        },
      ],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
    })

    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))

    expect(await screen.findByText('El tratamiento no aplica a esta corriente.')).toBeInTheDocument()
  })

  test('Tratamientos tab shows an empty message when there are no evaluations', async () => {
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))

    expect(await screen.findByText(/Sin evaluaciones de tratamiento/i)).toBeInTheDocument()
  })

  test('"Solicitar Evaluación" opens a dialog, lists available branch treatments and creates the request', async () => {
    fetchAvailableBranchTreatmentsMock.mockResolvedValue({
      branch_treatments: [
        { id: 10, treatment_name: 'Incineración', organization_name: 'EcoGestor SAS', branch_name: 'Planta Norte', max_capacity: '5000.00', capacity_unit: 'KG' },
      ],
    })
    createWasteTreatmentApprovalRequestMock.mockResolvedValue({
      treatment_approval: { id: 99, technical_status: 'PENDING', commercial_status: 'DRAFT' },
    })

    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')
    fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))
    await screen.findByText(/Sin evaluaciones de tratamiento/i)

    fireEvent.click(screen.getByRole('button', { name: 'Solicitar Evaluación' }))

    const option = await screen.findByRole('option', { name: /Incineración/ })
    fireEvent.click(option)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Solicitud' }))

    await vi.waitFor(() => {
      expect(createWasteTreatmentApprovalRequestMock).toHaveBeenCalledWith(20, { branch_treatment_id: 10 })
    })
  })

  test('shows the "Tratamiento Preaprobado Detectado" card when there are unrequested matches, and using it calls usePreapprovedTreatmentMatch', async () => {
    fetchWastePreapprovedMatchesMock.mockResolvedValue({
      matches: [
        {
          id: 42,
          organization_id: 2,
          waste_id: 999,
          branch_treatment_id: 11,
          technical_status: 'APPROVED',
          commercial_status: 'APPROVED',
          unit_price: '200.00',
          currency: 'COP',
          billing_unit: 'KG',
          is_active: true,
          organization: { id: 2, legal_name: 'EcoGestor SAS' },
          branch_treatment: {
            id: 11,
            operational_name: 'Horno 2',
            branch_id: 8,
            treatment_id: 4,
            max_capacity: null,
            capacity_unit: 'KG',
            treatment: { id: 4, uuid: 'treat-4', code: 'RECY', name: 'Reciclaje' },
            branch: { id: 8, name: 'Planta Sur' },
          },
        },
      ],
    })
    usePreapprovedTreatmentMatchMock.mockResolvedValue({
      treatment_approval: { id: 100, technical_status: 'PENDING', commercial_status: 'DRAFT' },
    })

    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')
    fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))

    expect(await screen.findByText('Tratamientos Preaprobados Detectados')).toBeInTheDocument()
    expect(screen.getByText(/Reciclaje/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Usar este tratamiento' }))

    await vi.waitFor(() => {
      expect(usePreapprovedTreatmentMatchMock).toHaveBeenCalledWith(20, 42)
    })
    // Desde 2026-08-15 la copia HEREDA la aprobación técnica del Gestor: el
    // residuo queda Clasificado y lo que falta es el visto bueno final, no
    // la confirmación del Gestor.
    expect(await screen.findByText(/queda Clasificado/i)).toBeInTheDocument()
    expect(screen.getByText(/visto bueno final/i)).toBeInTheDocument()
  })

  test('hides "Solicitar Evaluación" without treatment_approvals.create', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      tenant_organization_id: 1,
      permissions: ['wastes.read', 'treatment_approvals.read'],
    }
    // El backend YA gatea `treatment_approvals.create` al calcular
    // `treatment_approval_mode` (Gate::allows('requestEvaluation', $waste))
    // -- sin ese permiso, viaja `null`.
    fetchWasteMock.mockResolvedValue({ waste: baseWaste({ treatment_approval_mode: null }) })
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')
    fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))
    await screen.findByText(/Sin evaluaciones de tratamiento/i)

    expect(screen.queryByRole('button', { name: 'Solicitar Evaluación' })).not.toBeInTheDocument()
  })

  test('hides "Inactivar" without wastes.deactivate', async () => {
    currentUser = { id: 1, is_platform_staff: false, tenant_organization_id: 1, permissions: ['wastes.read'] }
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.queryByRole('button', { name: 'Inactivar' })).not.toBeInTheDocument()
  })

  test('shows "Inactivar" when the actor has wastes.deactivate', async () => {
    currentUser = { id: 1, is_platform_staff: false, tenant_organization_id: 1, permissions: ['wastes.read', 'wastes.deactivate'] }
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.getByRole('button', { name: 'Inactivar' })).toBeInTheDocument()
  })

  test('shows "Activar" (not "Inactivar") for an inactive waste when the actor has wastes.activate', async () => {
    fetchWasteMock.mockResolvedValue({ waste: baseWaste({ is_active: false }) })
    currentUser = { id: 1, is_platform_staff: false, tenant_organization_id: 1, permissions: ['wastes.read', 'wastes.activate'] }
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.getByRole('button', { name: 'Activar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Inactivar' })).not.toBeInTheDocument()
  })

  // ---- Cadena Generador -> Subgestor -> Gestor (confirmado por stakeholders reales, 2026-08-09) ----

  test('Subgestor viendo el residuo de un Generador cliente: sin acciones de edición, con banner informativo', async () => {
    // tenant_organization_id (99) DISTINTO de baseWaste().organization_id (1)
    // -- si la pantalla cargó (200), el backend ya confirmó que es un
    // Subgestor autorizado (WastePolicy::view()).
    currentUser = {
      id: 1,
      is_platform_staff: false,
      tenant_organization_id: 99,
      permissions: [
        'wastes.read',
        'wastes.update',
        'wastes.review',
        'wastes.classify',
        'wastes.reject',
        'wastes.activate',
        'wastes.deactivate',
        'treatment_approvals.read',
        'treatment_approvals.create',
      ],
    }
    fetchWasteMock.mockResolvedValue({ waste: baseWaste({ treatment_approval_mode: 'forward' }) })
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')

    expect(screen.getByRole('status')).toHaveTextContent(/viendo el residuo de un Generador cliente/i)
    expect(screen.queryByRole('button', { name: 'Enviar a Revisión' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Inactivar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument()
  })

  test('Subgestor con SOLO treatment_approvals.create (sin wastes.update) puede reenviar -- botón dice "Reenviar a Gestor"', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      tenant_organization_id: 99,
      permissions: ['wastes.read', 'treatment_approvals.read', 'treatment_approvals.create'],
    }
    fetchWasteMock.mockResolvedValue({ waste: baseWaste({ treatment_approval_mode: 'forward' }) })
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')
    fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))
    await screen.findByText(/Sin evaluaciones de tratamiento/i)

    expect(screen.getByRole('button', { name: 'Reenviar a Gestor' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Solicitar Evaluación' })).not.toBeInTheDocument()
  })

  // ---- Gestor con relación comercial activa ofreciendo su propio tratamiento (2026-08-12) ----

  test('Gestor con relación activa: banner de Gestor y botón "Ofrecer mi Tratamiento" (no "Solicitar Evaluación" ni "Reenviar a Gestor")', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      tenant_organization_id: 99,
      permissions: ['wastes.read', 'treatment_approvals.read', 'treatment_approvals.create'],
    }
    fetchWasteMock.mockResolvedValue({ waste: baseWaste({ treatment_approval_mode: 'offer' }) })
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')

    expect(screen.getByRole('status')).toHaveTextContent(/ofrecer uno de tus propios tratamientos/i)

    fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))
    await screen.findByText(/Sin evaluaciones de tratamiento/i)

    expect(screen.getByRole('button', { name: 'Ofrecer mi Tratamiento' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Solicitar Evaluación' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reenviar a Gestor' })).not.toBeInTheDocument()
  })

  test('"Ofrecer mi Tratamiento" opens a dialog, lists the Gestor\'s own branch treatments (fetchBranchTreatments, not fetchAvailableBranchTreatments) and creates the request', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      tenant_organization_id: 99,
      permissions: ['wastes.read', 'treatment_approvals.read', 'treatment_approvals.create'],
    }
    fetchWasteMock.mockResolvedValue({ waste: baseWaste({ treatment_approval_mode: 'offer' }) })
    fetchBranchTreatmentsMock.mockResolvedValue({
      data: [
        {
          id: 55,
          uuid: 'bt-55',
          tenant_organization_id: 99,
          organization_id: 99,
          branch_id: 7,
          treatment_id: 3,
          internal_code: 'BT-55',
          operational_name: 'Horno Propio',
          max_capacity: '3000.00',
          capacity_unit: 'KG',
          daily_capacity: null,
          monthly_capacity: null,
          environmental_license_number: null,
          valid_from: null,
          valid_until: null,
          requires_manual_approval: false,
          allows_mixed_waste: false,
          requires_weight_validation: true,
          operational_status: 'ACTIVE',
          observations: null,
          is_active: true,
          metadata: null,
          created_at: '2026-07-01T00:00:00Z',
          updated_at: '2026-07-01T00:00:00Z',
          created_by: null,
          updated_by: null,
          treatment: { id: 3, code: 'INCIN', name: 'Incineración Propia' },
          organization: { id: 99, legal_name: 'EcoGestor SAS' },
          branch: { id: 7, name: 'Planta Norte' },
        },
      ],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 15,
      kpis: { total: 1, active: 1, inactive: 0 },
    })
    createWasteTreatmentApprovalRequestMock.mockResolvedValue({
      treatment_approval: { id: 101, technical_status: 'PENDING', commercial_status: 'DRAFT' },
    })

    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')
    fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))
    await screen.findByText(/Sin evaluaciones de tratamiento/i)

    fireEvent.click(screen.getByRole('button', { name: 'Ofrecer mi Tratamiento' }))

    const option = await screen.findByRole('option', { name: /Incineración Propia/ })
    fireEvent.click(option)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Oferta' }))

    await vi.waitFor(() => {
      expect(createWasteTreatmentApprovalRequestMock).toHaveBeenCalledWith(20, { branch_treatment_id: 55 })
    })
    expect(fetchBranchTreatmentsMock).toHaveBeenCalled()
    expect(fetchAvailableBranchTreatmentsMock).not.toHaveBeenCalled()
  })

  test('treatment_approval_mode=null (actor sin permiso de evaluación): no muestra botón de Solicitar/Reenviar/Ofrecer', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      tenant_organization_id: 99,
      permissions: ['wastes.read', 'treatment_approvals.read'],
    }
    fetchWasteMock.mockResolvedValue({ waste: baseWaste({ treatment_approval_mode: null }) })
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')
    fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))
    await screen.findByText(/Sin evaluaciones de tratamiento/i)

    expect(screen.queryByRole('button', { name: 'Solicitar Evaluación' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reenviar a Gestor' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ofrecer mi Tratamiento' })).not.toBeInTheDocument()
  })

  // Suspensión APR <-> SUS (2026-08-14). Se detectó en la pasada de navegador
  // que las funciones del cliente de API existían pero ninguna pantalla las
  // llamaba: la suspensión era API-only.
  describe('suspender / reactivar', () => {
    test('el staff de EcoLink suspende un residuo Aprobado indicando el motivo', async () => {
      currentUser = {
        id: 1,
        is_platform_staff: true,
        permissions: ['wastes.read', 'wastes.suspend'],
        tenant_organization_id: 99,
      }
      fetchWasteMock.mockResolvedValue({ waste: { ...baseWaste(), status: 'APR' } })
      suspendWasteMock.mockResolvedValue({ waste: { status: 'SUS' } })

      render(<WasteDetailScreen wasteId={20} />)
      await screen.findByText('Aceite Lubricante Usado')

      fireEvent.click(screen.getByRole('button', { name: 'Suspender' }))

      // El motivo es obligatorio: sin él no se puede confirmar.
      const confirm = screen.getByRole('button', { name: 'Confirmar Suspensión' })
      expect(confirm).toBeDisabled()

      fireEvent.change(screen.getByLabelText('Motivo de la suspensión'), {
        target: { value: 'Licencia ambiental del Gestor vencida.' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar Suspensión' }))

      await vi.waitFor(() =>
        expect(suspendWasteMock).toHaveBeenCalledWith(20, { reason: 'Licencia ambiental del Gestor vencida.' })
      )
      expect(await screen.findByText(/retirado de circulación/i)).toBeInTheDocument()
    })

    test('un residuo Suspendido ofrece Reactivar', async () => {
      currentUser = {
        id: 1,
        is_platform_staff: true,
        permissions: ['wastes.read', 'wastes.suspend'],
        tenant_organization_id: 99,
      }
      fetchWasteMock.mockResolvedValue({ waste: { ...baseWaste(), status: 'SUS' } })
      reactivateWasteMock.mockResolvedValue({ waste: { status: 'APR' } })

      render(<WasteDetailScreen wasteId={20} />)
      await screen.findByText('Aceite Lubricante Usado')

      fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }))

      await vi.waitFor(() => expect(reactivateWasteMock).toHaveBeenCalledWith(20))
    })

    // Doble barrera, igual que en el backend: el permiso solo no alcanza.
    test('una organización cliente con el permiso NO ve la acción', async () => {
      currentUser = {
        id: 1,
        is_platform_staff: false,
        permissions: ['wastes.read', 'wastes.suspend'],
        tenant_organization_id: 1,
      }
      fetchWasteMock.mockResolvedValue({ waste: { ...baseWaste(), status: 'APR' } })

      render(<WasteDetailScreen wasteId={20} />)
      await screen.findByText('Aceite Lubricante Usado')

      expect(screen.queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument()
    })

    test('el staff sin el permiso tampoco la ve', async () => {
      currentUser = {
        id: 1,
        is_platform_staff: true,
        permissions: ['wastes.read'],
        tenant_organization_id: 99,
      }
      fetchWasteMock.mockResolvedValue({ waste: { ...baseWaste(), status: 'APR' } })

      render(<WasteDetailScreen wasteId={20} />)
      await screen.findByText('Aceite Lubricante Usado')

      expect(screen.queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument()
    })

    // Solo desde APR: un Clasificado todavía no está en circulación.
    test('un residuo Clasificado no es suspendible', async () => {
      currentUser = {
        id: 1,
        is_platform_staff: true,
        permissions: ['wastes.read', 'wastes.suspend'],
        tenant_organization_id: 99,
      }
      fetchWasteMock.mockResolvedValue({ waste: { ...baseWaste(), status: 'CLS' } })

      render(<WasteDetailScreen wasteId={20} />)
      await screen.findByText('Aceite Lubricante Usado')

      expect(screen.queryByRole('button', { name: 'Suspender' })).not.toBeInTheDocument()
    })
  })

  // Asignación delegada (Fase 2, 2026-08-15): registrar la evaluación de un
  // Gestor DE REFERENCIA, resuelta en su propia plataforma.
  describe('registrar evaluación externa', () => {
    beforeEach(() => {
      fetchAvailableBranchTreatmentsMock.mockResolvedValue({
        branch_treatments: [
          {
            id: 44,
            treatment_name: 'Incineración',
            organization_name: 'Gestor Externo S.A.S.',
            branch_name: 'Planta Sur',
            max_capacity: null,
            capacity_unit: 'KG',
          },
        ],
      })
    })

    test('con el permiso se ofrece la acción y se registra con el resultado', async () => {
      currentUser = {
        id: 1,
        is_platform_staff: true,
        permissions: ['wastes.read', 'treatment_approvals.read', 'treatment_approvals.assign_delegated'],
        tenant_organization_id: 99,
      }
      createDelegatedTreatmentApprovalMock.mockResolvedValue({ treatment_approval: { id: 500 } })

      render(<WasteDetailScreen wasteId={20} />)
      await screen.findByText('Aceite Lubricante Usado')

      fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Registrar Evaluación Externa' }))

      // El selector pide SOLO Gestores de referencia utilizables: sin esto
      // ofrecería opciones que el backend rechaza con 422.
      await vi.waitFor(() =>
        expect(fetchAvailableBranchTreatmentsMock).toHaveBeenCalledWith(
          expect.objectContaining({ delegatedOnly: true })
        )
      )

      fireEvent.click(await screen.findByText('Incineración'))

      // El resultado es obligatorio: es la constancia de qué se evaluó.
      expect(screen.getByRole('button', { name: 'Registrar' })).toBeDisabled()

      fireEvent.change(screen.getByLabelText('Resultado de la evaluación'), {
        target: { value: 'Aprobado en la plataforma del Gestor.' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))

      await vi.waitFor(() =>
        expect(createDelegatedTreatmentApprovalMock).toHaveBeenCalledWith(20, {
          branch_treatment_id: 44,
          technical_notes: 'Aprobado en la plataforma del Gestor.',
        })
      )
    })

    test('sin el permiso la acción no aparece', async () => {
      currentUser = {
        id: 1,
        is_platform_staff: true,
        permissions: ['wastes.read', 'treatment_approvals.read', 'treatment_approvals.evaluate'],
        tenant_organization_id: 99,
      }

      render(<WasteDetailScreen wasteId={20} />)
      await screen.findByText('Aceite Lubricante Usado')

      fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))

      expect(screen.queryByRole('button', { name: 'Registrar Evaluación Externa' })).not.toBeInTheDocument()
    })

    test('si no hay Gestores de referencia vinculados lo dice, en vez de dejar el selector vacío', async () => {
      currentUser = {
        id: 1,
        is_platform_staff: false,
        permissions: ['wastes.read', 'treatment_approvals.read', 'treatment_approvals.assign_delegated'],
        tenant_organization_id: 2,
      }
      fetchAvailableBranchTreatmentsMock.mockResolvedValue({ branch_treatments: [] })

      render(<WasteDetailScreen wasteId={20} />)
      await screen.findByText('Aceite Lubricante Usado')

      fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Registrar Evaluación Externa' }))

      expect(await screen.findByText(/No hay Gestores de referencia vinculados/i)).toBeInTheDocument()
    })
  })

  // Blindaje posterior a la aprobación (Fase 3, 2026-08-15): un residuo
  // APR/SUS ya respalda solicitudes y certificados.
  describe('residuo aprobado: edición bloqueada', () => {
    test('explica por qué no se puede editar y cuál es el camino', async () => {
      currentUser = {
        id: 1,
        is_platform_staff: false,
        permissions: ['wastes.read', 'wastes.update'],
        tenant_organization_id: 1,
      }
      fetchWasteMock.mockResolvedValue({ waste: { ...baseWaste(), status: 'APR' } })

      render(<WasteDetailScreen wasteId={20} />)
      await screen.findByText('Aceite Lubricante Usado')

      expect(screen.getByText(/ya no se puede editar/i)).toBeInTheDocument()
      expect(screen.getByText(/declara un residuo nuevo/i)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Editar en el Asistente' })).not.toBeInTheDocument()
    })

    // El camino de soporte: EcoLink sí corrige, así que no le mostramos el
    // aviso dirigido al cliente.
    test('al staff de EcoLink no se le muestra ese aviso', async () => {
      currentUser = {
        id: 1,
        is_platform_staff: true,
        permissions: ['wastes.read', 'wastes.update'],
        tenant_organization_id: 99,
      }
      fetchWasteMock.mockResolvedValue({ waste: { ...baseWaste(), status: 'APR' } })

      render(<WasteDetailScreen wasteId={20} />)
      await screen.findByText('Aceite Lubricante Usado')

      expect(screen.queryByText(/ya no se puede editar/i)).not.toBeInTheDocument()
    })

    test('un residuo en Borrador sí ofrece editar', async () => {
      currentUser = {
        id: 1,
        is_platform_staff: false,
        permissions: ['wastes.read', 'wastes.update'],
        tenant_organization_id: 1,
      }
      fetchWasteMock.mockResolvedValue({ waste: { ...baseWaste(), status: 'BR' } })

      render(<WasteDetailScreen wasteId={20} />)
      await screen.findByText('Aceite Lubricante Usado')

      expect(screen.getByRole('button', { name: 'Editar en el Asistente' })).toBeInTheDocument()
      expect(screen.queryByText(/ya no se puede editar/i)).not.toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  // Compatibilidad por corriente/UN: SUGIERE, no restringe (2026-08-18).
  //
  // Hasta hoy el backend EXCLUÍA de `available()` lo que no coincidía, y como
  // este selector es la única vía para elegir, esa ayuda se comportaba como una
  // regla -- una que el backend nunca tuvo: ninguna validación de
  // `WasteTreatmentApprovalController` mira corrientes ni códigos UN, así que
  // la misma asignación pasaba por API y era imposible por pantalla.
  // -----------------------------------------------------------------------
  describe('compatibilidad como sugerencia', () => {
    function conCompatibilidades() {
      fetchAvailableBranchTreatmentsMock.mockResolvedValue({
        branch_treatments: [
          { id: 10, treatment_name: 'Incineración', organization_name: 'EcoGestor SAS', branch_name: 'Planta Norte', max_capacity: null, capacity_unit: 'KG', compatibility: 'match' },
          { id: 11, treatment_name: 'Coprocesamiento', organization_name: 'EcoGestor SAS', branch_name: 'Planta Sur', max_capacity: null, capacity_unit: 'KG', compatibility: 'unrestricted' },
          { id: 12, treatment_name: 'Compostaje', organization_name: 'EcoGestor SAS', branch_name: 'Planta Este', max_capacity: null, capacity_unit: 'KG', compatibility: 'mismatch' },
        ],
      })
    }

    async function abrirSelector() {
      render(<WasteDetailScreen wasteId={20} />)
      await screen.findByText('Aceite Lubricante Usado')
      fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))
      await screen.findByText(/Sin evaluaciones de tratamiento/i)
      fireEvent.click(screen.getByRole('button', { name: 'Solicitar Evaluación' }))
    }

    // El punto de todo el cambio: lo que no coincide SIGUE ofreciéndose.
    test('ofrece también los que no coinciden con la corriente declarada', async () => {
      conCompatibilidades()
      await abrirSelector()

      expect(await screen.findByRole('option', { name: /Incineración/ })).toBeInTheDocument()
      expect(screen.getByRole('option', { name: /Compostaje/ })).toBeInTheDocument()
    })

    test('marca cuál coincide y cuál no', async () => {
      conCompatibilidades()
      await abrirSelector()

      await screen.findByRole('option', { name: /Incineración/ })
      expect(screen.getByText('Compatible')).toBeInTheDocument()
      expect(screen.getByText('No coincide con la corriente declarada')).toBeInTheDocument()
    })

    // `unrestricted` = el tratamiento no declaró catálogo. Anunciarlo en cada
    // fila sería ruido, y desde luego no debe leerse como incompatible.
    test('no marca nada cuando el tratamiento no declaró catálogo', async () => {
      conCompatibilidades()
      await abrirSelector()

      await screen.findByRole('option', { name: /Coprocesamiento/ })
      expect(screen.getAllByText('Compatible')).toHaveLength(1)
      expect(screen.getAllByText('No coincide con la corriente declarada')).toHaveLength(1)
    })

    test('se puede seleccionar y enviar uno que NO coincide', async () => {
      conCompatibilidades()
      createWasteTreatmentApprovalRequestMock.mockResolvedValue({ treatment_approval: { id: 900 } })
      await abrirSelector()

      fireEvent.click(await screen.findByRole('option', { name: /Compostaje/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar Solicitud' }))

      await vi.waitFor(() =>
        expect(createWasteTreatmentApprovalRequestMock).toHaveBeenCalledWith(20, { branch_treatment_id: 12 })
      )
    })

    // El texto ya no puede prometer que solo se ofrecen compatibles.
    test('el aviso dice que se puede elegir cualquiera', async () => {
      conCompatibilidades()
      await abrirSelector()

      expect(await screen.findByText(/puedes elegir cualquiera/i)).toBeInTheDocument()
    })
  })
})
