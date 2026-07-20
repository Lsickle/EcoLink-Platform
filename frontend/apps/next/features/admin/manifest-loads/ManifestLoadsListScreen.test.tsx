import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ManifestLoadsListScreen } from './ManifestLoadsListScreen'

const fetchManifestLoadsMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchManifestLoads: (...args: unknown[]) => fetchManifestLoadsMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[] } | null = {
  id: 1,
  is_platform_staff: false,
  permissions: ['manifest_loads.read'],
}

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

const emptyPage = { data: [], current_page: 1, last_page: 1, total: 0, per_page: 15 }

function manifestLoadsPage(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    ...emptyPage,
    data: [
      {
        id: 55,
        uuid: 'man-55',
        tenant_organization_id: 1,
        manifest_number: 'MAN-1-ABCDEFGH',
        transport_schedule_id: 9,
        generator_branch_id: 3,
        carrier_organization_id: 1,
        vehicle_id: 5,
        transport_personnel_id: 6,
        load_date: '2026-07-19',
        load_started_at: null,
        load_completed_at: null,
        declared_total_weight_kg: null,
        declared_total_volume_m3: null,
        generator_signer_person_id: 40,
        generator_signed_at: null,
        driver_signer_person_id: 41,
        driver_signed_at: null,
        pdf_file_id: null,
        observations: null,
        is_active: true,
        created_at: '2026-07-19T00:00:00Z',
        updated_at: '2026-07-19T00:00:00Z',
        manifest_status: { id: 1, code: 'DRAFT', name: 'Borrador', sort_order: 1, is_initial: true, is_final: false },
        transport_schedule: { id: 9, schedule_number: 'PRG-1-ABCDEFGH' },
        carrier_organization: { id: 1, legal_name: 'Gestor Ambiental S.A.S.' },
        generator_branch: { id: 3, name: 'Bodega Central', organization_id: 2 },
        vehicle: { id: 5, plate_number: 'ABC123' },
      },
    ],
    total: 1,
    ...overrides,
  }
}

describe('ManifestLoadsListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['manifest_loads.read'] }
    fetchManifestLoadsMock.mockResolvedValue(manifestLoadsPage())
  })

  afterEach(() => {
    fetchManifestLoadsMock.mockReset()
    pushMock.mockReset()
  })

  test('renders the manifest number, schedule, generator branch and status badge', async () => {
    render(<ManifestLoadsListScreen />)

    await screen.findByText('MAN-1-ABCDEFGH')
    expect(screen.getByText('PRG-1-ABCDEFGH')).toBeInTheDocument()
    expect(screen.getByText('Bodega Central')).toBeInTheDocument()
    expect(screen.getByText('ABC123')).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
  })

  test('does not show the "Organización" column for a tenant actor', async () => {
    render(<ManifestLoadsListScreen />)
    await screen.findByText('MAN-1-ABCDEFGH')

    expect(screen.queryByText('Gestor Ambiental S.A.S.')).not.toBeInTheDocument()
  })

  test('shows the "Organización" column for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true, permissions: ['manifest_loads.read'] }
    render(<ManifestLoadsListScreen />)

    expect(await screen.findByText('Gestor Ambiental S.A.S.')).toBeInTheDocument()
  })

  test('filters by status', async () => {
    render(<ManifestLoadsListScreen />)
    await screen.findByText('MAN-1-ABCDEFGH')
    fetchManifestLoadsMock.mockClear()

    fireEvent.click(screen.getByRole('combobox', { name: 'Filtrar por estado' }))
    const option = await screen.findByRole('option', { name: 'Firmado' })
    await act(async () => {
      fireEvent.pointerDown(option)
      fireEvent.click(option)
    })

    expect(fetchManifestLoadsMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'SIGNED' }))
  })

  test('navigates to the detail page when a row is clicked', async () => {
    render(<ManifestLoadsListScreen />)
    await screen.findByText('MAN-1-ABCDEFGH')

    fireEvent.click(screen.getByText('MAN-1-ABCDEFGH'))

    expect(pushMock).toHaveBeenCalledWith('/admin/manifest-loads/55')
  })

  test('shows an empty message when there are no results', async () => {
    fetchManifestLoadsMock.mockResolvedValue(emptyPage)
    render(<ManifestLoadsListScreen />)

    expect(await screen.findByText(/No hay manifiestos de cargue/i)).toBeInTheDocument()
  })
})
