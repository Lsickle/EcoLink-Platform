import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TreatmentsListScreen } from './TreatmentsListScreen'

const fetchTreatmentsMock = vi.fn()
const activateTreatmentMock = vi.fn()
const deactivateTreatmentMock = vi.fn()
const pushMock = vi.fn()

vi.mock('app/features/admin/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('app/features/admin/api')>()
  return {
    ...actual,
    fetchTreatments: (...args: unknown[]) => fetchTreatmentsMock(...args),
    activateTreatment: (...args: unknown[]) => activateTreatmentMock(...args),
    deactivateTreatment: (...args: unknown[]) => deactivateTreatmentMock(...args),
  }
})

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

let currentUser: { id: number; is_platform_staff: boolean } | null = { id: 1, is_platform_staff: false }

vi.mock('app/provider/auth', () => ({
  useAuth: () => ({ user: currentUser, isLoading: false, refresh: vi.fn(), logout: vi.fn() }),
  useRequireAuth: (permission?: string) => ({ isAuthorized: true, user: currentUser, isLoading: false, permission }),
}))

function makeTreatment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    uuid: 'treat-1',
    code: 'INCIN',
    name: 'Incineración',
    description: null,
    treatment_type: 'THERMAL',
    risk_level: 'HIGH',
    is_system: true,
    is_active: true,
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  }
}

describe('TreatmentsListScreen', () => {
  beforeEach(() => {
    currentUser = { id: 1, is_platform_staff: false }
    fetchTreatmentsMock.mockResolvedValue({
      data: [
        makeTreatment(),
        makeTreatment({ id: 2, uuid: 'treat-2', code: 'COPRO', name: 'Coprocesamiento', is_active: false }),
      ],
      current_page: 1,
      last_page: 1,
      total: 2,
      per_page: 15,
    })
  })

  afterEach(() => {
    fetchTreatmentsMock.mockReset()
    activateTreatmentMock.mockReset()
    deactivateTreatmentMock.mockReset()
    pushMock.mockReset()
  })

  test('requires the treatments.read permission', async () => {
    render(<TreatmentsListScreen />)
    await screen.findByText('Coprocesamiento')
  })

  test('hides "+ Crear Tratamiento" for a non-platform-staff actor', async () => {
    render(<TreatmentsListScreen />)
    await screen.findByText('Incineración')

    expect(screen.queryByRole('button', { name: /crear tratamiento/i })).not.toBeInTheDocument()
  })

  test('shows "+ Crear Tratamiento" for platform staff and navigates to /admin/catalogs/treatments/new', async () => {
    currentUser = { id: 1, is_platform_staff: true }
    render(<TreatmentsListScreen />)
    await screen.findByText('Incineración')

    fireEvent.click(screen.getByRole('button', { name: /crear tratamiento/i }))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/treatments/new')
  })

  test('hides the "Activar"/"Inactivar" row action for a non-platform-staff actor', async () => {
    render(<TreatmentsListScreen />)
    await screen.findByText('Coprocesamiento')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Coprocesamiento' }))
    const menu = await screen.findByRole('menu')

    expect(within(menu).queryByRole('menuitem', { name: 'Activar' })).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Ver' })).toBeInTheDocument()
  })

  test('"Activar" calls activateTreatment for platform staff', async () => {
    currentUser = { id: 1, is_platform_staff: true }
    activateTreatmentMock.mockResolvedValueOnce({ treatment: { ...makeTreatment({ id: 2 }), is_active: true } })
    render(<TreatmentsListScreen />)
    await screen.findByText('Coprocesamiento')

    fireEvent.click(screen.getByRole('button', { name: 'Acciones para Coprocesamiento' }))
    const menu = await screen.findByRole('menu')
    await act(async () => {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Activar' }))
    })

    expect(activateTreatmentMock).toHaveBeenCalledWith(2)
  })

  test('navigates to the detail page when clicking a row', async () => {
    render(<TreatmentsListScreen />)
    await screen.findByText('Incineración')

    fireEvent.click(screen.getByText('Incineración'))

    expect(pushMock).toHaveBeenCalledWith('/admin/catalogs/treatments/1')
  })
})
