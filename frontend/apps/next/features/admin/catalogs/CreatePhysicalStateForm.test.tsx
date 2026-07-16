import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreatePhysicalStateForm } from './CreatePhysicalStateForm'

const createPhysicalStateMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createPhysicalState: (...args: unknown[]) => createPhysicalStateMock(...args),
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

describe('CreatePhysicalStateForm', () => {
  beforeEach(() => {})

  afterEach(() => {
    createPhysicalStateMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the physical_states.manage permission via useRequireAuth', () => {
    render(<CreatePhysicalStateForm />)

    expect(useRequireAuthMock).toHaveBeenCalledWith('physical_states.manage')
  })

  test('shows validation errors when submitting without required fields', async () => {
    render(<CreatePhysicalStateForm />)

    fireEvent.click(screen.getByRole('button', { name: /crear estado físico/i }))

    expect(await screen.findByText('Ingresa un código.')).toBeInTheDocument()
    expect(screen.getByText('Ingresa un nombre.')).toBeInTheDocument()
    expect(createPhysicalStateMock).not.toHaveBeenCalled()
  })

  test('submits the payload and navigates to the detail page', async () => {
    createPhysicalStateMock.mockResolvedValueOnce({ physical_state: { id: 9, code: 'PASTOSO' } })
    render(<CreatePhysicalStateForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'PASTOSO' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Pastoso' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear estado físico/i }))
    })

    expect(createPhysicalStateMock).toHaveBeenCalledWith({
      code: 'PASTOSO',
      name: 'Pastoso',
    })
    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/physical-states/9')
  })

  test('shows the API validation error on submit failure', async () => {
    createPhysicalStateMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { code: ['Ya existe ese código.'] })
    )
    render(<CreatePhysicalStateForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'PASTOSO' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Pastoso' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear estado físico/i }))
    })

    expect(await screen.findByText('Ya existe ese código.')).toBeInTheDocument()
  })
})
