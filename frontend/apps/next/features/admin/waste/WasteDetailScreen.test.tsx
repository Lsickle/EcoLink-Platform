import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WasteDetailScreen } from './WasteDetailScreen'

const fetchWasteMock = vi.fn()
const fetchWasteFilesMock = vi.fn()
const fetchWasteActivityMock = vi.fn()
const startReviewWasteMock = vi.fn()
const classifyWasteMock = vi.fn()
const rejectWasteMock = vi.fn()
const fetchWasteTreatmentApprovalsMock = vi.fn()
const fetchWastePreapprovedMatchesMock = vi.fn()
const fetchAvailableBranchTreatmentsMock = vi.fn()
const createWasteTreatmentApprovalRequestMock = vi.fn()
const usePreapprovedTreatmentMatchMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchWaste: (...args: unknown[]) => fetchWasteMock(...args),
    fetchWasteFiles: (...args: unknown[]) => fetchWasteFilesMock(...args),
    fetchWasteActivity: (...args: unknown[]) => fetchWasteActivityMock(...args),
    startReviewWaste: (...args: unknown[]) => startReviewWasteMock(...args),
    classifyWaste: (...args: unknown[]) => classifyWasteMock(...args),
    rejectWaste: (...args: unknown[]) => rejectWasteMock(...args),
    fetchWasteTreatmentApprovals: (...args: unknown[]) => fetchWasteTreatmentApprovalsMock(...args),
    fetchWastePreapprovedMatches: (...args: unknown[]) => fetchWastePreapprovedMatchesMock(...args),
    fetchAvailableBranchTreatments: (...args: unknown[]) => fetchAvailableBranchTreatmentsMock(...args),
    createWasteTreatmentApprovalRequest: (...args: unknown[]) => createWasteTreatmentApprovalRequestMock(...args),
    usePreapprovedTreatmentMatch: (...args: unknown[]) => usePreapprovedTreatmentMatchMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
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
    waste_danger: 'TOXICO',
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
    ...overrides,
  }
}

describe('WasteDetailScreen', () => {
  beforeEach(() => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
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
    createWasteTreatmentApprovalRequestMock.mockReset()
    usePreapprovedTreatmentMatchMock.mockReset()
    pushMock.mockReset()
  })

  test('shows the waste name, status badge and waste_danger badge', async () => {
    render(<WasteDetailScreen wasteId={20} />)

    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.getByText('Declarado')).toBeInTheDocument()
    expect(screen.getByText('TOXICO')).toBeInTheDocument()
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
        {
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

    expect(await screen.findByText('EcoGestor SAS')).toBeInTheDocument()
    expect(screen.getByText('Incineración')).toBeInTheDocument()
    expect(screen.getByText('Aprobado')).toBeInTheDocument()
    expect(screen.getByText('Cotizado')).toBeInTheDocument()
    expect(screen.getByText('150.00 COP/KG')).toBeInTheDocument()
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
    expect(await screen.findByText(/debe confirmarla/i)).toBeInTheDocument()
  })

  test('hides "Solicitar Evaluación" without treatment_approvals.create', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['wastes.read', 'treatment_approvals.read'],
    }
    render(<WasteDetailScreen wasteId={20} />)
    await screen.findByText('Aceite Lubricante Usado')
    fireEvent.click(screen.getByRole('tab', { name: 'Tratamientos' }))
    await screen.findByText(/Sin evaluaciones de tratamiento/i)

    expect(screen.queryByRole('button', { name: 'Solicitar Evaluación' })).not.toBeInTheDocument()
  })
})
