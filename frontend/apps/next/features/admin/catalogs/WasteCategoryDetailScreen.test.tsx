import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { WasteCategoryDetailScreen } from './WasteCategoryDetailScreen'

const fetchWasteCategoryMock = vi.fn()
const updateWasteCategoryMock = vi.fn()
const activateWasteCategoryMock = vi.fn()
const deactivateWasteCategoryMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchWasteCategory: (...args: unknown[]) => fetchWasteCategoryMock(...args),
    updateWasteCategory: (...args: unknown[]) => updateWasteCategoryMock(...args),
    activateWasteCategory: (...args: unknown[]) => activateWasteCategoryMock(...args),
    deactivateWasteCategory: (...args: unknown[]) => deactivateWasteCategoryMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeWasteCategory(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 4,
    uuid: 'wc-4',
    code: 'APROVECHABLE',
    name: 'Aprovechable',
    description: 'Residuos aprovechables.',
    is_system: true,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('WasteCategoryDetailScreen', () => {
  beforeEach(() => {
    fetchWasteCategoryMock.mockResolvedValue({ waste_category: makeWasteCategory() })
  })

  afterEach(() => {
    fetchWasteCategoryMock.mockReset()
    updateWasteCategoryMock.mockReset()
    activateWasteCategoryMock.mockReset()
    deactivateWasteCategoryMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the waste_categories.read permission via useRequireAuth', async () => {
    render(<WasteCategoryDetailScreen wasteCategoryId={4} />)
    await screen.findByText('Aprovechable')

    expect(useRequireAuthMock).toHaveBeenCalledWith('waste_categories.read')
  })

  test('saves changes via updateWasteCategory', async () => {
    updateWasteCategoryMock.mockResolvedValueOnce({
      waste_category: { ...makeWasteCategory(), name: 'Aprovechable Reciclable' },
    })
    render(<WasteCategoryDetailScreen wasteCategoryId={4} />)
    await screen.findByText('Aprovechable')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Aprovechable Reciclable' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(updateWasteCategoryMock).toHaveBeenCalledWith(4, expect.objectContaining({ name: 'Aprovechable Reciclable' }))
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
  })

  test('toggles active status via activateWasteCategory/deactivateWasteCategory', async () => {
    deactivateWasteCategoryMock.mockResolvedValueOnce({
      waste_category: { ...makeWasteCategory(), is_active: false },
    })
    render(<WasteCategoryDetailScreen wasteCategoryId={4} />)
    await screen.findByText('Aprovechable')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivateWasteCategoryMock).toHaveBeenCalledWith(4)
  })

  test('shows the API validation error on save failure', async () => {
    updateWasteCategoryMock.mockRejectedValueOnce(new ApiValidationError('Error.', { name: ['Ya existe ese nombre.'] }))
    render(<WasteCategoryDetailScreen wasteCategoryId={4} />)
    await screen.findByText('Aprovechable')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(await screen.findByText('Ya existe ese nombre.')).toBeInTheDocument()
  })
})
