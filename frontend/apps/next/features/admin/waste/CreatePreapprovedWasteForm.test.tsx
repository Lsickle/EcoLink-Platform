import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { CreatePreapprovedWasteForm } from './CreatePreapprovedWasteForm'

const createPreapprovedWasteMock = vi.fn()
const fetchWasteCategoriesMock = vi.fn()
const fetchPhysicalStatesMock = vi.fn()
const fetchMeasurementUnitsMock = vi.fn()
const fetchGenerationFrequenciesMock = vi.fn()
const fetchWasteStreamsMock = vi.fn()
const fetchUnCodesMock = vi.fn()
const fetchBranchTreatmentsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createPreapprovedWaste: (...args: unknown[]) => createPreapprovedWasteMock(...args),
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
  useRouter: () => ({ push: pushMock }),
}))

type MockUser = { id: number; is_platform_staff: boolean; permissions: string[] } | null
let currentUser: MockUser = { id: 1, is_platform_staff: false, permissions: ['preapproved_wastes.manage'] }

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: (permission?: string) => {
    useRequireAuthCalls.push(permission)
    return { isAuthorized: true, user: currentUser, isLoading: false }
  },
}))

let useRequireAuthCalls: (string | undefined)[] = []

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 100 }

describe('CreatePreapprovedWasteForm', () => {
  beforeEach(() => {
    useRequireAuthCalls = []
    currentUser = { id: 1, is_platform_staff: false, permissions: ['preapproved_wastes.manage'] }
    fetchWasteCategoriesMock.mockResolvedValue(emptyPage)
    fetchPhysicalStatesMock.mockResolvedValue(emptyPage)
    fetchMeasurementUnitsMock.mockResolvedValue(emptyPage)
    fetchGenerationFrequenciesMock.mockResolvedValue(emptyPage)
    fetchWasteStreamsMock.mockResolvedValue(emptyPage)
    fetchUnCodesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 7, uuid: 'un-7', code: 'UN1993', name: 'Líquido inflamable', is_system: true, is_active: true, created_at: '', updated_at: '' }],
    })
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
    createPreapprovedWasteMock.mockReset()
    fetchWasteCategoriesMock.mockReset()
    fetchPhysicalStatesMock.mockReset()
    fetchMeasurementUnitsMock.mockReset()
    fetchGenerationFrequenciesMock.mockReset()
    fetchWasteStreamsMock.mockReset()
    fetchUnCodesMock.mockReset()
    fetchBranchTreatmentsMock.mockReset()
    pushMock.mockReset()
  })

  test('requires the preapproved_wastes.manage permission via useRequireAuth', async () => {
    render(<CreatePreapprovedWasteForm />)
    await screen.findByLabelText('Nombre')

    expect(useRequireAuthCalls).toContain('preapproved_wastes.manage')
  })

  test('shows a validation error when submitting without a name', async () => {
    render(<CreatePreapprovedWasteForm />)
    await screen.findByLabelText('Nombre')

    fireEvent.click(screen.getByRole('button', { name: 'Crear Residuo Preaprobado' }))

    expect(await screen.findByText('El nombre es obligatorio.')).toBeInTheDocument()
    expect(createPreapprovedWasteMock).not.toHaveBeenCalled()
  })

  test('shows a validation error when no classification (waste stream / UN code) is assigned', async () => {
    render(<CreatePreapprovedWasteForm />)
    await screen.findByLabelText('Nombre')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Aceite Preaprobado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear Residuo Preaprobado' }))

    expect(await screen.findByText('Asigna al menos una corriente Y/A o un código UN.')).toBeInTheDocument()
    expect(createPreapprovedWasteMock).not.toHaveBeenCalled()
  })

  test('for a platform-staff actor, shows the organization selector and requires it', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['preapproved_wastes.manage'] }
    render(<CreatePreapprovedWasteForm />)

    expect(await screen.findByLabelText('Organización')).toBeInTheDocument()
    // Sin organización elegida, no se cargan tratamientos de sede.
    expect(fetchBranchTreatmentsMock).not.toHaveBeenCalled()
  })

  test('submits with the nested approval payload and navigates to the detail page', async () => {
    createPreapprovedWasteMock.mockResolvedValueOnce({ waste: { id: 55 } })
    render(<CreatePreapprovedWasteForm />)
    await screen.findByLabelText('Nombre')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Aceite Preaprobado' } })

    // Selección del código UN vía MultiChipPicker.
    fireEvent.click(screen.getByRole('combobox', { name: '+ Agregar UN' }))
    const unOption = await screen.findByRole('option', { name: /UN1993/ })
    fireEvent.click(unOption)

    // Selección del tratamiento de sede.
    fireEvent.click(screen.getByRole('combobox', { name: /tratamiento de sede/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Incineración Planta 1' }))

    fireEvent.click(screen.getByRole('button', { name: 'Crear Residuo Preaprobado' }))

    await vi.waitFor(() => {
      expect(createPreapprovedWasteMock).toHaveBeenCalled()
    })
    const payload = createPreapprovedWasteMock.mock.calls[0]![0]
    expect(payload.name).toBe('Aceite Preaprobado')
    expect(payload.un_code_ids).toEqual([7])
    expect(payload.approval).toEqual(
      expect.objectContaining({ branch_treatment_id: 10, currency: 'COP', billing_unit: 'KG' })
    )
    expect(pushMock).toHaveBeenCalledWith('/admin/preapproved-wastes/55')
  })
})
