import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateBranchTreatmentForm } from './CreateBranchTreatmentForm'

const createBranchTreatmentMock = vi.fn()
const fetchBranchesMock = vi.fn()
const fetchTreatmentsMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createBranchTreatment: (...args: unknown[]) => createBranchTreatmentMock(...args),
    fetchBranches: (...args: unknown[]) => fetchBranchesMock(...args),
    fetchTreatments: (...args: unknown[]) => fetchTreatmentsMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean } | null = { id: 1, is_platform_staff: false }

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

describe('CreateBranchTreatmentForm', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false }
    fetchBranchesMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 7, uuid: 'branch-7', name: 'Planta Norte', code: 'PN' }],
      kpis: { total: 0, active: 0, inactive: 0, suspended: 0 },
    })
    fetchTreatmentsMock.mockResolvedValue({
      ...emptyPage,
      data: [{ id: 3, uuid: 'treat-3', code: 'INCIN', name: 'Incineración', treatment_type: 'THERMAL', risk_level: 'HIGH', is_active: true }],
    })
    searchOrganizationsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    createBranchTreatmentMock.mockReset()
    fetchBranchesMock.mockReset()
    fetchTreatmentsMock.mockReset()
    searchOrganizationsMock.mockReset()
    pushMock.mockReset()
  })

  test('hides the "Organización" selector for a non-platform-staff actor', async () => {
    render(<CreateBranchTreatmentForm />)
    await screen.findByLabelText(/sede/i)

    expect(screen.queryByLabelText('Organización')).not.toBeInTheDocument()
  })

  test('shows the "Organización" selector for platform staff, filtered by can_treat_waste', async () => {
    currentUser = { id: 1, is_platform_staff: true }
    render(<CreateBranchTreatmentForm />)

    expect(await screen.findByLabelText('Organización')).toBeInTheDocument()
  })

  test('fetches only active treatments for the "Tratamiento" selector', async () => {
    render(<CreateBranchTreatmentForm />)
    await screen.findByLabelText(/sede/i)

    expect(fetchTreatmentsMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }))
  })

  test('requires a branch and a treatment before submitting', async () => {
    render(<CreateBranchTreatmentForm />)
    await screen.findByLabelText(/sede/i)

    fireEvent.click(screen.getByRole('button', { name: /crear tratamiento de sede/i }))

    expect(await screen.findByText('Selecciona una sede.')).toBeInTheDocument()
    expect(createBranchTreatmentMock).not.toHaveBeenCalled()
  })

  test('creates a branch treatment for a non-platform-staff actor without organization_id', async () => {
    createBranchTreatmentMock.mockResolvedValueOnce({ branch_treatment: { id: 55 } })
    render(<CreateBranchTreatmentForm />)
    await screen.findByLabelText(/sede/i)

    fireEvent.click(screen.getByRole('combobox', { name: /sede/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Planta Norte' }))
    fireEvent.click(screen.getByRole('combobox', { name: /tratamiento/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Incineración' }))
    fireEvent.click(screen.getByRole('button', { name: /crear tratamiento de sede/i }))

    await vi.waitFor(() => expect(createBranchTreatmentMock).toHaveBeenCalled())
    expect(createBranchTreatmentMock).toHaveBeenCalledWith(
      expect.objectContaining({ branch_id: 7, treatment_id: 3 })
    )
    expect(createBranchTreatmentMock).toHaveBeenCalledWith(expect.not.objectContaining({ organization_id: expect.anything() }))
    expect(pushMock).toHaveBeenCalledWith('/admin/branch-treatments/55')
  })

  test('shows the backend validation error when the organization lacks can_treat_waste', async () => {
    createBranchTreatmentMock.mockRejectedValueOnce(
      new ApiValidationError('The given data was invalid.', {
        organization_id: ['La organización no tiene el tipo de negocio Gestor, no puede habilitar tratamientos.'],
      })
    )
    render(<CreateBranchTreatmentForm />)
    await screen.findByLabelText(/sede/i)

    fireEvent.click(screen.getByRole('combobox', { name: /sede/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Planta Norte' }))
    fireEvent.click(screen.getByRole('combobox', { name: /tratamiento/i }))
    fireEvent.click(await screen.findByRole('option', { name: 'Incineración' }))
    fireEvent.click(screen.getByRole('button', { name: /crear tratamiento de sede/i }))

    expect(
      await screen.findByText('La organización no tiene el tipo de negocio Gestor, no puede habilitar tratamientos.')
    ).toBeInTheDocument()
  })
})
