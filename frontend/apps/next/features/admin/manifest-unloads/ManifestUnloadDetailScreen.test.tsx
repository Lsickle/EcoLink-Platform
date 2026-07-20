import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ManifestUnloadDetailScreen } from './ManifestUnloadDetailScreen'

const fetchManifestUnloadMock = vi.fn()
const fetchManifestUnloadFilesMock = vi.fn()
const generateManifestUnloadMock = vi.fn()
const signManifestUnloadMock = vi.fn()
const completeManifestUnloadMock = vi.fn()
const cancelManifestUnloadMock = vi.fn()
const inspectManifestUnloadItemsMock = vi.fn()
const uploadFileMock = vi.fn()
const deleteFileMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchManifestUnload: (...args: unknown[]) => fetchManifestUnloadMock(...args),
    fetchManifestUnloadFiles: (...args: unknown[]) => fetchManifestUnloadFilesMock(...args),
    generateManifestUnload: (...args: unknown[]) => generateManifestUnloadMock(...args),
    signManifestUnload: (...args: unknown[]) => signManifestUnloadMock(...args),
    completeManifestUnload: (...args: unknown[]) => completeManifestUnloadMock(...args),
    cancelManifestUnload: (...args: unknown[]) => cancelManifestUnloadMock(...args),
    inspectManifestUnloadItems: (...args: unknown[]) => inspectManifestUnloadItemsMock(...args),
    uploadFile: (...args: unknown[]) => uploadFileMock(...args),
    deleteFile: (...args: unknown[]) => deleteFileMock(...args),
  }
})

let currentUser: { id: number; is_platform_staff: boolean; permissions: string[]; tenant_organization_id: number } | null = null

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

// receiving_organization.id=2 (Gestor receptor) -- unload_request.carrier_organization_id=1
// (transportador, organización DISTINTA).
function baseManifestUnload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 77,
    uuid: 'mun-77',
    tenant_organization_id: 2,
    manifest_number: 'MUN-2-ABCDEFGH',
    manifest_load_id: null,
    manifest_load: null,
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
    unload_request: { id: 12, request_number: 'SOL-1-ABCDEFGH', carrier_organization_id: 1 },
    receiving_branch: { id: 3, name: 'Planta Norte', organization_id: 2 },
    receiving_organization: { id: 2, legal_name: 'Gestor Ambiental S.A.S.' },
    vehicle: { id: 5, plate_number: 'ABC123', brand: 'Chevrolet', model: 'NPR' },
    transport_personnel: {
      id: 6,
      license_number: 'C2-12345',
      license_category: 'C2',
      has_hazmat_permit: false,
      person: { id: 7, first_name: 'Juan', last_name: 'Pérez' },
    },
    receiver_person: { id: 90, first_name: 'Ana', last_name: 'Restrepo' },
    driver_signer_person: { id: 7, first_name: 'Juan', last_name: 'Pérez' },
    items: [
      {
        id: 100,
        uuid: 'muli-100',
        manifest_unload_id: 77,
        manifest_load_item_id: null,
        unload_request_item_id: 30,
        waste_id: 20,
        received_quantity: '0.000',
        rejected_quantity: '0.000',
        unit_of_measure: 'KG',
        received_weight_kg: null,
        rejected_weight_kg: null,
        received_volume_m3: null,
        received_container_quantity: null,
        reception_condition: null,
        rejection_reason: null,
        inspection_approved: false,
        storage_location_id: null,
        received_at: null,
        observations: null,
        line_number: 1,
        is_active: true,
        waste: { id: 20, name: 'Aceite usado', code: 'A-001' },
      },
    ],
    ...overrides,
  }
}

describe('ManifestUnloadDetailScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['manifest_unloads.read'], tenant_organization_id: 2 }
    fetchManifestUnloadMock.mockResolvedValue({ manifest_unload: baseManifestUnload() })
    fetchManifestUnloadFilesMock.mockResolvedValue({ files: [] })
  })

  afterEach(() => {
    fetchManifestUnloadMock.mockReset()
    fetchManifestUnloadFilesMock.mockReset()
    generateManifestUnloadMock.mockReset()
    signManifestUnloadMock.mockReset()
    completeManifestUnloadMock.mockReset()
    cancelManifestUnloadMock.mockReset()
    inspectManifestUnloadItemsMock.mockReset()
    uploadFileMock.mockReset()
    deleteFileMock.mockReset()
  })

  test('renders manifest number, receiving branch, driver and items', async () => {
    render(<ManifestUnloadDetailScreen manifestUnloadId={77} />)

    await screen.findByText('MUN-2-ABCDEFGH')
    expect(screen.getByText('Planta Norte')).toBeInTheDocument()
    expect(screen.getAllByText(/Juan Pérez/).length).toBeGreaterThan(0)
    expect(screen.getByText('Aceite usado')).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
  })

  test('hides transition and sign actions without any manifest_unloads permission', async () => {
    render(<ManifestUnloadDetailScreen manifestUnloadId={77} />)
    await screen.findByText('MUN-2-ABCDEFGH')

    expect(screen.queryByRole('button', { name: 'Generar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Firmar como Receptor' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Firmar como Conductor' })).not.toBeInTheDocument()
  })

  test('shows "Generar" for the receiving owner in DRAFT and generates', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_unloads.read', 'manifest_unloads.update'],
      tenant_organization_id: 2,
    }
    generateManifestUnloadMock.mockResolvedValue({ manifest_unload: { id: 77 } })
    render(<ManifestUnloadDetailScreen manifestUnloadId={77} />)
    await screen.findByText('MUN-2-ABCDEFGH')

    fetchManifestUnloadMock.mockResolvedValue({
      manifest_unload: baseManifestUnload({ manifest_status: { id: 2, code: 'GENERATED', name: 'Generado', is_final: false } }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }))

    await waitFor(() => expect(generateManifestUnloadMock).toHaveBeenCalledWith(77))
    expect(await screen.findByText('Generado')).toBeInTheDocument()
  })

  test('shows the Receptor signature card as "Firmar como Receptor" only for the receiving organization', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_unloads.read', 'manifest_unloads.sign'],
      tenant_organization_id: 2,
    }
    fetchManifestUnloadMock.mockResolvedValue({
      manifest_unload: baseManifestUnload({ manifest_status: { id: 2, code: 'GENERATED', name: 'Generado', is_final: false } }),
    })
    render(<ManifestUnloadDetailScreen manifestUnloadId={77} />)
    await screen.findByText('MUN-2-ABCDEFGH')

    // El actor pertenece a la organización RECEPTORA (2), NO a la transportadora (1).
    expect(screen.getByRole('button', { name: 'Firmar como Receptor' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Firmar como Conductor' })).not.toBeInTheDocument()
  })

  test('signs as receiver and reloads', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_unloads.read', 'manifest_unloads.sign'],
      tenant_organization_id: 2,
    }
    fetchManifestUnloadMock.mockResolvedValue({
      manifest_unload: baseManifestUnload({ manifest_status: { id: 2, code: 'GENERATED', name: 'Generado', is_final: false } }),
    })
    signManifestUnloadMock.mockResolvedValue({ manifest_unload: { id: 77 } })
    render(<ManifestUnloadDetailScreen manifestUnloadId={77} />)
    await screen.findByText('MUN-2-ABCDEFGH')

    fetchManifestUnloadMock.mockResolvedValue({
      manifest_unload: baseManifestUnload({
        manifest_status: { id: 3, code: 'PARTIALLY_SIGNED', name: 'Parcialmente Firmado', is_final: false },
        receiver_signed_at: '2026-07-20T12:00:00Z',
      }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Firmar como Receptor' }))

    await waitFor(() => expect(signManifestUnloadMock).toHaveBeenCalledWith(77, { signer_type: 'RECEIVER' }))
    expect(await screen.findByText('Parcialmente Firmado')).toBeInTheDocument()
  })

  test('shows "Completar" only when SIGNED and completes', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_unloads.read', 'manifest_unloads.update'],
      tenant_organization_id: 2,
    }
    fetchManifestUnloadMock.mockResolvedValue({
      manifest_unload: baseManifestUnload({
        manifest_status: { id: 4, code: 'SIGNED', name: 'Firmado', is_final: false },
        receiver_signed_at: '2026-07-20T10:00:00Z',
        driver_signed_at: '2026-07-20T11:00:00Z',
      }),
    })
    completeManifestUnloadMock.mockResolvedValue({ manifest_unload: { id: 77 } })
    render(<ManifestUnloadDetailScreen manifestUnloadId={77} />)
    await screen.findByText('MUN-2-ABCDEFGH')

    fetchManifestUnloadMock.mockResolvedValue({
      manifest_unload: baseManifestUnload({ manifest_status: { id: 5, code: 'CLOSED', name: 'Cerrado', is_final: true } }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Completar' }))

    await waitFor(() => expect(completeManifestUnloadMock).toHaveBeenCalledWith(77))
    expect(await screen.findByText('Cerrado')).toBeInTheDocument()
  })

  test('shows "Cancelar" only in GENERATED/PARTIALLY_SIGNED and cancels', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_unloads.read', 'manifest_unloads.cancel'],
      tenant_organization_id: 2,
    }
    fetchManifestUnloadMock.mockResolvedValue({
      manifest_unload: baseManifestUnload({ manifest_status: { id: 2, code: 'GENERATED', name: 'Generado', is_final: false } }),
    })
    cancelManifestUnloadMock.mockResolvedValue({ manifest_unload: { id: 77 } })
    render(<ManifestUnloadDetailScreen manifestUnloadId={77} />)
    await screen.findByText('MUN-2-ABCDEFGH')

    fetchManifestUnloadMock.mockResolvedValue({
      manifest_unload: baseManifestUnload({ manifest_status: { id: 6, code: 'CANCELLED', name: 'Cancelado', is_final: true } }),
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(cancelManifestUnloadMock).toHaveBeenCalledWith(77))
    expect(await screen.findByText('Cancelado')).toBeInTheDocument()
  })

  test('hides "Cancelar" once SIGNED (not reachable from that state per backend)', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_unloads.read', 'manifest_unloads.cancel'],
      tenant_organization_id: 2,
    }
    fetchManifestUnloadMock.mockResolvedValue({
      manifest_unload: baseManifestUnload({ manifest_status: { id: 4, code: 'SIGNED', name: 'Firmado', is_final: false } }),
    })
    render(<ManifestUnloadDetailScreen manifestUnloadId={77} />)
    await screen.findByText('MUN-2-ABCDEFGH')

    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
  })

  test('shows the load error message when fetching fails', async () => {
    fetchManifestUnloadMock.mockRejectedValue(new Error('boom'))
    render(<ManifestUnloadDetailScreen manifestUnloadId={77} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('boom')
  })
})

describe('ManifestUnloadDetailScreen -- Inspección de Ítems', () => {
  beforeEach(() => {
    fetchManifestUnloadFilesMock.mockResolvedValue({ files: [] })
  })

  afterEach(() => {
    fetchManifestUnloadMock.mockReset()
    fetchManifestUnloadFilesMock.mockReset()
    inspectManifestUnloadItemsMock.mockReset()
  })

  test('is editable only in Draft for the receiver, and saves', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_unloads.read', 'manifest_unloads.update'],
      tenant_organization_id: 2,
    }
    fetchManifestUnloadMock.mockResolvedValue({ manifest_unload: baseManifestUnload() })
    inspectManifestUnloadItemsMock.mockResolvedValue({ manifest_unload: baseManifestUnload() })
    render(<ManifestUnloadDetailScreen manifestUnloadId={77} />)
    await screen.findByText('MUN-2-ABCDEFGH')

    // Sin peso total recibido -- error de validación local.
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Inspección' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('El peso total recibido es obligatorio')
    expect(inspectManifestUnloadItemsMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Cantidad recibida — Aceite usado'), { target: { value: '95' } })
    fireEvent.change(screen.getByLabelText('Peso Total Recibido (kg)'), { target: { value: '95' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Inspección' }))

    await waitFor(() =>
      expect(inspectManifestUnloadItemsMock).toHaveBeenCalledWith(77, {
        received_total_weight_kg: 95,
        rejected_total_weight_kg: undefined,
        items: [{ id: 100, received_quantity: 95, rejected_quantity: 0, reception_condition: undefined }],
      })
    )
  })

  test('is read-only once not Draft', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_unloads.read', 'manifest_unloads.update'],
      tenant_organization_id: 2,
    }
    fetchManifestUnloadMock.mockResolvedValue({
      manifest_unload: baseManifestUnload({
        manifest_status: { id: 2, code: 'GENERATED', name: 'Generado', is_final: false },
        received_total_weight_kg: '95.000',
        rejected_total_weight_kg: '0.000',
      }),
    })
    render(<ManifestUnloadDetailScreen manifestUnloadId={77} />)
    await screen.findByText('MUN-2-ABCDEFGH')

    expect(screen.queryByLabelText('Cantidad recibida — Aceite usado')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar Inspección' })).not.toBeInTheDocument()
    expect(screen.getByText(/Peso Total Recibido: 95.000 kg/)).toBeInTheDocument()
  })
})

describe('ManifestUnloadDetailScreen -- Evidencias Fotográficas', () => {
  beforeEach(() => {
    fetchManifestUnloadMock.mockResolvedValue({ manifest_unload: baseManifestUnload() })
  })

  afterEach(() => {
    fetchManifestUnloadMock.mockReset()
    fetchManifestUnloadFilesMock.mockReset()
    uploadFileMock.mockReset()
    deleteFileMock.mockReset()
  })

  test('lists existing evidence and allows the receiver to upload/delete', async () => {
    currentUser = {
      id: 1,
      is_platform_staff: false,
      permissions: ['manifest_unloads.read', 'manifest_unloads.update'],
      tenant_organization_id: 2,
    }
    fetchManifestUnloadFilesMock.mockResolvedValue({
      files: [{ id: 500, original_filename: 'foto-descargue.jpg' }],
    })
    uploadFileMock.mockResolvedValue({ file: { id: 501, original_filename: 'nueva-foto.jpg' } })
    deleteFileMock.mockResolvedValue({ message: 'Archivo eliminado.' })

    render(<ManifestUnloadDetailScreen manifestUnloadId={77} />)
    await screen.findByText('MUN-2-ABCDEFGH')

    expect(await screen.findByText('foto-descargue.jpg')).toBeInTheDocument()

    const file = new File(['contenido'], 'nueva-foto.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/Subir evidencia/), { target: { files: [file] } })

    await waitFor(() =>
      expect(uploadFileMock).toHaveBeenCalledWith({
        file,
        entityType: 'MANIFEST_UNLOAD',
        entityId: 77,
        fileCategory: 'PHOTO_EVIDENCE',
      })
    )
    expect(await screen.findByText('nueva-foto.jpg')).toBeInTheDocument()

    const existingRow = screen.getByText('foto-descargue.jpg').closest('li')
    expect(existingRow).not.toBeNull()
    fireEvent.click(within(existingRow as HTMLElement).getByRole('button', { name: 'Eliminar' }))
    await waitFor(() => expect(deleteFileMock).toHaveBeenCalledWith(500))
  })

  test('hides upload/delete controls without manage permission', async () => {
    currentUser = { id: 1, is_platform_staff: false, permissions: ['manifest_unloads.read'], tenant_organization_id: 2 }
    fetchManifestUnloadFilesMock.mockResolvedValue({ files: [{ id: 500, original_filename: 'foto-descargue.jpg' }] })

    render(<ManifestUnloadDetailScreen manifestUnloadId={77} />)
    await screen.findByText('MUN-2-ABCDEFGH')

    expect(await screen.findByText('foto-descargue.jpg')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Subir evidencia/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument()
  })
})
