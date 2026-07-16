import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { UnCodeDetailScreen } from './UnCodeDetailScreen'

const fetchUnCodeMock = vi.fn()
const updateUnCodeMock = vi.fn()
const activateUnCodeMock = vi.fn()
const deactivateUnCodeMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchUnCode: (...args: unknown[]) => fetchUnCodeMock(...args),
    updateUnCode: (...args: unknown[]) => updateUnCodeMock(...args),
    activateUnCode: (...args: unknown[]) => activateUnCodeMock(...args),
    deactivateUnCode: (...args: unknown[]) => deactivateUnCodeMock(...args),
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
    uuid: 'un-1',
    tenant_organization_id: null,
    code: 'UN1013',
    name: 'Dióxido de carbono',
    hazard_class: '2.2',
    packing_group: null,
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

describe('UnCodeDetailScreen', () => {
  beforeEach(() => {
    fetchUnCodeMock.mockResolvedValue({ un_code: makeDetail() })
  })

  afterEach(() => {
    fetchUnCodeMock.mockReset()
    updateUnCodeMock.mockReset()
    activateUnCodeMock.mockReset()
    deactivateUnCodeMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the un_codes.read permission via useRequireAuth', async () => {
    render(<UnCodeDetailScreen unCodeId={1} />)
    await screen.findByText('Dióxido de carbono')

    expect(useRequireAuthMock).toHaveBeenCalledWith('un_codes.read')
  })

  test('renders general info and audit fields', async () => {
    render(<UnCodeDetailScreen unCodeId={1} />)

    expect(await screen.findByText('Dióxido de carbono')).toBeInTheDocument()
    expect(screen.getByLabelText(/clase de riesgo/i)).toHaveValue('2.2')
    expect(screen.getAllByText('ana').length).toBeGreaterThan(0)
  })

  test('disables the code field for a system un_code (is_system=true)', async () => {
    render(<UnCodeDetailScreen unCodeId={1} />)
    await screen.findByText('Dióxido de carbono')

    expect(screen.getByLabelText('Código')).toBeDisabled()
    expect(screen.getByText('No se puede modificar el código de un código UN de sistema.')).toBeInTheDocument()
  })

  test('enables the code field for a non-system un_code', async () => {
    fetchUnCodeMock.mockResolvedValueOnce({ un_code: makeDetail({ is_system: false }) })
    render(<UnCodeDetailScreen unCodeId={1} />)
    await screen.findByText('Dióxido de carbono')

    expect(screen.getByLabelText('Código')).not.toBeDisabled()
  })

  test('saving submits the edited fields', async () => {
    updateUnCodeMock.mockResolvedValueOnce({ un_code: makeDetail({ hazard_class: '2.1' }) })
    render(<UnCodeDetailScreen unCodeId={1} />)
    await screen.findByText('Dióxido de carbono')

    fireEvent.change(screen.getByLabelText(/clase de riesgo/i), { target: { value: '2.1' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(updateUnCodeMock).toHaveBeenCalledWith(1, expect.objectContaining({ hazard_class: '2.1' }))
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
  })

  test('shows the save error on failure', async () => {
    updateUnCodeMock.mockRejectedValueOnce(
      new ApiValidationError('Error de validación.', { name: ['El nombre es requerido.'] })
    )
    render(<UnCodeDetailScreen unCodeId={1} />)
    await screen.findByText('Dióxido de carbono')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(await screen.findByText('El nombre es requerido.')).toBeInTheDocument()
  })

  test('"Inactivar" calls deactivateUnCode and updates the badge', async () => {
    deactivateUnCodeMock.mockResolvedValueOnce({ un_code: makeDetail({ is_active: false }) })
    render(<UnCodeDetailScreen unCodeId={1} />)
    await screen.findByText('Dióxido de carbono')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /inactivar/i }))
    })

    expect(deactivateUnCodeMock).toHaveBeenCalledWith(1)
    expect(await screen.findByText('Inactivo')).toBeInTheDocument()
  })
})
