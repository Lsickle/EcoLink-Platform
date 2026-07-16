import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { PackagingConditionDetailScreen } from './PackagingConditionDetailScreen'

const fetchPackagingConditionMock = vi.fn()
const updatePackagingConditionMock = vi.fn()
const activatePackagingConditionMock = vi.fn()
const deactivatePackagingConditionMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchPackagingCondition: (...args: unknown[]) => fetchPackagingConditionMock(...args),
    updatePackagingCondition: (...args: unknown[]) => updatePackagingConditionMock(...args),
    activatePackagingCondition: (...args: unknown[]) => activatePackagingConditionMock(...args),
    deactivatePackagingCondition: (...args: unknown[]) => deactivatePackagingConditionMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makePackagingCondition(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 2,
    uuid: 'pc-2',
    code: 'REGULAR',
    name: 'Regular',
    risk_level: 5,
    is_system: true,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('PackagingConditionDetailScreen', () => {
  beforeEach(() => {
    fetchPackagingConditionMock.mockResolvedValue({ packaging_condition: makePackagingCondition() })
  })

  afterEach(() => {
    fetchPackagingConditionMock.mockReset()
    updatePackagingConditionMock.mockReset()
    activatePackagingConditionMock.mockReset()
    deactivatePackagingConditionMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the packaging_conditions.read permission via useRequireAuth', async () => {
    render(<PackagingConditionDetailScreen packagingConditionId={2} />)
    await screen.findByText('Regular')

    expect(useRequireAuthMock).toHaveBeenCalledWith('packaging_conditions.read')
  })

  test('renders the provisional data notice', async () => {
    render(<PackagingConditionDetailScreen packagingConditionId={2} />)
    await screen.findByText('Regular')

    expect(screen.getByText(/datos provisionales/i)).toBeInTheDocument()
  })

  test('saves changes via updatePackagingCondition, including risk_level', async () => {
    updatePackagingConditionMock.mockResolvedValueOnce({
      packaging_condition: { ...makePackagingCondition(), risk_level: 7 },
    })
    render(<PackagingConditionDetailScreen packagingConditionId={2} />)
    await screen.findByText('Regular')

    fireEvent.change(screen.getByLabelText(/nivel de riesgo/i), { target: { value: '7' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(updatePackagingConditionMock).toHaveBeenCalledWith(2, expect.objectContaining({ risk_level: 7 }))
  })

  test('toggles active status via activatePackagingCondition/deactivatePackagingCondition', async () => {
    deactivatePackagingConditionMock.mockResolvedValueOnce({
      packaging_condition: { ...makePackagingCondition(), is_active: false },
    })
    render(<PackagingConditionDetailScreen packagingConditionId={2} />)
    await screen.findByText('Regular')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivatePackagingConditionMock).toHaveBeenCalledWith(2)
  })

  test('shows the API validation error on save failure', async () => {
    updatePackagingConditionMock.mockRejectedValueOnce(new ApiValidationError('Error.', { name: ['Ya existe ese nombre.'] }))
    render(<PackagingConditionDetailScreen packagingConditionId={2} />)
    await screen.findByText('Regular')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(await screen.findByText('Ya existe ese nombre.')).toBeInTheDocument()
  })
})
