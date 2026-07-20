import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchLocationsPanel } from './BranchLocationsPanel'

const fetchBranchLocationsMock = vi.fn()
const createBranchLocationMock = vi.fn()
const updateBranchLocationMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchBranchLocations: (...args: unknown[]) => fetchBranchLocationsMock(...args),
    createBranchLocation: (...args: unknown[]) => createBranchLocationMock(...args),
    updateBranchLocation: (...args: unknown[]) => updateBranchLocationMock(...args),
  }
})

let currentUser: { id: number; permissions: string[] } | null = {
  id: 1,
  permissions: ['branch_locations.read', 'branch_locations.create', 'branch_locations.update'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
}))

function branchLocation(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 8,
    uuid: 'bl-8',
    tenant_organization_id: 2,
    branch_id: 3,
    code: 'M3',
    name: 'Muelle 3',
    is_active: true,
    created_at: '2026-07-20T00:00:00Z',
    updated_at: '2026-07-20T00:00:00Z',
    ...overrides,
  }
}

describe('BranchLocationsPanel', () => {
  beforeEach(() => {
    currentUser = { id: 1, permissions: ['branch_locations.read', 'branch_locations.create', 'branch_locations.update'] }
    fetchBranchLocationsMock.mockResolvedValue({
      data: [branchLocation()],
      current_page: 1,
      last_page: 1,
      total: 1,
      per_page: 100,
    })
  })

  afterEach(() => {
    fetchBranchLocationsMock.mockReset()
    createBranchLocationMock.mockReset()
    updateBranchLocationMock.mockReset()
  })

  test('renders the dock code, name and active badge', async () => {
    render(<BranchLocationsPanel branchId={3} />)

    await screen.findByText('M3')
    expect(screen.getByText('Muelle 3')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(fetchBranchLocationsMock).toHaveBeenCalledWith(expect.objectContaining({ branchId: 3 }))
  })

  test('creates a new dock', async () => {
    createBranchLocationMock.mockResolvedValue({ branch_location: branchLocation({ id: 9, code: 'M4', name: 'Muelle 4' }) })
    render(<BranchLocationsPanel branchId={3} />)
    await screen.findByText('M3')

    fireEvent.click(screen.getByRole('button', { name: '+ Agregar Muelle' }))
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'M4' } })
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Muelle 4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear Muelle' }))

    await waitFor(() =>
      expect(createBranchLocationMock).toHaveBeenCalledWith({ branch_id: 3, code: 'M4', name: 'Muelle 4' })
    )
  })

  test('edits an existing dock', async () => {
    updateBranchLocationMock.mockResolvedValue({ branch_location: branchLocation({ name: 'Muelle 3 Renombrado' }) })
    render(<BranchLocationsPanel branchId={3} />)
    await screen.findByText('M3')

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Muelle 3 Renombrado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(updateBranchLocationMock).toHaveBeenCalledWith(8, { code: 'M3', name: 'Muelle 3 Renombrado', is_active: true })
    )
  })

  test('shows an empty message when there are no docks', async () => {
    fetchBranchLocationsMock.mockResolvedValue({ data: [], current_page: 1, last_page: 1, total: 0, per_page: 100 })
    render(<BranchLocationsPanel branchId={3} />)

    expect(await screen.findByText(/No hay muelles registrados/)).toBeInTheDocument()
  })

  test('hides write controls without branch_locations.create/.update', async () => {
    currentUser = { id: 1, permissions: ['branch_locations.read'] }
    render(<BranchLocationsPanel branchId={3} />)

    await screen.findByText('M3')
    expect(screen.queryByRole('button', { name: '+ Agregar Muelle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
  })
})
