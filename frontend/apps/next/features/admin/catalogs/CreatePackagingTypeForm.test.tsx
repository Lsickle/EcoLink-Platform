import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreatePackagingTypeForm } from './CreatePackagingTypeForm'

const createPackagingTypeMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createPackagingType: (...args: unknown[]) => createPackagingTypeMock(...args),
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

describe('CreatePackagingTypeForm', () => {
  beforeEach(() => {})

  afterEach(() => {
    createPackagingTypeMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the packaging_types.manage permission via useRequireAuth', () => {
    render(<CreatePackagingTypeForm />)

    expect(useRequireAuthMock).toHaveBeenCalledWith('packaging_types.manage')
  })

  test('shows validation errors when submitting without required fields', async () => {
    render(<CreatePackagingTypeForm />)

    fireEvent.click(screen.getByRole('button', { name: /crear tipo de embalaje/i }))

    expect(await screen.findByText('Ingresa un código.')).toBeInTheDocument()
    expect(screen.getByText('Ingresa un nombre.')).toBeInTheDocument()
    expect(createPackagingTypeMock).not.toHaveBeenCalled()
  })

  test('submits the payload and navigates to the detail page', async () => {
    createPackagingTypeMock.mockResolvedValueOnce({ packaging_type: { id: 30, code: 'FRASCO_VIDRIO' } })
    render(<CreatePackagingTypeForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'FRASCO_VIDRIO' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Frasco de vidrio' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear tipo de embalaje/i }))
    })

    expect(createPackagingTypeMock).toHaveBeenCalledWith({
      code: 'FRASCO_VIDRIO',
      name: 'Frasco de vidrio',
    })
    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/packaging-types/30')
  })

  test('shows the API validation error on submit failure', async () => {
    createPackagingTypeMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { code: ['Ya existe ese código.'] })
    )
    render(<CreatePackagingTypeForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'FRASCO_VIDRIO' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Frasco de vidrio' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear tipo de embalaje/i }))
    })

    expect(await screen.findByText('Ya existe ese código.')).toBeInTheDocument()
  })
})
