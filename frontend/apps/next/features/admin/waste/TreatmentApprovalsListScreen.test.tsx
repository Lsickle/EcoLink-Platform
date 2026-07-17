import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TreatmentApprovalsListScreen } from './TreatmentApprovalsListScreen'

const fetchTreatmentApprovalsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchTreatmentApprovals: (...args: unknown[]) => fetchTreatmentApprovalsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['treatment_approvals.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function approvalsPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...emptyPage,
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
        is_active: true,
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
        organization: { id: 2, legal_name: 'EcoGestor SAS' },
        waste: { id: 20, name: 'Aceite Lubricante Usado', code: 'RES-0001', organization_id: 1 },
        branch_treatment: { id: 10, operational_name: 'Horno 1', branch_id: 7, treatment_id: 3 },
      },
    ],
    total: 1,
    ...overrides,
  }
}

describe('TreatmentApprovalsListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['treatment_approvals.read'] }
    fetchTreatmentApprovalsMock.mockResolvedValue(approvalsPage())
  })

  afterEach(() => {
    fetchTreatmentApprovalsMock.mockReset()
    pushMock.mockReset()
  })

  test('renders the Residuo/Tratamiento/Estado Técnico/Estado Comercial/Precio columns', async () => {
    render(<TreatmentApprovalsListScreen />)

    await screen.findByText('Aceite Lubricante Usado')
    expect(screen.getByText('EcoGestor SAS')).toBeInTheDocument()
    expect(screen.getByText('Horno 1')).toBeInTheDocument()
    expect(screen.getByText('Aprobado')).toBeInTheDocument()
    expect(screen.getByText('Cotizado')).toBeInTheDocument()
    expect(screen.getByText('150.00 COP/KG')).toBeInTheDocument()
  })

  test('filters by technical status', async () => {
    render(<TreatmentApprovalsListScreen />)
    await screen.findByText('Aceite Lubricante Usado')
    fetchTreatmentApprovalsMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado técnico' }))
    const option = await screen.findByRole('option', { name: 'Aprobado' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchTreatmentApprovalsMock).toHaveBeenCalledWith(expect.objectContaining({ technicalStatus: 'APPROVED' }))
  })

  test('navigates to the detail page when a row is clicked', async () => {
    render(<TreatmentApprovalsListScreen />)
    await screen.findByText('Aceite Lubricante Usado')

    fireEvent.click(screen.getByText('Aceite Lubricante Usado'))

    expect(pushMock).toHaveBeenCalledWith('/admin/treatment-approvals/5')
  })

  test('shows an empty message when there are no results', async () => {
    fetchTreatmentApprovalsMock.mockResolvedValue(emptyPage)
    render(<TreatmentApprovalsListScreen />)

    expect(await screen.findByText(/No hay evaluaciones de tratamiento/i)).toBeInTheDocument()
  })

  test('does not render a "Crear" button (requests are created only from the waste detail)', async () => {
    render(<TreatmentApprovalsListScreen />)
    await screen.findByText('Aceite Lubricante Usado')

    expect(screen.queryByRole('button', { name: /crear/i })).not.toBeInTheDocument()
  })
})
