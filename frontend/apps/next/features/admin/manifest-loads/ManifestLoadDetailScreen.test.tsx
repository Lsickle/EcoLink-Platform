import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ManifestLoadDetailScreen } from './ManifestLoadDetailScreen'

const fetchManifestLoadMock = vi.fn()
const generateManifestLoadMock = vi.fn()
const signManifestLoadMock = vi.fn()
const startManifestLoadTransitMock = vi.fn()
const cancelManifestLoadMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchManifestLoad: (...args: unknown[]) => fetchManifestLoadMock(...args),
    generateManifestLoad: (...args: unknown[]) => generateManifestLoadMock(...args),
    signManifestLoad: (...args: unknown[]) => signManifestLoadMock(...args),
    startManifestLoadTransit: (...args: unknown[]) => startManifestLoadTransitMock(...args),
    cancelManifestLoad: (...args: unknown[]) => cancelManifestLoadMock(...args),
  }
})

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[]; tenant_organization_id: number } | null = null

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

// carrier_organization_id=1 (Gestor/transportador) -- generator_branch.organization_id=2
// (Generador, organización DISTINTA -- Modalidad 1, recolección normal).
function baseManifestLoad(overrides: Partial<Record<string, unknown>> = {}) {
  return {
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
    manifest_status: { id: 2, code: 'GENERATED', name: 'Generado', sort_order: 2, is_initial: false, is_final: false },
    transport_schedule: { id: 9, schedule_number: 'PRG-1-ABCDEFGH', organization_id: 1 },
    generator_branch: { id: 3, name: 'Bodega Central', organization_id: 2 },
    carrier_organization: { id: 1, legal_name: 'Gestor Ambiental S.A.S.' },
    vehicle: { id: 5, plate_number: 'ABC123', brand: 'Chevrolet', model: 'NPR' },
    transport_personnel: {
      id: 6,
      license_number: 'C2-12345',
      license_category: 'C2',
      has_hazmat_permit: false,
      person: { id: 7, first_name: 'Juan', last_name: 'Pérez' },
    },
    generator_signer_person: { id: 40, first_name: 'María', last_name: 'Gómez' },
    driver_signer_person: { id: 41, first_name: 'Carlos', last_name: 'Ruiz' },
    items: [
      {
        id: 100,
        uuid: 'mli-100',
        manifest_load_id: 55,
        transport_schedule_item_id: 30,
        waste_id: 20,
        approved_treatment_id: null,
        declared_quantity: '10.000',
        unit_of_measure: 'KG',
        actual_weight_kg: null,
        actual_volume_m3: null,
        container_quantity: null,
        packaging_type: null,
        internal_container_code: null,
        packaging_condition: null,
        transport_approved: true,
        special_handling_required: false,
        observations: null,
        line_number: 1,
        is_active: true,
        waste: { id: 20, name: 'Aceite usado', code: 'A-001' },
      },
    ],
    ...overrides,
  }
}

describe('ManifestLoadDetailScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['manifest_loads.read'], tenant_organization_id: 1 }
    fetchManifestLoadMock.mockResolvedValue({ manifest_load: baseManifestLoad() })
  })

  afterEach(() => {
    fetchManifestLoadMock.mockReset()
    generateManifestLoadMock.mockReset()
    signManifestLoadMock.mockReset()
    startManifestLoadTransitMock.mockReset()
    cancelManifestLoadMock.mockReset()
  })

  test('renders manifest number, generator branch, driver and items', async () => {
    render(<ManifestLoadDetailScreen manifestLoadId={55} />)

    await screen.findByText('MAN-1-ABCDEFGH')
    expect(screen.getByText('Bodega Central')).toBeInTheDocument()
    expect(screen.getByText(/Juan Pérez/)).toBeInTheDocument()
    expect(screen.getByText('Aceite usado')).toBeInTheDocument()
    expect(screen.getByText('Generado')).toBeInTheDocument()
  })

  test('hides transition and sign actions without any manifest_loads permission', async () => {
    render(<ManifestLoadDetailScreen manifestLoadId={55} />)
    await screen.findByText('MAN-1-ABCDEFGH')

    expect(screen.queryByRole('button', { name: 'Generar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Firmar como Generador' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Firmar como Conductor' })).not.toBeInTheDocument()
  })

  test('shows "Generar" for the carrier owner in DRAFT and generates', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_loads.read', 'manifest_loads.update'],
      tenant_organization_id: 1,
    }
    fetchManifestLoadMock.mockResolvedValue({
      manifest_load: baseManifestLoad({ manifest_status: { id: 1, code: 'DRAFT', name: 'Borrador', is_final: false } }),
    })
    generateManifestLoadMock.mockResolvedValue({ manifest_load: { id: 55 } })
    render(<ManifestLoadDetailScreen manifestLoadId={55} />)
    await screen.findByText('MAN-1-ABCDEFGH')

    fetchManifestLoadMock.mockResolvedValue({
      manifest_load: baseManifestLoad({ manifest_status: { id: 2, code: 'GENERATED', name: 'Generado', is_final: false } }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }))

    await waitFor(() => expect(generateManifestLoadMock).toHaveBeenCalledWith(55))
    expect(await screen.findByText('Generado')).toBeInTheDocument()
  })

  test('shows the Generador signature card as "Firmar como Generador" only for the generator organization', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_loads.read', 'manifest_loads.sign'],
      tenant_organization_id: 1,
    }
    render(<ManifestLoadDetailScreen manifestLoadId={55} />)
    await screen.findByText('MAN-1-ABCDEFGH')

    // El actor pertenece a la organización carrier (1), NO a la generadora (2).
    expect(screen.queryByRole('button', { name: 'Firmar como Generador' })).not.toBeInTheDocument()
    // Sí puede firmar como conductor (misma organización que el carrier).
    expect(screen.getByRole('button', { name: 'Firmar como Conductor' })).toBeInTheDocument()
  })

  test('signs as driver and reloads', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_loads.read', 'manifest_loads.sign'],
      tenant_organization_id: 1,
    }
    signManifestLoadMock.mockResolvedValue({ manifest_load: { id: 55 } })
    render(<ManifestLoadDetailScreen manifestLoadId={55} />)
    await screen.findByText('MAN-1-ABCDEFGH')

    fetchManifestLoadMock.mockResolvedValue({
      manifest_load: baseManifestLoad({
        manifest_status: { id: 3, code: 'PARTIALLY_SIGNED', name: 'Parcialmente Firmado', is_final: false },
        driver_signed_at: '2026-07-19T12:00:00Z',
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Firmar como Conductor' }))

    await waitFor(() => expect(signManifestLoadMock).toHaveBeenCalledWith(55, { signer_type: 'DRIVER' }))
    expect(await screen.findByText('Parcialmente Firmado')).toBeInTheDocument()
  })

  test('shows "Iniciar Tránsito" only when SIGNED, with both signatures already complete', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_loads.read', 'manifest_loads.update'],
      tenant_organization_id: 1,
    }
    fetchManifestLoadMock.mockResolvedValue({
      manifest_load: baseManifestLoad({
        manifest_status: { id: 4, code: 'SIGNED', name: 'Firmado', is_final: false },
        generator_signed_at: '2026-07-19T10:00:00Z',
        driver_signed_at: '2026-07-19T11:00:00Z',
      }),
    })
    startManifestLoadTransitMock.mockResolvedValue({ manifest_load: { id: 55 } })
    render(<ManifestLoadDetailScreen manifestLoadId={55} />)
    await screen.findByText('MAN-1-ABCDEFGH')

    fetchManifestLoadMock.mockResolvedValue({
      manifest_load: baseManifestLoad({ manifest_status: { id: 5, code: 'IN_TRANSIT', name: 'En Tránsito', is_final: false } }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Tránsito' }))

    await waitFor(() => expect(startManifestLoadTransitMock).toHaveBeenCalledWith(55))
    expect(await screen.findByText('En Tránsito')).toBeInTheDocument()
  })

  test('shows "Cancelar" only in GENERATED/PARTIALLY_SIGNED and cancels', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_loads.read', 'manifest_loads.cancel'],
      tenant_organization_id: 1,
    }
    cancelManifestLoadMock.mockResolvedValue({ manifest_load: { id: 55 } })
    render(<ManifestLoadDetailScreen manifestLoadId={55} />)
    await screen.findByText('MAN-1-ABCDEFGH')

    fetchManifestLoadMock.mockResolvedValue({
      manifest_load: baseManifestLoad({ manifest_status: { id: 8, code: 'CANCELLED', name: 'Cancelado', is_final: true } }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(cancelManifestLoadMock).toHaveBeenCalledWith(55))
    expect(await screen.findByText('Cancelado')).toBeInTheDocument()
  })

  test('hides "Cancelar" once SIGNED (not reachable from that state per backend)', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_loads.read', 'manifest_loads.cancel'],
      tenant_organization_id: 1,
    }
    fetchManifestLoadMock.mockResolvedValue({
      manifest_load: baseManifestLoad({ manifest_status: { id: 4, code: 'SIGNED', name: 'Firmado', is_final: false } }),
    })
    render(<ManifestLoadDetailScreen manifestLoadId={55} />)
    await screen.findByText('MAN-1-ABCDEFGH')

    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
  })

  test('shows the load error message when fetching fails', async () => {
    fetchManifestLoadMock.mockRejectedValue(new Error('boom'))
    render(<ManifestLoadDetailScreen manifestLoadId={55} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })
})
