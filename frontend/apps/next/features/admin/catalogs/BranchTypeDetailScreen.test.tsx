import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { BranchTypeDetailScreen } from './BranchTypeDetailScreen'

const fetchBranchTypeMock = vi.fn()
const updateBranchTypeMock = vi.fn()
const activateBranchTypeMock = vi.fn()
const deactivateBranchTypeMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchBranchType: (...args: unknown[]) => fetchBranchTypeMock(...args),
    updateBranchType: (...args: unknown[]) => updateBranchTypeMock(...args),
    activateBranchType: (...args: unknown[]) => activateBranchTypeMock(...args),
    deactivateBranchType: (...args: unknown[]) => deactivateBranchTypeMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeBranchType(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 4,
    uuid: 'bt-4',
    code: 'LAB',
    name: 'Laboratorio',
    category: 'Técnica',
    is_logistics: false,
    is_storage: false,
    is_treatment: false,
    is_dispatch: false,
    sort_order: 5,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('BranchTypeDetailScreen', () => {
  beforeEach(() => {
    fetchBranchTypeMock.mockResolvedValue({ branch_type: makeBranchType() })
  })

  afterEach(() => {
    fetchBranchTypeMock.mockReset()
    updateBranchTypeMock.mockReset()
    activateBranchTypeMock.mockReset()
    deactivateBranchTypeMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the branch_types.read permission via useRequireAuth', async () => {
    render(<BranchTypeDetailScreen branchTypeId={4} />)
    await screen.findByText('Laboratorio')

    expect(useRequireAuthMock).toHaveBeenCalledWith('branch_types.read')
  })

  test('renders the capability badges in the sidebar', async () => {
    fetchBranchTypeMock.mockResolvedValueOnce({
      branch_type: makeBranchType({ is_logistics: true, is_dispatch: true }),
    })
    render(<BranchTypeDetailScreen branchTypeId={4} />)
    await screen.findByText('Laboratorio')

    // "Capacidades"/"Logística"/"Despacho" aparecen 2 veces cada uno a
    // propósito: una como label del checkbox editable en el formulario, y
    // otra como badge de solo lectura en el sidebar (CatalogSidebarSection
    // "Capacidades", ver BranchTypeDetailScreen.tsx).
    expect(screen.getAllByText('Capacidades').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Logística').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Despacho').length).toBeGreaterThanOrEqual(2)
  })

  test('saves changes via updateBranchType', async () => {
    updateBranchTypeMock.mockResolvedValueOnce({ branch_type: { ...makeBranchType(), name: 'Laboratorio Central' } })
    render(<BranchTypeDetailScreen branchTypeId={4} />)
    await screen.findByText('Laboratorio')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Laboratorio Central' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(updateBranchTypeMock).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ name: 'Laboratorio Central' })
    )
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
  })

  test('toggles active status via activateBranchType/deactivateBranchType', async () => {
    deactivateBranchTypeMock.mockResolvedValueOnce({ branch_type: { ...makeBranchType(), is_active: false } })
    render(<BranchTypeDetailScreen branchTypeId={4} />)
    await screen.findByText('Laboratorio')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivateBranchTypeMock).toHaveBeenCalledWith(4)
  })

  test('shows the API validation error on save failure', async () => {
    updateBranchTypeMock.mockRejectedValueOnce(new ApiValidationError('Error.', { name: ['Ya existe ese nombre.'] }))
    render(<BranchTypeDetailScreen branchTypeId={4} />)
    await screen.findByText('Laboratorio')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(await screen.findByText('Ya existe ese nombre.')).toBeInTheDocument()
  })
})
