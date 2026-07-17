import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchTreatmentDetailScreen } from './BranchTreatmentDetailScreen'

const fetchBranchTreatmentMock = vi.fn()
const updateBranchTreatmentMock = vi.fn()
const activateBranchTreatmentMock = vi.fn()
const deactivateBranchTreatmentMock = vi.fn()
const fetchBranchTreatmentActivityMock = vi.fn()
const syncAllowedWasteStreamsMock = vi.fn()
const syncAllowedUnCodesMock = vi.fn()
const fetchWasteStreamsMock = vi.fn()
const fetchUnCodesMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchBranchTreatment: (...args: unknown[]) => fetchBranchTreatmentMock(...args),
    updateBranchTreatment: (...args: unknown[]) => updateBranchTreatmentMock(...args),
    activateBranchTreatment: (...args: unknown[]) => activateBranchTreatmentMock(...args),
    deactivateBranchTreatment: (...args: unknown[]) => deactivateBranchTreatmentMock(...args),
    fetchBranchTreatmentActivity: (...args: unknown[]) => fetchBranchTreatmentActivityMock(...args),
    syncBranchTreatmentAllowedWasteStreams: (...args: unknown[]) => syncAllowedWasteStreamsMock(...args),
    syncBranchTreatmentAllowedUnCodes: (...args: unknown[]) => syncAllowedUnCodesMock(...args),
    fetchWasteStreams: (...args: unknown[]) => fetchWasteStreamsMock(...args),
    fetchUnCodes: (...args: unknown[]) => fetchUnCodesMock(...args),
  }
})

const useRequireAuthMock = vi.fn((_permission?: string) => ({ user: { id: 1 }, isLoading: false, isAuthorized: true }))

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function branchTreatmentDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10,
    uuid: 'bt-10',
    organization_id: 1,
    branch_id: 7,
    treatment_id: 3,
    internal_code: 'BT-001',
    operational_name: 'Horno 1',
    max_capacity: '5000.00',
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
    created_at: '2026-07-17T00:00:00Z',
    updated_at: '2026-07-17T00:00:00Z',
    organization: { id: 1, legal_name: 'EcoGestor SAS' },
    branch: { id: 7, name: 'Planta Norte' },
    treatment: { id: 3, code: 'INCIN', name: 'Incineración', treatment_type: 'THERMAL', risk_level: 'HIGH', is_active: true },
    allowed_waste_streams: [{ id: 1, code: 'Y1', name: 'Desechos clínicos', tipo: 'Y' }],
    allowed_un_codes: [],
    created_by: { id: 1, username: 'admin' },
    updated_by: null,
    ...overrides,
  }
}

describe('BranchTreatmentDetailScreen', () => {
  beforeEach(() => {
    fetchBranchTreatmentMock.mockResolvedValue({ branch_treatment: branchTreatmentDetail() })
    fetchWasteStreamsMock.mockResolvedValue({
      ...emptyPage,
      data: [
        { id: 1, uuid: 'ws-1', code: 'Y1', name: 'Desechos clínicos', tipo: 'Y', is_active: true },
        { id: 2, uuid: 'ws-2', code: 'Y2', name: 'Desechos farmacéuticos', tipo: 'Y', is_active: true },
      ],
    })
    fetchUnCodesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 5, uuid: 'un-5', code: 'UN3291', name: 'Desechos clínicos', is_active: true }],
    })
    fetchBranchTreatmentActivityMock.mockResolvedValue({ ...emptyPage, data: [] })
  })

  afterEach(() => {
    fetchBranchTreatmentMock.mockReset()
    updateBranchTreatmentMock.mockReset()
    activateBranchTreatmentMock.mockReset()
    deactivateBranchTreatmentMock.mockReset()
    fetchBranchTreatmentActivityMock.mockReset()
    syncAllowedWasteStreamsMock.mockReset()
    syncAllowedUnCodesMock.mockReset()
    fetchWasteStreamsMock.mockReset()
    fetchUnCodesMock.mockReset()
  })

  test('renders the General tab with Sede/Organización/Tratamiento and editable capacity fields', async () => {
    render(<BranchTreatmentDetailScreen branchTreatmentId={10} />)

    expect((await screen.findAllByText('Planta Norte')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('EcoGestor SAS').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Capacidad Máxima')).toHaveValue(5000)
  })

  test('saves changes via updateBranchTreatment', async () => {
    updateBranchTreatmentMock.mockResolvedValueOnce({
      branch_treatment: { ...branchTreatmentDetail(), operational_name: 'Horno Principal' },
    })
    render(<BranchTreatmentDetailScreen branchTreatmentId={10} />)
    await screen.findByLabelText('Capacidad Máxima')

    fireEvent.change(screen.getByLabelText(/nombre operativo/i), { target: { value: 'Horno Principal' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    })

    expect(updateBranchTreatmentMock).toHaveBeenCalledWith(10, expect.objectContaining({ operational_name: 'Horno Principal' }))
  })

  test('toggles active status via activateBranchTreatment/deactivateBranchTreatment', async () => {
    deactivateBranchTreatmentMock.mockResolvedValueOnce({
      branch_treatment: { ...branchTreatmentDetail(), is_active: false, operational_status: 'INACTIVE' },
    })
    render(<BranchTreatmentDetailScreen branchTreatmentId={10} />)
    await screen.findByLabelText('Capacidad Máxima')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivateBranchTreatmentMock).toHaveBeenCalledWith(10)
  })

  test('the "Corrientes" tab shows a checklist of active waste streams, pre-checking the allowed ones', async () => {
    render(<BranchTreatmentDetailScreen branchTreatmentId={10} />)
    await screen.findByLabelText('Capacidad Máxima')

    fireEvent.click(screen.getByRole('tab', { name: 'Corrientes' }))

    await vi.waitFor(() => expect(fetchWasteStreamsMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' })))
    expect(await screen.findByText('Desechos farmacéuticos')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /desechos clínicos/i })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /desechos farmacéuticos/i })).not.toBeChecked()
  })

  test('"Guardar Corrientes" calls syncBranchTreatmentAllowedWasteStreams with the selected ids', async () => {
    syncAllowedWasteStreamsMock.mockResolvedValueOnce({ branch_treatment: branchTreatmentDetail() })
    render(<BranchTreatmentDetailScreen branchTreatmentId={10} />)
    await screen.findByLabelText('Capacidad Máxima')

    fireEvent.click(screen.getByRole('tab', { name: 'Corrientes' }))
    await screen.findByText('Desechos farmacéuticos')

    fireEvent.click(screen.getByRole('checkbox', { name: /desechos farmacéuticos/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar Corrientes' }))
    })

    expect(syncAllowedWasteStreamsMock).toHaveBeenCalledWith(10, expect.arrayContaining([1, 2]))
  })

  test('"Guardar Códigos UN" calls syncBranchTreatmentAllowedUnCodes with the selected ids', async () => {
    syncAllowedUnCodesMock.mockResolvedValueOnce({ branch_treatment: branchTreatmentDetail() })
    render(<BranchTreatmentDetailScreen branchTreatmentId={10} />)
    await screen.findByLabelText('Capacidad Máxima')

    fireEvent.click(screen.getByRole('tab', { name: 'Corrientes' }))
    const unCodesHeading = await screen.findByRole('heading', { name: /códigos un permitidos/i })
    fireEvent.click(within(unCodesHeading.closest('div') as HTMLElement).getByRole('button', { name: /mostrar/i }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /un3291/i }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar Códigos UN' }))
    })

    expect(syncAllowedUnCodesMock).toHaveBeenCalledWith(10, [5])
  })

  test('the "Actividad" tab lazy-loads audit events', async () => {
    fetchBranchTreatmentActivityMock.mockResolvedValueOnce({
      ...emptyPage,
      data: [{ event_type: 'BRANCH_TREATMENT_CREATED', description: 'Tratamiento de sede creado.', actor: { id: 1, username: 'admin' }, created_at: '2026-07-17T00:00:00Z' }],
    })
    render(<BranchTreatmentDetailScreen branchTreatmentId={10} />)
    await screen.findByLabelText('Capacidad Máxima')
    expect(fetchBranchTreatmentActivityMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('tab', { name: 'Actividad' }))

    expect(await screen.findByText('Tratamiento de sede creado.')).toBeInTheDocument()
    expect(fetchBranchTreatmentActivityMock).toHaveBeenCalledWith(10, expect.any(Object))
  })
})
