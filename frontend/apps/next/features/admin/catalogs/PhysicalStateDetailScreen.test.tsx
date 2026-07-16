import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { PhysicalStateDetailScreen } from './PhysicalStateDetailScreen'

const fetchPhysicalStateMock = vi.fn()
const updatePhysicalStateMock = vi.fn()
const activatePhysicalStateMock = vi.fn()
const deactivatePhysicalStateMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchPhysicalState: (...args: unknown[]) => fetchPhysicalStateMock(...args),
    updatePhysicalState: (...args: unknown[]) => updatePhysicalStateMock(...args),
    activatePhysicalState: (...args: unknown[]) => activatePhysicalStateMock(...args),
    deactivatePhysicalState: (...args: unknown[]) => deactivatePhysicalStateMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makePhysicalState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 4,
    uuid: 'ps-4',
    code: 'GASEOSO',
    name: 'Gaseoso',
    is_system: true,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('PhysicalStateDetailScreen', () => {
  beforeEach(() => {
    fetchPhysicalStateMock.mockResolvedValue({ physical_state: makePhysicalState() })
  })

  afterEach(() => {
    fetchPhysicalStateMock.mockReset()
    updatePhysicalStateMock.mockReset()
    activatePhysicalStateMock.mockReset()
    deactivatePhysicalStateMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the physical_states.read permission via useRequireAuth', async () => {
    render(<PhysicalStateDetailScreen physicalStateId={4} />)
    await screen.findByText('Gaseoso')

    expect(useRequireAuthMock).toHaveBeenCalledWith('physical_states.read')
  })

  test('saves changes via updatePhysicalState', async () => {
    updatePhysicalStateMock.mockResolvedValueOnce({
      physical_state: { ...makePhysicalState(), name: 'Gaseoso a Presión' },
    })
    render(<PhysicalStateDetailScreen physicalStateId={4} />)
    await screen.findByText('Gaseoso')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Gaseoso a Presión' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(updatePhysicalStateMock).toHaveBeenCalledWith(4, expect.objectContaining({ name: 'Gaseoso a Presión' }))
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
  })

  test('toggles active status via activatePhysicalState/deactivatePhysicalState', async () => {
    deactivatePhysicalStateMock.mockResolvedValueOnce({
      physical_state: { ...makePhysicalState(), is_active: false },
    })
    render(<PhysicalStateDetailScreen physicalStateId={4} />)
    await screen.findByText('Gaseoso')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivatePhysicalStateMock).toHaveBeenCalledWith(4)
  })

  test('shows the API validation error on save failure', async () => {
    updatePhysicalStateMock.mockRejectedValueOnce(new ApiValidationError('Error.', { name: ['Ya existe ese nombre.'] }))
    render(<PhysicalStateDetailScreen physicalStateId={4} />)
    await screen.findByText('Gaseoso')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(await screen.findByText('Ya existe ese nombre.')).toBeInTheDocument()
  })
})
