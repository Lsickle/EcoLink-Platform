import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateBranchTypeForm } from './CreateBranchTypeForm'

const createBranchTypeMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createBranchType: (...args: unknown[]) => createBranchTypeMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

describe('CreateBranchTypeForm', () => {
  beforeEach(() => {})

  afterEach(() => {
    createBranchTypeMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the branch_types.manage permission via useRequireAuth', () => {
    render(<CreateBranchTypeForm />)

    expect(useRequireAuthMock).toHaveBeenCalledWith('branch_types.manage')
  })

  test('shows validation errors when submitting without required fields', async () => {
    render(<CreateBranchTypeForm />)

    fireEvent.click(screen.getByRole('button', { name: /crear tipo de sede/i }))

    expect(await screen.findByText('Ingresa un código.')).toBeInTheDocument()
    expect(screen.getByText('Ingresa un nombre.')).toBeInTheDocument()
    expect(screen.getByText('Ingresa una categoría.')).toBeInTheDocument()
    expect(createBranchTypeMock).not.toHaveBeenCalled()
  })

  test('submits the payload with the 4 capability flags and navigates to the detail page', async () => {
    createBranchTypeMock.mockResolvedValueOnce({ branch_type: { id: 9, code: 'LAB' } })
    render(<CreateBranchTypeForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'LAB' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Laboratorio' } })
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Técnica' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tratamiento' }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear tipo de sede/i }))
    })

    expect(createBranchTypeMock).toHaveBeenCalledWith({
      code: 'LAB',
      name: 'Laboratorio',
      category: 'Técnica',
      is_logistics: false,
      is_storage: false,
      is_treatment: true,
      is_dispatch: false,
    })
    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/branch-types/9')
  })

  test('shows the API validation error on submit failure', async () => {
    createBranchTypeMock.mockRejectedValueOnce(new ApiValidationError('Error de validación.', { code: ['Ya existe ese código.'] }))
    render(<CreateBranchTypeForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'LAB' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Laboratorio' } })
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Técnica' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear tipo de sede/i }))
    })

    expect(await screen.findByText('Ya existe ese código.')).toBeInTheDocument()
  })
})
