import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { CreateWasteCategoryForm } from './CreateWasteCategoryForm'

const createWasteCategoryMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    createWasteCategory: (...args: unknown[]) => createWasteCategoryMock(...args),
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

describe('CreateWasteCategoryForm', () => {
  beforeEach(() => {})

  afterEach(() => {
    createWasteCategoryMock.mockReset()
    pushMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the waste_categories.manage permission via useRequireAuth', () => {
    render(<CreateWasteCategoryForm />)

    expect(useRequireAuthMock).toHaveBeenCalledWith('waste_categories.manage')
  })

  test('shows validation errors when submitting without required fields', async () => {
    render(<CreateWasteCategoryForm />)

    fireEvent.click(screen.getByRole('button', { name: /crear categoría/i }))

    expect(await screen.findByText('Ingresa un código.')).toBeInTheDocument()
    expect(screen.getByText('Ingresa un nombre.')).toBeInTheDocument()
    expect(createWasteCategoryMock).not.toHaveBeenCalled()
  })

  test('submits the payload and navigates to the detail page', async () => {
    createWasteCategoryMock.mockResolvedValueOnce({ waste_category: { id: 9, code: 'ORGANICO' } })
    render(<CreateWasteCategoryForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'ORGANICO' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Orgánico' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear categoría/i }))
    })

    expect(createWasteCategoryMock).toHaveBeenCalledWith({
      code: 'ORGANICO',
      name: 'Orgánico',
      description: undefined,
    })
    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/waste-categories/9')
  })

  test('shows the API validation error on submit failure', async () => {
    createWasteCategoryMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { code: ['Ya existe ese código.'] })
    )
    render(<CreateWasteCategoryForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'ORGANICO' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Orgánico' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /crear categoría/i }))
    })

    expect(await screen.findByText('Ya existe ese código.')).toBeInTheDocument()
  })
})
