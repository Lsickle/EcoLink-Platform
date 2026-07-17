import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TreatmentDetailScreen } from './TreatmentDetailScreen'

const fetchTreatmentMock = vi.fn()
const updateTreatmentMock = vi.fn()
const activateTreatmentMock = vi.fn()
const deactivateTreatmentMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchTreatment: (...args: unknown[]) => fetchTreatmentMock(...args),
    updateTreatment: (...args: unknown[]) => updateTreatmentMock(...args),
    activateTreatment: (...args: unknown[]) => activateTreatmentMock(...args),
    deactivateTreatment: (...args: unknown[]) => deactivateTreatmentMock(...args),
  }
})

let currentUser: { id: number; is_platform_staff: boolean } | null = { id: 1, is_platform_staff: true }

vi.mock('app/provider/auth', () => ({
  useRequireAuth: () => ({ isAuthorized: true, user: currentUser, isLoading: false }),
}))

function makeTreatment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'treat-1',
    tenant_organization_id: null,
    code: 'INCIN',
    name: 'Incineración',
    description: 'Tratamiento térmico de residuos peligrosos.',
    treatment_type: 'THERMAL',
    parent_treatment_id: null,
    requires_environmental_license: true,
    requires_special_transport: true,
    allows_recovery: false,
    requires_certificate: true,
    requires_weight_control: true,
    min_temperature: '800.00',
    max_temperature: '1200.00',
    temperature_unit: 'C',
    risk_level: 'HIGH',
    estimated_processing_time_hours: '4.00',
    is_system: true,
    is_active: true,
    metadata: null,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    created_by: { id: 1, username: 'ecolink.admin' },
    updated_by: { id: 1, username: 'ecolink.admin' },
    ...overrides,
  }
}

describe('TreatmentDetailScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: true }
    fetchTreatmentMock.mockResolvedValue({ treatment: makeTreatment() })
  })

  afterEach(() => {
    fetchTreatmentMock.mockReset()
    updateTreatmentMock.mockReset()
    activateTreatmentMock.mockReset()
    deactivateTreatmentMock.mockReset()
  })

  test('renders an editable form for platform staff', async () => {
    render(<TreatmentDetailScreen treatmentId={1} />)

    expect(await screen.findByLabelText('Código')).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
  })

  test('renders a read-only view for a non-platform-staff actor', async () => {
    currentUser = { id: 1, is_platform_staff: false }
    render(<TreatmentDetailScreen treatmentId={1} />)

    await screen.findAllByText('Incineración')

    expect(screen.queryByLabelText('Código')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /inactivar/i })).not.toBeInTheDocument()
  })

  test('saves changes via updateTreatment for platform staff', async () => {
    updateTreatmentMock.mockResolvedValueOnce({ treatment: { ...makeTreatment(), name: 'Incineración Industrial' } })
    render(<TreatmentDetailScreen treatmentId={1} />)
    await screen.findByLabelText('Código')

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Incineración Industrial' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    })

    expect(updateTreatmentMock).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Incineración Industrial' }))
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument()
  })

  test('toggles active status via activateTreatment/deactivateTreatment for platform staff', async () => {
    deactivateTreatmentMock.mockResolvedValueOnce({ treatment: { ...makeTreatment(), is_active: false } })
    render(<TreatmentDetailScreen treatmentId={1} />)
    await screen.findByLabelText('Código')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Inactivar' }))
    })

    expect(deactivateTreatmentMock).toHaveBeenCalledWith(1)
  })
})
