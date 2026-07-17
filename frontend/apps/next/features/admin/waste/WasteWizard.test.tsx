import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WasteWizard } from './WasteWizard'

const fetchWasteMock = vi.fn()
const fetchWasteFilesMock = vi.fn()
const createWasteMock = vi.fn()
const updateWasteMock = vi.fn()
const submitWasteMock = vi.fn()
const syncWasteWasteStreamsMock = vi.fn()
const syncWasteUnCodesMock = vi.fn()
const syncWasteHazardCharacteristicsMock = vi.fn()
const uploadFileMock = vi.fn()
const fetchWasteCategoriesMock = vi.fn()
const fetchPhysicalStatesMock = vi.fn()
const fetchWasteStreamsMock = vi.fn()
const fetchUnCodesMock = vi.fn()
const fetchHazardCharacteristicsMock = vi.fn()
const fetchBranchesMock = vi.fn()
const fetchMeasurementUnitsMock = vi.fn()
const fetchGenerationFrequenciesMock = vi.fn()
const fetchWastePreapprovedMatchesMock = vi.fn()
const usePreapprovedTreatmentMatchMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchWaste: (...args: unknown[]) => fetchWasteMock(...args),
    fetchWasteFiles: (...args: unknown[]) => fetchWasteFilesMock(...args),
    createWaste: (...args: unknown[]) => createWasteMock(...args),
    updateWaste: (...args: unknown[]) => updateWasteMock(...args),
    submitWaste: (...args: unknown[]) => submitWasteMock(...args),
    syncWasteWasteStreams: (...args: unknown[]) => syncWasteWasteStreamsMock(...args),
    syncWasteUnCodes: (...args: unknown[]) => syncWasteUnCodesMock(...args),
    syncWasteHazardCharacteristics: (...args: unknown[]) => syncWasteHazardCharacteristicsMock(...args),
    uploadFile: (...args: unknown[]) => uploadFileMock(...args),
    fetchWasteCategories: (...args: unknown[]) => fetchWasteCategoriesMock(...args),
    fetchPhysicalStates: (...args: unknown[]) => fetchPhysicalStatesMock(...args),
    fetchWasteStreams: (...args: unknown[]) => fetchWasteStreamsMock(...args),
    fetchUnCodes: (...args: unknown[]) => fetchUnCodesMock(...args),
    fetchHazardCharacteristics: (...args: unknown[]) => fetchHazardCharacteristicsMock(...args),
    fetchBranches: (...args: unknown[]) => fetchBranchesMock(...args),
    fetchMeasurementUnits: (...args: unknown[]) => fetchMeasurementUnitsMock(...args),
    fetchGenerationFrequencies: (...args: unknown[]) => fetchGenerationFrequenciesMock(...args),
    fetchWastePreapprovedMatches: (...args: unknown[]) => fetchWastePreapprovedMatchesMock(...args),
    usePreapprovedTreatmentMatch: (...args: unknown[]) => usePreapprovedTreatmentMatchMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['wastes.create', 'wastes.update'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function catalogItem(overrides: Partial<Record<string, unknown>> = {}) {
  return { is_system: true, is_active: true, created_at: '', updated_at: '', description: null, ...overrides }
}

describe('WasteWizard', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['wastes.create', 'wastes.update'] }

    fetchWasteCategoriesMock.mockResolvedValue({
      ...emptyPage,
      data: [catalogItem({ id: 1, uuid: 'wc-1', code: 'INDUSTRIAL', name: 'Industrial' })],
    })
    fetchPhysicalStatesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'ps-1', code: 'LIQUID', name: 'Líquido', is_system: true, is_active: true, created_at: '', updated_at: '' }],
    })
    fetchWasteStreamsMock.mockImplementation((params: { tipo?: 'Y' | 'A' }) => {
      if (params?.tipo === 'A') {
        return Promise.resolve({
          ...emptyPage,
          data: [{ id: 10, uuid: 'ws-10', tenant_organization_id: null, code: 'A3020', name: 'Residuos minerales', description: null, tipo: 'A', requires_manifest: true, requires_special_transport: false, is_system: true, is_active: true, metadata: null, created_at: '', updated_at: '' }],
        })
      }
      return Promise.resolve({
        ...emptyPage,
        data: [{ id: 1, uuid: 'ws-1', tenant_organization_id: null, code: 'Y8', name: 'Aceites minerales', description: null, tipo: 'Y', requires_manifest: true, requires_special_transport: false, is_system: true, is_active: true, metadata: null, created_at: '', updated_at: '' }],
      })
    })
    fetchUnCodesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 5, uuid: 'un-5', tenant_organization_id: null, code: 'UN3082', name: 'Peligroso ambiental', hazard_class: null, packing_group: null, is_system: true, is_active: true, metadata: null, created_at: '', updated_at: '' }],
    })
    fetchHazardCharacteristicsMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 2, uuid: 'hc-2', code: 'TOXICO', name: 'Tóxico', risk_level: 7, description: null, is_system: true, is_active: true, created_at: '', updated_at: '' }],
    })
    fetchBranchesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 3, uuid: 'br-3', tenant_organization_id: 1, organization_id: 1, branch_type_id: 1, code: null, name: 'Sede Principal', status: 'ACTIVE', country_id: null, department_id: null, municipality_id: null, locality_id: null, address: null, phone: null, email: null, environmental_license: null, license_expiration_date: null, operational_capacity: null, observations: null, is_active: true, created_at: '', updated_at: '', created_by: null, updated_by: null }],
      kpis: { total: 1, active: 1, inactive: 0, suspended: 0 },
    })
    fetchMeasurementUnitsMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'mu-1', code: 'KG', name: 'Kilogramo', is_system: true, is_active: true, created_at: '', updated_at: '' }],
    })
    fetchGenerationFrequenciesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 1, uuid: 'gf-1', code: 'MONTHLY', name: 'Mensual', is_system: true, is_active: true, created_at: '', updated_at: '' }],
    })
    syncWasteWasteStreamsMock.mockResolvedValue({ waste: { waste_danger: null } })
    syncWasteUnCodesMock.mockResolvedValue({ waste: { waste_danger: null } })
    syncWasteHazardCharacteristicsMock.mockResolvedValue({ waste: { waste_danger: null } })
    updateWasteMock.mockResolvedValue({ waste: { id: 50 } })
    fetchWastePreapprovedMatchesMock.mockResolvedValue({ matches: [] })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('creates the waste on "Siguiente" from Step 1 and advances to Step 2', async () => {
    createWasteMock.mockResolvedValue({ waste: { id: 50, name: 'Aceite Lubricante Usado' } })
    render(<WasteWizard />)

    await screen.findByRole('heading', { name: 'Paso 1 de 5 — Identificación' })
    fireEvent.change(screen.getByLabelText('Nombre del Residuo *'), { target: { value: 'Aceite Lubricante Usado' } })
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))

    await vi.waitFor(() => {
      expect(createWasteMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Aceite Lubricante Usado' }))
    })
    await screen.findByRole('heading', { name: 'Paso 2 de 5 — Caracterización' })
  })

  test('"Residuo Existente" and "Residuo Preaprobado" cards are disabled with a "Próximamente" hint', async () => {
    render(<WasteWizard />)
    await screen.findByRole('heading', { name: 'Paso 1 de 5 — Identificación' })

    expect(screen.getByRole('radio', { name: /Residuo Existente/ })).toBeDisabled()
    expect(screen.getByRole('radio', { name: /Residuo Preaprobado/ })).toBeDisabled()
  })

  test('Step 2: adding a Y stream chip and syncing on "Siguiente"', async () => {
    createWasteMock.mockResolvedValue({ waste: { id: 50, name: 'Aceite Lubricante Usado' } })
    syncWasteWasteStreamsMock.mockResolvedValue({ waste: { id: 50, waste_hazard_characteristics: [], waste_danger: null } })
    updateWasteMock.mockResolvedValue({ waste: { id: 50 } })
    render(<WasteWizard />)

    await screen.findByRole('heading', { name: 'Paso 1 de 5 — Identificación' })
    fireEvent.change(screen.getByLabelText('Nombre del Residuo *'), { target: { value: 'Aceite Lubricante Usado' } })
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))
    await screen.findByRole('heading', { name: 'Paso 2 de 5 — Caracterización' })

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar Y' }))
    const option = await screen.findByRole('option', { name: /Y8/ })
    fireEvent.click(option)

    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))

    await vi.waitFor(() => {
      expect(syncWasteWasteStreamsMock).toHaveBeenCalledWith(50, [1])
    })
    await screen.findByRole('heading', { name: 'Paso 3 de 5 — Información de Generación' })
  })

  function preapprovedMatch(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 42,
      organization_id: 2,
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
      ...overrides,
    }
  }

  test('Step 2: adding the first stream auto-saves the draft and checks for preapproved matches', async () => {
    createWasteMock.mockResolvedValue({ waste: { id: 50, name: 'Aceite Lubricante Usado' } })
    syncWasteWasteStreamsMock.mockResolvedValue({ waste: { id: 50, waste_hazard_characteristics: [], waste_danger: null } })
    fetchWastePreapprovedMatchesMock.mockResolvedValue({ matches: [preapprovedMatch()] })

    render(<WasteWizard />)
    await screen.findByRole('heading', { name: 'Paso 1 de 5 — Identificación' })
    fireEvent.change(screen.getByLabelText('Nombre del Residuo *'), { target: { value: 'Aceite Lubricante Usado' } })
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))
    await screen.findByRole('heading', { name: 'Paso 2 de 5 — Caracterización' })

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar Y' }))
    const option = await screen.findByRole('option', { name: /Y8/ })
    fireEvent.click(option)

    await vi.waitFor(() => {
      expect(fetchWastePreapprovedMatchesMock).toHaveBeenCalledWith(50)
    })
    expect(await screen.findByText('Tratamiento Preaprobado Detectado')).toBeInTheDocument()
    expect(screen.getByText(/Reciclaje/)).toBeInTheDocument()
  })

  test('Step 2: does not show a card when there are no preapproved matches', async () => {
    createWasteMock.mockResolvedValue({ waste: { id: 50, name: 'Aceite Lubricante Usado' } })
    render(<WasteWizard />)
    await screen.findByRole('heading', { name: 'Paso 1 de 5 — Identificación' })
    fireEvent.change(screen.getByLabelText('Nombre del Residuo *'), { target: { value: 'Aceite Lubricante Usado' } })
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))
    await screen.findByRole('heading', { name: 'Paso 2 de 5 — Caracterización' })

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar Y' }))
    const option = await screen.findByRole('option', { name: /Y8/ })
    fireEvent.click(option)

    await vi.waitFor(() => {
      expect(fetchWastePreapprovedMatchesMock).toHaveBeenCalled()
    })
    expect(screen.queryByText('Tratamiento Preaprobado Detectado')).not.toBeInTheDocument()
  })

  test('Step 2: "Usar este tratamiento" calls usePreapprovedTreatmentMatch and shows the pending-confirmation message', async () => {
    createWasteMock.mockResolvedValue({ waste: { id: 50, name: 'Aceite Lubricante Usado' } })
    fetchWastePreapprovedMatchesMock.mockResolvedValue({ matches: [preapprovedMatch()] })
    usePreapprovedTreatmentMatchMock.mockResolvedValue({ treatment_approval: { id: 100 } })

    render(<WasteWizard />)
    await screen.findByRole('heading', { name: 'Paso 1 de 5 — Identificación' })
    fireEvent.change(screen.getByLabelText('Nombre del Residuo *'), { target: { value: 'Aceite Lubricante Usado' } })
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }))
    await screen.findByRole('heading', { name: 'Paso 2 de 5 — Caracterización' })

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar Y' }))
    const option = await screen.findByRole('option', { name: /Y8/ })
    fireEvent.click(option)

    await screen.findByText('Tratamiento Preaprobado Detectado')
    fireEvent.click(screen.getByRole('button', { name: 'Usar este tratamiento' }))

    await vi.waitFor(() => {
      expect(usePreapprovedTreatmentMatchMock).toHaveBeenCalledWith(50, 42)
    })
    expect(await screen.findByText(/debe confirmarla/i)).toBeInTheDocument()
  })

  test('resumes an existing draft: loads the waste and prefills Step 1 fields', async () => {
    fetchWasteMock.mockResolvedValue({
      waste: {
        id: 77,
        organization_id: 1,
        branch_id: null,
        waste_category_id: 1,
        code: 'RES-0077',
        name: 'Solvente Usado',
        description: 'Solvente de limpieza',
        status: 'BR',
        waste_danger: null,
        waste_type_id: 1,
        physical_state_id: 1,
        measurement_unit_id: 1,
        average_weight: null,
        generation_frequency_id: null,
        requires_special_transport: false,
        requires_special_ppe: false,
        requires_sds: false,
        requires_characterization: false,
        quantity: null,
        generation_date: null,
        internal_reference: null,
        operational_notes: null,
        is_active: true,
        organization: { id: 1, legal_name: 'Hospital San José' },
        branch: null,
        waste_category: catalogItem({ id: 1, uuid: 'wc-1', code: 'INDUSTRIAL', name: 'Industrial' }),
        waste_type: catalogItem({ id: 1, uuid: 'wt-1', code: 'OPERATIONAL', name: 'Operacional' }),
        physical_state: { id: 1, uuid: 'ps-1', code: 'LIQUID', name: 'Líquido', is_system: true, is_active: true, created_at: '', updated_at: '' },
        measurement_unit: { id: 1, uuid: 'mu-1', code: 'KG', name: 'Kilogramo', is_system: true, is_active: true, created_at: '', updated_at: '' },
        generation_frequency: null,
        operational_status: catalogItem({ id: 1, uuid: 'os-1', code: 'ACTIVE', name: 'Activo' }),
        waste_stream_assignments: [],
        waste_un_codes: [],
        waste_hazard_characteristics: [],
        created_by: { id: 1, username: 'admin' },
        updated_by: { id: 1, username: 'admin' },
      },
    })
    fetchWasteFilesMock.mockResolvedValue({ files: {} })

    render(<WasteWizard wasteId={77} />)

    await vi.waitFor(() => {
      expect(fetchWasteMock).toHaveBeenCalledWith(77)
    })
    expect(await screen.findByDisplayValue('Solvente Usado')).toBeInTheDocument()
  })

  test('"Guardar Borrador" persists without advancing the step', async () => {
    createWasteMock.mockResolvedValue({ waste: { id: 50, name: 'Aceite Lubricante Usado' } })
    render(<WasteWizard />)

    await screen.findByRole('heading', { name: 'Paso 1 de 5 — Identificación' })
    fireEvent.change(screen.getByLabelText('Nombre del Residuo *'), { target: { value: 'Aceite Lubricante Usado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Borrador' }))

    await vi.waitFor(() => {
      expect(createWasteMock).toHaveBeenCalled()
    })
    expect(screen.getByRole('heading', { name: 'Paso 1 de 5 — Identificación' })).toBeInTheDocument()
  })

  test('shows the "Organización" selector only for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['wastes.create', 'wastes.update'] }
    render(<WasteWizard />)
    await screen.findByRole('heading', { name: 'Paso 1 de 5 — Identificación' })

    expect(screen.getByLabelText('Organización')).toBeInTheDocument()
  })

  test('hides the "Organización" selector for a tenant actor', async () => {
    render(<WasteWizard />)
    await screen.findByRole('heading', { name: 'Paso 1 de 5 — Identificación' })

    expect(screen.queryByLabelText('Organización')).not.toBeInTheDocument()
  })
})
