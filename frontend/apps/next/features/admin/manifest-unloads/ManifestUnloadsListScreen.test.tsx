import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ManifestUnloadsListScreen } from './ManifestUnloadsListScreen'

const fetchManifestUnloadsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchManifestUnloads: (...args: unknown[]) => fetchManifestUnloadsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['manifest_unloads.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function manifestUnloadsPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...emptyPage,
    data: [
      {
        id: 77,
        uuid: 'mun-77',
        tenant_organization_id: 2,
        manifest_number: 'MUN-2-ABCDEFGH',
        manifest_load_id: null,
        unload_request_id: 12,
        receiving_branch_id: 3,
        receiving_organization_id: 2,
        vehicle_id: 5,
        transport_personnel_id: 6,
        unload_date: '2026-07-20',
        unload_started_at: null,
        unload_completed_at: null,
        received_total_weight_kg: null,
        rejected_total_weight_kg: null,
        received_total_volume_m3: null,
        received_as_expected: null,
        receiver_person_id: 90,
        receiver_signed_at: null,
        driver_signer_person_id: 7,
        driver_signed_at: null,
        pdf_file_id: null,
        incidents: null,
        observations: null,
        is_active: true,
        created_at: '2026-07-20T00:00:00Z',
        updated_at: '2026-07-20T00:00:00Z',
        manifest_status: { id: 1, code: 'DRAFT', name: 'Borrador', sort_order: 1, is_initial: true, is_final: false },
        unload_request: { id: 12, request_number: 'SOL-1-ABCDEFGH' },
        receiving_organization: { id: 2, legal_name: 'Gestor Ambiental S.A.S.' },
        receiving_branch: { id: 3, name: 'Planta Norte', organization_id: 2 },
        vehicle: { id: 5, plate_number: 'ABC123' },
      },
    ],
    total: 1,
    ...overrides,
  }
}

describe('ManifestUnloadsListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['manifest_unloads.read'] }
    fetchManifestUnloadsMock.mockResolvedValue(manifestUnloadsPage())
  })

  afterEach(() => {
    fetchManifestUnloadsMock.mockReset()
    pushMock.mockReset()
  })

  test('renders the manifest number, request, receiving branch and status badge', async () => {
    render(<ManifestUnloadsListScreen />)

    await screen.findByText('MUN-2-ABCDEFGH')
    expect(screen.getByText('SOL-1-ABCDEFGH')).toBeInTheDocument()
    expect(screen.getByText('Planta Norte')).toBeInTheDocument()
    expect(screen.getByText('ABC123')).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
  })

  test('does not show the "Organización" column for a tenant actor', async () => {
    render(<ManifestUnloadsListScreen />)
    await screen.findByText('MUN-2-ABCDEFGH')

    expect(screen.queryByText('Gestor Ambiental S.A.S.')).not.toBeInTheDocument()
  })

  test('shows the "Organización" column for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['manifest_unloads.read'] }
    render(<ManifestUnloadsListScreen />)

    expect(await screen.findByText('Gestor Ambiental S.A.S.')).toBeInTheDocument()
  })

  test('filters by status', async () => {
    render(<ManifestUnloadsListScreen />)
    await screen.findByText('MUN-2-ABCDEFGH')
    fetchManifestUnloadsMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    const option = await screen.findByRole('option', { name: 'Firmado' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchManifestUnloadsMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'SIGNED' }))
  })

  test('navigates to the detail page when a row is clicked', async () => {
    render(<ManifestUnloadsListScreen />)
    await screen.findByText('MUN-2-ABCDEFGH')

    fireEvent.click(screen.getByText('MUN-2-ABCDEFGH'))

    expect(pushMock).toHaveBeenCalledWith('/admin/manifest-unloads/77')
  })

  test('shows an empty message when there are no results', async () => {
    fetchManifestUnloadsMock.mockResolvedValue(emptyPage)
    render(<ManifestUnloadsListScreen />)

    expect(await screen.findByText(/No hay manifiestos de descargue/i)).toBeInTheDocument()
  })
})
