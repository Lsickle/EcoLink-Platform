import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateUnCodeForm } from './CreateUnCodeForm'

const createUnCodeMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createUnCode: (...args: unknown[]) => createUnCodeMock(...args),
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

describe('CreateUnCodeForm', () => {
  beforeEach(() => {
    createUnCodeMock.mockResolvedValue({ un_code: { id: 7, code: 'UN9999', name: 'Prueba' } })
  })

  afterEach(() => {
    createUnCodeMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the un_codes.read permission via useRequireAuth', () => {
    render(<CreateUnCodeForm />)
    expect(useRequireAuthMock).toHaveBeenCalledWith('un_codes.read')
  })

  test('shows field errors and does not submit when code/name are empty', async () => {
    render(<CreateUnCodeForm />)

    fireEvent.click(screen.getByRole('button', { name: /crear código un/i }))

    expect(await screen.findByText('Ingresa un código.')).toBeInTheDocument()
    expect(createUnCodeMock).not.toHaveBeenCalled()
  })

  test('submits the payload with optional fields omitted when blank', async () => {
    render(<CreateUnCodeForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'UN9999' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Prueba' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear código un/i }))
    })

    expect(createUnCodeMock).toHaveBeenCalledWith({ code: 'UN9999', name: 'Prueba', hazard_class: undefined, packing_group: undefined })
    expect(pushMock).toHaveBeenCalledWith('/admin/un-codes/7')
  })

  test('shows the API error without navigating', async () => {
    createUnCodeMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { code: ['El código ya está en uso.'] })
    )
    render(<CreateUnCodeForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'UN1013' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Duplicado' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear código un/i }))
    })

    expect(await screen.findByText('El código ya está en uso.')).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })
})
