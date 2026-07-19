import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TransportPersonnelListScreen } from './TransportPersonnelListScreen'

const fetchTransportPersonnelMock = vi.fn()
const searchOrganizationsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchTransportPersonnel: (...args: unknown[]) => fetchTransportPersonnelMock(...args),
    searchOrganizations: (...args: unknown[]) => searchOrganizationsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['transport_personnel.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function personnelPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...emptyPage,
    data: [
      {
        id: 10,
        uuid: 'tp-10',
        organization_id: 1,
        person_id: 5,
        license_number: 'LIC-001',
        license_category: 'C2',
        license_expiration_date: '2027-01-01',
        has_hazmat_permit: true,
        is_active: true,
        metadata: null,
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-07-01T00:00:00Z',
        person: { id: 5, full_name: 'Juan Pérez', document_number: '123456' },
      },
    ],
    total: 1,
    ...overrides,
  }
}

describe('TransportPersonnelListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['transport_personnel.read'] }
    fetchTransportPersonnelMock.mockResolvedValue(personnelPage())
    searchOrganizationsMock.mockResolvedValue(emptyPage)
  })

  afterEach(() => {
    fetchTransportPersonnelMock.mockReset()
    searchOrganizationsMock.mockReset()
    pushMock.mockReset()
  })

  test('shows the conductor row with contact name, document, license and hazmat permit', async () => {
    render(<TransportPersonnelListScreen />)

    await screen.findByText('Juan Pérez')
    const row = screen.getByText('Juan Pérez').closest('tr') as HTMLElement
    expect(within(row).getByText('123456')).toBeInTheDocument()
    expect(within(row).getByText(/LIC-001/)).toBeInTheDocument()
    expect(within(row).getByText(/C2/)).toBeInTheDocument()
    expect(within(row).getByText('Activo')).toBeInTheDocument()
    expect(within(row).getByText('Sí')).toBeInTheDocument()
  })

  test('hides the Organización column/filter for a non-platform-staff tenant admin', async () => {
    render(<TransportPersonnelListScreen />)

    await screen.findByText('Juan Pérez')
    expect(screen.queryByLabelText('Organización')).not.toBeInTheDocument()
  })

  test('shows the Organización filter for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['transport_personnel.read'] }
    render(<TransportPersonnelListScreen />)

    await screen.findByText('Juan Pérez')
    expect(screen.getByRole('columnheader', { name: 'Organización' })).toBeInTheDocument()
  })

  test('applies search with debounce', async () => {
    render(<TransportPersonnelListScreen />)
    await screen.findByText('Juan Pérez')
    fetchTransportPersonnelMock.mockClear()

    fireEvent.change(screen.getByLabelText('Buscar conductores'), { target: { value: 'Juan' } })

    await vi.waitFor(() => {
      expect(fetchTransportPersonnelMock).toHaveBeenCalledWith(expect.objectContaining({ search: 'Juan' }))
    })
  })

  test('navigates to /admin/transport-personnel/new when "Registrar Conductor" is clicked', async () => {
    render(<TransportPersonnelListScreen />)
    await screen.findByText('Juan Pérez')

    fireEvent.click(screen.getByRole('button', { name: '+ Registrar Conductor' }))

    expect(pushMock).toHaveBeenCalledWith('/admin/transport-personnel/new')
  })

  test('navigates to the driver detail when a row is clicked', async () => {
    render(<TransportPersonnelListScreen />)
    await screen.findByText('Juan Pérez')

    fireEvent.click(screen.getByText('Juan Pérez'))

    expect(pushMock).toHaveBeenCalledWith('/admin/transport-personnel/10')
  })
})
