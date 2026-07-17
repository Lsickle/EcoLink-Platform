import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TreatmentApprovalDetailScreen } from './TreatmentApprovalDetailScreen'

const fetchTreatmentApprovalMock = vi.fn()
const updateTreatmentApprovalMock = vi.fn()
const approveTreatmentApprovalTechnicalMock = vi.fn()
const rejectTreatmentApprovalTechnicalMock = vi.fn()
const approveTreatmentApprovalCommercialMock = vi.fn()
const rejectTreatmentApprovalCommercialMock = vi.fn()
const quoteTreatmentApprovalMock = vi.fn()
const negotiateTreatmentApprovalMock = vi.fn()
const cancelTreatmentApprovalMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchTreatmentApproval: (...args: unknown[]) => fetchTreatmentApprovalMock(...args),
    updateTreatmentApproval: (...args: unknown[]) => updateTreatmentApprovalMock(...args),
    approveTreatmentApprovalTechnical: (...args: unknown[]) => approveTreatmentApprovalTechnicalMock(...args),
    rejectTreatmentApprovalTechnical: (...args: unknown[]) => rejectTreatmentApprovalTechnicalMock(...args),
    approveTreatmentApprovalCommercial: (...args: unknown[]) => approveTreatmentApprovalCommercialMock(...args),
    rejectTreatmentApprovalCommercial: (...args: unknown[]) => rejectTreatmentApprovalCommercialMock(...args),
    quoteTreatmentApproval: (...args: unknown[]) => quoteTreatmentApprovalMock(...args),
    negotiateTreatmentApproval: (...args: unknown[]) => negotiateTreatmentApprovalMock(...args),
    cancelTreatmentApproval: (...args: unknown[]) => cancelTreatmentApprovalMock(...args),
  }
})

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[]; tenant_organization_id?: number } | null =
  {
    id: 1,
    is_platform_staff: false,
    permissions: ['treatment_approvals.read', 'treatment_approvals.update', 'treatment_approvals.evaluate'],
    tenant_organization_id: 2,
  }

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

function baseDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 5,
    uuid: 'ta-5',
    tenant_organization_id: 2,
    organization_id: 2,
    waste_id: 20,
    branch_treatment_id: 10,
    version: 1,
    commercial_status: 'DRAFT',
    technical_status: 'PENDING',
    unit_price: null,
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
    commercial_approved_at: null,
    valid_from: null,
    valid_until: null,
    detailed_notes: null,
    is_active: true,
    metadata: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    organization: { id: 2, legal_name: 'EcoGestor SAS' },
    waste: {
      id: 20,
      name: 'Aceite Lubricante Usado',
      code: 'RES-0001',
      organization_id: 1,
      organization: { id: 1, legal_name: 'Hospital San José' },
      waste_stream_assignments: [
        { id: 1, waste_stream_id: 119, waste_stream: { id: 119, code: 'Y9', name: 'Mezclas y emulsiones de aceite y agua', tipo: 'Y' } },
      ],
      waste_un_codes: [],
      waste_hazard_characteristics: [
        { id: 1, hazard_characteristic_id: 5, hazard_characteristic: { id: 5, code: 'TOXICO', name: 'TOXICO', risk_level: 7 } },
      ],
    },
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
    technical_approved_by: null,
    commercial_approved_by: null,
    ...overrides,
  }
}

describe('TreatmentApprovalDetailScreen', () => {
  beforeEach(() => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['treatment_approvals.read', 'treatment_approvals.update', 'treatment_approvals.evaluate'],
      tenant_organization_id: 2,
    }
    fetchTreatmentApprovalMock.mockResolvedValue({ treatment_approval: baseDetail() })
  })

  afterEach(() => {
    fetchTreatmentApprovalMock.mockReset()
    updateTreatmentApprovalMock.mockReset()
    approveTreatmentApprovalTechnicalMock.mockReset()
    rejectTreatmentApprovalTechnicalMock.mockReset()
    approveTreatmentApprovalCommercialMock.mockReset()
    rejectTreatmentApprovalCommercialMock.mockReset()
    quoteTreatmentApprovalMock.mockReset()
    negotiateTreatmentApprovalMock.mockReset()
    cancelTreatmentApprovalMock.mockReset()
  })

  test('shows the referenced waste read-only (name, code, generator organization) and the treatment', async () => {
    render(<TreatmentApprovalDetailScreen treatmentApprovalId={5} />)

    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.getByText('RES-0001')).toBeInTheDocument()
    expect(screen.getByText('Hospital San José')).toBeInTheDocument()
    expect(screen.getByText('Incineración')).toBeInTheDocument()
  })

  test('shows the waste classification (corrientes/UN, hazard characteristics) via the eager-loaded relations', async () => {
    render(<TreatmentApprovalDetailScreen treatmentApprovalId={5} />)

    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.getByText(/Y9/)).toBeInTheDocument()
    expect(screen.getByText(/TOXICO/)).toBeInTheDocument()
  })

  test('shows the "Aprobar Técnico"/"Rechazar Técnico" buttons when the actor is the evaluating Gestor and technical_status=PENDING', async () => {
    render(<TreatmentApprovalDetailScreen treatmentApprovalId={5} />)
    await screen.findByText('Aceite Lubricante Usado')

    expect(screen.getByRole('button', { name: 'Aprobar Técnico' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rechazar Técnico' })).toBeInTheDocument()
  })

  test('hides evaluation buttons for the waste-owner side (not the evaluating Gestor)', async () => {
    currentUser = {
      id: 2,
      is_platform_staff: false,
      permissions: ['treatment_approvals.read'],
      tenant_organization_id: 1,
    }
    render(<TreatmentApprovalDetailScreen treatmentApprovalId={5} />)
    await screen.findByText('Aceite Lubricante Usado')

    expect(screen.queryByRole('button', { name: 'Aprobar Técnico' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
  })

  test('"Aprobar Técnico" calls approveTreatmentApprovalTechnical', async () => {
    approveTreatmentApprovalTechnicalMock.mockResolvedValue({
      treatment_approval: { technical_status: 'APPROVED', commercial_status: 'DRAFT' },
    })
    render(<TreatmentApprovalDetailScreen treatmentApprovalId={5} />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar Técnico' }))

    await vi.waitFor(() => {
      expect(approveTreatmentApprovalTechnicalMock).toHaveBeenCalledWith(5, {})
    })
  })

  test('"Rechazar Técnico" requires technical_notes and calls rejectTreatmentApprovalTechnical', async () => {
    rejectTreatmentApprovalTechnicalMock.mockResolvedValue({
      treatment_approval: { technical_status: 'REJECTED', commercial_status: 'DRAFT' },
    })
    render(<TreatmentApprovalDetailScreen treatmentApprovalId={5} />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByRole('button', { name: 'Rechazar Técnico' }))
    fireEvent.change(screen.getByLabelText('Motivo del rechazo técnico'), { target: { value: 'Falta caracterización' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Rechazo Técnico' }))

    await vi.waitFor(() => {
      expect(rejectTreatmentApprovalTechnicalMock).toHaveBeenCalledWith(5, { technical_notes: 'Falta caracterización' })
    })
  })

  test('does not show "Aprobar Comercial" without unit_price fixed, shows it once unit_price is present', async () => {
    fetchTreatmentApprovalMock.mockResolvedValue({
      treatment_approval: baseDetail({ commercial_status: 'QUOTED', unit_price: '150.00' }),
    })
    render(<TreatmentApprovalDetailScreen treatmentApprovalId={5} />)
    await screen.findByText('Aceite Lubricante Usado')

    expect(screen.getByRole('button', { name: 'Aprobar Comercial' })).toBeInTheDocument()
  })

  test('editing commercial terms calls updateTreatmentApproval', async () => {
    updateTreatmentApprovalMock.mockResolvedValue({
      treatment_approval: { unit_price: '150.00', currency: 'COP', billing_unit: 'KG' },
    })
    render(<TreatmentApprovalDetailScreen treatmentApprovalId={5} />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.change(screen.getByLabelText('Precio Unitario'), { target: { value: '150' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await vi.waitFor(() => {
      expect(updateTreatmentApprovalMock).toHaveBeenCalledWith(5, expect.objectContaining({ unit_price: 150 }))
    })
  })
})
