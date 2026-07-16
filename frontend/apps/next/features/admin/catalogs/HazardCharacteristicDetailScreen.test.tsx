import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { HazardCharacteristicDetailScreen } from './HazardCharacteristicDetailScreen'

const fetchHazardCharacteristicMock = vi.fn()
const updateHazardCharacteristicMock = vi.fn()
const activateHazardCharacteristicMock = vi.fn()
const deactivateHazardCharacteristicMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchHazardCharacteristic: (...args: unknown[]) => fetchHazardCharacteristicMock(...args),
    updateHazardCharacteristic: (...args: unknown[]) => updateHazardCharacteristicMock(...args),
    activateHazardCharacteristic: (...args: unknown[]) => activateHazardCharacteristicMock(...args),
    deactivateHazardCharacteristic: (...args: unknown[]) => deactivateHazardCharacteristicMock(...args),
  }
})

const useRequireAuthMock = vi.fn<(permission?: string) => { user: { id: number } | null; isLoading: boolean; isAuthorized: boolean }>(
  () => ({ user: { id: 1 }, isLoading: false, isAuthorized: true })
)

vi.mock('app/provider/auth', () => ({
  useRequireAuth: (permission?: string) => useRequireAuthMock(permission),
}))

function makeHazardCharacteristic(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 4,
    uuid: 'hc-4',
    code: 'TOXICO',
    name: 'Tóxico',
    risk_level: 7,
    description: 'Sustancias tóxicas.',
    is_system: true,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('HazardCharacteristicDetailScreen', () => {
  beforeEach(() => {
    fetchHazardCharacteristicMock.mockResolvedValue({ hazard_characteristic: makeHazardCharacteristic() })
  })

  afterEach(() => {
    fetchHazardCharacteristicMock.mockReset()
    updateHazardCharacteristicMock.mockReset()
    activateHazardCharacteristicMock.mockReset()
    deactivateHazardCharacteristicMock.mockReset()
    useRequireAuthMock.mockClear()
  })

  test('requires the hazard_characteristics.read permission via useRequireAuth', async () => {
    render(<HazardCharacteristicDetailScreen hazardCharacteristicId={4} />)
    await screen.findByText('Tóxico')

    expect(useRequireAuthMock).toHaveBeenCalledWith('hazard_characteristics.read')
  })

  test('renders the derived qualitative risk level label, not the raw number', async () => {
    render(<HazardCharacteristicDetailScreen hazardCharacteristicId={4} />)
    await screen.findByText('Tóxico')

    // Aparece 2 veces a propósito: badge de cabecera + CatalogSidebarStat
    // "Detalle" (mismo criterio ya usado en BranchTypeDetailScreen.test.tsx
    // para "Capacidades"/"Logística").
    expect(screen.getAllByText('Alto').length).toBeGreaterThanOrEqual(2)
  })

  test('saves changes via updateHazardCharacteristic', async () => {
    updateHazardCharacteristicMock.mockResolvedValueOnce({
      hazard_characteristic: { ...makeHazardCharacteristic(), name: 'Tóxico Agudo' },
    })
    render(<HazardCharacteristicDetailScreen hazardCharacteristicId={4} />)
    await screen.findByText('Tóxico')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Tóxico Agudo' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(updateHazardCharacteristicMock).toHaveBeenCalledWith(4, expect.objectContaining({ name: 'Tóxico Agudo' }))
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
  })

  test('toggles active status via activateHazardCharacteristic/deactivateHazardCharacteristic', async () => {
    deactivateHazardCharacteristicMock.mockResolvedValueOnce({
      hazard_characteristic: { ...makeHazardCharacteristic(), is_active: false },
    })
    render(<HazardCharacteristicDetailScreen hazardCharacteristicId={4} />)
    await screen.findByText('Tóxico')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivateHazardCharacteristicMock).toHaveBeenCalledWith(4)
  })

  test('shows the API validation error on save failure', async () => {
    updateHazardCharacteristicMock.mockRejectedValueOnce(new ApiValidationError('Error.', { name: ['Ya existe ese nombre.'] }))
    render(<HazardCharacteristicDetailScreen hazardCharacteristicId={4} />)
    await screen.findByText('Tóxico')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    })

    expect(await screen.findByText('Ya existe ese nombre.')).toBeInTheDocument()
  })
})
