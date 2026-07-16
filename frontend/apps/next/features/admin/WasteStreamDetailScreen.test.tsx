import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { WasteStreamDetailScreen } from './WasteStreamDetailScreen'

const fetchWasteStreamMock = vi.fn()
const updateWasteStreamMock = vi.fn()
const activateWasteStreamMock = vi.fn()
const deactivateWasteStreamMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchWasteStream: (...args: unknown[]) => fetchWasteStreamMock(...args),
    updateWasteStream: (...args: unknown[]) => updateWasteStreamMock(...args),
    activateWasteStream: (...args: unknown[]) => activateWasteStreamMock(...args),
    deactivateWasteStream: (...args: unknown[]) => deactivateWasteStreamMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'ws-1',
    tenant_organization_id: null,
    code: 'Y8',
    name: 'Residuos de tintas',
    description: null,
    tipo: 'Y',
    requires_manifest: true,
    requires_special_transport: false,
    is_system: true,
    is_active: true,
    metadata: null,
    created_at: '2026-01-10T00:00:00Z',
    updated_at: '2026-01-12T00:00:00Z',
    created_by: { id: 9, username: 'ana' },
    updated_by: { id: 9, username: 'ana' },
    ...overrides,
  }
}

describe('WasteStreamDetailScreen', () => {
  beforeEach(() => {
    fetchWasteStreamMock.mockResolvedValue({ waste_stream: makeDetail() })
  })

  afterEach(() => {
    fetchWasteStreamMock.mockReset()
    updateWasteStreamMock.mockReset()
    activateWasteStreamMock.mockReset()
    deactivateWasteStreamMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the waste_streams.read permission via useRequireAuth', async () => {
    render(<WasteStreamDetailScreen wasteStreamId={1} />)
    await screen.findByRole('button', { name: /guardar cambios/i })

    expect(useRequireAuthMock).toHaveBeenCalledWith('waste_streams.read')
  })

  test('renders general info, tipo badge (read-only) and audit fields', async () => {
    render(<WasteStreamDetailScreen wasteStreamId={1} />)

    await screen.findByRole('button', { name: /guardar cambios/i })
    expect(screen.getAllByText('Residuos de tintas').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Y').length).toBeGreaterThan(0)
    expect(screen.getAllByText('ana').length).toBeGreaterThan(0)
    expect(screen.getByText('No se puede modificar una vez creada la corriente.')).toBeInTheDocument()
  })

  test('disables the code field for a system waste stream (is_system=true)', async () => {
    render(<WasteStreamDetailScreen wasteStreamId={1} />)
    await screen.findByRole('button', { name: /guardar cambios/i })

    expect(screen.getByLabelText('Código')).toBeDisabled()
    expect(screen.getByText('No se puede modificar el código de una corriente de sistema.')).toBeInTheDocument()
  })

  test('enables the code field for a non-system waste stream', async () => {
    fetchWasteStreamMock.mockResolvedValueOnce({ waste_stream: makeDetail({ is_system: false }) })
    render(<WasteStreamDetailScreen wasteStreamId={1} />)
    await screen.findByRole('button', { name: /guardar cambios/i })

    expect(screen.getByLabelText('Código')).not.toBeDisabled()
  })

  test('saving submits the edited fields without `tipo` (immutable)', async () => {
    updateWasteStreamMock.mockResolvedValueOnce({ waste_stream: makeDetail({ name: 'Nuevo nombre' }) })
    render(<WasteStreamDetailScreen wasteStreamId={1} />)
    await screen.findByRole('button', { name: /guardar cambios/i })

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuevo nombre' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(updateWasteStreamMock).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: 'Nuevo nombre' })
    )
    const [, payload] = updateWasteStreamMock.mock.calls[0]
    expect(payload).not.toHaveProperty('tipo')
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
  })

  test('shows the save error on failure', async () => {
    updateWasteStreamMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { name: ['El nombre es requerido.'] })
    )
    render(<WasteStreamDetailScreen wasteStreamId={1} />)
    await screen.findByRole('button', { name: /guardar cambios/i })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(await screen.findByText('El nombre es requerido.')).toBeInTheDocument()
  })

  test('"Inactivar" calls deactivateWasteStream and updates the badge', async () => {
    deactivateWasteStreamMock.mockResolvedValueOnce({ waste_stream: makeDetail({ is_active: false }) })
    render(<WasteStreamDetailScreen wasteStreamId={1} />)
    await screen.findByRole('button', { name: /guardar cambios/i })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /inactivar/i }))
    })

    expect(deactivateWasteStreamMock).toHaveBeenCalledWith(1)
    expect(await screen.findByText('Inactivo')).toBeInTheDocument()
  })

  test('shows "—" when created_by/updated_by are null', async () => {
    fetchWasteStreamMock.mockResolvedValueOnce({
      waste_stream: makeDetail({ created_by: null, updated_by: null }),
    })
    render(<WasteStreamDetailScreen wasteStreamId={1} />)
    await screen.findByRole('button', { name: /guardar cambios/i })

    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
