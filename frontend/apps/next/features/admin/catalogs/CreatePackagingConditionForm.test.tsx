import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreatePackagingConditionForm } from './CreatePackagingConditionForm'

const createPackagingConditionMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createPackagingCondition: (...args: unknown[]) => createPackagingConditionMock(...args),
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

describe('CreatePackagingConditionForm', () => {
  beforeEach(() => {})

  afterEach(() => {
    createPackagingConditionMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the packaging_conditions.manage permission via useRequireAuth', () => {
    render(<CreatePackagingConditionForm />)

    expect(useRequireAuthMock).toHaveBeenCalledWith('packaging_conditions.manage')
  })

  test('renders the provisional data notice', () => {
    render(<CreatePackagingConditionForm />)

    expect(screen.getByText(/datos provisionales/i)).toBeInTheDocument()
  })

  test('shows validation errors when submitting without required fields', async () => {
    render(<CreatePackagingConditionForm />)

    fireEvent.click(screen.getByRole('button', { name: /crear estado/i }))

    expect(await screen.findByText('Ingresa un código.')).toBeInTheDocument()
    expect(screen.getByText('Ingresa un nombre.')).toBeInTheDocument()
    expect(createPackagingConditionMock).not.toHaveBeenCalled()
  })

  test('submits without risk_level when left blank (nullable field)', async () => {
    createPackagingConditionMock.mockResolvedValueOnce({ packaging_condition: { id: 8, code: 'HUMEDO' } })
    render(<CreatePackagingConditionForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'HUMEDO' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Húmedo' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear estado/i }))
    })

    expect(createPackagingConditionMock).toHaveBeenCalledWith({
      code: 'HUMEDO',
      name: 'Húmedo',
      risk_level: undefined,
    })
    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/packaging-conditions/8')
  })

  test('submits the payload with risk_level and navigates to the detail page', async () => {
    createPackagingConditionMock.mockResolvedValueOnce({ packaging_condition: { id: 9, code: 'OXIDADO' } })
    render(<CreatePackagingConditionForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'OXIDADO' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Oxidado' } })
    fireEvent.change(screen.getByLabelText(/nivel de riesgo/i), { target: { value: '7' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear estado/i }))
    })

    expect(createPackagingConditionMock).toHaveBeenCalledWith({
      code: 'OXIDADO',
      name: 'Oxidado',
      risk_level: 7,
    })
    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/packaging-conditions/9')
  })

  test('shows the API validation error on submit failure', async () => {
    createPackagingConditionMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { code: ['Ya existe ese código.'] })
    )
    render(<CreatePackagingConditionForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'HUMEDO' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Húmedo' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear estado/i }))
    })

    expect(await screen.findByText('Ya existe ese código.')).toBeInTheDocument()
  })
})
