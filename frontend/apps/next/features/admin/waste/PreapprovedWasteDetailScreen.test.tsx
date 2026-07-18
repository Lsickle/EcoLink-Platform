import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PreapprovedWasteDetailScreen } from './PreapprovedWasteDetailScreen'

const fetchPreapprovedWasteMock = vi.fn()
const updatePreapprovedWasteMock = vi.fn()
const activatePreapprovedWasteMock = vi.fn()
const deactivatePreapprovedWasteMock = vi.fn()
const fetchWasteCategoriesMock = vi.fn()
const fetchPhysicalStatesMock = vi.fn()
const fetchMeasurementUnitsMock = vi.fn()
const fetchGenerationFrequenciesMock = vi.fn()
const fetchWasteStreamsMock = vi.fn()
const fetchUnCodesMock = vi.fn()
const fetchBranchTreatmentsMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchPreapprovedWaste: (...args: unknown[]) => fetchPreapprovedWasteMock(...args),
    updatePreapprovedWaste: (...args: unknown[]) => updatePreapprovedWasteMock(...args),
    activatePreapprovedWaste: (...args: unknown[]) => activatePreapprovedWasteMock(...args),
    deactivatePreapprovedWaste: (...args: unknown[]) => deactivatePreapprovedWasteMock(...args),
    fetchWasteCategories: (...args: unknown[]) => fetchWasteCategoriesMock(...args),
    fetchPhysicalStates: (...args: unknown[]) => fetchPhysicalStatesMock(...args),
    fetchMeasurementUnits: (...args: unknown[]) => fetchMeasurementUnitsMock(...args),
    fetchGenerationFrequencies: (...args: unknown[]) => fetchGenerationFrequenciesMock(...args),
    fetchWasteStreams: (...args: unknown[]) => fetchWasteStreamsMock(...args),
    fetchUnCodes: (...args: unknown[]) => fetchUnCodesMock(...args),
    fetchBranchTreatments: (...args: unknown[]) => fetchBranchTreatmentsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

type MockUser = { id: number; is_platform_staff: boolean; permissions: string[] } | null
let currentUser: MockUser = { id: 1, is_platform_staff: false, permissions: ['preapproved_wastes.read', 'preapproved_wastes.manage'] }

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: (permission?: string) => {
    useRequireAuthCalls.push(permission)
    return { isAuthorized: true, user: currentUser, isLoading: false }
  },
}))

let useRequireAuthCalls: (string | undefined)[] = []

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 100 }

function makeDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 30,
    uuid: 'pw-30',
    tenant_organization_id: 2,
    organization_id: 2,
    branch_id: null,
    waste_category_id: null,
    code: 'PRE-0001',
    name: 'Aceite Usado Preaprobado',
    description: null,
    physical_state_id: null,
    measurement_unit_id: 1,
    average_weight: null,
    generation_frequency_id: null,
    requires_special_transport: false,
    requires_special_ppe: false,
    requires_characterization: false,
    requires_sds: false,
    is_active: true,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    organization: { id: 2, legal_name: 'EcoGestor SAS' },
    waste_category: null,
    physical_state: null,
    measurement_unit: { id: 1, uuid: 'mu-1', code: 'KG', name: 'Kilogramos', is_system: true, is_active: true, created_at: '', updated_at: '' },
    generation_frequency: null,
    waste_stream_assignments: [
      { id: 1, waste_stream_id: 119, is_primary: true, waste_stream: { id: 119, code: 'Y9', name: 'Mezclas', tipo: 'Y', is_system: true, is_active: true, created_at: '', updated_at: '' } },
    ],
    waste_un_codes: [],
    treatment_approvals: [
      {
        id: 1,
        branch_treatment_id: 10,
        unit_price: '50000',
        currency: 'COP',
        billing_unit: 'KG',
        minimum_quantity: null,
        maximum_quantity: null,
        requires_lab_analysis: false,
        requires_sds: false,
        restrictions: null,
        valid_from: null,
        valid_until: null,
        technical_status: 'APPROVED',
        commercial_status: 'APPROVED',
        is_active: true,
        branch_treatment: {
          id: 10,
          operational_name: 'Incineración Planta 1',
          branch_id: 3,
          treatment_id: 4,
          max_capacity: null,
          capacity_unit: 'KG',
          treatment: { id: 4, uuid: 't-4', code: 'INC', name: 'Incineración', description: null, is_system: true, is_active: true, created_at: '', updated_at: '' },
          branch: { id: 3, name: 'Planta Norte' },
        },
        technical_approved_by: { id: 1, username: 'ana' },
        commercial_approved_by: { id: 1, username: 'ana' },
      },
    ],
    ...overrides,
  }
}

describe('PreapprovedWasteDetailScreen', () => {
  beforeEach(() => {
    useRequireAuthCalls = []
    currentUser = { id: 1, is_platform_staff: false, permissions: ['preapproved_wastes.read', 'preapproved_wastes.manage'] }
    fetchPreapprovedWasteMock.mockResolvedValue({ waste: makeDetail() })
    fetchWasteCategoriesMock.mockResolvedValue(emptyPage)
    fetchPhysicalStatesMock.mockResolvedValue(emptyPage)
    fetchMeasurementUnitsMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'mu-1', code: 'KG', name: 'Kilogramos', is_system: true, is_active: true, created_at: '', updated_at: '' }],
    })
    fetchGenerationFrequenciesMock.mockResolvedValue(emptyPage)
    fetchWasteStreamsMock.mockImplementation((params: { tipo?: string }) =>
      Promise.resolve(
        params?.tipo === 'Y'
          ? {
              ...emptyPage,
              data: [{ id: 119, uuid: 'ws-119', code: 'Y9', name: 'Mezclas', tipo: 'Y', is_system: true, is_active: true, created_at: '', updated_at: '' }],
            }
          : emptyPage
      )
    )
    fetchUnCodesMock.mockResolvedValue(emptyPage)
    fetchBranchTreatmentsMock.mockResolvedValue({
      ...emptyPage,
      data: [
        {
          id: 10,
          uuid: 'bt-10',
          tenant_organization_id: 2,
          organization_id: 2,
          branch_id: 3,
          treatment_id: 4,
          internal_code: 'BT-10',
          operational_name: 'Incineración Planta 1',
          max_capacity: null,
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
          created_at: '',
          updated_at: '',
          created_by: null,
          updated_by: null,
        },
      ],
      kpis: { total: 1, active: 1, inactive: 0 },
    })
  })

  afterEach(() => {
    fetchPreapprovedWasteMock.mockReset()
    updatePreapprovedWasteMock.mockReset()
    activatePreapprovedWasteMock.mockReset()
    deactivatePreapprovedWasteMock.mockReset()
    fetchWasteCategoriesMock.mockReset()
    fetchPhysicalStatesMock.mockReset()
    fetchMeasurementUnitsMock.mockReset()
    fetchGenerationFrequenciesMock.mockReset()
    fetchWasteStreamsMock.mockReset()
    fetchUnCodesMock.mockReset()
    fetchBranchTreatmentsMock.mockReset()
  })

  test('requires the preapproved_wastes.read permission via useRequireAuth', async () => {
    render(<PreapprovedWasteDetailScreen preapprovedWasteId={30} />)
    await screen.findByText('Aceite Usado Preaprobado')

    expect(useRequireAuthCalls).toContain('preapproved_wastes.read')
  })

  test('renders the organization, classification and pre-filled commercial terms', async () => {
    render(<PreapprovedWasteDetailScreen preapprovedWasteId={30} />)

    await screen.findByText('Aceite Usado Preaprobado')
    expect(screen.getByText(/EcoGestor SAS/)).toBeInTheDocument()
    expect(screen.getByText('Y9', { exact: false })).toBeInTheDocument()
    expect(screen.getByDisplayValue('50000')).toBeInTheDocument()
  })

  test('scopes the branch_treatment select to the waste organization', async () => {
    render(<PreapprovedWasteDetailScreen preapprovedWasteId={30} />)
    await screen.findByText('Aceite Usado Preaprobado')

    expect(fetchBranchTreatmentsMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 2, operationalStatus: 'ACTIVE' })
    )
  })

  test('"Inactivar" calls deactivatePreapprovedWaste and refreshes the detail', async () => {
    deactivatePreapprovedWasteMock.mockResolvedValueOnce({ waste: { id: 30, is_active: false } })
    fetchPreapprovedWasteMock
      .mockResolvedValueOnce({ waste: makeDetail() })
      .mockResolvedValueOnce({ waste: makeDetail({ is_active: false }) })
    render(<PreapprovedWasteDetailScreen preapprovedWasteId={30} />)
    await screen.findByText('Aceite Usado Preaprobado')

    fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))

    await vi.waitFor(() => expect(deactivatePreapprovedWasteMock).toHaveBeenCalledWith(30))
    expect(await screen.findByText('Inactivo')).toBeInTheDocument()
  })

  test('hides the save button and disables inputs for an actor without preapproved_wastes.manage', async () => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['preapproved_wastes.read'] }
    render(<PreapprovedWasteDetailScreen preapprovedWasteId={30} />)
    await screen.findByText('Aceite Usado Preaprobado')

    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Inactivar' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Nombre')).toBeDisabled()
  })

  test('saving submits the nested approval payload and refreshes via fetchPreapprovedWaste', async () => {
    updatePreapprovedWasteMock.mockResolvedValueOnce({ waste: { id: 30 } })
    fetchPreapprovedWasteMock
      .mockResolvedValueOnce({ waste: makeDetail() })
      .mockResolvedValueOnce({ waste: makeDetail({ name: 'Aceite Usado Preaprobado' }) })
    render(<PreapprovedWasteDetailScreen preapprovedWasteId={30} />)
    await screen.findByText('Aceite Usado Preaprobado')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await vi.waitFor(() => expect(updatePreapprovedWasteMock).toHaveBeenCalledWith(30, expect.objectContaining({
      name: 'Aceite Usado Preaprobado',
      approval: expect.objectContaining({ branch_treatment_id: 10 }),
    })))
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
  })
})
