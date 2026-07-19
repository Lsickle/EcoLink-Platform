import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ApiValidationError } from 'app/features/admin/api'
import { TransportPersonnelDetailScreen } from './TransportPersonnelDetailScreen'

const fetchTransportPersonnelByIdMock = vi.fn()
const updateTransportPersonnelMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchTransportPersonnelById: (...args: unknown[]) => fetchTransportPersonnelByIdMock(...args),
    updateTransportPersonnel: (...args: unknown[]) => updateTransportPersonnelMock(...args),
  }
})

vi.mock('app/provider/auth', () => ({
  useRequireAuth: () => ({ isAuthorized: true, user: { id: 1, is_platform_staff: false }, isLoading: false }),
}))

function driverDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
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
    organization: { id: 1, legal_name: 'EcoFleet SAS' },
    person: {
      id: 5,
      first_name: 'Juan',
      last_name: 'Pérez',
      full_name: 'Juan Pérez',
      document_number: '123456',
      email: 'juan@ecolink.test',
      phone: null,
    },
    created_by: { id: 1, username: 'admin' },
    updated_by: null,
    ...overrides,
  }
}

describe('TransportPersonnelDetailScreen', () => {
  beforeEach(() => {
    fetchTransportPersonnelByIdMock.mockResolvedValue({ transport_personnel: driverDetail() })
  })

  afterEach(() => {
    fetchTransportPersonnelByIdMock.mockReset()
    updateTransportPersonnelMock.mockReset()
  })

  test('shows the driver contact name, document and license info', async () => {
    render(<TransportPersonnelDetailScreen transportPersonnelId={10} />)

    expect((await screen.findAllByText('Juan Pérez')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('123456').length).toBeGreaterThan(0)
    expect(screen.getByDisplayValue('LIC-001')).toBeInTheDocument()
  })

  test('saves license changes via updateTransportPersonnel', async () => {
    updateTransportPersonnelMock.mockResolvedValueOnce({
      transport_personnel: { ...driverDetail(), license_number: 'LIC-002' },
    })
    render(<TransportPersonnelDetailScreen transportPersonnelId={10} />)
    await screen.findByDisplayValue('LIC-001')

    fireEvent.change(screen.getByLabelText(/Número de Licencia/), { target: { value: 'LIC-002' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    })

    expect(updateTransportPersonnelMock).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ license_number: 'LIC-002' })
    )
  })

  test('shows a validation error on save failure', async () => {
    updateTransportPersonnelMock.mockRejectedValueOnce(
      new ApiValidationError('The given data was invalid.', { license_number: ['Formato inválido.'] })
    )
    render(<TransportPersonnelDetailScreen transportPersonnelId={10} />)
    await screen.findByDisplayValue('LIC-001')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    })

    expect(await screen.findByText('Formato inválido.')).toBeInTheDocument()
  })
})
