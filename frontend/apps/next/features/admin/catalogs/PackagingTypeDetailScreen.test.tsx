import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { PackagingTypeDetailScreen } from './PackagingTypeDetailScreen'

const fetchPackagingTypeMock = vi.fn()
const updatePackagingTypeMock = vi.fn()
const activatePackagingTypeMock = vi.fn()
const deactivatePackagingTypeMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchPackagingType: (...args: unknown[]) => fetchPackagingTypeMock(...args),
    updatePackagingType: (...args: unknown[]) => updatePackagingTypeMock(...args),
    activatePackagingType: (...args: unknown[]) => activatePackagingTypeMock(...args),
    deactivatePackagingType: (...args: unknown[]) => deactivatePackagingTypeMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makePackagingType(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 4,
    uuid: 'pt-4',
    code: 'TAMBOR_METAL',
    name: 'Tambor metálico',
    is_system: true,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('PackagingTypeDetailScreen', () => {
  beforeEach(() => {
    fetchPackagingTypeMock.mockResolvedValue({ packaging_type: makePackagingType() })
  })

  afterEach(() => {
    fetchPackagingTypeMock.mockReset()
    updatePackagingTypeMock.mockReset()
    activatePackagingTypeMock.mockReset()
    deactivatePackagingTypeMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the packaging_types.read permission via useRequireAuth', async () => {
    render(<PackagingTypeDetailScreen packagingTypeId={4} />)
    await screen.findByText('Tambor metálico')

    expect(useRequireAuthMock).toHaveBeenCalledWith('packaging_types.read')
  })

  test('saves changes via updatePackagingType', async () => {
    updatePackagingTypeMock.mockResolvedValueOnce({
      packaging_type: { ...makePackagingType(), name: 'Tambor de metal' },
    })
    render(<PackagingTypeDetailScreen packagingTypeId={4} />)
    await screen.findByText('Tambor metálico')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Tambor de metal' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(updatePackagingTypeMock).toHaveBeenCalledWith(4, expect.objectContaining({ name: 'Tambor de metal' }))
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
  })

  test('toggles active status via activatePackagingType/deactivatePackagingType', async () => {
    deactivatePackagingTypeMock.mockResolvedValueOnce({
      packaging_type: { ...makePackagingType(), is_active: false },
    })
    render(<PackagingTypeDetailScreen packagingTypeId={4} />)
    await screen.findByText('Tambor metálico')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivatePackagingTypeMock).toHaveBeenCalledWith(4)
  })

  test('shows the API validation error on save failure', async () => {
    updatePackagingTypeMock.mockRejectedValueOnce(new ApiValidationError('Error.', { name: ['Ya existe ese nombre.'] }))
    render(<PackagingTypeDetailScreen packagingTypeId={4} />)
    await screen.findByText('Tambor metálico')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(await screen.findByText('Ya existe ese nombre.')).toBeInTheDocument()
  })
})
